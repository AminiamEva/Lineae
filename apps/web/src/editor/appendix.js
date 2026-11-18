import {Node} from '@tiptap/core';
export const AppendixStart=Node.create({
 name:'appendixStart',group:'block',atom:true,selectable:true,
 parseHTML:()=>[{tag:'div[data-appendix-start]'}],
 renderHTML:()=>['div',{'data-appendix-start':'',contenteditable:'false','aria-label':'\\appendix'}],
});
