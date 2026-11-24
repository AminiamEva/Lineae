import {applySlotEdit} from '../native-math/source.mjs';

// Native surface geometry adapter. Display-list coordinates are page space;
// callers provide the zoom used for the current painted page.
const stopsFor = (observed, resolve) => {
  const byOffset = new Map();
  const push = (owner, role, after, page, bbox) => {
    const target = resolve({owner, role, after});
    if (!target) return;
    const stop = {
      ...target, page, after,
      x: after ? bbox[2] : bbox[0], top: bbox[1], bottom: bbox[3],
    };
    const previous = byOffset.get(target.docOffset);
    // A glyph boundary inside a slot is the precise caret target; an empty
    // field marker at the same offset is only a fallback.
    if (!previous || (previous.slot.role !== 'nucleus' && target.slot.role === 'nucleus')) {
      byOffset.set(target.docOffset, stop);
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
  return [...byOffset.values()].sort((left, right) => left.docOffset - right.docOffset ||
    (left.after ? 1 : 0) - (right.after ? 1 : 0));
};

const sameFormula = (left, right) =>
  left?.formula.from16 === right?.formula.from16 &&
  left?.formula.kind === right?.formula.kind &&
  left?.formula.filePath === right?.formula.filePath;

export function createMathSurface({resolve}) {
  let stops = [], index = -1, anchor = -1, pendingOffset = null, lastEdit = null;

  const formulaStops = () => index < 0 ? [] :
    stops.filter(stop => sameFormula(stop, stops[index]));

  function select(offset) {
    index = stops.findIndex(stop => stop.docOffset === offset);
    if (index < 0) index = 0;
    anchor = index;
    return stops[index] ?? null;
  }

  return {
    get stops() { return stops; },
    get index() { return index; },
    get caret() { return stops[index] ?? null; },
    get anchor() { return stops[anchor] ?? null; },
    get pendingOffset() { return pendingOffset; },
    get lastEdit() { return lastEdit; },
    setObservation(observed) {
      stops = stopsFor(observed, resolve);
      if (!stops.length) { index = anchor = -1; return false; }
      if (pendingOffset !== null) {
        const offset = pendingOffset;
        pendingOffset = null;
        const exact = stops.findIndex(stop => stop.docOffset === offset);
        if (exact >= 0) { index = anchor = exact; return true; }
      }
      const current = stops[index];
      if (!current) { index = anchor = 0; return true; }
      const moved = stops.findIndex(stop => stop.docOffset === current.docOffset);
      index = moved >= 0 ? moved : Math.min(index, stops.length - 1);
      anchor = index;
      return true;
    },
    nearest(page, x, y) {
      let best = -1, distance = Infinity;
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (stop.page !== page) continue;
        const height = Math.max(1, stop.bottom - stop.top);
        const center = (stop.top + stop.bottom) / 2;
        const value = (stop.x - x) ** 2 + ((center - y) / height) ** 2;
        if (value < distance) { distance = value; best = i; }
      }
      if (best < 0) return null;
      index = anchor = best;
      return stops[best];
    },
    move(delta, extend = false) {
      const own = stops.filter(stop => sameFormula(stop, stops[index]));
      if (!own.length) return null;
      const position = own.findIndex(stop => stop === stops[index]);
      const next = Math.max(0, Math.min(own.length - 1, position + delta));
      index = stops.indexOf(own[next]);
      if (!extend) anchor = index;
      return stops[index];
    },
    selectBetween(fromOffset, toOffset) {
      const from = stops.findIndex(stop => stop.docOffset === fromOffset);
      const to = stops.findIndex(stop => stop.docOffset === toOffset);
      if (from < 0 || to < 0) return false;
      anchor = from; index = to;
      return true;
    },
    insert(text) {
      const stop = stops[index];
      if (!stop || typeof text !== 'string' || !text) return null;
      const start = Math.min(anchor, index), end = Math.max(anchor, index);
      const from = stops[start], to = stops[end];
      if (!sameFormula(from, stop) || from.slot.id !== to.slot.id) return null;
      try {
        const result = applySlotEdit(stop.formula.math, {
          slotId: stop.slot.id, from16: from.local, to16: to.local, insert: text,
        });
        pendingOffset = from.docOffset + text.length;
        lastEdit = {formula: stop.formula, patch: result.patch, text: result.source};
        return lastEdit;
      } catch { return null; }
    },
    erase(backward = true) {
      const stop = stops[index];
      if (!stop) return null;
      const own = formulaStops();
      const position = own.indexOf(stop);
      const neighbor = own[position + (backward ? -1 : 1)];
      if (!neighbor || neighbor.slot.id !== stop.slot.id) return null;
      const from = Math.min(stop.local, neighbor.local);
      const to = Math.max(stop.local, neighbor.local);
      if (from === to) return null;
      try {
        const result = applySlotEdit(stop.formula.math, {
          slotId: stop.slot.id, from16: from, to16: to, insert: '',
        });
        pendingOffset = stop.formula.from16 + stop.slot.from16 + from;
        lastEdit = {formula: stop.formula, patch: result.patch, text: result.source};
        return lastEdit;
      } catch { return null; }
    },
    clearPending() { pendingOffset = null; lastEdit = null; },
    reset() { stops = []; index = anchor = -1; pendingOffset = null; lastEdit = null; },
  };
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
