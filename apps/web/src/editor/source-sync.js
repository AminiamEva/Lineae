import {plainTableCells,tableCellRanges} from './native-text/table-cells.mjs';
import {containerParagraphRanges,plainContainerParagraphs,plainParagraphText} from './native-text/containers.mjs';
import {paragraphSpelling,mathSpelling,proseSpelling} from './source-spelling.mjs';
import {includeEmptyParagraphs,ownsEditedRange,blockWhitespace,splitEditableBoundaries} from './source-boundaries.mjs';
import { parseDocument } from '../../latex/document.mjs';
import { importBlocks, serialize } from './latex-codec.js';
import {serializeTblr,serializeSourceTable,environmentEnd} from '../../latex/tblr.mjs';
import {sourceStructure} from '../../latex/source-structure.mjs';
import {serializeSourceFigure,tikzDrawingRanges} from '../../latex/images.mjs';
import {serializeTextEnvironment} from '../../latex/text-environments.mjs';
import {markedRuns} from './native-text/prose-runs.mjs';

// This is a projection of the authoritative source, not a second document.
// A rich edit may only replace a block whose original spelling round-trips
// exactly. All other bytes (including comments, macros and separators) survive.
const typingGap = node => node.type === 'paragraph' && !node.content?.length && !serialize(node).trim();

const referenceSubtrees=new WeakMap();
function containsSourceReference(node){
  if(referenceSubtrees.has(node))return referenceSubtrees.get(node);
  const attrs=node.attrs;
  const result=Boolean(attrs.sourceCommand || attrs.labelSource || attrs.environmentSource ||
    node.content.content.some(containsSourceReference));
  referenceSubtrees.set(node,result);
  return result;
}

export function requiresSourceProjection(doc){
  // A keystroke replaces only its ancestors in the immutable ProseMirror
  // tree. Never serialize the entire document just to choose a writeback path.
  return containsSourceReference(doc) || doc.content.content.some(node=>node.type.name==='raw' ||
    node.attrs.longtable || node.attrs.tblr || node.attrs.tabularx || node.attrs.figureSource);
}

export function sourceProjection(text, doc, options) {
  const ordinary = projectBlocks(text,doc,options);
  if (ordinary) return ordinary;
  // TeX consumes a run of empty authoring paragraphs as one separator. Keep
  // their zero-byte insertion points separate from the next serialized block.
  const indices = doc.content.map((_,i)=>i).filter(i=>!typingGap(doc.content[i]));
  if (!indices.length || indices.length===doc.content.length) return null;
  const compact = projectBlocks(text,{...doc,content:indices.map(i=>doc.content[i])},options);
  if (!compact) return null;
  const blocks=[];
  for (const block of compact.blocks) {
    const index=indices[block.index]??doc.content.length;
    if (block.count && indices[block.index+block.count-1]!==index+block.count-1) return null;
    blocks.push({...block,index});
  }
  const starts=new Map(blocks.filter(b=>b.count).map(b=>[b.index,b.from]));
  const parsed=parseDocument(text,options);
  let next=text.length-parsed.end.length;
  for(let index=doc.content.length-1;index>=0;index--){
    if(!typingGap(doc.content[index])){next=starts.get(index);continue;}
    if(next===undefined)return null;
    const spacing=parsed.eol+parsed.eol;
    const emptyPrefix=/(?:\r?\n)[ \t]*(?:\r?\n)[ \t]*$/.test(text.slice(0,next))?'':spacing;
    const emptySuffix=/^[ \t]*(?:\r?\n)[ \t]*(?:\r?\n)/.test(text.slice(next))?'':spacing;
    blocks.push({emptyPrefix,emptySuffix,index,count:1,raw:'',from:next,to:next,editable:true,typingGap:true,
      snapshot:JSON.stringify([doc.content[index]])});
  }
  blocks.sort((a,b)=>a.from-b.from || a.index-b.index || a.to-b.to);
  return {text,blocks,count:doc.content.length};
}

function projectBlocks(text, doc, options) {
  const parsed = parseDocument(text, options);
  if (!parsed) return null;
  let offset = parsed.start.length, index = 0;
  const blocks = parsed.blocks.map(raw => {
    const count = importBlocks(raw).length;
    const nodes = doc.content.slice(index, index + count);
    const canonical = nodes.map(serialize).join('').trim();
    const spelling=mathSpelling(raw,nodes)??paragraphSpelling(raw,canonical,nodes)??
      (nodes.length===1&&nodes[0].type==='table'&&plainTableCells(raw)?{plainTable:true}:null);
    const block = { spelling, from: offset, to: offset + raw.length, index, count, raw,
      editable: count > 0 && !nodes.some(node => node.type === 'raw') && (raw.trim() === canonical || !!spelling),
      tableCells: nodes.length===1 && nodes[0].type==='table' && Boolean(tableCellRanges(raw)),
      tikz: nodes.length===1 && tikzDrawingRanges(raw,nodes[0]).length>0,
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
  const empty=typingGap;
  if(!snapshot||!['paragraph','heading'].includes(previous?.type)||next?.type!==previous.type)return null;
  // Enter can change only the number of visual paragraphs. Their source
  // ownership is an insertion point, never the following paragraph's bytes.
  if(empty(previous) && index<before.content.length-1){
    const saved=JSON.parse(snapshot);
    if(JSON.stringify(saved.content.filter(node=>!empty(node)))===JSON.stringify(before.content.filter(node=>!empty(node)))){
      const base=projection?.text===text && snapshot===JSON.stringify(before)?projection:null;
      const gap=(base??sourceProjection(text,before))?.blocks.find(b=>b.typingGap&&b.index===index);
      if(gap){
        return [{from:gap.from,to:gap.to,insert:gap.emptyPrefix+serialize(next).slice(0,-2)+gap.emptySuffix}];
      }
    }
  }
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
  if(empty(previous) && !mapped && index<before.content.length-1)return null;
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
  if(!block.editable){
    const changes=typedProseChange(block,previous,next);
    if(changes)return changes;
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
    block.count===1 && block.editable && !block.typingGap && !block.spelling && block.snapshot===JSON.stringify([before.content[index]]));
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

export function richSourceChanges(projection, doc, {editProse=false}={}) {
  if (!projection) return null;
  if (doc.content.length !== projection.count) {
    const before = projection.blocks.flatMap(block => JSON.parse(block.snapshot));
    const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    let first=0, oldEnd=before.length, newEnd=doc.content.length;
    while(first<oldEnd && first<newEnd && same(before[first],doc.content[first])) first++;
    while(oldEnd>first && newEnd>first && same(before[oldEnd-1],doc.content[newEnd-1])) {oldEnd--;newEnd--;}
    if(oldEnd===first && before[first]?.type==='paragraph' && doc.content.slice(first,newEnd).every(typingGap)){
      const next=projection.blocks.find(b=>b.index===first && b.count===1);
      if(next){
        const eol=projection.text.match(/\r?\n/)?.[0]??'\n';
        return [{from:next.from,to:next.from,insert:(eol+eol).repeat(newEnd-first)}];
      }
    }
    const block=projection.blocks.find(block=>ownsEditedRange(block,first,oldEnd));
    if (!block) {
      if(oldEnd>=first+2 && newEnd===first+1)return plainParagraphJoin(projection,before.slice(first,oldEnd),doc.content[first],first);
      const owner=oldEnd===first+1 && projection.blocks.find(b=>b.index===first && b.count===1);
      return owner?paragraphSplitChange(projection,owner,before[first],doc.content.slice(first,newEnd)):null;
    }
    const nodes=doc.content.slice(block.index,block.index+block.count+doc.content.length-before.length);
    const split=paragraphSplitChange(projection,block,before[block.index],nodes);
    if(split)return split;
    return patchBlock(block,nodes);
  }
  const changes = [];
  for (const block of projection.blocks) {
    const nodes = doc.content.slice(block.index, block.index + block.count);
    if (JSON.stringify(nodes) === block.snapshot) continue;
    const typed=editProse && !block.editable && nodes.length===1
      ?typedProseChange(block,JSON.parse(block.snapshot)[0],nodes[0]):null;
    const patch = typed ?? patchPlainTabular(block,nodes) ?? (block.editable ? patchBlock(block,nodes) :
      inlineMathChanges(block,nodes)??markedInlineProseChanges(block,nodes)??plainTableChanges(block,nodes)??tikzFigureChanges(block,nodes)??
      theoremParagraphChanges(block,nodes)??containerProseChanges(block,nodes)??patchIsolatedTables(block,nodes));
    if (!patch) return null;
    changes.push(...patch);
  }
  return changes;
}

function typedProseChange(block,before,after) {
  if(block.count!==1 || before?.type!=='paragraph' || after?.type!=='paragraph' ||
      JSON.stringify(before.attrs)!==JSON.stringify(after.attrs) || !before.content?.length)return null;
  const old=before.content,next=after.content??[];
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  let first=0,left=old.length,right=next.length;
  while(first<left && first<right && same(old[first],next[first]))first++;
  while(first<left && first<right && same(old[left-1],next[right-1])){left--;right--;}
  if(left-first>1 || right-first>1 || (left===first && right===first))return null;
  const removed=first<left?old[first]:null, inserted=first<right?next[first]:null;
  if((removed && removed.type!=='text') || (inserted && inserted.type!=='text') ||
      (removed && inserted && !same(removed.marks,inserted.marks)))return null;
  const spelling=proseSpelling(block.raw,serialize(before).slice(0,-2),before.content);
  return spelling?patchSpelling(block,serialize(after).slice(0,-2),spelling):null;
}

// Enter is an authored separator. A TeX import discards horizontal space at
// paragraph edges, so re-importing the joined result cannot prove this edit.
// Verify the original bytes and both inline halves before inserting the break.
function paragraphSplitChange(projection,block,original,parts) {
  if(block.count!==1 || parts.length<2 || original?.type!=='paragraph' ||
      parts.some(node=>node.type!=='paragraph') || block.snapshot!==JSON.stringify([original]))return null;
  const joined=[];
  for(const part of parts)for(const child of part.content??[]){
    const last=joined.at(-1);
    if(child.type==='text' && last?.type==='text' && JSON.stringify(last.marks)===JSON.stringify(child.marks)){
      joined[joined.length-1]={...last,text:last.text+child.text};
    }else joined.push(child);
  }
  if(JSON.stringify(original.content??[])!==JSON.stringify(joined))return null;
  let previous=serialize(original).slice(0,-2);
  if(!previous.trim())return null;
  const eol=block.raw.match(/\r?\n/)?.[0]??projection.text.slice(block.to).match(/\r?\n/)?.[0]??
    projection.text.match(/\r?\n/)?.[0]??'\n';
  let replacement=parts.map(node=>serialize(node).slice(0,-2)).join(eol+eol);
  const spelling=block.spelling;
  if(spelling?.unicode && spelling.canonicalBody===previous)return patchSpelling(block,replacement,spelling);
  if(spelling?.canonical && previous.startsWith(spelling.canonical) && replacement.startsWith(spelling.canonical)){
    previous=spelling.original+previous.slice(spelling.canonical.length);
    replacement=spelling.original+replacement.slice(spelling.canonical.length);
  }
  const at=block.raw.indexOf(previous);
  if(at>=0 && !block.raw.slice(0,at).trim() && !block.raw.slice(at+previous.length).trim())
    return minimalChange(previous,replacement,block.from+at);
  const mapped=proseSpelling(block.raw,previous,original.content);
  return mapped?patchSpelling(block,replacement,mapped,true):null;
}

// Imported tabular rows may have extra space before their terminators.
// Map the serializer's single edit to original offsets, retaining row trivia
// and line endings. Decline any spelling whose ownership we cannot prove.
function patchPlainTabular(block, nodes) {
  if (nodes.length !== 1 || !nodes[0].attrs?.atomicTabular) return null;
  const [before] = JSON.parse(block.snapshot);
  if (!before?.attrs?.atomicTabular) return null;
  const oldBody = serialize(before).trim();
  const newBody = serialize(nodes[0]).trim();
  const raw = block.raw.trim();
  const [change] = minimalChange(oldBody, newBody, 0);
  // A replacement spanning multiple rows has multiple owners. Leave that
  // operation to the existing structural writeback.
  if (change.insert && oldBody.slice(change.from,change.to).includes('\n')) return null;
  const offsets = [0];
  let i = 0;
  for (const token of raw.matchAll(/[ \t]+(?=\\\\[ \t]*(?:\r?\n|$))|\r\n|[\s\S]/g)) {
    const value = token[0];
    const canonical = /^[ \t]+$/.test(value) && raw.startsWith('\\\\', token.index + value.length)
      ? /^[ \t]+(?=\\\\)/.exec(oldBody.slice(i))?.[0]
      : value === '\r\n' ? '\n' : value;
    if (!canonical || !oldBody.startsWith(canonical, i)) return null;
    i += canonical.length;
    offsets[i] = token.index + value.length;
  }
  const from = offsets[change.from], to = offsets[change.to];
  if (i !== oldBody.length || from === undefined || to === undefined) return null;
  const eol = raw.slice(from).match(/\r?\n/)?.[0] ?? raw.match(/\r?\n/)?.[0] ?? '\n';
  const insert = change.insert.replaceAll('\n', eol);
  const updated = raw.slice(0, from) + insert + raw.slice(to);
  const imported = importBlocks(updated);
  if (imported.length !== 1 || serialize(imported[0]).trim() !== newBody) return null;
  const start = block.from + block.raw.indexOf(raw);
  return [{from:start+from, to:start+to, insert}];
}

export function matchesParagraphGap(source,nodes) {
  if(!nodes.length)return /^[ \t]*\r?\n[ \t]*\r?\n\s*$/.test(source);
  if(source.includes('%')||nodes.some(node=>node.type!=='mathBlock'))return false;
  const parsed=parseDocument(source,{fragment:true})?.blocks.flatMap(raw=>importBlocks(raw));
  return parsed?.length===nodes.length&&parsed.every((node,index)=>node.type==='mathBlock'&&
    serialize(node)===serialize(nodes[index]));
}

function plainParagraphJoin(projection,selected,joined,index) {
  const left=selected[0],right=selected.at(-1);
  const nodes=[left,right,joined];
  if(nodes.some(node=>node?.type!=='paragraph'||node.content?.length!==1||
    node.content[0].type!=='text'||node.content[0].marks?.length))return null;
  const a=left.content[0].text,b=right.content[0].text;
  if(JSON.stringify({...joined,content:left.content})!==JSON.stringify(left))return null;
  const owners=[0,selected.length-1].map(offset=>projection.blocks.find(block=>
    block.index===index+offset&&block.count===1&&block.editable));
  const [first,last]=owners;
  if(first?.raw.trim()!==a||last?.raw.trim()!==b)return null;
  const from=first.from+first.raw.trimEnd().length,to=last.to-last.raw.trimStart().length;
  const gap=projection.text.slice(from,to),replacement=serialize(joined).slice(0,-2);
  if(!matchesParagraphGap(gap,selected.slice(1,-1))||
     importBlocks(replacement).map(serialize).join('')!==serialize(joined))return null;
  return minimalChange(a+gap+b,replacement,from-a.length);
}

// The plain rich view normally serializes structural changes. A formula-only
// edit has a verified source range, so it must not reformat neighboring text.
export function standaloneMathChanges(projection,doc) {
  if(!projection||doc.content.length!==projection.count)return null;
  const changes=[];
  for(const block of projection.blocks){
    const nodes=doc.content.slice(block.index,block.index+block.count);
    if(JSON.stringify(nodes)===block.snapshot)continue;
    const patch=mathBodyChanges(block,nodes)??inlineMathChanges(block,nodes)??markedInlineProseChanges(block,nodes)??plainTableChanges(block,nodes)??
      tikzFigureChanges(block,nodes)??containerProseChanges(block,nodes);
    if(!patch)return null;
    changes.push(...patch);
  }
  return changes;
}

function tikzFigureChanges(block,nodes) {
  if(!block.tikz)return null;
  const before=JSON.parse(block.snapshot),original=before[0];
  if(nodes.length!==before.length||nodes[0]?.type!==original.type)return null;
  const restored=structuredClone(nodes),[updated]=restored,patches=[];
  for(const range of tikzDrawingRanges(block.raw,original)){
    const child=range.child===null?updated:updated.content?.[range.child];
    const drawing=block.raw.slice(range.from,range.to),next=child?.attrs?.tikzSource;
    if(drawing===next)continue;
    if(typeof next!=='string')return null;
    const [newRange]=tikzDrawingRanges(next);
    if(newRange?.from!==0||newRange.to!==next.length||newRange.child!==null)return null;
    patches.push(...minimalChange(drawing,next,block.from+range.from));
    child.attrs.tikzSource=drawing;
  }
  return patches.length&&JSON.stringify(restored)===block.snapshot?patches:null;
}

function plainTableChanges(block,nodes) {
  const previous=JSON.parse(block.snapshot);
  const [before]=previous,[after]=nodes;
  if(before?.type!=='table'||after?.type!=='table'||nodes.length!==previous.length)return null;
  const cells=tableCellRanges(block.raw);
  if(!cells)return null;
  const restored=structuredClone(nodes);
  const patches=[];
  function read(cell) {
    const [paragraph]=cell?.content??[];
    if(cell?.content?.length!==1||paragraph.type!=='paragraph')return null;
    const content=paragraph.content??[];
    if(content.some(node=>node.type!=='text'||node.marks?.length))return null;
    return content.map(node=>node.text).join('');
  }
  function patchInlineMath(text,oldCell,nextCell,offset) {
    const [token]=[...sourceStructure(text)];
    const old=oldCell?.content?.[0]?.content;
    const next=nextCell?.content?.[0]?.content;
    if(token?.kind!=='inlineMath'||token.index!==0||token.end!==text.length||
      oldCell?.content?.length!==1||nextCell?.content?.length!==1||old?.length!==1||next?.length!==1||
      old[0].type!=='math'||next[0].type!=='math'||old[0].attrs.latex!==token.latex||typeof next[0].attrs.latex!=='string')return null;
    const previous={...next[0],attrs:{...next[0].attrs,latex:token.latex}};
    if(JSON.stringify(previous)!==JSON.stringify(old[0]))return null;
    return minimalChange(token.latex,next[0].attrs.latex,offset+token.delimiter.length);
  }
  for(const {row,column,text,offset} of cells){
    const oldCell=before.content[row]?.content?.[column];
    const nextCell=after.content[row]?.content?.[column];
    if(JSON.stringify(oldCell)===JSON.stringify(nextCell))continue;
    const next=read(nextCell), at=block.from+offset;
    const paragraph=oldCell?.content?.length===1&&nextCell?.content?.length===1&&oldCell.content[0];
    const updated=paragraph?[nextCell.content[0]]:null;
    const region=paragraph?{raw:text,from:at,count:1,snapshot:JSON.stringify([paragraph])}:null;
    const patch=read(oldCell)===text&&next!==null&&!/[\\{}$%&#_^~\r\n]/.test(next)&&next===next.trim()
      ?minimalChange(text,next,at):patchInlineMath(text,oldCell,nextCell,at)??(region&&
        (inlineMathChanges(region,updated)??markedInlineProseChanges(region,updated)));
    if(!patch)return null;
    const target=restored[0].content[row].content[column].content[0];
    if(oldCell.content[0].content)target.content=oldCell.content[0].content;
    else delete target.content;
    patches.push(...patch);
  }
  if(!patches.length||JSON.stringify(restored)!==block.snapshot)return null;
  return patches;
}

function containerProseChanges(block,nodes) {
  const [previous]=JSON.parse(block.snapshot);
  const [current]=nodes;
  if(nodes.length!==1||block.count!==1||
     !['theoremBlock','blockquote','orderedList','bulletList','descriptionList','multiColumn'].includes(previous?.type)||
     current?.type!==previous.type)return null;
  const restored=structuredClone(current),changes=[];
  const at=(node,path)=>path.reduce((parent,index)=>parent?.content?.[index],node);
  for(const {from,text,container,path} of containerParagraphRanges(block.raw)){
    if(container!==previous.type)continue;
    const before=at(previous,path),after=at(current,path);
    if(JSON.stringify(before)===JSON.stringify(after))continue;
    const next=plainParagraphText(after);
    const start=block.from+from;
    const region={raw:text,from:start,count:1,snapshot:JSON.stringify([before])};
    const edits=plainParagraphText(before)===text&&next&&next===next.trim()&&!/[\\{}$%&#_^~\r\n]/.test(next)
      ?minimalChange(text,next,start):inlineMathChanges(region,[after])??markedInlineProseChanges(region,[after]);
    if(!edits)return null;
    at(restored,path).content=before.content;
    changes.push(...edits);
  }
  if(!changes.length||JSON.stringify(restored)!==JSON.stringify(previous))return null;
  return changes;
}

function theoremParagraphChanges(block,nodes) {
  const [before]=JSON.parse(block.snapshot),[after]=nodes;
  if(block.count!==1||nodes.length!==1||before?.type!=='theoremBlock'||after?.type!=='theoremBlock')return null;
  const delta=after.content?.length-before.content?.length;
  if(Math.abs(delta)!==1)return null;
  const removed=delta>0?1:2,added=delta>0?2:1;
  const paragraphs=plainContainerParagraphs(block.raw).filter(({path})=>path.length===1);
  const eol=block.raw.includes('\r\n')?'\r\n':'\n';
  for(const {from,text,container,path:[index]} of paragraphs){
    if(container!=='theoremBlock')continue;
    const last=paragraphs.find(part=>part.path[0]===index+removed-1);
    if(!last)continue;
    const end=last.from+last.text.length;
    const replacementNodes=after.content.slice(index,index+added);
    if(replacementNodes.length!==added||replacementNodes.some(node=>{
      const text=plainParagraphText(node);
      return !text||text!==text.trim();
    }))continue;
    const restored=structuredClone(after);
    restored.content.splice(index,added,...before.content.slice(index,index+removed));
    if(JSON.stringify(restored)!==JSON.stringify(before))continue;
    if(delta<0&&!/^[ \t]*\r?\n[ \t]*\r?\n\s*$/.test(block.raw.slice(from+text.length,last.from)))return null;
    const replacement=replacementNodes.map(node=>serialize(node).slice(0,-2)).join(eol+eol);
    const draft=block.raw.slice(0,from)+replacement+block.raw.slice(end);
    if(importBlocks(draft).map(serialize).join('')!==serialize(after))return null;
    return minimalChange(block.raw.slice(from,end),replacement,block.from+from);
  }
  return null;
}


function mathBodyChanges(block,nodes) {
  const previous=JSON.parse(block.snapshot);
  if(!block.editable||!nodes.length||nodes.length!==previous.length||
      nodes[0].type!=='mathBlock'||previous[0].type!=='mathBlock')return null;
  // The editor may append an empty paragraph for typing after the final atom.
  // It has no source bytes and cannot invalidate an otherwise exact math edit.
  if(!nodes.slice(1).every((node,index)=>node.type==='paragraph'&&!node.content?.length&&
      JSON.stringify(node)===JSON.stringify(previous[index+1])))return null;
  const before=previous[0],after=nodes[0];
  if(JSON.stringify({...after,attrs:{...after.attrs,latex:before.attrs.latex}})!==JSON.stringify(before))return null;
  const spelling=mathSpelling(block.raw,[before]);
  if(!spelling)return null;
  const [leading,trailing]=blockWhitespace(spelling.latex);
  const body=spelling.latex.slice(leading.length,spelling.latex.length-trailing.length);
  return minimalChange(body,after.attrs.latex.trim(),block.from+spelling.start+leading.length);
}

function inlineMathChanges(block,nodes) {
  const [before]=JSON.parse(block.snapshot),[after]=nodes;
  if(block.count!==1||nodes.length!==1||before?.type!=='paragraph'||after?.type!=='paragraph'||
    before.content?.length!==after.content?.length)return null;
  const math=(before.content??[]).flatMap((node,index)=>node.type==='math'?[index]:[]);
  if(!math.length)return null;
  const tokens=[...sourceStructure(block.raw)].filter(token=>token.kind==='inlineMath');
  if(tokens.length!==math.length)return null;
  const restored=structuredClone(after),patches=[];
  for(const [ordinal,index] of math.entries()){
    const original=before.content[index],updated=after.content[index],token=tokens[ordinal];
    if(original.attrs.latex!==token.latex||original.attrs.delimiter!==token.delimiter||
      updated?.type!=='math'||typeof updated.attrs.latex!=='string')return null;
    restored.content[index].attrs.latex=token.latex;
    if(token.latex!==updated.attrs.latex)patches.push(...minimalChange(token.latex,updated.attrs.latex,
      block.from+token.index+token.delimiter.length));
  }
  return patches.length&&JSON.stringify([restored])===block.snapshot?patches:null;
}

function markedInlineProseChanges(block,nodes) {
  const [before]=JSON.parse(block.snapshot),[after]=nodes;
  if(block.count!==1||nodes.length!==1||before?.type!=='paragraph'||after?.type!=='paragraph'||
    !before.content?.length||before.content.length!==after.content?.length)return null;
  const inline=new Map([...sourceStructure(block.raw)].filter(token=>token.kind==='inlineMath').map(token=>[token.index,token]));
  const leading=block.raw.length-block.raw.trimStart().length;
  const parts=markedRuns(block.raw.trim(),leading,[],inline);
  if(parts?.length!==before.content.length||!parts.some(part=>part.kind!=='text'||part.marks?.length))return null;
  const restored=structuredClone(after),patches=[];
  for(const [index,part] of parts.entries()){
    const old=before.content[index],next=after.content[index];
    if(part.kind==='math'){
      if(old.type!=='math'||old.attrs.latex!==part.latex||JSON.stringify(old)!==JSON.stringify(next))return null;
      continue;
    }
    if(part.kind==='break'){
      if(old.type!=='hardBreak'||JSON.stringify(old)!==JSON.stringify(next))return null;
      continue;
    }
    if(part.kind==='reference'||part.kind==='atom'){
      if(old.type!==part.type||serialize(old)!==part.source||JSON.stringify(old)!==JSON.stringify(next))return null;
      continue;
    }
    if(old.type!=='text'||old.text!==part.text||next.type!=='text'||typeof next.text!=='string'||
      (old.marks??[]).length!==part.marks.length||
      (old.marks??[]).some(mark=>!part.marks.includes(mark.type)))return null;
    if(old.text===next.text)continue;
    const from=part.from16;
    const spelling=block.raw.slice(from,part.to16);
    restored.content[index].text=old.text;
    patches.push(...minimalChange(spelling,serialize({type:'text',text:next.text}),block.from+from));
  }
  return patches.length&&JSON.stringify([restored])===block.snapshot?patches:null;
}

// A protected neighbor must stay untouched, but need not block a source-backed
// table's cell edit. Locate only real outer environments, never quoted examples
// in comments, macro definitions or Raw containers. Equal tables map by order.
function patchIsolatedTables(block,nodes) {
  const before=JSON.parse(block.snapshot);
  if(nodes.length!==before.length)return null;
  const sources=before.map(node=>node.attrs?.atomicTabular ? serialize(node).trim() : node.attrs?.longtable ? serializeSourceTable(node,serialize,'longtable') : node.type==='table'&&node.attrs?.tblr ? serializeTblr(node,serialize) : null);
  const starts=[...sourceStructure(block.raw)].filter(token=>token.kind==='begin'&&token.topLevel);
  const changes=[];
  for(let i=0;i<nodes.length;i++) {
    if(JSON.stringify(before[i])===JSON.stringify(nodes[i]))continue;
    const source=sources[i],node=nodes[i];
    if(!source||node.type!=='table'||JSON.stringify(node.attrs)!==JSON.stringify(before[i].attrs))return null;
    const leading=source.length-source.trimStart().length,body=source.trim();
    const ranges=starts.flatMap(token=>{
      const name=/^\\begin\{(table\*?|tblr|longtable|tabular)\}$/.exec(token.value)?.[1];
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

function patchSpelling(block,body,spelling,split=false){
  const {canonicalBody:old,map,start,comments=[],italic=[],protectedRanges=[]}=spelling;
  const [patch]=minimalChange(old,body,0);
  let {from,to}=patch;
  while(from>0 && map[start+from]===null)from--;
  while(to<old.length && map[start+to]===null)to++;
  const trailing=from===to && comments.find(c=>c.offset===start+from && !/[\r\n]$/.test(block.raw.slice(c.from,c.to)));
  // When the source block ends inside a comment, appending after it would
  // comment out the newly typed text. Keep that insertion on its left edge.
  const a=trailing?trailing.from:map[start+from];
  const b=from===to?a:comments.find(c=>c.offset===start+to)?.from??map[start+to];
  if(!Number.isInteger(a)||!Number.isInteger(b))return null;
  if(comments.some(c=>a<c.to && b>c.from))return null;
  if(protectedRanges.some(atom=>a<atom.to && b>atom.from))return null;
  let insert=patch.insert;
  if(split && insert.includes('\\textit{')){
    const mark=italic.findLast(m=>m.from<=a && a<=m.to);
    if(mark)insert=insert.replaceAll('\\textit{',mark.command+'{');
  }
  return [{from:block.from+a,to:block.from+b,insert:old.slice(from,patch.from)+insert+old.slice(patch.to,to)}];
}

function patchBlock(block,nodes) {
    const math=mathBodyChanges(block,nodes)??inlineMathChanges(block,nodes)??markedInlineProseChanges(block,nodes)??plainTableChanges(block,nodes)??
      tikzFigureChanges(block,nodes)??theoremParagraphChanges(block,nodes)??containerProseChanges(block,nodes);
    if(math)return math;
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
      return patchSpelling(block,serialize(nodes[0]).slice(0,-2),block.spelling);
    }
    let [leading,trailing] = block.emptyPrefix!==undefined&&!block.raw.trim()?[block.emptyPrefix,block.emptySuffix??'']:blockWhitespace(block.raw);
    const body = nodes.map(serialize).join('').trim();
    // Prove the new block also round-trips through the existing importer.
    const parsed = parseDocument('\\begin{document}\n' + body + '\n\\end{document}\n');
    if (!parsed || parsed.blocks.flatMap(importBlocks).map(serialize).join('').trim() !== body) return null;
    const originalBody=block.spelling&&body.startsWith(block.spelling.canonical)
      ? block.spelling.original+body.slice(block.spelling.canonical.length) : body;
    // The rich paragraph may have spaces typed before the next word arrives.
    // Preserve them separately from source trivia after the paragraph.
    let typedSpaces='';
    const [previous]=JSON.parse(block.snapshot);
    if(block.count===1&&nodes.length===1&&previous?.type==='paragraph'&&nodes[0].type==='paragraph'){
      const previousBody=serialize(previous).slice(0,-2);
      const previousSpaces=previousBody.match(/[ \t]+$/)?.[0]??'';
      if(previousSpaces&&trailing.startsWith(previousSpaces))trailing=trailing.slice(previousSpaces.length);
      if(body)typedSpaces=serialize(nodes[0]).slice(0,-2).match(/[ \t]+$/)?.[0]??'';
    }
    const next = leading + originalBody + typedSpaces + trailing;
    return minimalChange(block.raw,next,block.from);
}

function minimalChange(original,next,from) {
  let a=0, b=original.length, c=next.length;
  while(a<b && a<c && original[a]===next[a]) a++;
  while(b>a && c>a && original[b-1]===next[c-1]) {b--;c--;}
  return [{from:from+a,to:from+b,insert:next.slice(a,c)}];
}
