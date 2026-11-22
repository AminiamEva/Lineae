import {Node} from '@tiptap/core';
export const AppendixStart=Node.create({
 name:'appendixStart',group:'block',atom:true,selectable:true,
 addKeyboardShortcuts(){
  const remove=()=>this.editor.state.selection.node?.type.name==='appendixStart'&&this.editor.commands.deleteSelection();
  return {Backspace:remove,Delete:remove};
 },
 parseHTML:()=>[{tag:'div[data-appendix-start]'}],
 renderHTML:()=>['div',{'data-appendix-start':'',contenteditable:'false','aria-label':'\\appendix'}],
});
export const MatterStart=Node.create({
 name:'matterStart',group:'block',atom:true,selectable:true,
 addAttributes:()=>({matter:{default:'main'}}),
 parseHTML:()=>[{tag:'div[data-matter-start]',getAttrs:dom=>({matter:dom.dataset.matterStart||'main'})}],
 renderHTML:({node})=>['div',{'data-matter-start':node.attrs.matter,contenteditable:'false','aria-label':'\\'+node.attrs.matter}],
});

export const LayoutCommand=Node.create({
 name:'layoutCommand',group:'block',atom:true,selectable:true,
 addAttributes:()=>({command:{default:''}}),
 parseHTML:()=>[{tag:'div[data-layout-command]',getAttrs:dom=>({command:dom.dataset.layoutCommand||''})}],
 renderHTML:({node})=>['div',{'data-layout-command':node.attrs.command,contenteditable:'false'}],
});
