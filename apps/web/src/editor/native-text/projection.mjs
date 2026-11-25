import {headingAt} from '../../../latex/headings.mjs';
import {escapeText} from '../../../latex/inline.mjs';
import {tableCellRanges,verticalTableSelection} from './table-cells.mjs';
import {containerParagraphRanges} from './containers.mjs';
import {parseDocument} from '../../../latex/document.mjs';
import {structuralCommandAt,unwrapParagraphWrappers} from '../../../latex/blocks.mjs';
import {displayEnvironment} from '../../../latex/math-environments.mjs';
import {environmentEnd} from '../../../latex/tblr.mjs';
import {sourceStructure} from '../../../latex/source-structure.mjs';
import {decodeProse,markedRuns} from './prose-runs.mjs';
import {projectDocumentFormulas} from '../native-math/document.mjs';
import {textPatch} from '../source-boundaries.mjs';
import {instrumentDrawing} from './drawing-projection.mjs';

const segmenter = new Intl.Segmenter('und', {granularity:'grapheme'});
const unsupported = /[\\{}$%&#_^~]/;

// Prose text is tagged per grapheme with its own LuaTeX attribute. Only plain
// runs are instrumented: TeX syntax, comments and math never receive a guessed
// source range.
function reusableProseTags(previous,source,filePath){
  const paragraphs=previous?.paragraphs?.filter(paragraph=>paragraph.filePath===filePath);
  if(!paragraphs?.length)return undefined;
  const [patch]=textPatch(paragraphs[0].source,source);
  const tags=new Map();
  for(const paragraph of paragraphs){
    for(const glyph of paragraph.glyphs){
      const from=paragraph.from16+glyph.from16,to=paragraph.from16+glyph.to16;
      if(patch&&to>patch.from&&from<patch.to)continue;
      const shift=patch&&to>patch.from?patch.insert.length-(patch.to-patch.from):0;
      tags.set(`${from+shift}/${to+shift}`,glyph);
    }
  }
  return (from,to,char)=>{
    const key=`${from}/${to}`,glyph=tags.get(key);
    if(glyph?.char!==char)return undefined;
    tags.delete(key);
    return glyph.tag;
  };
}

function instrumentText(raw, firstOwner, attribute, from, reuse) {
  const {text,offsets}=decodeProse(raw);
  let next = firstOwner, local = 0, instrumented = '\\begingroup';
  const glyphs = [];
  for (const {segment} of segmenter.segment(text)) {
    const end=local+segment.length,from16=offsets?.[local]??local,to16=offsets?.[end]??end;
    const token=raw.slice(from16,to16);
    if (/^\s+$/u.test(segment)) { instrumented += token; local = end; continue; }
    const tag = reuse?.(from+from16,from+to16,segment)??next++;
    instrumented += `\\attribute${attribute}=${tag} ${token}`;
    glyphs.push({tag, from16, to16, char:segment});
    local = end;
  }
  return {instrumented:instrumented + '\\endgroup', glyphs, nextTag:next};
}

function plainBlock(block,keepThrough=0) {
  const leading = block.match(/^\s*/)[0].length;
  const end=block.trimEnd().length;
  const preserved=keepThrough>end&&keepThrough<=block.length&&/^[ \t]+$/.test(block.slice(end,keepThrough));
  return {leading,text:block.slice(leading,preserved?keepThrough:end)};
}

function proseBody(block,keepThrough) {
  const {leading,text}=plainBlock(block,keepThrough);
  const heading=headingAt(text);
  if(heading?.end===text.length&&(heading.title.trim()===heading.title||
     (heading.title===heading.title.trimStart()&&keepThrough===leading+heading.titleFrom+heading.title.length)))
    return {leading:leading+heading.titleFrom,text:heading.title,heading:heading.name,headingEnd:leading+heading.end};
  const wrapper=unwrapParagraphWrappers(text);
  const indent=/^\\(?:noindent|indent)(?![A-Za-z])[ \t]*/.exec(wrapper.text)?.[0].length??0;
  if(wrapper.from||indent)return {leading:leading+wrapper.from+indent,text:wrapper.text.slice(indent),wrapperEnd:leading+text.length};
  return {leading,text};
}

function instrumentProse(block, source, blockFrom, firstOwner, attribute, filePath, keepThrough, reuse, formulas=[]) {
  const {leading,text,heading,headingEnd,wrapperEnd}=proseBody(block,keepThrough-blockFrom);
  const base=blockFrom+leading;
  const inline=new Map(formulas.map(formula=>[formula.outerFrom16-base,{formula,end:formula.outerTo16-base,latex:formula.math.source}]));
  const parts=markedRuns(text,0,[],inline);
  if(!parts?.length)return null;
  if(parts.filter(part=>part.kind==='math').length!==inline.size)return null;
  const runs=[],glyphs=[];
  let projection='',cursor=0,nextTag=firstOwner;
  for(const [partIndex,part] of parts.entries()){
    if(part.kind==='break')continue;
    if(part.kind==='math'){
      const {formula}=inline.get(part.from16);
      projection+=text.slice(cursor,formula.from16-base)+formula.math.projection+
        text.slice(formula.to16-base,part.to16);
      cursor=part.to16;
      continue;
    }
    const built=instrumentText(text.slice(part.from16,part.to16),nextTag,attribute,base+part.from16,reuse);
    nextTag=built.nextTag;
    projection+=text.slice(cursor,part.from16)+built.instrumented;
    cursor=part.to16;
    runs.push({...part,partIndex});
    for(const glyph of built.glyphs)
      glyphs.push({...glyph,from16:part.from16+glyph.from16,to16:part.from16+glyph.to16});
  }
  if(!glyphs.length)return null;
  const paragraph={source,filePath,from16:blockFrom+leading,text,heading,glyphs,parts,runs,
    ...(headingEnd===undefined?{}:{headingEnd:blockFrom+headingEnd}),
    ...(wrapperEnd===undefined?{}:{wrapped:true,wrapperEnd:blockFrom+wrapperEnd})};
  return {projection:block.slice(0,leading)+projection+text.slice(cursor)+block.slice(leading+text.length),
    paragraphs:[paragraph],nextTag};
}

function renderInstrumentedBlock(block,blockFrom,replacements,formulas,projectedFormulas){
  for(const formula of formulas)if(!projectedFormulas.has(formula))replacements.push({
    from:formula.from16-blockFrom,to:formula.to16-blockFrom,insert:formula.math.projection,
  });
  if(!replacements.length)return null;
  let projection='',cursor=0;
  for(const {from,to,insert} of replacements.sort((left,right)=>left.from-right.from)){
    if(from<cursor||to>block.length)return null;
    projection+=block.slice(cursor,from)+insert;
    cursor=to;
  }
  return projection+block.slice(cursor);
}

function instrumentTable(block, source, blockFrom, firstOwner, attribute, filePath, reuse, formulas=[]) {
  const cells=tableCellRanges(block);
  if(!cells||!cells.length&&!formulas.length)return null;
  const replacements=[],projectedFormulas=new Set();
  const vertical=verticalTableSelection(block);
  const tableStart=blockFrom+block.length-block.trimStart().length;
  const tableEnd=blockFrom+block.trimEnd().length;
  let nextTag=firstOwner;
  const paragraphs=[];
  for(const cell of cells){
    const {text,offset,row,column}=cell;
    // An empty inline math boundary has zero ink and reports an engine-owned point.
    // The visible page still comes from the uninstrumented source.
    const from=blockFrom+offset;
    const tableCell={from16:tableStart,to16:tableEnd,row,column,...(vertical&&{vertical})};
    if(text){
      const inline=formulas.filter(formula=>formula.outerFrom16>=from&&formula.outerTo16<=from+text.length);
      const built=instrumentProse(text,source,from,nextTag,attribute,filePath,0,reuse,inline);
      if(!built||built.paragraphs.some(paragraph=>paragraph.heading))continue;
      nextTag=built.nextTag;
      inline.forEach(formula=>projectedFormulas.add(formula));
      replacements.push({from:offset,to:offset+text.length,insert:built.projection});
      paragraphs.push(...built.paragraphs.map(paragraph=>({...paragraph,tableCell})));
    }else{
      const tag=reuse?.(from,from,'')??nextTag++;
      replacements.push({from:offset,to:offset,
        insert:`\\begingroup\\mathsurround=0pt\\attribute${attribute}=${tag} $ $\\endgroup`});
      paragraphs.push({source,filePath,from16:from,text,glyphs:[{tag,from16:0,to16:0,char:''}],
        parts:[],runs:[{from16:0,to16:0,text,partIndex:0}],tableCell});
    }
  }
  const projection=renderInstrumentedBlock(block,blockFrom,replacements,formulas,projectedFormulas);
  return projection===null?null:{projection,paragraphs,nextTag};
}

function instrumentContainer(block,source,blockFrom,firstOwner,attribute,filePath,reuse,formulas=[]) {
  const parts=containerParagraphRanges(block);
  if(!parts.length)return null;
  const paragraphs=[],replacements=[],projectedFormulas=new Set();
  let nextTag=firstOwner;
  for(const {from,text,container,path} of parts){
    const start=blockFrom+from;
    const inline=formulas.filter(formula=>formula.outerFrom16>=start&&formula.outerTo16<=start+text.length);
    const built=instrumentProse(text,source,start,nextTag,attribute,filePath,0,reuse,inline);
    if(!built||built.paragraphs.some(paragraph=>paragraph.heading))continue;
    replacements.push({from,to:from+text.length,insert:built.projection});
    inline.forEach(formula=>projectedFormulas.add(formula));
    paragraphs.push(...built.paragraphs.map(paragraph=>({...paragraph,container:{type:container,path}})));
    nextTag=built.nextTag;
  }
  const projection=renderInstrumentedBlock(block,blockFrom,replacements,formulas,projectedFormulas);
  return projection===null?null:{projection,paragraphs,nextTag};
}

function instrumentTextBlock(block,source,from,next,attribute,filePath,keepThrough,reuse){
  return instrumentTable(block,source,from,next,attribute,filePath,reuse)??
    instrumentContainer(block,source,from,next,attribute,filePath,reuse)??
    instrumentProse(block,source,from,next,attribute,filePath,keepThrough,reuse);
}

function observationBlocks(doc,splitIncludes){
  const body=doc.blocks.join('');
  const tokens=[...sourceStructure(body)];
  if(tokens.some(token=>token.kind==='invalid'))return doc.blocks;
  const boundaries=[];
  let last=0;
  for(const token of tokens){
    if(!token.topLevel||token.index<last)continue;
    const argument=splitIncludes&&['\\input','\\include'].includes(token.value)&&
      /^[ \t]*\{[^{}\\%\r\n]+\}/.exec(body.slice(token.end));
    const environment=token.kind==='begin'&&displayEnvironment(token.value);
    const commandEnd=structuralCommandAt(body,token)?.end||
      (argument&&token.end+argument[0].length)||
      (environment&&environmentEnd(body,token.index,environment)?.end)||
      (token.kind==='displayMath'&&token.end);
    if(commandEnd){boundaries.push(token.index,commandEnd);last=commandEnd;}
  }
  let from=0,index=0;
  return doc.blocks.flatMap(block=>{
    const end=from+block.length,parts=[];
    let start=from;
    while(index<boundaries.length&&boundaries[index]<end){
      const next=boundaries[index++];
      if(next>start)parts.push(body.slice(start,next));
      start=next;
    }
    parts.push(body.slice(start,end));
    from=end;
    return parts;
  });
}

// Prose-only documents: every plain paragraph becomes a native target.
export function projectTextDocument(source, {firstOwner=1, attribute=65000, fragment=false, filePath,keepThrough=0,previous,splitIncludes=false,measureDrawings=false}={}) {
  const doc = parseDocument(source,{fragment});
  if (!doc) return null;
  const body = doc.blocks.join('');
  if (doc.start + body + doc.end !== source) return null;
  const reuse=reusableProseTags(previous,source,filePath);
  let output = '', cursor = 0, next = Math.max(firstOwner,previous?.nextTag??1), bodyOffset = 0;
  const paragraphs = [], owners = new Map();
  for (const block of observationBlocks(doc,splitIncludes)) {
    const blockStart = bodyOffset;
    bodyOffset += block.length;
    if (!block.trim()) continue;
    const blockFrom=doc.start.length+blockStart;
    const result=(measureDrawings&&instrumentDrawing(block,source,blockFrom,next,attribute,filePath))||
      instrumentTextBlock(block,source,blockFrom,next,attribute,filePath,keepThrough,reuse);
    if(!result)continue;
    output+=source.slice(cursor,blockFrom)+result.projection;
    cursor=blockFrom+block.length;
    next=result.nextTag;
    for(const [tag,entry] of result.owners??[])owners.set(tag,entry);
    for(const paragraph of result.paragraphs){
      paragraphs.push(paragraph);
      for(const glyph of paragraph.glyphs)owners.set(glyph.tag,{paragraph,glyph});
    }
  }
  if (!owners.size) return null;
  return {source, projection:output + source.slice(cursor), paragraphs, owners, nextTag:next, kind:'text', formulas:[]};
}

// Combined document projection for a single file: math spans keep their
// instrumented projection, formula-free plain blocks are tagged as prose, and
// plain runs beside inline math are tagged individually. Runs never cross
// math; a paragraph records the exact text/math child sequence so the editor
// can map a run patch to one ProseMirror text node.
export function projectMixedDocument(source, {previous=[], attribute=65000, fragment=false, firstOwner=1, filePath,keepThrough=0,splitIncludes=false,measureDrawings=false}={}) {
  const doc = parseDocument(source,{fragment});
  if (!doc) return null;
  const body = doc.blocks.join('');
  if (doc.start + body + doc.end !== source) return null;
  const firstTag=Math.max(firstOwner,previous?.nextTag??1);
  const math = projectDocumentFormulas(source, {previous:previous?.formulas ?? [],firstTag,fragment,filePath});
  if (!math) return projectTextDocument(source,{attribute,firstOwner,fragment,filePath,keepThrough,previous,splitIncludes,measureDrawings});
  const reuse=reusableProseTags(previous,source,filePath);
  const formulas = [...math.formulas].sort((left, right) => left.from16 - right.from16);
  const mathTokens = [...sourceStructure(body)].filter(token =>
    token.kind === 'inlineMath' || token.kind === 'displayMath');
  const owners = new Map(math.owners), paragraphs = [];
  let output='',cursor=0,next=math.nextTag,bodyOffset=0,firstFormula=0,firstToken=0;
  for (const block of observationBlocks(doc,splitIncludes)) {
    const blockStart = bodyOffset;
    const from16 = doc.start.length + bodyOffset;
    bodyOffset += block.length;
    const to16 = from16 + block.length;
    while(firstFormula<formulas.length&&formulas[firstFormula].to16<=from16)firstFormula++;
    let formulaEnd=firstFormula;
    while(formulaEnd<formulas.length&&formulas[formulaEnd].from16<to16)formulaEnd++;
    const overlapping=formulas.slice(firstFormula,formulaEnd);
    while(firstToken<mathTokens.length&&mathTokens[firstToken].index<blockStart)firstToken++;
    let tokenEnd=firstToken;
    while(tokenEnd<mathTokens.length&&mathTokens[tokenEnd].index<bodyOffset)tokenEnd++;
    const blockTokens=mathTokens.slice(firstToken,tokenEnd);
    if (overlapping.some(formula => formula.from16 < from16 || formula.to16 > to16)) {
      return {...math, kind:'math', paragraphs:[]};
    }
    output += source.slice(cursor, from16);
    const result=overlapping.length?(instrumentTable(block,source,from16,next,attribute,filePath,reuse,overlapping)??
      instrumentContainer(block,source,from16,next,attribute,filePath,reuse,overlapping)??
      (overlapping.every(formula=>formula.kind==='inlineMath')&&
        instrumentProse(block,source,from16,next,attribute,filePath,keepThrough,reuse,overlapping))):
      ((measureDrawings&&instrumentDrawing(block,source,from16,next,attribute,filePath))||
        instrumentTextBlock(block,source,from16,next,attribute,filePath,keepThrough,reuse));
    if(result){
      output+=result.projection;
      cursor=to16;
      next=result.nextTag;
      for(const [tag,entry] of result.owners??[])owners.set(tag,entry);
      for(const paragraph of result.paragraphs){
        paragraphs.push(paragraph);
        for(const glyph of paragraph.glyphs)owners.set(glyph.tag,{paragraph,glyph});
      }
      continue;
    }
    const {leading,text}=plainBlock(block,keepThrough-from16);
    const contentFrom = from16 + leading;
    const parts = [], runs = [], glyphs = [];
    let run = '', partCursor = 0;
    const addText = (from, to) => {
      const raw = text.slice(from, to);
      if (!raw) return;
      const marked=markedRuns(raw,from);
      if(!marked){
        parts.push({kind:'text',from16:from,to16:to,text:raw});
        run+=raw;
        return;
      }
      let offset=from;
      for(const part of marked){
        const partIndex=parts.push(part)-1;
        if(part.kind==='break')continue;
        const built=instrumentText(text.slice(part.from16,part.to16),next,attribute,contentFrom+part.from16,reuse);
        next=built.nextTag;
        runs.push({...part,partIndex});
        for(const glyph of built.glyphs)
          glyphs.push({...glyph,from16:glyph.from16+part.from16,to16:glyph.to16+part.from16});
        run+=text.slice(offset,part.from16)+built.instrumented;
        offset=part.to16;
      }
      run+=text.slice(offset,to);
    };
    const segments = overlapping.map(formula => ({
      formula,
      token: blockTokens.find(token =>
        doc.start.length + token.index + token.delimiter.length === formula.from16),
    }));
    if (segments.every(segment => segment.token && segment.token.end >= segment.formula.to16 - doc.start.length)) {
      for (const {formula, token} of segments) {
        const tokenStart = doc.start.length + token.index - contentFrom;
        const tokenEnd = doc.start.length + token.end - contentFrom;
        const mathFrom = formula.from16 - contentFrom, mathTo = formula.to16 - contentFrom;
        addText(partCursor, tokenStart);
        run += source.slice(contentFrom + tokenStart, contentFrom + mathFrom) +
          formula.math.projection +
          source.slice(contentFrom + mathTo, contentFrom + tokenEnd);
        parts.push({kind:'math', from16:tokenStart, to16:tokenEnd, latex:formula.math.source});
        partCursor = tokenEnd;
      }
    } else {
      for (const formula of overlapping) {
        const mathFrom = formula.from16 - contentFrom;
        addText(partCursor, mathFrom);
        parts.push({kind:'math', from16:mathFrom, to16:formula.to16 - contentFrom, latex:formula.math.source});
        run += formula.math.projection;
        partCursor = formula.to16 - contentFrom;
      }
    }
    addText(partCursor, text.length);
    output += source.slice(from16, contentFrom) + run +
      source.slice(contentFrom + text.length, to16);
    if (runs.length) {
      const paragraph = {source, filePath, from16:contentFrom, text, glyphs, runs, parts, index:paragraphs.length};
      for (const glyph of glyphs) owners.set(glyph.tag, {paragraph, glyph});
      paragraphs.push(paragraph);
    }
    cursor = to16;
  }
  output += source.slice(cursor);
  const kind = paragraphs.length ? 'mixed' : 'math';
  return {source, projection:output, owners, formulas, paragraphs, nextTag:next, kind};
}

// Instrument each file independently while sharing the owner ID namespace.
export function projectMixedSnapshot(snapshot, previous, pending, {measureDrawings=false}={}) {
  let nextTag=previous?.nextTag??1;
  const owners=new Map(), formulas=[], paragraphs=[], files=[];
  function add(source,filePath,fragment) {
    const projection=projectMixedDocument(source,{previous,firstOwner:nextTag,filePath,fragment,splitIncludes:true,measureDrawings,
      keepThrough:pending?.path===filePath?pending.offset:0});
    if(!projection)return null;
    nextTag=projection.nextTag;
    for(const [tag,target] of projection.owners)owners.set(tag,target);
    formulas.push(...projection.formulas);
    paragraphs.push(...projection.paragraphs);
    return projection.projection;
  }
  const fragment=snapshot.fragment;
  const root=fragment
    ?fragment.start+(add(fragment.source,snapshot.mainFile,true)??fragment.source)+fragment.end
    :add(snapshot.source,snapshot.mainFile,false)??snapshot.source;
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  for(const file of snapshot.files??[]){
    if(snapshot.editablePaths&&!snapshot.editablePaths.has(file.path))continue;
    if(file.path===snapshot.mainFile||!/\.tex$/i.test(file.path)||file.bytes.length>2*1024*1024)continue;
    let source;
    try {source=decoder.decode(new Uint8Array(file.bytes));} catch {continue;}
    const projection=add(source,file.path,true);
    if(projection!==null)files.push({path:file.path,source:projection});
  }
  const kind=paragraphs.length ? (formulas.length?'mixed':'text') : 'math';
  return owners.size ? {source:snapshot.source,projection:root,owners,formulas,paragraphs,files,nextTag,kind} : null;
}

export function textTarget(projection, owner, after) {
  const entry = projection?.owners.get(owner);
  if (!entry?.paragraph || !entry?.glyph) return null;
  const {paragraph, glyph} = entry;
  const local = after ? glyph.to16 : glyph.from16;
  return {
    kind:'text', paragraph, glyph, owner, after,
    local, docOffset:paragraph.from16 + local,
    hit:{owner, role:'nucleus', after},
  };
}

export function proseEditEndpoints(paragraph, from, to) {
  const runs=paragraph.runs??[];
  const contains=(run,offset)=>offset>=run.from16&&offset<=run.to16&&
    (!run.offsets||run.offsets.includes(offset-run.from16));
  const single=runs.find(run=>contains(run,from)&&contains(run,to));
  if(single)return {start:single,end:single};
  const start=runs.find(run=>contains(run,from));
  const end=runs.find(run=>contains(run,to));
  if(!start||!end||start.partIndex>=end.partIndex)return null;
  const between=paragraph.parts.slice(start.partIndex+1,end.partIndex);
  if(!between.length||between.some(part=>part.kind!=='math'||part.from16<from||part.to16>to))return null;
  return {start,end};
}

export function textEdit(projection, {paragraph, from16, to16, insert}) {
  if (!projection || (projection.source!==paragraph.source && !projection.paragraphs?.includes(paragraph))) return null;
  if (!Number.isInteger(from16) || !Number.isInteger(to16) || from16 < 0 || to16 < from16 || to16 > paragraph.text.length) return null;
  if (paragraph.runs && !proseEditEndpoints(paragraph,from16,to16)) return null;
  if(typeof insert!=='string')return null;
  const latex=escapeText(insert);
  if((paragraph.container||paragraph.tableCell)&&(latex!==insert||unsupported.test(insert)))return null;
  const next = paragraph.text.slice(0, from16) + latex + paragraph.text.slice(to16);
  const source = paragraph.source.slice(0, paragraph.from16) + next + paragraph.source.slice(paragraph.from16 + paragraph.text.length);
  const patch={from:from16,to:to16,insert,...(latex!==insert&&{latex})};
  return {text:next,patch,source,selection:from16+latex.length};
}
