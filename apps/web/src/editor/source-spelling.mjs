import {serialize} from './latex-codec.js';
import {mathSpan} from '../../latex/math-delimiters.mjs';
import {groupEnd} from '../../latex/source-structure.mjs';

// Map only source tokens whose rendered spelling can be checked against the
// entire old paragraph. Offsets inside a rewritten TeX token have no owner.
// A comment has two source boundaries at the same visible text position.
export function proseSpelling(raw,target,children=[]) {
  if(!target)return null;
  const map=[0],comments=[],italic=[],protectedRanges=[];
  const atoms=children.filter(n=>n.type!=='text').map(serialize);
  if(atoms.some(a=>!a))return null;
  let normalized='', nextAtom=0,match;
  const tokens=/\\(?:noindent|indent)(?![A-Za-z])(?:\{\})?[ \t]*|\\[A-Za-z]+|\\[\s\S]|%[^\r\n]*(?:\r?\n|$)|\r?\n[ \t]*|[^\\%{}$\r\n\u00a0§¶•…–—‘’“”®™©]+|[\s\S]/gu;
  while((match=tokens.exec(raw))){
    const {index}=match;
    let token=match[0],end=tokens.lastIndex;
    let value=token;
    // Preserve formulas, references and other unchanged inline nodes verbatim.
    // Their contents can use the same commands as prose with different meaning.
    const atom=atoms[nextAtom];
    const physicalAtom=atom==='\\\\\n' && token==='\\\\' ?
      /^\\\\(?:[ \t]*\r?\n)?/.exec(raw.slice(index))[0] : atom;
    if(physicalAtom && raw.startsWith(physicalAtom,index)){
      token=physicalAtom;
      value=atom;
      end=tokens.lastIndex=index+token.length;
      protectedRanges.push({from:index,to:end});
      nextAtom++;
    }else if(token[0]==='%'){
      const last=comments.at(-1);
      if(last?.offset===normalized.length)last.to=end;
      else comments.push({offset:normalized.length,from:index,to:end});
      map[normalized.length]=end;
      continue;
    }else if(/^[\r\n]/.test(token))value=' ';
    else if(/^\\(?:noindent|indent)(?![A-Za-z])/.test(token))value=token.match(/^\\[A-Za-z]+/)[0]+' ';
    else if(/^\\(?:emph|textsl|textit)$/.test(token) && raw[end]==='{'){
      const close=groupEnd(raw,end);
      if(close<0)return null;
      italic.push({from:end+1,to:close-1,command:token});
      value='\\textit';
    }else if(/^[\u00a0§¶•…–—‘’“”®™©]$/u.test(token))value=serialize({type:'text',text:token});
    const position=normalized.length;
    normalized+=value;
    for(let i=1;i<value.length;i++)map[position+i]=value===token?index+i:null;
    map[normalized.length]=end;
  }
  if(nextAtom!==atoms.length)return null;
  const start=normalized.indexOf(target);
  if(start<0 || normalized.slice(0,start).trim() || normalized.slice(start+target.length).trim())return null;
  return {canonicalBody:target,map,start,comments,italic,protectedRanges};
}

// MathLive normalizes a field's outer whitespace on the first edit. Retain
// that spelling separately from the editable formula, just as for paragraphs.
export function mathSpelling(raw,nodes){
  if(nodes.length!==1||nodes[0].type!=='mathBlock')return null;
  const node=nodes[0],source=raw.trim(),open=node.attrs.delimiter??'\\[';
  if(!['\\[','$$'].includes(open)||!source.startsWith(open))return null;
  const span=mathSpan(source,0,open);
  if(!span||span.end!==source.length||span.latex.trim()!==node.attrs.latex.trim())return null;
  return {math:true,latex:span.latex,start:raw.length-raw.trimStart().length+open.length};
}
// TeX paragraph commands can end at a non-ASCII character or an empty group.
// Keep the user's exact prefix when editing text; do not relax unknown macros.
export function paragraphSpelling(raw,canonical,nodes){
  if(nodes.length!==1||nodes[0].type!=='paragraph')return null;
  const source=raw.trim();
  const match=source.match(/^\\(indent|noindent)(?![a-zA-Z])(?:\{\})?[ \t]*/);
  if(match) {
    const prefix='\\'+match[1]+' ';
    return canonical===prefix+source.slice(match[0].length)
      ? {canonical:prefix,original:match[0]} : null;
  }
  // Normalize only known literal Unicode spellings; retain an exact source map.
  const target=serialize(nodes[0]).slice(0,-2),map=[0];let normalized='';
  for(let offset=0;offset<raw.length;){const char=String.fromCodePoint(raw.codePointAt(offset));const value=/[\u00a0§¶•…–—‘’“”®™©]/u.test(char)?serialize({type:'text',text:char}):char;const start=normalized.length;normalized+=value;for(let n=1;n<value.length;n++)map[start+n]=null;offset+=char.length;map[normalized.length]=offset;}
  const at=normalized.indexOf(target);
  if(target&&at>=0&&normalized!==raw&&!normalized.slice(0,at).trim()&&!normalized.slice(at+target.length).trim())return {unicode:true,canonicalBody:target,map,start:at};
  // Paragraph spacing/shading/border/alignment are emitted as nested groups.
  // Allow text edits inside the wrapper while keeping the importer's canonical
  // projection; the wrapper prefix is retained up to the first changed byte.
  if(!/^\{(?:\\(?:fbox|colorbox|vspace\*?|linespread|raggedright|raggedleft|centering|justifying)\b)/.test(source))return null;
  let index=0;
  const limit=Math.min(source.length,canonical.length);
  while(index<limit&&source[index]===canonical[index])index++;
  if(!index)return null;
  return {canonical:canonical.slice(0,index),original:source.slice(0,index)};
}
