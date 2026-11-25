import {importBlocks,listParagraphRanges} from '../../../latex/blocks.mjs';
import {parseDocument} from '../../../latex/document.mjs';
import {importTextEnvironment} from '../../../latex/text-environments.mjs';
import {theoremParts} from '../../../latex/theorem.mjs';

export function plainParagraphText(node) {
  if(node?.type!=='paragraph')return null;
  const content=node.content??[];
  if(content.some(child=>child.type!=='text'||child.marks?.length))return null;
  return content.map(child=>child.text).join('');
}

function paragraphRange(source,from,to,container,path,node) {
  if(node?.type!=='paragraph')return null;
  const body=source.slice(from,to);
  const text=body.trim();
  if(!text)return null;
  return {from:from+body.indexOf(text),text,container,path,node};
}

export function containerParagraphRanges(source) {
  const theorem=theoremParts(source);
  if(theorem){
    const doc=parseDocument(theorem.body,{fragment:true});
    if(!doc||doc.blocks.join('')!==theorem.body)return [];
    let offset=theorem.bodyFrom,index=0;
    const paragraphs=[];
    for(const raw of doc.blocks){
      const nodes=importBlocks(raw);
      if(nodes.some(node=>node.type==='raw'))return [];
      if(nodes.length===1){
        const part=paragraphRange(source,offset,offset+raw.length,'theoremBlock',[index],nodes[0]);
        if(part)paragraphs.push(part);
      }
      offset+=raw.length;
      index+=nodes.length;
    }
    return paragraphs;
  }
  if(/^\s*\\begin\{(?:itemize|enumerate|description)\}/.test(source))
    return listParagraphRanges(source).flatMap(({from,to,container,path,node})=>{
      const range=paragraphRange(source,from,to,container,path,node);
      return range?[range]:[];
    });
  const environment=importTextEnvironment(source,raw=>importBlocks(raw,{groups:true}));
  return (environment?.attrs.environmentSource.parts??[]).flatMap(part=>{
    if(part.count!==1||part.protected)return [];
    const range=paragraphRange(source,part.from,part.to,'blockquote',[part.index],part.nodes[0]);
    return range?[range]:[];
  });
}

export function plainContainerParagraphs(source) {
  return containerParagraphRanges(source).filter(({text,node})=>text===plainParagraphText(node)&&
    !/[\\{}$%&#_^~\r\n]/.test(text));
}
