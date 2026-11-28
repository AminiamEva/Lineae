import {parseDocument} from '../../../latex/document.mjs';
import {serialize} from '../../editor/latex-codec.js';

// All offsets originate in the source being sent to rtex. DOM and ProseMirror
// positions belong to this snapshot only. Empty editing paragraphs have no ink.
const encoder = new TextEncoder();
const serializedNodes = new WeakMap();

function serializedBlock(node) {
  if (!serializedNodes.has(node)) serializedNodes.set(node, serialize(node.toJSON()));
  return serializedNodes.get(node);
}

function generatedBlocks(source, doc) {
  const parsed = parseDocument(source);
  if (!parsed) return [];
  const blocks = [];
  let body = '';
  doc.forEach((node, _, index) => {
    const raw = serializedBlock(node);
    blocks.push({from:body.length, to:body.length + raw.length, raw, index, count:1});
    body += raw;
    if (node.type.name === 'raw' && index + 1 < doc.childCount && !/(?:\r?\n)[ \t]*(?:\r?\n)[ \t]*$/.test(raw)) {
      const ending=raw.match(/\r?\n[ \t]*$/)?.[0];
      body+=ending?(ending.startsWith('\r\n')?'\r\n':'\n'):'\n\n';
    }
  });
  const actual = source.slice(parsed.start.length, source.length - parsed.end.length);
  const separator = body && !body.endsWith('\n') ? parsed.eol : '';
  if (!actual.endsWith(body + separator)) return [];
  const prefix = actual.slice(0, actual.length - body.length - separator.length);
  if (prefix.trim() && prefix.trim() !== '\\maketitle') return [];
  const base = parsed.start.length + prefix.length;
  return blocks.map(block => ({...block, from:base + block.from, to:base + block.to}));
}

// Capture before awaiting asset reads. A subsequent transaction may reuse an
// element for its modified paragraph, so retain the immutable text as well.
export function richSourceMap(view, {path, source, projection, composition, prefix = ''}) {
  const files = new Map();
  function register(file, bytes, doc, position, blocks, base) {
    let group = files.get(file);
    if (!group) files.set(file, group = {source:bytes, entries:[]});
    if (group.source !== bytes) return;
    const index = new Map(blocks.filter(b => b.count > 0).map(b => [b.index,b]));
    doc.forEach((node, offset, i) => {
      if (!['paragraph','heading','mathBlock'].includes(node.type.name)) return;
      const b = index.get(i);
      if (!b) return;
      // The lossless source codec can group a final paragraph and its empty
      // typing tail. The final paragraph still has exactly one ink owner.
      if (b.snapshot) {
        const group=Array.from({length:b.count},(_,n)=>doc.maybeChild(i+n));
        if(group.some(n=>!n) || group.slice(1).some(n=>n.type.name!=='paragraph'||n.content.size) ||
           JSON.stringify(group.map(n=>n.toJSON()))!==b.snapshot)return;
      }
      if (bytes.slice(base + b.from, base + b.to) !== b.raw) return;
      const raw = b.raw.trim();
      if (!raw) return;
      const from = base + b.from + b.raw.indexOf(raw);
      const element = view.nodeDOM(position + offset);
      if (element?.nodeType !== 1) return;
      const simple = node.isTextblock && node.content.content.every(child => child.isText || child.type.name === 'hardBreak');
      group.entries.push({element,node,position:position+offset, text:simple ? node.textBetween(0,node.content.size,'','\n') : null,
        heading:node.type.name === 'heading', start:from, end:from + raw.length});
    });
  }
  if (composition && view.state.doc.firstChild?.type.name === 'projectRegion') {
    view.state.doc.forEach((regionNode, offset, index) => {
      const region = composition.regions[index];
      if (!region?.projection || region.key !== regionNode.attrs.regionKey) return;
      const text = composition.sources.get(region.id);
      if (typeof text === 'string') register(region.path, text, regionNode, offset+1, region.projection.blocks, region.from);
    });
  } else {
    const src = prefix + source;
    const blocks = projection?.text === source ? projection.blocks : generatedBlocks(source, view.state.doc);
    register(path, src, view.state.doc, 0, blocks, prefix.length);
  }
  for (const group of files.values()) {
    const offsets = new Set(group.entries.flatMap(e => [e.start,e.end]));
    const bytes = new Map();
    let previous = 0, total = 0;
    for (const at of [...offsets].sort((a,b) => a-b)) {
      total += encoder.encode(group.source.slice(previous,at)).length;
      bytes.set(at,total); previous=at;
    }
    for (const e of group.entries) {e.start=bytes.get(e.start);e.end=bytes.get(e.end);}
    delete group.source;
  }
  return new Map([...files].filter(([,group]) => group.entries.length).map(([file,group]) => [file,group.entries]));
}

// A span can include a directive (e.g. \newpage). If several editable blocks
// share one rtex container, only the independent observer can disambiguate it.
export function bindRichSpans(files, spans) {
  const owners = new Map();
  for (const [path,entries] of files ?? []) {
    const ranges = (spans?.[path] ?? []).filter(s => s.kind !== 'Preamble' && s.kind !== 'Trailer').sort((a,b)=>a.range.start-b.range.start);
    let i=0;
    for (const entry of [...entries].sort((a,b)=>a.start-b.start)) {
      while (i<ranges.length && ranges[i].range.end<=entry.start) i++;
      const span=ranges[i];
      if (!span || span.range.start>entry.start || span.range.end<entry.end) continue;
      owners.set(span.id,owners.has(span.id) ? null : entry);
    }
  }
  return owners;
}
