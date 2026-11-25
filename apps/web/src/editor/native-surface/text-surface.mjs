import {textTarget, textEdit} from '../native-text/projection.mjs';

const segmenter = new Intl.Segmenter('und', {granularity:'grapheme'});

function stopsFor(observed, projection) {
  const byOffset = new Map();
  for (const page of observed ?? []) {
    if (page?.exact !== true || !page.dl?.math_owners) continue;
    for (const glyph of page.dl.math_owners.glyphs ?? []) {
      if (!projection.owners.has(glyph.owner)) continue;
      for (const after of [false, true]) {
        const target = textTarget(projection, glyph.owner, after);
        if (!target) continue;
        const stop = {
          ...target, page: page.page,
          x: after ? glyph.bbox[2] : glyph.bbox[0],
          top: glyph.bbox[1], bottom: glyph.bbox[3],
        };
        const previous = byOffset.get(target.docOffset);
        // Prefer the boundary whose paragraph/glyph is stable; either side of a
        // space has no tag, so the nearest glyph edge is the caret.
        if (!previous || (!previous.after && after)) byOffset.set(target.docOffset, stop);
      }
    }
  }
  return [...byOffset.values()].sort((a, b) => a.docOffset - b.docOffset);
}

const sameParagraph = (a, b) =>
  a?.paragraph.from16 === b?.paragraph.from16 && a?.paragraph.source === b?.paragraph.source;
const runsOf = paragraph => paragraph.runs ?? [{from16:0, to16:paragraph.text.length}];
const runFor = (paragraph, from16, to16) =>
  runsOf(paragraph).find(run => from16 >= run.from16 && to16 <= run.to16) ?? null;
const runAt = (paragraph, offset, backward) => runsOf(paragraph).find(run =>
  backward ? offset > run.from16 && offset <= run.to16 : offset >= run.from16 && offset < run.to16) ?? null;
const boundariesOf = (run, fallback) => {
  const boundaries = [run.from16];
  for (const {segment} of segmenter.segment(run.text ?? fallback))
    boundaries.push(boundaries.at(-1) + segment.length);
  return boundaries;
};

export function createTextSurface({projection}) {
  let sourceProjection = projection;
  let stops = [], index = -1, anchor = -1, pendingOffset = null, lastEdit = null;

  const own = () => index < 0 ? [] :
    stops.filter(stop => sameParagraph(stop, stops[index]));

  return {
    get stops() { return stops; },
    get caret() { return stops[index] ?? null; },
    get anchor() { return stops[anchor] ?? null; },
    get pendingOffset() { return pendingOffset; },
    get lastEdit() { return lastEdit; },
    setProjection(next) { if (next) sourceProjection = next; },
    setObservation(observed) {
      stops = stopsFor(observed, sourceProjection);
      if (!stops.length) { index = anchor = -1; return false; }
      if (pendingOffset !== null) {
        const exact = stops.findIndex(stop => stop.docOffset === pendingOffset);
        pendingOffset = null;
        if (exact >= 0) { index = anchor = exact; return true; }
      }
      const current = stops[index];
      index = current ? Math.max(0, stops.findIndex(stop => stop.docOffset === current.docOffset)) : 0;
      anchor = index;
      return true;
    },
    nearest(page, x, y) {
      let best = -1, distance = Infinity;
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (stop.page !== page) continue;
        const height = Math.max(1, stop.bottom - stop.top);
        const value = (stop.x - x) ** 2 + (((stop.top + stop.bottom) / 2 - y) / height) ** 2;
        if (value < distance) { distance = value; best = i; }
      }
      if (best < 0) return null;
      index = anchor = best;
      return stops[best];
    },
    move(delta, extend = false) {
      const list = own();
      if (!list.length) return null;
      const position = list.indexOf(stops[index]);
      const next = Math.max(0, Math.min(list.length - 1, position + delta));
      index = stops.indexOf(list[next]);
      if (!extend) anchor = index;
      return stops[index];
    },
    selectBetween(fromOffset, toOffset) {
      const from = stops.findIndex(stop => stop.docOffset === fromOffset);
      const to = stops.findIndex(stop => stop.docOffset === toOffset);
      if (from < 0 || to < 0 || !sameParagraph(stops[from], stops[to])) return false;
      anchor = from; index = to;
      return true;
    },
    insert(text) {
      const stop = stops[index];
      if (!stop || !text) return null;
      const start = stops[Math.min(anchor, index)], end = stops[Math.max(anchor, index)];
      if (!sameParagraph(start, stop) || !runFor(stop.paragraph, start.local, end.local)) return null;
      const result = textEdit(sourceProjection, {
        paragraph: stop.paragraph, from16: start.local, to16: end.local, insert: text,
      });
      if (!result) return null;
      pendingOffset = stop.paragraph.from16 + result.selection;
      lastEdit = {kind:'text', paragraph: stop.paragraph, ...result};
      return lastEdit;
    },
    erase(backward = true) {
      const stop = stops[index];
      if (!stop) return null;
      let from, to;
      if (anchor !== index) {
        const start = stops[Math.min(anchor, index)], end = stops[Math.max(anchor, index)];
        from = Math.min(start.local, end.local);
        to = Math.max(start.local, end.local);
        if (!runFor(stop.paragraph, from, to)) return null;
      } else {
        const run = runAt(stop.paragraph, stop.local, backward);
        if (!run) return null;
        const boundaries = boundariesOf(run, stop.paragraph.text);
        if (backward) {
          to = boundaries.filter(boundary => boundary <= stop.local).at(-1) ?? run.from16;
          from = boundaries[boundaries.indexOf(to) - 1] ?? run.from16;
        } else {
          from = boundaries.find(boundary => boundary >= stop.local) ?? run.to16;
          to = boundaries[boundaries.indexOf(from) + 1] ?? run.to16;
        }
      }
      if (from === to) return null;
      const result = textEdit(sourceProjection, {
        paragraph: stop.paragraph, from16: from, to16: to, insert: '',
      });
      if (!result) return null;
      pendingOffset = stop.paragraph.from16 + result.selection;
      lastEdit = {kind:'text', paragraph: stop.paragraph, ...result};
      return lastEdit;
    },
    clearPending() { pendingOffset = null; lastEdit = null; },
    reset() { stops = []; index = anchor = -1; pendingOffset = null; lastEdit = null; },
  };
}
