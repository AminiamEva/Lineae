import {paragraphSpelling} from './source-spelling.mjs';
import {serialize} from './latex-codec.js';

const empty = node => node.type === 'paragraph' && !node.content?.length && !serialize(node).trim();
export function includeEmptyParagraphs(blocks,index,parsed,text,doc) {
  const tail = doc.content.slice(index);
  if (!tail.length || !tail.every(empty)) return index;
  if (!index) {
    blocks.splice(0,blocks.length,{
      from:parsed.start.length,to:text.length - parsed.end.length,index:0,count:doc.content.length,
      raw:parsed.blocks.join(''),editable:true,snapshot:JSON.stringify(doc.content),
    });
    return doc.content.length;
  }
  const owner = blocks.findLast(block => block.count > 0);
  if (!owner?.editable) return index;
  owner.count += tail.length;
  owner.snapshot = JSON.stringify(doc.content.slice(owner.index,owner.index + owner.count));
  return doc.content.length;
}
export function ownsEditedRange(block,first,last) {
  return block.editable && first >= block.index && last <= block.index + block.count && first <= block.index + block.count;
}
export function blockWhitespace(raw) {
  if (!raw.trim()) return ['',raw];
  const leading = raw.match(/^\s*/)[0];
  return [leading,raw.slice(leading.length).match(/\s*$/)[0]];
}

// A source block may contain a heading and a paragraph separated by one newline.
// Split only where each canonical node is found verbatim and gaps are whitespace.
// Every original byte remains owned by exactly one of the resulting blocks.
export function splitEditableBoundaries(blocks,doc){
  return blocks.flatMap(block=>{
    if(block.editable||block.count<2)return [block];
    const nodes=doc.content.slice(block.index,block.index+block.count);
    const matches=[];let cursor=0;
    for(const node of nodes){
      if(node.type==='raw')return [block];
      const canonical=serialize(node).trim();
      if(!canonical)return [block];
      let start=block.raw.indexOf(canonical,cursor),spelling=null,length=canonical.length;
      if(start<0){
        const tail=block.raw.slice(cursor),body=tail.trim();
        spelling=paragraphSpelling(body,canonical,[node]);
        if(!spelling)return [block];
        start=cursor+tail.length-tail.trimStart().length;length=body.length;
      }
      if(block.raw.slice(cursor,start).trim())return [block];
      matches.push({start,end:start+length,spelling});
      cursor=start+length;
    }
    if(block.raw.slice(cursor).trim())return [block];
    return nodes.map((node,index)=>{
      const from=index?matches[index].start:0;
      const to=matches[index+1]?.start??block.raw.length;
      return {spelling:matches[index].spelling,from:block.from+from,to:block.from+to,index:block.index+index,count:1,
        raw:block.raw.slice(from,to),editable:true,snapshot:JSON.stringify([node])};
    });
  });
}
