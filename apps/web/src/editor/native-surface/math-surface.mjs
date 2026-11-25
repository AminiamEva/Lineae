import {createSelectionModel} from './selection-model.mjs';
import {applySlotEdit,applyStructureCommand} from '../native-math/source.mjs';

// Native surface geometry adapter. Display-list coordinates are page space;
// callers provide the zoom used for the current painted page.
const stopsFor = (observed, resolve) => {
  const byAddress = new Map();
  const push = (owner, role, after, page, bbox) => {
    const target = resolve({owner, role, after});
    if (!target) return;
    const stop = {
      ...target, page, after,
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
    if (page?.exact !== true || !page.dl?.math_owners) continue;
    for (const field of page.dl.math_owners.fields ?? []) {
      push(field.owner, field.role, false, page.page, field.bbox);
    }
    for (const glyph of page.dl.math_owners.glyphs ?? []) {
      push(glyph.owner, 'nucleus', false, page.page, glyph.bbox);
      push(glyph.owner, 'nucleus', true, page.page, glyph.bbox);
    }
  }
  return [...byAddress.values()].sort((left, right) => left.docOffset - right.docOffset ||
    (left.after ? 1 : 0) - (right.after ? 1 : 0));
};

const sameFormula = (left, right) =>
  left?.formula.from16 === right?.formula.from16 &&
  left?.formula.kind === right?.formula.kind &&
  left?.formula.filePath === right?.formula.filePath;

export function createMathSurface({resolve}) {
  const selection = createSelectionModel(sameFormula,stop=>stop.formula.filePath ?? undefined);
  return Object.assign(selection, {
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
        return selection.record({formula: stop.formula, patch: result.patch, text: result.source}, from.docOffset + text.length);
      } catch { return null; }
    },
    command(command) {
      const [from,to] = selection.range;
      if(!from||!sameFormula(from,to)||from.slot.id!==to.slot.id)return null;
      try {
        const result=applyStructureCommand(from.formula.math,{
          slotId:from.slot.id,from16:from.local,to16:to.local,command,
        });
        if(!result)return null;
        return selection.record({formula:from.formula,patch:result.patch,text:result.source,structure:true},
          from.formula.from16+result.cursor);
      } catch { return null; }
    },
    erase(backward = true) {
      const stop = selection.caret;
      if (!stop) return null;
      let [start, end] = selection.range;
      if (start === end) {
        const own = selection.stops.filter(candidate => sameFormula(candidate, stop));
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
