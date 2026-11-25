import {parseDocument} from '../../../latex/document.mjs';
import {unwrapParagraphWrappers} from '../../../latex/blocks.mjs';
import {tableCellRanges} from '../native-text/table-cells.mjs';
import {containerParagraphRanges} from '../native-text/containers.mjs';
import {markedRuns} from '../native-text/prose-runs.mjs';
import {sourceStructure} from '../../../latex/source-structure.mjs';
import {environmentEnd} from '../../../latex/tblr.mjs';
import {applySlotEdit,projectMath} from './source.mjs';

// First direct-edit scope: one top-level display. Multiple displays require
// a document-wide owner registry; never let independent owner IDs collide.
export function projectDisplayMath(source,previous) {
  const doc=parseDocument(source);
  if(!doc)return null;
  const body=doc.blocks.join('');
  const tokens=[...sourceStructure(body)];
  if(tokens.some(token=>token.kind==='invalid'))return null;
  const displays=tokens.filter(token=>token.topLevel&&token.kind==='displayMath');
  if(displays.length!==1)return null;
  const span=displays[0],from16=doc.start.length+span.index+span.delimiter.length;
  const to16=from16+span.latex.length;
  const math=projectMath(span.latex,{
    previous:previous?.delimiter===span.delimiter&&previous.from16===from16?previous.math:undefined,
  });
  if(!math.supported)return null;
  return Object.freeze({source,from16,to16,delimiter:span.delimiter,math,
    projection:source.slice(0,from16)+math.projection+source.slice(to16)});
}

// Assign disjoint owner IDs within this exact document revision. Keep
// unsupported display spans intact and preserve their ordinal in the editor.
export function projectDocumentFormulas(source,{fragment=false,firstTag=1,filePath,previous=[]}={}) {
  const doc=parseDocument(source,{fragment});
  if(!doc)return null;
  const body=doc.blocks.join('');
  if(doc.start+body+doc.end!==source)return null;
  const tokens=[...sourceStructure(body)];
  if(tokens.some(token=>token.kind==='invalid'))return null;
  const tableCells=new Map(tokens.flatMap(token=>{
    const table=token.topLevel&&token.kind==='begin'&&/^\\begin\{(tabular|tblr|tabularx|table\*?)\}$/.exec(token.value)?.[1];
    if(!table)return [];
    const close=environmentEnd(body,token.index,table);
    if(!close)return [];
    return (tableCellRanges(body.slice(token.index,close.end))??[]).flatMap(cell=>{
      const inline=new Map([...sourceStructure(cell.text)].filter(part=>part.kind==='inlineMath')
        .map(part=>[part.index,part]));
      if(!inline.size||!markedRuns(cell.text,0,[],inline))return [];
      return [...inline.keys()].map(index=>[token.index+cell.offset+index,
        {from16:doc.start.length+token.index,to16:doc.start.length+close.end,row:cell.row,column:cell.column}]);
    });
  }));
  const nested=new Map(tokens.filter(token=>token.kind==='inlineMath').map(token=>[token.index,token]));
  const markedMath=new Set();
  let blockStart=0;
  for(const block of doc.blocks){
    if(block.includes('{')&&nested.size){
      const wrapped=unwrapParagraphWrappers(block);
      if(wrapped.from>block.length-block.trimStart().length){
        const indent=/^\\(?:noindent|indent)(?![A-Za-z])[ \t]*/.exec(wrapped.text)?.[0].length??0;
        for(const run of markedRuns(wrapped.text.slice(indent),blockStart+wrapped.from+indent,[],nested)??[])
          if(run.kind==='math')markedMath.add(run.from16);
      }
      for(const run of markedRuns(block,blockStart,[],nested)??[])
        if(run.kind==='math'&&run.insideMark)markedMath.add(run.from16);
      for(const {from,text} of containerParagraphRanges(block)){
        for(const run of markedRuns(text,blockStart+from,[],nested)??[])
          if(run.kind==='math')markedMath.add(run.from16);
      }
    }
    blockStart+=block.length;
  }
  const spans=tokens.flatMap(token=>{
    if(token.kind==='inlineMath'&&(tableCells.has(token.index)||markedMath.has(token.index)))return [token];
    if(!token.topLevel)return [];
    if(['displayMath','inlineMath'].includes(token.kind))return [token];
    const name=token.kind==='begin'&&/^\\begin\{((?:equation|align(?:at)?|flalign|gather|multline|eqnarray)\*?)\}$/.exec(token.value)?.[1];
    const close=name&&environmentEnd(body,token.index,name);
    if(!close)return [];
    const equation=name.startsWith('equation');
    return [{index:token.index,end:close.end,delimiter:equation?token.value:'',
      latex:equation?body.slice(token.end,close.start):body.slice(token.index,close.end),kind:'displayMath'}];
  });
  const counts={displayMath:0,inlineMath:0},ordinals={...counts};
  for(const span of spans)counts[span.kind]++;
  const formulas=[], owners=new Map();
  const priorByKind={displayMath:new Map(),inlineMath:new Map()};
  for(const formula of previous){
    if(formula.filePath===filePath)priorByKind[formula.kind]?.set(formula.ordinal,formula);
  }
  let projection='',cursor=0;
  for(const span of spans){
    const ordinal=ordinals[span.kind]++;
    const from16=doc.start.length+span.index+span.delimiter.length,to16=from16+span.latex.length;
    const candidate=priorByKind[span.kind].get(ordinal);
    const prior=candidate&&(candidate.from16===from16||candidate.math.source===span.latex)?candidate:undefined;
    const math=projectMath(span.latex,{firstTag,previous:prior?.math});
    if(!math.supported)continue;
    const formula={source,from16,to16,math,ordinal,kind:span.kind,count:counts[span.kind],filePath,
      outerFrom16:doc.start.length+span.index,outerTo16:doc.start.length+span.end,
      projectionFrom16:projection.length+from16-cursor};
    const cell=tableCells.get(span.index);
    if(cell)formula.tableCell=cell;
    for(const atom of math.atoms)owners.set(atom.tag,{formula,atom});
    formulas.push(formula);
    firstTag=math.nextTag;
    projection+=source.slice(cursor,from16)+math.projection;cursor=to16;
  }
  return formulas.length?{source,projection:projection+source.slice(cursor),formulas,owners,nextTag:firstTag}:null;
}

export function projectSnapshotFormulas(snapshot,previous) {
  const prior=previous?.formulas??[];
  const root=projectDocumentFormulas(snapshot.source,{filePath:snapshot.mainFile,
    firstTag:previous?.nextTag??1,previous:prior});
  if(!snapshot.files)return root;
  const files=[],owners=new Map(root?.owners),formulas=[...(root?.formulas??[])];
  let firstTag=root?.nextTag??previous?.nextTag??1;
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  for(const file of snapshot.files){
    if(file.path===snapshot.mainFile||!/\.tex$/i.test(file.path)||file.bytes.length>2*1024*1024)continue;
    let input;
    try {input=decoder.decode(new Uint8Array(file.bytes));}catch{continue;}
    const parsed=projectDocumentFormulas(input,{fragment:true,firstTag,filePath:file.path,previous:prior});
    if(!parsed)continue;
    firstTag=parsed.nextTag;
    files.push({path:file.path,source:parsed.projection});
    formulas.push(...parsed.formulas);
    for(const [tag,owner] of parsed.owners)owners.set(tag,owner);
  }
  return owners.size?{source:snapshot.source,projection:root?.projection??snapshot.source,owners,files,formulas,nextTag:firstTag}:null;
}

export function editDisplayMathSlot(projection,currentSource,hit,edit) {
  if(!projection||projection.source!==currentSource||!hit)return null;
  const role={num:'numerator',den:'denominator',sup:'superscript',sub:'subscript',radicand:'radicand',
    degree:'degree',cell:'cell',nucleus:'nucleus',body:'body'}[hit.role];
  const slots=projection.math.slots.filter(slot=>slot.tag===hit.owner&&slot.role===role);
  if(slots.length!==1)return null;
  const result=applySlotEdit(projection.math,{...edit,slotId:slots[0].id});
  const {from16:base}=projection,{patch,selection}=result;
  return {
    patch:{from:base+patch.from,to:base+patch.to,insert:patch.insert},
    selection:{anchor:base+selection.anchor16,head:base+selection.head16,slotId:selection.slotId},
  };
}
