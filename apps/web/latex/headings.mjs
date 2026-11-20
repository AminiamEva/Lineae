import {referenceAt} from './reference-commands.mjs';
// Scan arguments without expanding TeX. Escaped braces and comments do not
// affect balance; brackets inside a braced optional argument are literal.
function argument(source, start, open='{', close='}') {
  if (source[start] !== open) return null;
  let depth=1, braces=0;
  for(let index=start+1; index<source.length; index++) {
    const char=source[index];
    if(char==='\\') { index++; continue; }
    if(char==='%') {
      while(index<source.length && source[index]!=='\n' && source[index]!=='\r') index++;
      continue;
    }
    if(open==='[') {
      if(char==='{') { braces++; continue; }
      if(char==='}') { if(!braces)return null; braces--; continue; }
      if(braces)continue;
    }
    if(char===open)depth++;
    else if(char===close && --depth===0)return {value:source.slice(start+1,index),end:index+1};
  }
  return null;
}

function skipTrivia(source,index) {
  const trivia=/(?:\s+|%[^\r\n]*(?:\r?\n|$))*/y;
  trivia.lastIndex=index;trivia.exec(source);return trivia.lastIndex;
}

export function headingAt(source,index=0) {
  const command=/\\(section|subsection|subsubsection)(?![A-Za-z])([*]?)/y;
  command.lastIndex=index;
  const match=command.exec(source);
  if(!match)return null;
  let cursor=skipTrivia(source,command.lastIndex),short;
  if(source[cursor]==='[') {
    const optional=argument(source,cursor,'[',']');
    if(!optional)return null;
    short=optional.value;cursor=skipTrivia(source,optional.end);
  }
  const title=argument(source,cursor);
  if(!title)return null;
  let end=title.end,label,labelSource;
  const labelled=referenceAt(source,skipTrivia(source,end));
  if(labelled?.kind==='label'){
    label=labelled.key;labelSource=source.slice(end,labelled.end);end=labelled.end;
    if(labelSource==='\\label{'+label+'}')labelSource=undefined;
  }
  return {name:match[1],star:match[2],short,title:title.value,label,labelSource,end};
}
