import { installContextMenu } from './editor/context-menu.js';
import { installFormatControls } from './editor/format-controls.js';
import { decorateToolbar } from './editor/icons.js';
import { PaperBehavior } from './editor/paper-behavior.js';
import { MathNode, MathBlock, configureMathKeys, insertFormula } from './editor/math-node.js';
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
try {
  const configurationUrl=new URL('./config.yaml',import.meta.url);
  configurationUrl.search=new URL(import.meta.url).search;
  const response=await fetch(configurationUrl);
  if(response.ok)configureMathKeys((await response.json()).keybindings?.math);
} catch(error) { console.warn('Configuration / 配置',error); }
let editor;
function insertMath(display = false, latex = '') {
  insertFormula(editor, display, latex);
}
const Shortcuts = Extension.create({
  name:'documentShortcuts',
  addProseMirrorPlugins:()=>[new Plugin({props:{
    handleTextInput(view,from,to,text) {
      if(text==='\\') {showCommands();return true;}
      if(text!=='$')return false;
      const previous=view.state.doc.resolve(from).nodeBefore;
      if(previous?.type.name==='math' && !previous.attrs.latex && !previous.attrs.display) {
        insertFormula(editor, true, '', { from: from - previous.nodeSize, to: from });
        return true;
      }
      insertMath();
      return true;
    },
  }})],
  addKeyboardShortcuts() {
    const enterFormula = forward => {
      const { selection }=this.editor.state;
      if(!selection.empty)return false;
      const node=forward?selection.$from.nodeAfter:selection.$from.nodeBefore;
      if(!['math','mathBlock'].includes(node?.type.name))return false;
      const position=selection.from-(forward?0:node.nodeSize);
      const field=this.editor.view.nodeDOM(position)?.querySelector('math-field');
      if(!field)return false;
      field.focus();
      field.executeCommand(forward?'moveToMathfieldStart':'moveToMathfieldEnd');
      return true;
    };
    return {
      ArrowRight:()=>enterFormula(true),
      ArrowLeft:()=>enterFormula(false),
      Tab:()=>{
        if(this.editor.isActive('table'))return false;
        if(this.editor.isActive('listItem'))return this.editor.commands.sinkListItem('listItem');
        return this.editor.commands.insertContent('    ');
      },
      'Shift-Tab':()=>this.editor.isActive('listItem')?this.editor.commands.liftListItem('listItem'):false,
    };
  },
});
const paper=document.querySelector('#editor');
paper.replaceChildren();
editor=new Editor({
  element:paper,
  extensions:[StarterKit.configure({heading:{levels:[1,2,3]}}),PaperBehavior,TextStyle,Underline,Table.configure({resizable:true}),TableRow,TableCell,TableHeader,Raw,MathNode,MathBlock,Shortcuts],
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
const boldButton=button('B',()=>editor.chain().focus().toggleBold().run());
const italicButton=button('I',()=>editor.chain().focus().toggleItalic().run());
const underlineButton=button('U',()=>editor.chain().focus().toggleMark('underline').run());
editor.on('transaction',()=>{
  for(const [button,mark] of [[boldButton,'bold'],[italicButton,'italic'],[underlineButton,'underline']]) {
    button.setAttribute('aria-pressed',String(editor.isActive(mark)));
  }
});
installFormatControls(editor, tools);
const headingMenu = document.createElement('select');
headingMenu.setAttribute('aria-label', '段落样式 / Paragraph style');
for (const [value, label] of [['0', '正文 / Text'], ['1', 'section'], ['2', 'subsection'], ['3', 'subsubsection']]) {
  headingMenu.append(new Option(label, value));
}
headingMenu.addEventListener('change', () => {
  const level = Number(headingMenu.value);
  if (level) editor.chain().focus().setHeading({ level }).run();
  else editor.chain().focus().setParagraph().run();
});
editor.on('transaction', () => { headingMenu.value = String(editor.getAttributes('heading').level ?? 0); });
tools.append(headingMenu);
button('itemize',()=>editor.chain().focus().toggleBulletList().run());
button('enumerate',()=>editor.chain().focus().toggleOrderedList().run());
button('▦',()=>editor.chain().focus().insertTable({rows:2,cols:2,withHeaderRow:false}).run());
let editingMath = null;
document.addEventListener('focusin', event => {
  const field=event.composedPath().find(element=>element?.tagName==='MATH-FIELD');
  if(field) editingMath=field;
  else if(paper.contains(event.target) || event.target.classList?.contains('source-view')) editingMath=null;
},true);
function activeMath() {
  if(document.activeElement?.tagName==='MATH-FIELD') return document.activeElement;
  return editingMath?.isConnected ? editingMath : null;
}
button('＋ Row',()=>{const field=activeMath(); if(field)field.executeCommand('addRowAfter');else editor.chain().focus().addRowAfter().run();});
button('＋ Column',()=>{const field=activeMath(); if(field)field.executeCommand('addColumnAfter');else editor.chain().focus().addColumnAfter().run();});
button('$',()=>insertMath());
button('$$',()=>insertMath(true));
const sourceView=document.createElement('textarea');
sourceView.className='source-view'; sourceView.hidden=true;
paper.after(sourceView);
let documentParts=parseDocument('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\end{document}\n');
let filename='lineae.tex';
let importedSource=null;
let importedSnapshot=null;
function source() {
  const document=editor.getJSON();
  if(importedSnapshot===JSON.stringify(document))return importedSource;
  return exportDocument(documentParts,serialize(document));
}
function load(text) {
  const parsed=parseDocument(text);
  if(!parsed)throw new Error('无法识别文档 / Invalid document');
  // Preserve imported source exactly. Unsupported blocks remain directly accessible in source mode.
  documentParts=parsed;
  const content=parsed.blocks.map(importBlock).filter(Boolean);
  editor.commands.setContent({type:'doc',content:content.length?content:[{type:'paragraph'}]});
  importedSource=text;importedSnapshot=JSON.stringify(editor.getJSON());
}
button('LaTeX',()=>{
  if(sourceView.hidden) {
    sourceView.value=source(); sourceView.hidden=false; paper.hidden=true;
  } else {
    try {load(sourceView.value);sourceView.hidden=true;paper.hidden=false;editor.commands.focus();}
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
const commands = document.createElement('div');
commands.className = 'command-menu';
commands.hidden = true;
commands.setAttribute('role', 'dialog');
commands.setAttribute('aria-label', 'LaTeX 补全 / LaTeX completion');
const filter = document.createElement('input');
filter.placeholder = 'LaTeX 命令 / command';
filter.setAttribute('aria-label', filter.placeholder);
filter.setAttribute('aria-controls', 'latex-candidates');
filter.setAttribute('aria-autocomplete', 'list');
const candidates = document.createElement('div');
candidates.id = 'latex-candidates';
candidates.className = 'command-candidates';
candidates.setAttribute('role', 'listbox');
commands.append(filter, candidates);
document.body.append(commands);

const formulaCommands = {
  frac: '\\frac{#?}{#?}', sqrt: '\\sqrt{#?}', sum: '\\sum',
  int: '\\int', lim: '\\lim', matrix: '\\begin{pmatrix}#?\\end{pmatrix}',
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta', theta: '\\theta',
  lambda: '\\lambda', mu: '\\mu', pi: '\\pi', sigma: '\\sigma', omega: '\\omega',
  infty: '\\infty', leq: '\\leq', geq: '\\geq', neq: '\\neq', times: '\\times',
  in: '\\in', notin: '\\notin', subset: '\\subset', subseteq: '\\subseteq',
  cup: '\\cup', cap: '\\cap', forall: '\\forall', exists: '\\exists',
  to: '\\to', rightarrow: '\\rightarrow', leftarrow: '\\leftarrow',
  sin: '\\sin', cos: '\\cos', tan: '\\tan', log: '\\log', ln: '\\ln',
  displaystyle: '\\displaystyle', textstyle: '\\textstyle',
};
const structureCommands = {
  section: () => editor.chain().focus().setHeading({ level: 1 }).run(),
  subsection: () => editor.chain().focus().setHeading({ level: 2 }).run(),
  subsubsection: () => editor.chain().focus().setHeading({ level: 3 }).run(),
  itemize: () => editor.chain().focus().toggleBulletList().run(),
  enumerate: () => editor.chain().focus().toggleOrderedList().run(),
  table: () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run(),
  inline: () => insertMath(),
  equation: () => insertMath(true),
};
let completionField = null;
let completionAnchor = null;
let candidateIndex = 0;

function positionCommands() {
  if (!completionAnchor) return;
  const width = Math.min(320, window.innerWidth - 16);
  commands.style.width = width + 'px';
  commands.style.left = Math.max(8, Math.min(completionAnchor.left, window.innerWidth - width - 8)) + 'px';
  const below = completionAnchor.bottom + 6;
  const height = commands.getBoundingClientRect().height;
  commands.style.top = (below + height <= window.innerHeight - 32
    ? below : Math.max(8, completionAnchor.top - height - 6)) + 'px';
}
function closeCommands(restoreFocus = false) {
  commands.hidden = true;
  if (restoreFocus) {
    if (completionField?.isConnected) completionField.focus();
    else editor.view.focus();
  }
}
function showCommands(field = null) {
  completionField = field;
  if (field) {
    const caret = field.shadowRoot?.querySelector('.ML__caret');
    completionAnchor = (caret ?? field).getBoundingClientRect();
  } else completionAnchor = editor.view.coordsAtPos(editor.state.selection.from);
  commands.hidden = false;
  filter.value = '';
  renderCommands();
  positionCommands();
  filter.focus();
}
function insertFormulaCommand(latex) {
  const fragment = latex.replaceAll('#?', '\\placeholder{}');
  if (completionField?.isConnected) {
    completionField.focus();
    completionField.executeCommand(['insert', fragment]);
  } else insertMath(false, fragment);
}
function highlightCandidate(index) {
  const controls = [...candidates.querySelectorAll('button')];
  if (!controls.length) { filter.removeAttribute('aria-activedescendant'); return; }
  candidateIndex = (index + controls.length) % controls.length;
  for (let i = 0; i < controls.length; i++) controls[i].setAttribute('aria-selected', String(i === candidateIndex));
  filter.setAttribute('aria-activedescendant', controls[candidateIndex].id);
  const selected = controls[candidateIndex];
  const top = selected.offsetTop;
  const bottom = top + selected.offsetHeight;
  if (top < candidates.scrollTop) candidates.scrollTop = top;
  else if (bottom > candidates.scrollTop + candidates.clientHeight)
    candidates.scrollTop = bottom - candidates.clientHeight;
}
function renderCommands() {
  candidates.replaceChildren();
  const actions = Object.fromEntries(Object.entries(formulaCommands).map(([name, latex]) =>
    [name, () => insertFormulaCommand(latex)]));
  if (!completionField) Object.assign(actions, structureCommands);
  const query = filter.value.replace(/^\\/, '').toLowerCase();
  for (const [name, action] of Object.entries(actions).filter(([name]) => name.startsWith(query)).sort(([a],[b]) => Number(b===query)-Number(a===query))) {
    const control = document.createElement('button');
    control.type = 'button';
    control.id = 'complete-' + name;
    control.setAttribute('role', 'option');
    control.textContent = '\\' + name;
    control.tabIndex = -1;
    control.addEventListener('mousedown', event => event.preventDefault());
    control.addEventListener('click', () => { closeCommands(); action(); });
    candidates.append(control);
  }
  if (!candidates.children.length) {
    const empty = document.createElement('p');
    empty.textContent = '无匹配命令 / No matching command';
    candidates.append(empty);
  }
  highlightCandidate(0);
}
filter.addEventListener('input', renderCommands);
filter.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeCommands(true); }
  if (['Enter', 'Tab'].includes(event.key)) {
    event.preventDefault();
    candidates.querySelectorAll('button')[candidateIndex]?.click();
  }
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    highlightCandidate(candidateIndex + (event.key === 'ArrowDown' ? 1 : -1));
  }
});
paper.addEventListener('lineae-math-command', event => showCommands(event.detail.field));
document.addEventListener('pointerdown', event => { if (!commands.contains(event.target)) closeCommands(); }, true);
document.addEventListener('scroll', event => {
  if (!commands.hidden && !commands.contains(event.target)) closeCommands();
}, true);
window.addEventListener('resize', () => closeCommands());

const footer=document.createElement('footer');footer.className='document-status';
const count=document.createElement('span');
const zoom=document.createElement('input');zoom.type='range';zoom.min='50';zoom.max='300';zoom.value='100';
const percent=document.createElement('output');
function scale() {
  paper.style.zoom=Number(zoom.value)/100;
  percent.textContent=zoom.value+'%';
  requestAnimationFrame(()=>{
    const brand=document.querySelector('header h1');
    brand.style.opacity=String(Math.max(0,Math.min(1,(paper.getBoundingClientRect().left-brand.getBoundingClientRect().right)/28)));
  });
}
window.addEventListener('resize',scale);
zoom.addEventListener('input',scale);
let wheelZoom = Number(zoom.value);
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || activeMath() || !['+','=','-','0'].includes(event.key)) return;
  event.preventDefault();
  wheelZoom = event.key === '0' ? 100 : Math.max(50, Math.min(300, Number(zoom.value) + (event.key === '-' ? -10 : 10)));
  zoom.value = String(wheelZoom); scale();
}, true);
zoom.addEventListener('input', () => { wheelZoom = Number(zoom.value); });
document.querySelector('main').addEventListener('wheel', event => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  wheelZoom = Math.max(50, Math.min(300, wheelZoom - event.deltaY * units * 0.12));
  zoom.value = String(Math.round(wheelZoom));
  scale();
}, { passive: false });
const environment = document.createElement('span'); environment.className='environment-tag';
function updateEnvironment() {
  const field=activeMath();
  const name=field ? (field.value.includes('matrix}')?'matrix':field.closest('.math-display')?'display math':'inline math') :
    !sourceView.hidden?'LaTeX': ['table','listItem','heading'].find(type=>editor.isActive(type)) ?? 'text';
  const labels={matrix:'矩阵 / Matrix','display math':'行间公式 / Display math','inline math':'行内公式 / Inline math',table:'表格 / Table',listItem:'列表 / List',heading:'标题 / Heading',text:'正文 / Text',LaTeX:'源码 / Source'};
  environment.textContent=labels[name]; environment.dataset.environment=name;
}
footer.append(count,environment,zoom,percent);document.body.append(footer);scale();
editor.on('transaction',updateEnvironment);
document.addEventListener('focusin',updateEnvironment);paper.addEventListener('input',updateEnvironment);
updateEnvironment();
editor.on('update',()=>{count.textContent=editor.getText().length+' 字符 / characters';});
const header=document.querySelector('header');
const ribbon=document.createElement('div');ribbon.className='ribbon';
const tabs=document.createElement('nav');tabs.className='ribbon-tabs';
const home=document.createElement('div');home.className='tools';
const insert=document.createElement('div');insert.className='tools';
const files=header.querySelector('.tools');
for(const control of [...tools.children]) {
  (control.hasAttribute('data-home') || control.tagName==='SELECT' || ['↶','↷','B','I','U','H'].includes(control.textContent)?home:insert).append(control);
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
decorateToolbar(ribbon);
const download=document.querySelector('#download');
language.addEventListener('change',updateLanguage);updateLanguage();selectGroup('home');

installContextMenu(editor, paper, language, message => {
  const status = document.querySelector('#status');
  status.hidden = false;
  status.textContent = message;
});
