import {paragraphSpelling} from './source-spelling.mjs';
import {includeEmptyParagraphs,ownsEditedRange,blockWhitespace,splitEditableBoundaries} from './source-boundaries.mjs';
import { parseDocument } from '../../latex/document.mjs';
import { importBlocks, serialize } from './latex-codec.js';
import {serializeTblr,serializeSourceTable,environmentEnd} from '../../latex/tblr.mjs';
import {sourceStructure} from '../../latex/source-structure.mjs';
import {serializeSourceFigure} from '../../latex/images.mjs';
import {serializeTextEnvironment} from '../../latex/text-environments.mjs';

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
    const spelling=paragraphSpelling(raw,canonical,nodes);
    const block = { spelling, from: offset, to: offset + raw.length, index, count, raw,
      editable: count > 0 && !nodes.some(node => node.type === 'raw') && (raw.trim() === canonical || !!spelling),
      snapshot: JSON.stringify(nodes) };
    offset += raw.length;
    index += count;
    return block;
  });
  const editableBlocks=splitEditableBoundaries(blocks,doc);
  index = includeEmptyParagraphs(editableBlocks,index,parsed,text,doc);
  if(options?.emptyPrefix!==undefined&&!text.trim()&&editableBlocks.length===1){editableBlocks[0].emptyPrefix=options.emptyPrefix;editableBlocks[0].emptySuffix=options.emptySuffix;}
  return index === doc.content.length ? { text, blocks:editableBlocks, count: index } : null;
}

// Keep the imported draft authoritative even when the rich view omits source
// trivia. Only the transaction's top-level paragraph may own the patch.
function standaloneTextChanges(text,projection,snapshot,before,after,index) {
  const previous=before.content[index], next=after.content[index];
  const empty=node=>node.type==='paragraph' && !node.content?.length && !serialize(node).trim();
  if(previous?.type!=='paragraph' || next?.type!=='paragraph')return null;
  if(snapshot!==JSON.stringify(before)) {
    // Double-clicking below a terminal table can add a visual typing paragraph.
    // Accept only extra empty paragraphs after the exact imported document.
    const saved=JSON.parse(snapshot), length=saved.content.length;
    const addedEmptyTail=index>=length && before.content.slice(length).every(empty) &&
      snapshot===JSON.stringify({...before,content:before.content.slice(0,length)});
    if(!addedEmptyTail) {
      // An earlier authoring command (e.g. exiting a code block) may already
      // have changed the rich tree. Reconcile it only through verified ranges.
      if(!projection)return null;
      if(projection.text!==text) {
        const old=parseDocument(projection.text), current=parseDocument(text);
        if(!old || !current || projection.text.slice(old.start.length)!==text.slice(current.start.length))return null;
        projection=sourceProjection(text,saved);
      }
      const prior=richSourceChanges(projection,before);
      if(!prior?.length)return null;
      const apply=(draft,changes)=>changes.reduceRight((value,{from,to,insert})=>
        value.slice(0,from)+insert+value.slice(to),draft);
      const draft=apply(text,prior);
      const changes=standaloneTextChanges(draft,null,JSON.stringify(before),before,after,index);
      return changes ? minimalChange(text,apply(draft,changes),0) : null;
    }
  }
  // Empty typing paragraphs have no bytes. Exclude those placeholders when
  // matching source indices, keeping every nonempty node in document order.
  const mapped=projection?.text===text && projection.blocks.find(b=>b.index===index && b.count===1 &&
    b.snapshot===JSON.stringify([previous]) && text.slice(b.from,b.to)===b.raw);
  if(empty(previous) && Number.isInteger(mapped?.emptyOffset)) {
    const at=mapped.from+mapped.emptyOffset;
    if(at<mapped.from || at>mapped.to)return null;
    return [{from:at,to:at,insert:serialize(next).slice(0,-2)}];
  }
  const nodes=mapped ? before.content : before.content.filter(node=>!empty(node));
  const sourceIndex=mapped ? index : before.content.slice(0,index).filter(node=>!empty(node)).length;
  if(empty(previous) && index===before.content.length-1) {
    const parsed=parseDocument(text);
    if(!parsed || parsed.blocks.flatMap(importBlocks).length!==sourceIndex)return null;
    const at=text.length-parsed.end.length;
    return [{from:at,to:at,insert:parsed.eol+serialize(next).slice(0,-2)+parsed.eol}];
  }
  const base=nodes.length===before.content.length && projection?.text===text ? projection :
    sourceProjection(text,{...before,content:nodes});
  const block=base?.blocks.find(b=>sourceIndex>=b.index && sourceIndex<b.index+b.count);
  if(!block || text.slice(block.from,block.to)!==block.raw ||
      block.snapshot!==JSON.stringify(nodes.slice(block.index,block.index+block.count)))return null;
  // Compare content without the serializer's two-byte paragraph separator.
  // Preserve both source trivia and literal spaces typed by the user.
  if(block.count===1 && block.editable && !block.spelling) {
    const oldBody=serialize(previous).slice(0,-2),newBody=serialize(next).slice(0,-2);
    const start=block.raw.indexOf(oldBody);
    if(start>=0 && !block.raw.slice(0,start).trim() && !block.raw.slice(start+oldBody.length).trim())
      return minimalChange(oldBody,newBody,block.from+start);
  }
  const updated=nodes.slice();
  updated[sourceIndex]=next;
  const changes=richSourceChanges(base,{...after,content:updated});
  if(!changes?.some(c=>c.insert || c.from!==c.to) || changes.some(c=>c.from<block.from || c.to<c.from || c.to>block.to))return null;
  return changes;
}

export function standaloneParagraphDraft(text,projection,snapshot,before,after,index) {
  const changes=standaloneTextChanges(text,projection,snapshot,before,after,index);
  if(!changes)return null;
  const draft=changes.reduceRight((value,{from,to,insert})=>value.slice(0,from)+insert+value.slice(to),text);
  const [patch]=changes;
  const owner=projection?.text===text && projection.blocks.find(block=>block.index===index &&
    block.count===1 && block.editable && !block.spelling && block.snapshot===JSON.stringify([before.content[index]]));
  // Retain a proven block boundary across keystrokes, including when deleting
  // its last character. Re-parsing whitespace alone would lose that position.
  if(owner && changes.length===1 && patch.from>=owner.from && patch.to<=owner.to) {
    const delta=draft.length-text.length, ownerIndex=projection.blocks.indexOf(owner);
    const blocks=projection.blocks.map((block,i)=>{
      if(i<ownerIndex)return block;
      if(i>ownerIndex)return {...block,from:block.from+delta,to:block.to+delta};
      const to=block.to+delta;
      return {...block,to,raw:draft.slice(block.from,to),snapshot:JSON.stringify([after.content[index]]),
        emptyOffset:!after.content[index].content?.length && !patch.insert ? patch.from-block.from : undefined};
    });
    return {draft,changes,projection:{...projection,text:draft,blocks}};
  }
  return {draft,changes,projection:sourceProjection(draft,after)};
}

export function richSourceChanges(projection, doc) {
  if (!projection) return null;
  if (doc.content.length !== projection.count) {
    const before = projection.blocks.flatMap(block => JSON.parse(block.snapshot));
    const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    let first=0, oldEnd=before.length, newEnd=doc.content.length;
    while(first<oldEnd && first<newEnd && same(before[first],doc.content[first])) first++;
    while(oldEnd>first && newEnd>first && same(before[oldEnd-1],doc.content[newEnd-1])) {oldEnd--;newEnd--;}
    const block=projection.blocks.find(block=>ownsEditedRange(block,first,oldEnd));
    if (!block) return null;
    const nodes=doc.content.slice(block.index,block.index+block.count+doc.content.length-before.length);
    return patchBlock(block,nodes);
  }
  const changes = [];
  for (const block of projection.blocks) {
    const nodes = doc.content.slice(block.index, block.index + block.count);
    if (JSON.stringify(nodes) === block.snapshot) continue;
    const patch = block.editable ? patchBlock(block,nodes) : patchIsolatedTables(block,nodes);
    if (!patch) return null;
    changes.push(...patch);
  }
  return changes;
}

// A protected neighbor must stay untouched, but need not block a source-backed
// table's cell edit. Locate only real outer environments, never quoted examples
// in comments, macro definitions or Raw containers. Equal tables map by order.
function patchIsolatedTables(block,nodes) {
  const before=JSON.parse(block.snapshot);
  if(nodes.length!==before.length)return null;
  const sources=before.map(node=>node.attrs?.longtable ? serializeSourceTable(node,serialize,'longtable') : node.type==='table'&&node.attrs?.tblr ? serializeTblr(node,serialize) : null);
  const starts=[...sourceStructure(block.raw)].filter(token=>token.kind==='begin'&&token.topLevel);
  const changes=[];
  for(let i=0;i<nodes.length;i++) {
    if(JSON.stringify(before[i])===JSON.stringify(nodes[i]))continue;
    const source=sources[i],node=nodes[i];
    if(!source||node.type!=='table'||JSON.stringify(node.attrs)!==JSON.stringify(before[i].attrs))return null;
    const leading=source.length-source.trimStart().length,body=source.trim();
    const ranges=starts.flatMap(token=>{
      const name=/^\\begin\{(table\*?|tblr|longtable)\}$/.exec(token.value)?.[1];
      if(!name)return [];
      const end=environmentEnd(block.raw,token.index,name);
      return end&&block.raw.slice(token.index,end.end)===body ? [token.index] : [];
    });
    const peers=sources.flatMap((value,index)=>value?.trim()===body?[index]:[]);
    if(ranges.length!==peers.length)return null;
    const start=ranges[peers.indexOf(i)]-leading;
    if(start<0||block.raw.slice(start,start+source.length)!==source)return null;
    const from=block.from+start;
    const patch=patchBlock({...block,from,to:from+source.length,raw:source,count:1,snapshot:JSON.stringify([before[i]])},[node]);
    if(!patch)return null;
    changes.push(...patch);
  }
  changes.sort((a,b)=>a.from-b.from);
  if(changes.some((change,i)=>i&&change.from<changes[i-1].to))return null;
  return changes;
}

function patchBlock(block,nodes) {
    if (nodes.some(node => node.type === 'raw')) return null;
    const environments=list=>list.flatMap(node=>[
      ...(node.attrs?.environmentSource?[node.attrs.environmentSource.source]:[]),...environments(node.content??[])]);
    if(JSON.stringify(environments(JSON.parse(block.snapshot)).sort())!==JSON.stringify(environments(nodes).sort()))return null;
    const unsafe=node=>Boolean(node.attrs?.environmentSource&&serializeTextEnvironment(node,serialize)===null)||
      Boolean(node.type==='documentImage'&&node.attrs?.figureSource&&serializeSourceFigure(node.attrs)===null)||
      Boolean(node.type==='table'&&node.attrs?.tblr&&serializeTblr(node,serialize)===null)||
      Boolean(node.type==='table'&&node.attrs?.longtable&&serializeSourceTable(node,serialize,'longtable')===null)||
      Boolean(node.type==='table'&&node.attrs?.tabularx&&serializeSourceTable(node,serialize,'tabularx')===null)||
      (node.content??[]).some(unsafe);
    if(nodes.some(unsafe))return null;
    if(block.spelling?.unicode){
      if(nodes.length!==1||nodes[0].type!=='paragraph')return null;
      const spelling=block.spelling,body=serialize(nodes[0]).slice(0,-2),old=spelling.canonicalBody;
      const [patch]=minimalChange(old,body,0);let from=patch.from,to=patch.to;
      while(from>0&&spelling.map[spelling.start+from]===null)from--;
      while(to<old.length&&spelling.map[spelling.start+to]===null)to++;
      const a=spelling.map[spelling.start+from],b=spelling.map[spelling.start+to];if(!Number.isInteger(a)||!Number.isInteger(b))return null;
      return [{from:block.from+a,to:block.from+b,insert:old.slice(from,patch.from)+patch.insert+old.slice(patch.to,to)}];
    }
    const [leading,trailing] = block.emptyPrefix!==undefined&&!block.raw.trim()?[block.emptyPrefix,block.emptySuffix??'']:blockWhitespace(block.raw);
    const body = nodes.map(serialize).join('').trim();
    // Prove the new block also round-trips through the existing importer.
    const parsed = parseDocument('\\begin{document}\n' + body + '\n\\end{document}\n');
    if (!parsed || parsed.blocks.flatMap(importBlocks).map(serialize).join('').trim() !== body) return null;
    const originalBody=block.spelling&&body.startsWith(block.spelling.canonical)
      ? block.spelling.original+body.slice(block.spelling.canonical.length) : body;
    const next = leading + originalBody + trailing;
    return minimalChange(block.raw,next,block.from);
}

function minimalChange(original,next,from) {
  let a=0, b=original.length, c=next.length;
  while(a<b && a<c && original[a]===next[a]) a++;
  while(b>a && c>a && original[b-1]===next[c-1]) {b--;c--;}
  return [{from:from+a,to:from+b,insert:next.slice(a,c)}];
}
