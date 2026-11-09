import { parseInline } from '../latex/inline.mjs';
import { parseTable } from '../latex/tables.mjs';
import { Editor, Node, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Plugin } from '@tiptap/pm/state';
import { parseDocument } from '../latex/document.mjs';
import { exportDocument } from '../latex/packages.mjs';

const escape = text => text.replace(/[\\{}%$&#_^~]/g, char => ({
  '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
}[char] ?? '\\' + char));
function serialize(node) {
  const content = (node.content ?? []).map(serialize).join('');
  if (node.type === 'text') {
    let value = escape(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = '\\textbf{' + value + '}';
      if (mark.type === 'italic') value = '\\textit{' + value + '}';
      if (mark.type === 'strike') value = '\\sout{' + value + '}';
    }
    return value;
  }
  switch (node.type) {
    case 'paragraph': return content + '\n\n';
    case 'heading': return '\\' + ['section','subsection','subsubsection'][Math.min(node.attrs.level,3)-1] + '{' + content + '}\n\n';
    case 'bulletList': return '\\begin{itemize}\n' + content + '\\end{itemize}\n\n';
    case 'orderedList': return '\\begin{enumerate}\n' + content + '\\end{enumerate}\n\n';
    case 'listItem': return '\\item ' + content.trim() + '\n';
    case 'math': return node.attrs.display ? '\\[' + node.attrs.latex + '\\]' : '$' + node.attrs.latex + '$';
    case 'raw': return node.attrs.source;
    case 'hardBreak': return '\\\\\n';
    case 'table': return '\\begin{tabular}{' + 'l'.repeat(node.content[0].content.length) + '}\n' + content + '\\end{tabular}\n\n';
    case 'tableRow': return node.content.map(cell => serialize(cell).trim()).join(' & ') + ' \\\\\n';
    default: return content;
  }
}
const Raw = Node.create({
  name:'raw', group:'block', atom:true,
  addAttributes:()=>({source:{default:''}}),
  parseHTML:()=>[{tag:'pre[data-raw]'}],
  renderHTML:({node})=>['pre',{'data-raw':'',contenteditable:'false'},node.attrs.source],
});
const MathNode = Node.create({
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
          {key:'ctrl+6',command:'moveToSuperscript'},
          {key:'ctrl+-',command:'moveToSubscript'},
          {key:'ctrl+0',command:'moveAfterParent'},
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
let editor;
function insertMath(display=false) {
  const position=editor.state.selection.from;
  editor.chain().focus().insertContent({type:'math',attrs:{latex:'',display}}).run();
  requestAnimationFrame(()=>{
    const dom=editor.view.nodeDOM(position);
    dom?.querySelector('math-field')?.focus();
  });
}
const Shortcuts = Extension.create({
  name:'documentShortcuts',
  addProseMirrorPlugins:()=>[new Plugin({props:{
    handleTextInput(view,from,to,text) {
      if(text!=='$')return false;
      insertMath();
      return true;
    },
  }})],
  addKeyboardShortcuts() {
    return {
      Tab:()=>this.editor.isActive('listItem')?this.editor.commands.sinkListItem('listItem'):false,
      'Shift-Tab':()=>this.editor.isActive('listItem')?this.editor.commands.liftListItem('listItem'):false,
    };
  },
});
const paper=document.querySelector('#editor');
paper.replaceChildren();
editor=new Editor({
  element:paper,
  extensions:[StarterKit,Table.configure({resizable:true}),TableRow,TableCell,TableHeader,Raw,MathNode,Shortcuts],
  content:'<p></p>',
});
const tools=document.querySelector('#insert');
tools.replaceChildren();
function button(label, action) {
  const control=document.createElement('button');
  control.type='button'; control.textContent=label;
  control.addEventListener('mousedown',event=>event.preventDefault());
  control.addEventListener('click',action);
  tools.append(control);
}
button('↶',()=>editor.chain().focus().undo().run());
button('↷',()=>editor.chain().focus().redo().run());
button('B',()=>editor.chain().focus().toggleBold().run());
button('I',()=>editor.chain().focus().toggleItalic().run());
button('H',()=>editor.chain().focus().toggleHeading({level:1}).run());
button('itemize',()=>editor.chain().focus().toggleBulletList().run());
button('enumerate',()=>editor.chain().focus().toggleOrderedList().run());
button('▦',()=>editor.chain().focus().insertTable({rows:2,cols:2,withHeaderRow:false}).run());
button('＋ Row',()=>editor.chain().focus().addRowAfter().run());
button('＋ Column',()=>editor.chain().focus().addColumnAfter().run());
button('$',()=>insertMath());
button('$$',()=>insertMath(true));
const sourceView=document.createElement('textarea');
sourceView.className='source-view'; sourceView.hidden=true;
paper.after(sourceView);
let documentParts=parseDocument('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\end{document}\n');
let filename='lineae.tex';
function source() {return exportDocument(documentParts,serialize(editor.getJSON()));}
function inlineContent(text) {
  const parsed=parseInline(text);
  if(!parsed)return null;
  function convert(parts,marks=[]) {
    return parts.flatMap(part=>{
      if(typeof part==='string')return part?[{type:'text',text:part,marks}]:[];
      if(part.math!==undefined)return [{type:'math',attrs:{latex:part.math,display:false}}];
      const type={strong:'bold',em:'italic'}[part.tag];
      if(!type)throw new Error('Unsupported inline formatting');
      return convert(part.children,[...marks,{type}]);
    });
  }
  try{return convert(parsed);}catch{return null;}
}
function importBlock(block) {
  const text=block.trim();
  if(!text)return null;
  const heading=text.match(/^\\(section|subsection|subsubsection)\{([^{}]*)\}$/);
  if(heading)return {type:'heading',attrs:{level:['section','subsection','subsubsection'].indexOf(heading[1])+1},content:[{type:'text',text:heading[2]}]};
  const math=text.match(/^\\\[([\s\S]*?)\\\]$/);
  if(math)return {type:'paragraph',content:[{type:'math',attrs:{latex:math[1],display:true}}]};
  const list=text.match(/^\\begin\{(itemize|enumerate)\}\n([\s\S]*?)\n\\end\{\1\}$/);
  if(list) {
    const items=list[2].split(/\n(?=\\item)/).map(item=>inlineContent(item.replace(/^\\item\s?/,'')));
    if(items.every(Boolean))return {type:list[1]==='itemize'?'bulletList':'orderedList',content:items.map(content=>({type:'listItem',content:[{type:'paragraph',content}]}))};
  }
  const table=parseTable(text);
  if(table && !table.trailing.length && table.rows.every(row=>!row.rules.length)) {
    return {type:'table',content:table.rows.map(row=>({type:'tableRow',content:row.cells.map(cell=>({type:'tableCell',content:[{type:'paragraph',content:cell.trim()?[{type:'text',text:cell.trim()}]:[]}]}))}))};
  }
  const content=inlineContent(text);
  if(content)return {type:'paragraph',content};
  return {type:'raw',attrs:{source:block}};
}
function load(text) {
  const parsed=parseDocument(text);
  if(!parsed)throw new Error('无法识别文档 / Invalid document');
  // Preserve imported source exactly. Unsupported blocks remain directly accessible in source mode.
  documentParts=parsed;
  const content=parsed.blocks.map(importBlock).filter(Boolean);
  editor.commands.setContent({type:'doc',content:content.length?content:[{type:'paragraph'}]});
}
button('LaTeX',()=>{
  if(sourceView.hidden) {
    sourceView.value=source(); sourceView.hidden=false; paper.hidden=true;
  } else {
    try {load(sourceView.value);sourceView.hidden=true;paper.hidden=false;}
    catch(error){document.querySelector('#status').hidden=false;document.querySelector('#status').textContent=error.message;}
  }
});
document.querySelector('#download').disabled=false;
document.querySelector('#download').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([sourceView.hidden?source():sourceView.value],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.querySelector('#file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {load(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer()));filename=file.name;}
  catch(error){const status=document.querySelector('#status');status.hidden=false;status.textContent=error.message;}
});
const footer=document.createElement('footer');footer.className='document-status';
const count=document.createElement('span');
const zoom=document.createElement('input');zoom.type='range';zoom.min='50';zoom.max='300';zoom.value='100';
const percent=document.createElement('output');
function scale(){paper.style.zoom=Number(zoom.value)/100;percent.textContent=zoom.value+'%';}
zoom.addEventListener('input',scale);
let wheel=0;
document.querySelector('main').addEventListener('wheel',event=>{
  if(!event.ctrlKey)return;
  event.preventDefault();wheel+=event.deltaY;
  if(Math.abs(wheel)<80)return;
  zoom.value=String(Number(zoom.value)+(wheel<0?2:-2));wheel=0;scale();
},{passive:false});
footer.append(count,zoom,percent);document.body.append(footer);scale();
editor.on('update',()=>{count.textContent=editor.getText().length+' 字符 / characters';});
document.querySelector('header').append(tools);
