import {Node} from '@tiptap/core';
export const CounterDirective=Node.create({
 name:'counterDirective',group:'block',atom:true,selectable:true,
 addAttributes:()=>({latex:{default:''}}),
 parseHTML:()=>[{tag:'div[data-counter-directive]',getAttrs:element=>({latex:element.dataset.counterDirective})}],
 renderHTML:({node})=>['div',{'data-counter-directive':node.attrs.latex,contenteditable:'false','aria-label':node.attrs.latex}],
 addKeyboardShortcuts(){const remove=()=>this.editor.state.selection.node?.type.name==='counterDirective'&&this.editor.commands.deleteSelection();return {Backspace:remove,Delete:remove};},
});