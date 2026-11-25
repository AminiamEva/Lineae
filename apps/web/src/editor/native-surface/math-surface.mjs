import {createSelectionModel} from './selection-model.mjs';
import {applyPastedMath,applySlotEdit,applyStructureCommand,expandMatrix,insertDisplayLine,removeEmptyScript,applySingleCharacterScript,applyScalableFence,nativeOperatorBody,toggleFormulaDisplayStyle} from '../native-math/source.mjs';

const structuralAtom=atom=>['frac','sqrt','fence','group','wrapper','matrix'].includes(atom.kind)&&
  !(atom.kind==='matrix'&&/^(?:align|flalign|gather|multline|eqnarray)/.test(atom.command));
const address=(formula,offset)=>JSON.stringify([formula.filePath,formula.occurrence,offset]);

// Native surface geometry adapter. Display-list coordinates are page space;
// callers provide the zoom used for the current painted page.
const stopsFor = (observed, resolve, verified, pasted, pasteOffset) => {
  const byAddress = new Map();
  const push = (owner, role, after, page, bbox, empty = false) => {
    const target = resolve({owner, role, after});
    if (!target) return;
    const fenceGlyph=target.atom.kind==='fence'&&target.slot.role==='body'&&role==='nucleus';
    const stop = {
      ...target,page,after,empty:empty||fenceGlyph,
      x: after||fenceGlyph?bbox[2]:bbox[0],top:bbox[1],bottom:bbox[3],
      ...(fenceGlyph?{hit:{...target.hit,page,caretBox:[bbox[2],bbox[1],bbox[2],bbox[3]]}}:{}),
    };
    const key = address(target.formula,target.docOffset);
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
    const body=nativeOperatorBody(stop.formula.math,stop.atom);
    if(body&&!body.slot.raw){
      stop.hit={...stop.hit,operatorHint:true};
      const {formula,x,top,bottom,page}=stop;
      tails.push({...stop,...body,local:0,docOffset:formula.from16+body.slot.from16,empty:true,operatorSlot:stop.slot,
        hit:{...stop.hit,page,caretBox:[x,top,x,bottom]}});
    }
    const path=stop.atom.path;
    const script=path.match(/\/(?:superscript|subscript)\/\d+$/);
    if(!script)continue;
    const parentPath=path.slice(0,script.index);
    const {formula}=stop;
    if(!atomsByFormula.has(formula))atomsByFormula.set(formula,new Map(formula.math.atoms.map(atom=>[atom.path,atom])));
    const parent=atomsByFormula.get(formula).get(parentPath);
    if(!parent)continue;
    const docOffset=formula.from16+parent.to16;
    const slot=formula.math.slots.find(slot=>slot.role==='body'&&slot.from16===0&&slot.to16===formula.math.source.length);
    if(!slot)continue;
    const base=byAddress.get(address(formula,formula.from16+parent.from16))??stop;
    const x=Math.max(stop.x,base.page===stop.page?base.x:stop.x);
    const {top,bottom}=base.page===stop.page?base:stop;
    tails.push({...stop,slot,local:parent.to16,docOffset,atom:parent,x,top,bottom,
      hit:{...stop.hit,page:stop.page,caretBox:[x,top,x,bottom]}});
  }
  const observedFormulas=new Map();
  for(const stop of byAddress.values()){
    if(!observedFormulas.has(stop.formula))observedFormulas.set(stop.formula,[]);
    observedFormulas.get(stop.formula).push(stop);
  }
  for(const [formula,stops] of observedFormulas){
    for(const {wrapper,body} of formattingBodies(formula)){
      const docOffset=formula.from16+wrapper.to16;
      if(byAddress.has(address(formula,docOffset)))continue;
      const end=stops.filter(stop=>stop.after&&stop.docOffset>=formula.from16+body.from16&&
        stop.docOffset<=formula.from16+body.to16).sort((left,right)=>right.docOffset-left.docOffset)[0];
      const slot=formula.math.slots.filter(slot=>slot.from16<=wrapper.from16&&slot.to16>=wrapper.to16)
        .sort((left,right)=>left.raw.length-right.raw.length)[0];
      if(!end||!slot)continue;
      const {x,top,bottom,page}=end;
      tails.push({...end,slot,local:wrapper.to16-slot.from16,docOffset,atom:wrapper,
        hit:{...end.hit,page,caretBox:[x,top,x,bottom]}});
    }
    for(const atom of formula.math.atoms.filter(atom=>structuralAtom(atom)&&atom.kind!=='wrapper')){
      const docOffset=formula.from16+atom.to16;
      if(byAddress.has(address(formula,docOffset)))continue;
      const body=stops.filter(stop=>stop.docOffset>formula.from16+atom.from16&&stop.docOffset<=docOffset);
      const right=body.filter(stop=>stop.after||stop.empty).sort((a,b)=>b.x-a.x)[0];
      const slot=formula.math.slots.filter(slot=>slot.from16<=atom.from16&&slot.to16>=atom.to16)
        .sort((a,b)=>a.raw.length-b.raw.length)[0];
      if(!right||!slot||body.some(stop=>stop.page!==right.page))continue;
      const {x,top,bottom,page}=right;
      tails.push({...right,slot,atom,local:atom.to16-slot.from16,docOffset,empty:false,
        hit:{...right.hit,page,caretBox:[x,top,x,bottom]}});
    }
    if(pasted?.paste&&pasted.formula.filePath===formula.filePath&&pasted.formula.from16===formula.from16&&
       !byAddress.has(address(formula,pasteOffset))){
      const local=pasteOffset-formula.from16;
      const atom=formula.math.atoms.find(atom=>atom.kind!=='formula'&&atom.kind!=='token'&&atom.to16===local);
      const children=atom?stops.filter(stop=>stop.docOffset>=formula.from16+atom.from16&&stop.docOffset<=pasteOffset):[];
      const end=children.filter(stop=>stop.after||stop.empty).sort((left,right)=>right.x-left.x)[0];
      const slot=atom&&formula.math.slots.filter(slot=>slot.from16<=atom.from16&&slot.to16>=local)
        .sort((left,right)=>left.raw.length-right.raw.length)[0];
      if(end&&slot&&children.every(stop=>stop.page===end.page)){
        const {x,top,bottom,page}=end;
        tails.push({...end,slot,local:local-slot.from16,docOffset:pasteOffset,atom,
          hit:{...end.hit,page,caretBox:[x,top,x,bottom]}});
      }
    }
  }
  for(const stop of tails){
    const key=address(stop.formula,stop.docOffset);
    if(!byAddress.has(key)||byAddress.get(key).hit.caretBox&&byAddress.get(key).x<stop.x)byAddress.set(key,stop);
  }
  return [...byAddress.values()].sort((left, right) => left.docOffset - right.docOffset ||
    (left.after ? 1 : 0) - (right.after ? 1 : 0));
};

export const sameFormula = (left, right) =>
  left?.formula.from16 === right?.formula.from16 &&
  left?.formula.kind === right?.formula.kind &&
  left?.formula.occurrence === right?.formula.occurrence &&
  left?.formula.filePath === right?.formula.filePath;

function formattingBodies(formula){
  return formula.math.atoms.filter(atom=>atom.kind==='wrapper').flatMap(wrapper=>{
    const body=formula.math.slots.find(slot=>slot.ownerId===wrapper.id&&slot.role==='body'&&slot.grouped);
    return body?[{wrapper,body}]:[];
  });
}

export function createMathSurface({resolve,selection=createSelectionModel(sameFormula,stop=>stop.formula.filePath)}) {
  return Object.assign(Object.create(selection), {
    collectStops(observed,verified) { return stopsFor(observed,resolve,verified,selection.lastEdit,selection.pendingOffset); },
    setObservation(observed) { return selection.setStops(this.collectStops(observed)); },
    leaveFormatting(){
      const caret=selection.caret;
      if(caret?.kind!=='math'||selection.anchor!==caret)return false;
      const offset=caret.docOffset-caret.formula.from16;
      const enclosing=formattingBodies(caret.formula).filter(({body})=>offset>=body.from16&&offset<=body.to16)
        .sort((left,right)=>left.body.raw.length-right.body.raw.length)[0];
      if(!enclosing)return false;
      const next=selection.stops.find(stop=>stop.kind==='math'&&sameFormula(stop,caret)&&
        stop.docOffset===caret.formula.from16+enclosing.wrapper.to16);
      return next?selection.selectTargets(next,next):false;
    },
    leaveStructure(){
      const caret=selection.caret;
      if(caret?.kind!=='math')return false;
      const {formula}=caret,offset=caret.docOffset-formula.from16;
      const compound=formula.math.atoms.filter(atom=>structuralAtom(atom)&&atom.from16<offset&&atom.to16>offset)
        .sort((a,b)=>(a.to16-a.from16)-(b.to16-b.from16))[0];
      if(!compound){
        const script=caret.atom.path.match(/^(.*)\/(?:superscript|subscript)\//);
        if(!script)return false;
        const base=formula.math.atoms.find(atom=>atom.path===script[1]);
        if(!base)return false;
        return selection.selectBetween(formula.from16+base.to16,formula.from16+base.to16,formula.filePath);
      }
      return selection.selectBetween(formula.from16+compound.to16,formula.from16+compound.to16,formula.filePath);
    },
    insert(text,{paste=false}={}) {
      const stop = selection.caret;
      if (!stop || typeof text !== 'string' || !text) return null;
      const [from, to] = selection.range;
      if (!sameFormula(from, stop) || from.slot.id !== to.slot.id) return null;
      try {
        const body=from===to&&stop.after&&stop.slot.role==='nucleus'?nativeOperatorBody(stop.formula.math,stop.atom):null;
        const edit={
          slotId:body?.slot.id??stop.slot.id,from16:body?0:from.local,to16:body?0:to.local,insert:text,
        };
        let result,structure=false;
        try{result=applySlotEdit(stop.formula.math,edit);}
        catch(error){
          if(!paste)throw error;
          result=applyPastedMath(stop.formula.math,edit);structure=true;
        }
        if(!result)return null;
        return selection.record({formula:stop.formula,patch:result.patch,text:result.source,
          ...(structure&&{structure,paste:true,requiresAmsmath:true})},
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
    clearEmptyScript(){
      const stop=selection.caret;
      if(!stop?.empty||selection.anchor!==stop)return null;
      const script=removeEmptyScript(stop.formula.math,stop.slot);
      return script?selection.record({formula:stop.formula,patch:script.patch,text:script.source,structure:true},
        stop.formula.from16+script.cursor):null;
    },
    wrapFence(pair){
      const [first,last]=selection.range;
      if(first?.kind!=='math'||last?.kind!=='math'||!sameFormula(first,last))return null;
      const {formula}=first;
      const from=first.docOffset-formula.from16,to=last.docOffset-formula.from16;
      const owner=first.slot===last.slot?first.slot:formula.math.slots.filter(slot=>
        slot.from16<=from&&slot.to16>=to).sort((left,right)=>left.raw.length-right.raw.length)[0];
      if(!owner)return null;
      try{
        const edit=applyScalableFence(formula.math,owner,from-owner.from16,to-owner.from16,pair);
        return edit?selection.record({formula,patch:edit.patch,text:edit.source,structure:true},
          formula.from16+edit.cursor):null;
      }catch{return null;}
    },
    command(command) {
      const [from,to] = selection.range;
      if(!from||!sameFormula(from,to)||from.slot.id!==to.slot.id)return null;
      try {
        const result=command==='toggleDisplayStyle'
          ?from===to&&from.formula.delimiter!==''&&toggleFormulaDisplayStyle(from.formula.math,from.docOffset-from.formula.from16)
          :command==='enterLine'
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
        if(backward&&stop.operatorSlot){
          try{
            const {formula,operatorSlot}=stop;
            const result=applySlotEdit(formula.math,{slotId:operatorSlot.id,from16:0,to16:operatorSlot.raw.length,insert:''});
            return selection.record({formula,patch:result.patch,text:result.source},formula.from16+result.selection.head16);
          }catch{return null;}
        }
        const script=backward?this.clearEmptyScript():null;
        if(script)return script;
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
