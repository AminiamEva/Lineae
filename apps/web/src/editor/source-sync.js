import { parseDocument } from '../../latex/document.mjs';
import { importBlocks, serialize } from './latex-codec.js';

// This is a projection of the authoritative source, not a second document.
// A rich edit may only replace a block whose original spelling round-trips
// exactly. All other bytes (including comments, macros and separators) survive.
export function sourceProjection(text, doc, options) {
  const parsed = parseDocument(text, options);
  if (!parsed) return null;
  let offset = parsed.start.length, index = 0;
  const blocks = parsed.blocks.map(raw => {
    const count = importBlocks(raw).length;
    const nodes = doc.content.slice(index, index + count);
    const canonical = nodes.map(serialize).join('').trim();
    const block = { from: offset, to: offset + raw.length, index, count, raw,
      editable: count > 0 && !nodes.some(node => node.type === 'raw') && raw.trim() === canonical,
      snapshot: JSON.stringify(nodes) };
    offset += raw.length;
    index += count;
    return block;
  });
  if (!index && doc.content.length === 1 && doc.content[0].type === 'paragraph' && !doc.content[0].content?.length) {
    blocks.splice(0, blocks.length, {from:parsed.start.length,to:text.length-parsed.end.length,
      index:0,count:1,raw:parsed.blocks.join(''),editable:true,snapshot:JSON.stringify(doc.content)});
    index = 1;
  }
  return index === doc.content.length ? { text, blocks, count: index } : null;
}

export function richSourceChanges(projection, doc) {
  if (!projection) return null;
  if (doc.content.length !== projection.count) {
    const before = projection.blocks.flatMap(block => JSON.parse(block.snapshot));
    const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    let first=0, oldEnd=before.length, newEnd=doc.content.length;
    while(first<oldEnd && first<newEnd && same(before[first],doc.content[first])) first++;
    while(oldEnd>first && newEnd>first && same(before[oldEnd-1],doc.content[newEnd-1])) {oldEnd--;newEnd--;}
    const block=projection.blocks.find(b=>b.editable && first>=b.index && oldEnd<=b.index+b.count && first<b.index+b.count);
    if (!block) return null;
    const nodes=doc.content.slice(block.index,block.index+block.count+doc.content.length-before.length);
    return patchBlock(block,nodes);
  }
  const changes = [];
  for (const block of projection.blocks) {
    const nodes = doc.content.slice(block.index, block.index + block.count);
    if (JSON.stringify(nodes) === block.snapshot) continue;
    if (!block.editable) return null;
    const patch = patchBlock(block,nodes);
    if (!patch) return null;
    changes.push(...patch);
  }
  return changes;
}

function patchBlock(block,nodes) {
    if (nodes.some(node => node.type === 'raw')) return null;
    const leading = block.raw.match(/^\s*/)[0];
    const trailing = block.raw.slice(leading.length).match(/\s*$/)[0];
    const body = nodes.map(serialize).join('').trim();
    // Prove the new block also round-trips through the existing importer.
    const parsed = parseDocument('\\begin{document}\n' + body + '\n\\end{document}\n');
    if (!parsed || parsed.blocks.flatMap(importBlocks).map(serialize).join('').trim() !== body) return null;
    const next = leading + body + trailing;
    // A minimal patch preserves untouched line endings inside a changed block.
    let a = 0, b = block.raw.length, c = next.length;
    while (a < b && a < c && block.raw[a] === next[a]) a++;
    while (b > a && c > a && block.raw[b - 1] === next[c - 1]) { b--; c--; }
    return [{from: block.from + a, to: block.from + b, insert: next.slice(a, c)}];
}
