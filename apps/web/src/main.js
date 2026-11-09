import { parseInline } from '../latex/inline.mjs';
import { parseTable } from '../latex/tables.mjs';
import { Editor, Node, Extension, Mark } from '@tiptap/core';
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
      if (mark.type === 'underline') value = '\\underline{' + value + '}';
      if (mark.type === 'textStyle') {
        if (/^#[\da-f]{6}$/i.test(mark.attrs.color ?? '')) value='\\textcolor[HTML]{'+mark.attrs.color.slice(1)+'}{'+value+'}';
        const size=Number.parseFloat(mark.attrs.fontSize);
        if(size>=6 && size<=72)value='{\\fontsize{'+size+'}{'+Math.ceil(size*1.2)+'}\\selectfont '+value+'}';
        const family={'Georgia':'\\rmfamily','Arial':'\\sffamily','monospace':'\\ttfamily'}[mark.attrs.fontFamily];
        if(family)value='{'+family+' '+value+'}';
      }
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
        if(event.ctrlKey && ['z','y'].includes(event.key.toLowerCase())) {
          event.preventDefault();event.stopPropagation();
          if(event.key.toLowerCase()==='z')editor.commands.undo();else editor.commands.redo();
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
          {key:'ctrl+6',command:'moveToSuperscript'},
          {key:'ctrl+-',command:'moveToSubscript'},
          {key:'ctrl+0',command:'moveAfterParent'},
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
function inlineContent(text) {
  const parsed=parseInline(text);
  if(!parsed)return null;
  function convert(parts,marks=[]) {
    return parts.flatMap(part=>{
      if(typeof part==='string')return part?[{type:'text',text:part,marks}]:[];
      if(part.math!==undefined)return [{type:'math',attrs:{latex:part.math,display:false}}];
      const type={strong:'bold',em:'italic',u:'underline'}[part.tag];
      if(type)return convert(part.children,[...marks,{type}]);
      const attrs=part.points?{fontSize:part.points+'pt'}:
        part.attribute==='color'?{color:part.value}:
        part.attribute==='face'?{fontFamily:part.value}:null;
      if(!attrs)throw new Error('Unsupported inline formatting');
      return convert(part.children,[...marks,{type:'textStyle',attrs}]);
    });
  }
  try{return convert(parsed);}catch{return null;}
}
function importBlock(block) {
  const text=block.trim();
  if(!text)return null;
  const heading=text.match(/^\\(section|subsection|subsubsection)\{([^{}]*)\}$/);
  if(heading)return {type:'heading',attrs:{level:['section','subsection','subsubsection'].indexOf(heading[1])+1},content:[{type:'text',text:heading[2]}]};
  const math=text.match(/^\\\[([\s\S]*?)\\\]$/) ?? text.match(/^\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}$/);
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
