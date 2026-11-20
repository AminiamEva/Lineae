import {sourceStructure} from './source-structure.mjs';

function skipTrivia(source,index) {
  const trivia=/(?:\s+|%[^\r\n]*(?:\r?\n|$))*/y;
  trivia.lastIndex=index;trivia.exec(source);return trivia.lastIndex;
}

// Optional arguments allow brackets protected by braces; escapes and comments
// cannot close either kind of argument. Values are slices of the original text.
function argument(source,start,open='{',close='}') {
  if(source[start]!==open)return null;
  let depth=1,braces=0;
  for(let index=start+1;index<source.length;index++) {
    const char=source[index];
    if(char==='\\'){index++;continue;}
    if(char==='%') {
      while(index<source.length && source[index]!=='\r' && source[index]!=='\n')index++;
      continue;
    }
    if(open==='[') {
      if(char==='{'){braces++;continue;}
      if(char==='}'){if(!braces)return null;braces--;continue;}
      if(braces)continue;
    }
    if(char===open)depth++;
    else if(char===close && --depth===0)return {value:source.slice(start+1,index),end:index+1};
  }
  return null;
}

// A lossless description of the outer float, not a conversion of its contents.
// Complex floats remain Raw nodes; this descriptor is also used by their view.
export function parseTableFloat(source) {
  const opening=/^\s*\\begin\{(table\*?)\}/.exec(source);
  if(!opening)return null;
  const tokens=Array.from(sourceStructure(source));
  if(tokens.some(token=>token.kind==='invalid'))return null;
  let depth=0,closing;
  for(const token of tokens) {
    if(token.kind==='begin' && /^\\begin\{table\*?\}$/.test(token.value))depth++;
    if(token.kind==='end' && /^\\end\{table\*?\}$/.test(token.value) && --depth===0) {
      closing=token;break;
    }
  }
  if(!closing || source.slice(closing.end).trim())return null;
  let bodyStart=opening[0].length,placement=null;
  const optionStart=skipTrivia(source,bodyStart);
  if(source[optionStart]==='[') {
    const option=argument(source,optionStart,'[',']');
    if(!option || option.end>closing.index)return null;
    placement=option.value;bodyStart=option.end;
  }
  const body=source.slice(bodyStart,closing.index);
  const result={source,environment:opening[1],open:source.slice(0,bodyStart),body,
    close:source.slice(closing.index),placement,caption:null,shortCaption:null,
    captionStarred:false,label:null,centered:false};
  let cursor=0;
  for(const token of sourceStructure(body)) {
    if(!token.topLevel || token.kind!=='command' || token.index<cursor)continue;
    if(token.value==='\\centering'){result.centered=true;continue;}
    if(token.value!=='\\caption' && token.value!=='\\label')continue;
    const caption=token.value==='\\caption';
    const starred=caption && body[token.end]==='*';
    let start=skipTrivia(body,token.end+(starred?1:0)),short=null;
    if(caption && body[start]==='[') {
      const option=argument(body,start,'[',']');
      if(!option)return null;
      short=option.value;start=skipTrivia(body,option.end);
    }
    const value=argument(body,start);
    if(!value)return null;
    cursor=value.end;
    if(caption && result.caption===null) {
      result.caption=value.value;result.shortCaption=short;result.captionStarred=starred;
    } else if(!caption && result.label===null)result.label=value.value;
  }
  return result;
}
