import {serialize} from './latex-codec.js';
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
