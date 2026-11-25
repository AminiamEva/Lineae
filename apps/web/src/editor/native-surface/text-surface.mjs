import {createSelectionModel} from './selection-model.mjs';
import {textTarget, textEdit} from '../native-text/projection.mjs';

const segmenter = new Intl.Segmenter('und', {granularity:'grapheme'});

function stopsFor(observed, projection, verified) {
  const byOffset = new Map();
  for (const page of observed ?? []) {
    if ((!verified&&page?.exact!==true)||!page?.dl?.math_owners)continue;
    for (const field of page.dl.math_owners.fields ?? []) {
      if(!field.empty||!['math','cell'].includes(field.role))continue;
      const target=textTarget(projection,field.owner,false);
      if(!target?.paragraph.tableCell||target.paragraph.text)continue;
      byOffset.set(JSON.stringify([target.paragraph.filePath,target.docOffset]),{
        ...target,hit:{owner:field.owner,role:field.role},page:page.page,
        x:field.bbox[0],top:field.bbox[1],bottom:field.bbox[3],
      });
    }
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
        const key=JSON.stringify([target.paragraph.filePath,target.docOffset]);
        const previous = byOffset.get(key);
        // Prefer the boundary whose paragraph/glyph is stable; either side of a
        // space has no tag, so the nearest glyph edge is the caret.
        if (!previous || (!previous.after && after)) byOffset.set(key, stop);
      }
    }
  }
  return [...byOffset.values()].sort((a, b) => a.docOffset - b.docOffset);
}

export const sameParagraph = (a, b) =>
  a?.paragraph.filePath === b?.paragraph.filePath &&
  a?.paragraph.from16 === b?.paragraph.from16 && a?.paragraph.source === b?.paragraph.source;
const runsOf = paragraph => paragraph.runs ?? [{from16:0, to16:paragraph.text.length}];
const runAt = (paragraph, offset, backward) => runsOf(paragraph).find(run =>
  backward ? offset > run.from16 && offset <= run.to16 : offset >= run.from16 && offset < run.to16) ?? null;
const boundariesOf = (run, fallback) => {
  const boundaries=[run.from16];
  let local=0;
  for(const {segment} of segmenter.segment(run.text??fallback)){
    local+=segment.length;
    boundaries.push(run.from16+(run.offsets?.[local]??local));
  }
  return boundaries;
};

export function createTextSurface({projection,selection=createSelectionModel(sameParagraph,stop=>stop.paragraph.filePath)}) {
  let sourceProjection = projection;
  return Object.assign(Object.create(selection), {
    setProjection(next) { if (next) sourceProjection = next; },
    collectStops(observed,verified) { return stopsFor(observed,sourceProjection,verified); },
    setObservation(observed) { return selection.setStops(stopsFor(observed, sourceProjection)); },
    insert(text) {
      const stop = selection.caret;
      if (!stop || !text) return null;
      const [start, end] = selection.range;
      if (!sameParagraph(start, stop)) return null;
      const result = textEdit(sourceProjection, {
        paragraph: stop.paragraph, from16: start.local, to16: end.local, insert: text,
      });
      if (!result) return null;
      return selection.record({kind:'text', paragraph: stop.paragraph, ...result}, stop.paragraph.from16 + result.selection);
    },
    erase(backward = true) {
      const stop = selection.caret;
      if (!stop) return null;
      let from, to;
      if (selection.anchor !== stop) {
        const [start, end] = selection.range;
        from = Math.min(start.local, end.local);
        to = Math.max(start.local, end.local);
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
      return selection.record({kind:'text', paragraph: stop.paragraph, ...result}, stop.paragraph.from16 + result.selection);
    },

  });
}
