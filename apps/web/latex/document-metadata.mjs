import {parseDocument} from './document.mjs';
import {sourceStructure} from './source-structure.mjs';
import {group,trivia} from './tblr.mjs';

const metadataKeys=new Set(['title','author','date']);

export function documentMetadata(preamble,key) {
  if(!metadataKeys.has(key))return null;
  let result=null;
  for(const token of sourceStructure(preamble)){
    if(!token.topLevel||token.kind!=='command'||token.value!=='\\'+key)continue;
    const open=trivia(preamble,token.end);
    const argument=group(preamble,open);
    if(argument)result={from:open+1,to:argument.end-1,value:argument.value};
  }
  return result;
}

export function writeDocumentMetadata(source,key,value) {
  const parts=parseDocument(source);
  if(!parts||!metadataKeys.has(key))return null;
  const current=documentMetadata(parts.start,key);
  const at=parts.start.lastIndexOf('\\begin{document}');
  if(at<0)return null;
  const from=current?.from??at,to=current?.to??at;
  const insert=current?value:'\\'+key+'{'+value+'}'+parts.eol;
  const preamble=parts.start.slice(0,from)+insert+parts.start.slice(to);
  const body=parts.blocks.join('');
  const addMaketitle=key==='title'&&Boolean(value)&&![...sourceStructure(body)].some(token=>
    token.kind==='command'&&token.topLevel&&token.value==='\\maketitle');
  const draft=preamble+(addMaketitle?'\\maketitle'+parts.eol+parts.eol:'')+body+parts.end;
  const change=addMaketitle?{from,to:parts.start.length,insert:preamble.slice(from)+'\\maketitle'+parts.eol+parts.eol}:
    {from,to,insert};
  return {draft,preamble,addMaketitle,change};
}
