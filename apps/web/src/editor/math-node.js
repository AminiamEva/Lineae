import { Node } from '@tiptap/core';
let configuredKeys=[{key:'ctrl+6',command:'moveToSuperscript'},{key:'ctrl+-',command:'moveToSubscript'},{key:'ctrl+0',command:'moveAfterParent'}];
export function configureMathKeys(values) {
  const allowed=new Set(['moveToSuperscript','moveToSubscript','moveAfterParent']);
  const entries=Object.entries(values ?? {}).filter(([key,command])=>/^ctrl\+[^+]+$/.test(key)&&allowed.has(command));
  if(entries.length)configuredKeys=entries.map(([key,command])=>({key,command}));
}
export const MathNode = Node.create({
  name:'math', group:'inline', inline:true, atom:true,
  addAttributes:()=>({latex:{default:''},display:{default:false}}),
  parseHTML:()=>[{tag:'span[data-math]'}],
  renderHTML:({node})=>['span',{'data-math':''},node.attrs.latex],
  addNodeView() {
    return ({node, editor, getPos}) => {
      const dom=document.createElement('span');
      dom.className=node.attrs.display?'math-display':'math-inline';
      const field=document.createElement('math-field');
      field.textContent=node.attrs.latex;
      dom.append(field);
      field.addEventListener('input',()=>{
        const pos=getPos();
        if(typeof pos==='number') editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...node.attrs,latex:field.value}));
      });
      field.addEventListener('keydown',event=>{
        if(event.ctrlKey && ['z','y'].includes(event.key.toLowerCase())) {
          event.preventDefault();event.stopPropagation();
          if(event.key.toLowerCase()==='z')editor.commands.undo();else editor.commands.redo();
          return;
        }
        if(event.key==='$' && (field.value || node.attrs.display)) {
          event.preventDefault();event.stopPropagation();
          const position=getPos();
          editor.commands.focus();
          editor.commands.setTextSelection(position+1);
          return;
        }
        if(event.key==='$' && !field.value && !node.attrs.display) {
          event.preventDefault();
          const pos=getPos();
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{latex:'',display:true}));
        }
        if(event.key==='Backspace' && !field.value) {
          event.preventDefault();
          editor.chain().focus().deleteRange({from:getPos(),to:getPos()+1}).run();
        }
      },true);
      field.addEventListener('move-out',event=>{
        const pos=getPos();
        editor.commands.focus();
        editor.commands.setTextSelection(pos+(event.detail.direction==='backward'?0:1));
      });
      field.addEventListener('mount',()=>{
        field.keybindings=[
          ...configuredKeys,
          ...field.keybindings,
        ];
      });
      return {
        dom,
        update(next) {
          if(next.type.name!=='math')return false;
          node=next;
          dom.className=node.attrs.display?'math-display':'math-inline';
          if(field.value!==node.attrs.latex)field.value=node.attrs.latex;
          return true;
        },
        stopEvent:()=>true,
        ignoreMutation:()=>true,
      };
    };
  },
});
