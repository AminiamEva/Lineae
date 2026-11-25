import {createSelectionModel} from './selection-model.mjs';
import {applySlotEdit,applyStructureCommand,expandMatrix,insertDisplayLine,removeEmptyScript,applySingleCharacterScript} from '../native-math/source.mjs';

// Native surface geometry adapter. Display-list coordinates are page space;
// callers provide the zoom used for the current painted page.
const stopsFor = (observed, resolve, verified) => {
  const byAddress = new Map();
  const push = (owner, role, after, page, bbox, empty = false) => {
    const target = resolve({owner, role, after});
    if (!target) return;
    const stop = {
      ...target, page, after,empty,
      x: after ? bbox[2] : bbox[0], top: bbox[1], bottom: bbox[3],
    };
    const key = JSON.stringify([target.formula.filePath,target.docOffset]);
    const previous = byAddress.get(key);
    // A glyph boundary inside a slot is the precise caret target; an empty
    // field marker at the same offset is only a fallback.
    if (!previous || (previous.slot.role !== 'nucleus' && target.slot.role === 'nucleus')) {
      byAddress.set(key, stop);
    }
  };
  for (const page of observed ?? []) {
    if ((!verified&&page?.exact!==true)||!page?.dl?.math_owners)continue;
    for (const field of page.dl.math_owners.fields ?? []) {
      push(field.owner, field.role, false, page.page, field.bbox,field.empty===true);
    }
    for (const glyph of page.dl.math_owners.glyphs ?? []) {
      push(glyph.owner, 'nucleus', false, page.page, glyph.bbox);
      push(glyph.owner, 'nucleus', true, page.page, glyph.bbox);
    }
  }
  const atomsByFormula=new Map(),tails=[];
  for(const stop of byAddress.values()){
    if(!stop.after||stop.slot.role!=='nucleus')continue;
    const path=stop.atom.path;
    const script=path.match(/\/(?:superscript|subscript)\/\d+$/);
    const parentPath=script?path.slice(0,script.index):path.replace(/\/body\/\d+$/,'');
    if(parentPath===path)continue;
    const {formula}=stop;
    if(!atomsByFormula.has(formula))atomsByFormula.set(formula,new Map(formula.math.atoms.map(atom=>[atom.path,atom])));
    const parent=atomsByFormula.get(formula).get(parentPath);
    if(!parent||!script&&parent.command!=='\\text')continue;
    const docOffset=formula.from16+parent.to16;
    const slot=formula.math.slots.find(slot=>slot.role==='body'&&slot.from16===0&&slot.to16===formula.math.source.length);
    if(!slot)continue;
    const base=byAddress.get(JSON.stringify([formula.filePath,formula.from16+parent.from16]))??stop;
    const x=Math.max(stop.x,base.page===stop.page?base.x:stop.x);
    const {top,bottom}=base.page===stop.page?base:stop;
    tails.push({...stop,slot,local:parent.to16,docOffset,atom:parent,x,top,bottom,
      hit:{...stop.hit,page:stop.page,caretBox:[x,top,x,bottom]}});
  }
  for(const stop of tails){
    const key=JSON.stringify([stop.formula.filePath,stop.docOffset]);
    if(!byAddress.has(key)||byAddress.get(key).hit.caretBox&&byAddress.get(key).x<stop.x)byAddress.set(key,stop);
  }
  return [...byAddress.values()].sort((left, right) => left.docOffset - right.docOffset ||
    (left.after ? 1 : 0) - (right.after ? 1 : 0));
};

export const sameFormula = (left, right) =>
  left?.formula.from16 === right?.formula.from16 &&
  left?.formula.kind === right?.formula.kind &&
  left?.formula.filePath === right?.formula.filePath;

export function createMathSurface({resolve,selection=createSelectionModel(sameFormula,stop=>stop.formula.filePath)}) {
  return Object.assign(Object.create(selection), {
    collectStops(observed,verified) { return stopsFor(observed,resolve,verified); },
    setObservation(observed) { return selection.setStops(stopsFor(observed, resolve)); },
    insert(text) {
      const stop = selection.caret;
      if (!stop || typeof text !== 'string' || !text) return null;
      const [from, to] = selection.range;
      if (!sameFormula(from, stop) || from.slot.id !== to.slot.id) return null;
      try {
        const result = applySlotEdit(stop.formula.math, {
          slotId: stop.slot.id, from16: from.local, to16: to.local, insert: text,
        });
        return selection.record({formula:stop.formula,patch:result.patch,text:result.source},
          stop.formula.from16+result.selection.head16);
      } catch { return null; }
    },
    moveEmptySlot(backward) {
      const caret=selection.caret;
      if(!caret)return false;
      const candidates=selection.stops.filter(stop=>stop.kind==='math'&&stop.empty&&sameFormula(stop,caret));
      if(backward)candidates.reverse();
      const target=candidates.find(stop=>backward?stop.docOffset<caret.docOffset:stop.docOffset>caret.docOffset);
      return target?selection.selectTargets(target,target):false;
    },
    singleCharacterScript(marker,text){
      const caret=selection.caret;
      if(!caret||caret!==selection.anchor)return null;
      try{
        const edit=applySingleCharacterScript(caret.formula.math,caret.slot,caret.local,marker,text);
        return edit?selection.record({formula:caret.formula,patch:edit.patch,text:edit.source,structure:true},
          caret.formula.from16+edit.cursor):null;
      }catch{return null;}
    },
    command(command) {
      const [from,to] = selection.range;
      if(!from||!sameFormula(from,to)||from.slot.id!==to.slot.id)return null;
      try {
        const result=command==='enterLine'
          ?from===to&&from.formula.kind==='displayMath'&&insertDisplayLine(from.formula.math,from.slot,from.local)
          :command==='addRow'||command==='addColumn'
          ?expandMatrix(from.formula.math,selection.caret.slot,selection.caret.local,command==='addRow'?'row':'column')
          :applyStructureCommand(from.formula.math,{slotId:from.slot.id,from16:from.local,to16:to.local,command});
        if(!result)return null;
        return selection.record({formula:from.formula,patch:result.patch,text:result.source,structure:true,
          requiresAmsmath:result.requiresAmsmath},
          from.formula.from16+result.cursor);
      } catch { return null; }
    },
    erase(backward = true) {
      const stop = selection.caret;
      if (!stop) return null;
      let [start, end] = selection.range;
      if (start === end) {
        if(backward&&stop.empty){
          const script=removeEmptyScript(stop.formula.math,stop.slot);
          if(script)return selection.record({formula:stop.formula,patch:script.patch,text:script.source,structure:true},
            stop.formula.from16+script.cursor);
        }
        const own = selection.stops.filter(candidate => candidate.kind==='math'&&sameFormula(candidate, stop));
        const neighbor = own[own.indexOf(stop) + (backward ? -1 : 1)];
        if (!neighbor) return null;
        start = stop;
        end = neighbor;
      }
      if (!sameFormula(start, end) || start.slot.id !== end.slot.id) return null;
      const from = Math.min(start.local, end.local);
      const to = Math.max(start.local, end.local);
      if (from === to) return null;
      try {
        const result = applySlotEdit(stop.formula.math, {
          slotId: stop.slot.id, from16: from, to16: to, insert: '',
        });
        return selection.record({formula: stop.formula, patch: result.patch, text: result.source}, stop.formula.from16 + stop.slot.from16 + from);
      } catch { return null; }
    },

  });
}

export function surfaceCaretRect(stop, scale, pageLeft, pageTop) {
  if (!stop) return null;
  const height = Math.max(1, (stop.bottom - stop.top) * scale);
  return {
    x: pageLeft + stop.x * scale,
    y: pageTop + ((stop.top + stop.bottom) / 2) * scale - height / 2,
    height,
  };
}
