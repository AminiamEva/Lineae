import {headingAt} from '../../../latex/headings.mjs';
import {plainTableCells} from './table-cells.mjs';
import {plainContainerParagraphs} from './containers.mjs';
import {parseDocument} from '../../../latex/document.mjs';
import {sourceStructure} from '../../../latex/source-structure.mjs';
import {readGroup} from '../../../latex/table-spans.mjs';
import {projectDocumentFormulas} from '../native-math/document.mjs';

const segmenter = new Intl.Segmenter('und', {granularity:'grapheme'});
const unsupported = /[\\{}$%&#_^~]/;
const plainTokens=/^(?:\\[%&_#${}]|[^\\{}$%&#_^~])+/u;

function decodeProse(raw) {
  if(!raw.includes('\\'))return {text:raw};
  const offsets=[0];
  let text='';
  for(let index=0;index<raw.length;index++){
    if(raw[index]==='\\')index++;
    text+=raw[index];
    offsets.push(index+1);
  }
  return {text,offsets};
}

// Prose text is tagged per grapheme with its own LuaTeX attribute. Only plain
// runs are instrumented: TeX syntax, comments and math never receive a guessed
// source range.
function instrumentText(raw, firstOwner, attribute) {
  const {text,offsets}=decodeProse(raw);
  let next = firstOwner, local = 0, instrumented = '\\begingroup';
  const glyphs = [];
  for (const {segment} of segmenter.segment(text)) {
    const end=local+segment.length,from16=offsets?.[local]??local,to16=offsets?.[end]??end;
    const token=raw.slice(from16,to16);
    if (/^\s+$/u.test(segment)) { instrumented += token; local = end; continue; }
    const tag = next++;
    instrumented += `\\attribute${attribute}=${tag} ${token}`;
    glyphs.push({tag, from16, to16, char:segment});
    local = end;
  }
  return {instrumented:instrumented + '\\endgroup', glyphs, nextTag:next};
}

function plainBlock(block) {
  const leading = block.match(/^\s*/)[0].length;
  const trailing = block.length - block.trimEnd().length;
  return {leading, trailing, text:block.slice(leading, block.length - trailing)};
}

const textMarks = {textbf:'bold',textit:'italic',texttt:'code',underline:'underline',
  sout:'strike',textsuperscript:'superscript',textsubscript:'subscript'};
function proseBody(block) {
  const {leading,text}=plainBlock(block);
  const heading=headingAt(text);
  if(heading?.end===text.length&&heading.title.trim()===heading.title)
    return {leading:leading+heading.titleFrom,text:heading.title,heading:heading.name};
  return {leading,text};
}

function markedRuns(text, offset=0, marks=[]) {
  const runs=[];
  let cursor=0;
  while(cursor<text.length){
    const raw=plainTokens.exec(text.slice(cursor))?.[0];
    if(raw){
      runs.push({kind:'text',from16:offset+cursor,to16:offset+cursor+raw.length,...decodeProse(raw),marks});
      cursor+=raw.length;
      continue;
    }
    const command=/^\\([a-z]+)(?=\{)/.exec(text.slice(cursor));
    const mark=command&&Object.hasOwn(textMarks,command[1])&&textMarks[command[1]];
    if(!mark||marks.includes(mark)||marks.length>=3)return null;
    const start=cursor+command[0].length;
    const group=readGroup(text,start);
    if(!group?.value)return null;
    const nested=markedRuns(group.value,offset+start+1,[...marks,mark]);
    if(!nested)return null;
    runs.push(...nested);
    cursor=group.end;
  }
  return runs;
}

function instrumentProse(block, source, blockFrom, firstOwner, attribute, filePath) {
  const {leading,text,heading}=proseBody(block);
  const parts=markedRuns(text);
  if(!parts?.length)return null;
  const runs=[],glyphs=[];
  let projection='',cursor=0,nextTag=firstOwner;
  for(const [partIndex,part] of parts.entries()){
    const built=instrumentText(text.slice(part.from16,part.to16),nextTag,attribute);
    nextTag=built.nextTag;
    projection+=text.slice(cursor,part.from16)+built.instrumented;
    cursor=part.to16;
    runs.push({...part,partIndex});
    for(const glyph of built.glyphs)
      glyphs.push({...glyph,from16:part.from16+glyph.from16,to16:part.from16+glyph.to16});
  }
  if(!glyphs.length)return null;
  const paragraph={source,filePath,from16:blockFrom+leading,text,heading,glyphs,parts,runs};
  return {projection:block.slice(0,leading)+projection+text.slice(cursor)+block.slice(leading+text.length),
    paragraphs:[paragraph],nextTag};
}

function instrumentTable(block, source, blockFrom, firstOwner, attribute, filePath) {
  const cells=plainTableCells(block);
  if(!cells?.length)return null;
  let projection='',cursor=0,nextTag=firstOwner;
  const paragraphs=[];
  for(const cell of cells){
    const {text,offset,row,column}=cell;
    // An empty inline math boundary has zero ink and reports an engine-owned point.
    // The visible page still comes from the uninstrumented source.
    const built=text?instrumentText(text,nextTag,attribute):{
      instrumented:`\\begingroup\\mathsurround=0pt\\attribute${attribute}=${nextTag} $ $\\endgroup`,
      glyphs:[{tag:nextTag,from16:0,to16:0,char:''}],nextTag:nextTag+1,
    };
    nextTag=built.nextTag;
    projection+=block.slice(cursor,offset)+built.instrumented;
    cursor=offset+text.length;
    paragraphs.push({source,filePath,from16:blockFrom+offset,text,glyphs:built.glyphs,
      parts:text?[{kind:'text',from16:0,to16:text.length,text}]:[],
      runs:[{from16:0,to16:text.length,text,partIndex:0}],
      tableCell:{from16:blockFrom,row,column}});
  }
  return {projection:projection+block.slice(cursor),paragraphs,nextTag};
}

function instrumentContainer(block,source,blockFrom,firstOwner,attribute,filePath) {
  const parts=plainContainerParagraphs(block);
  if(!parts.length)return null;
  const paragraphs=[];
  let projection='',cursor=0,nextTag=firstOwner;
  for(const {from,text,container,path} of parts){
    const built=instrumentText(text,nextTag,attribute);
    projection+=block.slice(cursor,from)+built.instrumented;
    cursor=from+text.length;
    nextTag=built.nextTag;
    const part={kind:'text',from16:0,to16:text.length,text};
    paragraphs.push({source,filePath,from16:blockFrom+from,text,glyphs:built.glyphs,
      parts:[part],runs:[{...part,partIndex:0}],container:{type:container,path}});
  }
  return {projection:projection+block.slice(cursor),paragraphs,nextTag};
}

function instrumentTextBlock(block,source,from,next,attribute,filePath){
  return instrumentTable(block,source,from,next,attribute,filePath)??
    instrumentContainer(block,source,from,next,attribute,filePath)??
    instrumentProse(block,source,from,next,attribute,filePath);
}

// Prose-only documents: every plain paragraph becomes a native target.
export function projectTextDocument(source, {firstOwner=1, attribute=65000, fragment=false, filePath}={}) {
  const doc = parseDocument(source,{fragment});
  if (!doc) return null;
  const body = doc.blocks.join('');
  if (doc.start + body + doc.end !== source) return null;
  let output = '', cursor = 0, next = firstOwner, bodyOffset = 0;
  const paragraphs = [], owners = new Map();
  for (const block of doc.blocks) {
    const blockStart = bodyOffset;
    bodyOffset += block.length;
    if (!block.trim()) continue;
    const blockFrom=doc.start.length+blockStart;
    const result=instrumentTextBlock(block,source,blockFrom,next,attribute,filePath);
    if(!result)continue;
    output+=source.slice(cursor,blockFrom)+result.projection;
    cursor=blockFrom+block.length;
    next=result.nextTag;
    for(const paragraph of result.paragraphs){
      paragraphs.push(paragraph);
      for(const glyph of paragraph.glyphs)owners.set(glyph.tag,{paragraph,glyph});
    }
  }
  if (!paragraphs.length) return null;
  return {source, projection:output + source.slice(cursor), paragraphs, owners, nextTag:next, kind:'text', formulas:[]};
}

// Combined document projection for a single file: math spans keep their
// instrumented projection, formula-free plain blocks are tagged as prose, and
// plain runs beside inline math are tagged individually. Runs never cross
// math; a paragraph records the exact text/math child sequence so the editor
// can map a run patch to one ProseMirror text node.
export function projectMixedDocument(source, {previous=[], attribute=65000, fragment=false, firstOwner=1, filePath}={}) {
  const doc = parseDocument(source,{fragment});
  if (!doc) return null;
  const body = doc.blocks.join('');
  if (doc.start + body + doc.end !== source) return null;
  const math = projectDocumentFormulas(source, {previous:previous?.formulas ?? [], firstTag:firstOwner, fragment, filePath});
  if (!math) return projectTextDocument(source, {attribute,firstOwner,fragment,filePath});
  const formulas = [...math.formulas].sort((left, right) => left.from16 - right.from16);
  const mathTokens = [...sourceStructure(body)].filter(token =>
    token.kind === 'inlineMath' || token.kind === 'displayMath');
  const owners = new Map(math.owners), paragraphs = [];
  let output = '', cursor = 0, next = math.nextTag, bodyOffset = 0;
  for (const block of doc.blocks) {
    const blockStart = bodyOffset;
    const from16 = doc.start.length + bodyOffset;
    bodyOffset += block.length;
    const to16 = from16 + block.length;
    const overlapping = formulas.filter(formula => formula.from16 < to16 && formula.to16 > from16);
    const blockTokens = mathTokens.filter(token =>
      token.index >= blockStart && token.index < blockStart + block.length);
    if (overlapping.some(formula => formula.from16 < from16 || formula.to16 > to16)) {
      return {...math, kind:'math', paragraphs:[]};
    }
    output += source.slice(cursor, from16);
    const result=!overlapping.length&&instrumentTextBlock(block,source,from16,next,attribute,filePath);
    if(result){
      output+=result.projection;
      cursor=to16;
      next=result.nextTag;
      for(const paragraph of result.paragraphs){
        paragraphs.push(paragraph);
        for(const glyph of paragraph.glyphs)owners.set(glyph.tag,{paragraph,glyph});
      }
      continue;
    }
    const {leading,text}=plainBlock(block);
    const contentFrom = from16 + leading;
    const parts = [], runs = [], glyphs = [];
    let run = '', partCursor = 0;
    const addText = (from, to) => {
      const raw = text.slice(from, to);
      if (!raw) return;
      const partIndex = parts.length;
      const supported=plainTokens.exec(raw)?.[0]===raw;
      const part={kind:'text',from16:from,to16:to,...(supported?decodeProse(raw):{text:raw})};
      parts.push(part);
      if (!supported) { run += raw; return; }
      const built = instrumentText(raw, next, attribute);
      next = built.nextTag;
      runs.push({...part,partIndex});
      for (const glyph of built.glyphs)
        glyphs.push({...glyph, from16:glyph.from16 + from, to16:glyph.to16 + from});
      run += built.instrumented;
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
export function projectMixedSnapshot(snapshot, previous) {
  let nextTag=previous?.nextTag??1;
  const owners=new Map(), formulas=[], paragraphs=[], files=[];
  function add(source,filePath,fragment) {
    const projection=projectMixedDocument(source,{previous,firstOwner:nextTag,filePath,fragment});
    if(!projection)return null;
    nextTag=projection.nextTag;
    for(const [tag,target] of projection.owners)owners.set(tag,target);
    formulas.push(...projection.formulas);
    paragraphs.push(...projection.paragraphs);
    return projection.projection;
  }
  const root=add(snapshot.source,snapshot.mainFile,false)??snapshot.source;
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  for(const file of snapshot.files??[]){
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
  if(typeof insert!=='string'||/[\\^~]/.test(insert))return null;
  if((paragraph.container||paragraph.tableCell)&&unsupported.test(insert))return null;
  const latex=insert.replace(/[%&_#${}]/g,char=>'\\'+char);
  const next = paragraph.text.slice(0, from16) + latex + paragraph.text.slice(to16);
  const source = paragraph.source.slice(0, paragraph.from16) + next + paragraph.source.slice(paragraph.from16 + paragraph.text.length);
  const patch={from:from16,to:to16,insert,...(latex!==insert&&{latex})};
  return {text:next,patch,source,selection:from16+latex.length};
}
