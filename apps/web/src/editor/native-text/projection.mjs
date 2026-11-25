import {plainTableCells} from './table-cells.mjs';
import {parseDocument} from '../../../latex/document.mjs';
import {sourceStructure} from '../../../latex/source-structure.mjs';
import {projectDocumentFormulas} from '../native-math/document.mjs';

const segmenter = new Intl.Segmenter('und', {granularity:'grapheme'});
const unsupported = /[\\{}$%&#_^~]/;

// Prose text is tagged per grapheme with its own LuaTeX attribute. Only plain
// runs are instrumented: TeX syntax, comments and math never receive a guessed
// source range.
function instrumentText(text, firstOwner, attribute) {
  let next = firstOwner, local = 0, instrumented = '\\begingroup';
  const glyphs = [];
  for (const {segment} of segmenter.segment(text)) {
    if (/^\s+$/u.test(segment)) { instrumented += segment; local += segment.length; continue; }
    const tag = next++;
    instrumented += `\\attribute${attribute}=${tag} ${segment}`;
    glyphs.push({tag, from16:local, to16:local + segment.length, char:segment});
    local += segment.length;
  }
  return {instrumented:instrumented + '\\endgroup', glyphs, nextTag:next};
}

function plainBlock(block) {
  const leading = block.match(/^\s*/)[0].length;
  const trailing = block.length - block.trimEnd().length;
  return {leading, trailing, text:block.slice(leading, block.length - trailing)};
}

const textMarks = {textbf:'bold',textit:'italic',texttt:'code'};
function proseBody(block) {
  const {leading,text}=plainBlock(block);
  const mark=/^\\(textbf|textit|texttt)\{([^{}]+)\}$/.exec(text);
  if(!mark)return {leading,text,mark:null};
  return {leading:leading+mark[1].length+2,text:mark[2],mark:textMarks[mark[1]]};
}

function instrumentTable(block, source, blockFrom, firstOwner, attribute, filePath) {
  const cells=plainTableCells(block)?.filter(cell=>cell.text);
  if(!cells?.length)return null;
  let projection='',cursor=0,nextTag=firstOwner;
  const paragraphs=[];
  for(const cell of cells){
    const {text,offset,row,column}=cell;
    const built=instrumentText(text,nextTag,attribute);
    nextTag=built.nextTag;
    projection+=block.slice(cursor,offset)+built.instrumented;
    cursor=offset+text.length;
    paragraphs.push({source,filePath,from16:blockFrom+offset,text,glyphs:built.glyphs,
      parts:[{kind:'text',from16:0,to16:text.length,text}],
      runs:[{from16:0,to16:text.length,text,partIndex:0}],
      tableCell:{from16:blockFrom,row,column}});
  }
  return {projection:projection+block.slice(cursor),paragraphs,nextTag};
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
    const table=instrumentTable(block,source,blockFrom,next,attribute,filePath);
    if(table){
      output+=source.slice(cursor,blockFrom)+table.projection;
      cursor=blockFrom+block.length;
      next=table.nextTag;
      for(const paragraph of table.paragraphs){
        paragraphs.push(paragraph);
        for(const glyph of paragraph.glyphs)owners.set(glyph.tag,{paragraph,glyph});
      }
      continue;
    }
    const {leading,text,mark}=proseBody(block);
    if (!text || unsupported.test(text)) continue;
    const built = instrumentText(text, next, attribute);
    next = built.nextTag;
    const from16 = doc.start.length + blockStart + leading;
    const paragraph = {source, filePath, from16, text, glyphs:built.glyphs, index:paragraphs.length,
      parts:[{kind:'text', from16:0, to16:text.length, text, mark}],
      runs:[{from16:0, to16:text.length, text, partIndex:0}]};
    for (const glyph of built.glyphs) owners.set(glyph.tag, {paragraph, glyph});
    paragraphs.push(paragraph);
    output += source.slice(cursor, from16) + built.instrumented;
    cursor = from16 + text.length;
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
    const table=!overlapping.length&&instrumentTable(block,source,from16,next,attribute,filePath);
    if(table){
      output+=table.projection;
      cursor=to16;
      next=table.nextTag;
      for(const paragraph of table.paragraphs){
        paragraphs.push(paragraph);
        for(const glyph of paragraph.glyphs)owners.set(glyph.tag,{paragraph,glyph});
      }
      continue;
    }
    const {leading,text,mark}=overlapping.length ? {...plainBlock(block),mark:null} : proseBody(block);
    const contentFrom = from16 + leading;
    if (!overlapping.length) {
      if (text && !unsupported.test(text)) {
        const built = instrumentText(text, next, attribute);
        next = built.nextTag;
        const paragraph = {source, filePath, from16:contentFrom, text, glyphs:built.glyphs, index:paragraphs.length,
          parts:[{kind:'text', from16:0, to16:text.length, text, mark}],
          runs:[{from16:0, to16:text.length, text, partIndex:0}]};
        for (const glyph of built.glyphs) owners.set(glyph.tag, {paragraph, glyph});
        paragraphs.push(paragraph);
        output += source.slice(from16, contentFrom) + built.instrumented;
        cursor = contentFrom + text.length;
        continue;
      }
    }
    const parts = [], runs = [], glyphs = [];
    let run = '', partCursor = 0;
    const addText = (from, to) => {
      const raw = text.slice(from, to);
      if (!raw) return;
      const partIndex = parts.length;
      parts.push({kind:'text', from16:from, to16:to, text:raw});
      if (unsupported.test(raw)) { run += raw; return; }
      const built = instrumentText(raw, next, attribute);
      next = built.nextTag;
      runs.push({from16:from, to16:to, text:raw, partIndex});
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
  const contains=(run,offset)=>offset>=run.from16&&offset<=run.to16;
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
  if (typeof insert !== 'string' || unsupported.test(insert)) return null;
  const next = paragraph.text.slice(0, from16) + insert + paragraph.text.slice(to16);
  const source = paragraph.source.slice(0, paragraph.from16) + next + paragraph.source.slice(paragraph.from16 + paragraph.text.length);
  return {text:next, patch:{from:from16, to:to16, insert}, source, selection:from16 + insert.length};
}
