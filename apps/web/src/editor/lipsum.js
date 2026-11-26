import {Node} from '@tiptap/core';
import {LIPSUM_PARAGRAPHS} from '../../latex/lipsum-data.mjs';

export function lipsumParagraphs(range='1-7'){
 const [startText,endText]=String(range).split('-');
 const start=Math.max(1,Number.parseInt(startText,10)||1);
 const end=Math.max(start,Number.parseInt(endText||String(start),10)||start);
 return LIPSUM_PARAGRAPHS.slice(start-1,Math.min(150,end));
}
export const Lipsum=Node.create({
 name:'lipsum',group:'inline',inline:true,atom:true,selectable:true,
 addOptions:()=>({expandPreview:true}),
 addAttributes:()=>({range:{default:'1-7'}}),
 parseHTML:()=>[{tag:'span[data-lipsum]',getAttrs:dom=>({range:dom.dataset.lipsum||'1-7'})}],
 renderHTML:({node})=>['span',{'data-lipsum':node.attrs.range,contenteditable:'false'},'\\lipsum['+node.attrs.range+']'],
 addNodeView(){
  const expandPreview=this.options.expandPreview;
  return ({node})=>{
   const dom=document.createElement('span');
   dom.className='lipsum-content';
   dom.dataset.lipsum=node.attrs.range;
   dom.contentEditable='false';
   const render=()=>{
    if(!expandPreview){dom.textContent='\\lipsum['+node.attrs.range+']';return;}
    dom.replaceChildren(...lipsumParagraphs(node.attrs.range).map(text=>{
     const p=document.createElement('span');p.className='lipsum-paragraph';p.textContent=text;return p;
    }));
   };
   render();
   return {dom,update(next){if(next.type!==node.type)return false;node=next;dom.dataset.lipsum=next.attrs.range;render();return true;}};
  };
 },
});
