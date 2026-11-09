import { MathNode } from './editor/math-node.js';
import { serialize, importBlock } from './editor/latex-codec.js';
import { Editor, Node, Extension, Mark } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Plugin } from '@tiptap/pm/state';
import { parseDocument } from '../latex/document.mjs';
import { exportDocument } from '../latex/packages.mjs';

const TextStyle = Mark.create({
  name:'textStyle',
  addAttributes:()=>({
    color:{default:null},fontFamily:{default:null},fontSize:{default:null},
  }),
  parseHTML:()=>[{tag:'span[data-text-style]'}],
  renderHTML:({HTMLAttributes})=>['span',{
    'data-text-style':'',
    style:Object.entries(HTMLAttributes).filter(([,v])=>v).map(([key,value])=>
      key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+value).join(';'),
  },0],
});
const Underline = Mark.create({
  name:'underline',parseHTML:()=>[{tag:'u'}],renderHTML:()=>['u',0],
});
const Raw = Node.create({
  name:'raw', group:'block', atom:true,
  addAttributes:()=>({source:{default:''}}),
  parseHTML:()=>[{tag:'pre[data-raw]'}],
  renderHTML:({node})=>['pre',{'data-raw':'',contenteditable:'false'},node.attrs.source],
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
      if(text==='\\') {showCommands();return true;}
      if(text!=='$')return false;
      const previous=view.state.doc.resolve(from).nodeBefore;
      if(previous?.type.name==='math' && !previous.attrs.latex && !previous.attrs.display) {
        view.dispatch(view.state.tr.setNodeMarkup(from-previous.nodeSize,undefined,{latex:'',display:true}));
        requestAnimationFrame(()=>view.nodeDOM(from-previous.nodeSize)?.querySelector('math-field')?.focus());
        return true;
      }
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
  extensions:[StarterKit,TextStyle,Underline,Table.configure({resizable:true}),TableRow,TableCell,TableHeader,Raw,MathNode,Shortcuts],
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
  return control;
}
button('↶',()=>editor.chain().focus().undo().run());
button('↷',()=>editor.chain().focus().redo().run());
button('B',()=>editor.chain().focus().toggleBold().run());
button('I',()=>editor.chain().focus().toggleItalic().run());
button('U',()=>editor.chain().focus().toggleMark('underline').run());
for(const [attribute,values] of Object.entries({
  color:['#000000','#595959','#c00000','#ff0000','#ed7d31','#ffc000','#00b050','#008080','#0070c0','#7030a0'],
  fontFamily:['Georgia','Arial','monospace'],
  fontSize:[8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72].map(size=>size+'pt'),
})) {
  const menu=document.createElement('select');
  menu.setAttribute('aria-label',attribute);
  menu.append(new Option({color:'颜色 / Color',fontFamily:'字体 / Font',fontSize:'字号 / Size'}[attribute],''));
  values.forEach(value=>menu.append(new Option(value,value)));
  menu.addEventListener('change',()=>{if(menu.value)editor.chain().focus().setMark('textStyle',{[attribute]:menu.value}).run();menu.value='';});
  tools.append(menu);
}
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
const commands=document.createElement('div');
commands.className='command-menu';commands.hidden=true;
const filter=document.createElement('input');
filter.placeholder='LaTeX 命令 / command';
const candidates=document.createElement('div');
commands.append(filter,candidates);document.body.append(commands);
const commandActions={
  frac:()=>insertFormulaCommand('\\frac{#?}{#?}'),
  sqrt:()=>insertFormulaCommand('\\sqrt{#?}'),
  sum:()=>insertFormulaCommand('\\sum_{#?}^{#?}'),
  int:()=>insertFormulaCommand('\\int_{#?}^{#?}'),
  section:()=>editor.chain().focus().setHeading({level:1}).run(),
  subsection:()=>editor.chain().focus().setHeading({level:2}).run(),
  itemize:()=>editor.chain().focus().toggleBulletList().run(),
  enumerate:()=>editor.chain().focus().toggleOrderedList().run(),
  table:()=>editor.chain().focus().insertTable({rows:2,cols:2,withHeaderRow:false}).run(),
  inline:()=>insertMath(),
  equation:()=>insertMath(true),
};
function insertFormulaCommand(latex) {
  insertMath();
  requestAnimationFrame(()=>{
    const field=document.activeElement;
    if(field?.tagName==='MATH-FIELD')field.executeCommand(['insert',latex]);
  });
}
function showCommands() {
  commands.hidden=false;filter.value='';renderCommands();filter.focus();
}
function renderCommands() {
  candidates.replaceChildren();
  for(const [name,action] of Object.entries(commandActions).filter(([name])=>name.startsWith(filter.value))) {
    const control=document.createElement('button');control.textContent='\\'+name;
    control.addEventListener('click',()=>{commands.hidden=true;action();});
    candidates.append(control);
  }
}
filter.addEventListener('input',renderCommands);
filter.addEventListener('keydown',event=>{
  if(event.key==='Escape'){commands.hidden=true;editor.commands.focus();}
  if(event.key==='Enter'){event.preventDefault();candidates.firstElementChild?.click();}
  if(event.key==='ArrowDown'){event.preventDefault();candidates.firstElementChild?.focus();}
});
commands.addEventListener('keydown',event=>{
  if(event.key==='Escape'){commands.hidden=true;editor.commands.focus();}
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
const header=document.querySelector('header');
const ribbon=document.createElement('div');ribbon.className='ribbon';
const tabs=document.createElement('nav');tabs.className='ribbon-tabs';
const home=document.createElement('div');home.className='tools';
const insert=document.createElement('div');insert.className='tools';
const files=header.querySelector('.tools');
for(const control of [...tools.children]) {
  (control.tagName==='SELECT' || ['↶','↷','B','I','U','H'].includes(control.textContent)?home:insert).append(control);
}
const groups={files,home,insert};
const captions={files:['文件','File'],home:['主页','Home'],insert:['插入','Insert']};
const language=document.querySelector('#language');
function updateLanguage() {
  const chinese=language.value==='zh-CN';
  document.documentElement.lang=language.value;
  for(const tab of tabs.children)tab.textContent=captions[tab.dataset.group][chinese?0:1];
  download.textContent=chinese?'下载 .tex':'Download .tex';
  header.querySelector('.open span').textContent=chinese?'打开 .tex':'Open .tex';
}
function selectGroup(name) {
  for(const [key,panel] of Object.entries(groups)) panel.hidden=key!==name;
  for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.group===name));
}
for(const name of Object.keys(groups)) {
  const tab=document.createElement('button');tab.type='button';tab.dataset.group=name;
  tab.addEventListener('mousedown',event=>event.preventDefault());
  tab.addEventListener('click',()=>selectGroup(name));tabs.append(tab);
}
ribbon.append(tabs,files,home,insert);header.append(ribbon);tools.remove();
const download=document.querySelector('#download');
language.addEventListener('change',updateLanguage);updateLanguage();selectGroup('home');
