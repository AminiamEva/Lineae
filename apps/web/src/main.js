import { installContextMenu } from './editor/context-menu.js';
import { textCommands } from '../latex/inline.mjs';
import { closeHistory } from '@tiptap/pm/history';
import { exitCode } from '@tiptap/pm/commands';
import { mathFontStyles, applyMathFont } from './editor/math-formatting.js';
import { installFormatControls } from './editor/format-controls.js';
import { decorateToolbar, applyToolbarDescriptions, icon } from './editor/icons.js';
import { PaperBehavior } from './editor/paper-behavior.js';
import { MathNode, MathBlock, configureMathKeys, insertFormula, toggleDisplayStyle } from './editor/math-node.js';
import { Ref, Label, Cite, Footnote, TableOfContents, refreshReferences, collectReferenceLabels } from './editor/references.js';
import { insertCitationDialog } from './editor/citation-dialog.js';
import { chooseReference } from './editor/reference-index.js';
import { installTableHoverAddRow } from './editor/table-hover.js';
import { parseYaml, toYaml, mergeConfig } from './editor/config.mjs';
import { askText } from './editor/dialog.js';
import { installDocumentFind } from './editor/find.js';
import { DocumentImage, insertLocalImage, installImageDrop } from './editor/image-node.js';
import { projectAssets, rememberAsset } from './editor/project-assets.js';
import { buildProjectZip, safeProjectPath, projectDependencies } from './editor/project-zip.mjs';
import { theoremNames } from '../latex/theorem.mjs';
import { MultiSelection } from './editor/multi-selection.js';
import { installSpaceOverlay } from './editor/space-overlay.js';
import { wrapMathWithDelimiters } from '../latex/delimiters.mjs';
import { readDelimiterPair } from './editor/delimiter-input.js';
import { serialize, importBlocks } from './editor/latex-codec.js';
import { Editor, Node, Extension, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Plugin, Selection, NodeSelection } from '@tiptap/pm/state';
import { parseDocument } from '../latex/document.mjs';
import { exportDocument } from '../latex/packages.mjs';
import { MARGIN_PRESETS, readPageSetup, writePageSetup, pageMetrics } from '../latex/geometry.mjs';
import { mathSymbols } from '../latex/math-symbols.mjs';
import { createThemeController } from './ui/theme.mjs';
import { installTooltips } from './ui/tooltips.mjs';
import { installRovingFocus } from './ui/keyboard-nav.mjs';
import { fadeIn } from './ui/motion.mjs';
import { getLanguage, localize, setLanguage, t } from './ui/i18n.mjs';

const cssColor = value => {
  const rgb=/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value??'');
  if(rgb)return '#'+[1,2,3].map(index=>Number(rgb[index]).toString(16).padStart(2,'0')).join('');
  return /^#[\da-f]{6}$/i.test(value??'')?value:null;
};
const cssSize = value => {
  const px=/^([\d.]+)px$/i.exec(value??'');
  return px?Math.round(Number(px[1])*.75)+'pt':(value||null);
};
const TextStyle = Mark.create({
  name:'textStyle',
  addAttributes:()=>({
    color:{default:null,parseHTML:element=>cssColor(element.style.color)},
    fontFamily:{default:null,parseHTML:element=>element.style.fontFamily?.replace(/["']/g,'')||null},
    fontSize:{default:null,parseHTML:element=>cssSize(element.style.fontSize)},
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
const Superscript = Mark.create({
  name:'superscript',parseHTML:()=>[{tag:'sup'}],renderHTML:()=>['sup',0],
});
const Subscript = Mark.create({
  name:'subscript',parseHTML:()=>[{tag:'sub'}],renderHTML:()=>['sub',0],
});
const SmallCaps = Mark.create({
  name:'smallcaps',parseHTML:()=>[{tag:'span[data-smallcaps]'}],
  renderHTML:()=>['span',{'data-smallcaps':'',style:'font-variant:small-caps'},0],
});
const Boxed = Mark.create({
  name:'boxed',parseHTML:()=>[{tag:'span[data-boxed]'}],
  addAttributes:()=>({boxId:{default:null,parseHTML:element=>element.dataset.boxId??null}}),
  renderHTML:({mark})=>['span',{'data-boxed':'','data-box-id':mark.attrs.boxId,style:'border:1px solid currentColor;padding:0 .2em'},0],
});
const LanguageCodeBlock = CodeBlock.extend({
  renderHTML({ node, HTMLAttributes }) {
    const language = node.attrs.language;
    const attributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    if (language) attributes['data-language'] = language;
    return ['pre', attributes,
      ['code', { class: language ? this.options.languageClassPrefix + language : null }, 0]];
  },
});
const TextCommand = Mark.create({
  name: 'textCommand',
  inclusive: false,
  addAttributes: () => ({ name: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-text-command]', contentElement: element => element.querySelector('.tex-logo-source') ?? element, getAttrs: element => {
    const name = element.dataset.textCommand;
    return Object.hasOwn(textCommands, name) ? { name } : false;
  } }],
  renderHTML: ({ mark }) => ['span', { 'data-text-command': mark.attrs.name }, 0],
});
function insertTextCommand(name) {
  editor.chain().focus().insertContent({ type: 'text', text: textCommands[name], marks: [{ type: 'textCommand', attrs: { name } }] }).run();
}
const TheoremBlock = Node.create({
  name:'theoremBlock',group:'block',content:'block+',defining:true,
  addAttributes:()=>({kind:{default:'theorem'},title:{default:null}}),
  parseHTML:()=>[{tag:'section[data-theorem]',getAttrs:element=>Object.hasOwn(theoremNames,element.dataset.theorem)?{kind:element.dataset.theorem,title:element.dataset.theoremTitle||null}:false}],
  renderHTML:({node})=>['section',{'data-theorem':node.attrs.kind,'data-theorem-title':node.attrs.title??'',
    'data-theorem-heading':theoremNames[node.attrs.kind]+(node.attrs.title?' ('+node.attrs.title+')':'')+'.'},0],
});
const Raw = Node.create({
  name:'raw', group:'block', atom:true,
  addAttributes:()=>({source:{default:''}}),
  parseHTML:()=>[{tag:'pre[data-raw]'}],
  renderHTML:({node})=>['pre',{'data-raw':'',contenteditable:'false'},node.attrs.source],
});
const DescriptionList = Node.create({
  name:'descriptionList', group:'block', content:'descriptionItem+',
  parseHTML:()=>[{tag:'dl'}],
  renderHTML:()=>['dl',0],
});
const DescriptionItem = Node.create({
  name:'descriptionItem', content:'paragraph+', defining:true,
  addAttributes:()=>({term:{default:''}}),
  parseHTML:()=>[{tag:'dd',getAttrs:dom=>({term:dom.dataset.term??''})}],
  renderHTML:({node})=>['dd',{'data-term':node.attrs.term},0],
});
let appConfig={};
try {
  const configurationUrl=new URL('./config.yaml',import.meta.url);
  configurationUrl.search=new URL(import.meta.url).search;
  const response=await fetch(configurationUrl);
  if(response.ok)appConfig=parseYaml(await response.text());
  const saved=localStorage.getItem('lineae.config');
  if(saved)appConfig=mergeConfig(appConfig,parseYaml(saved));
  configureMathKeys(appConfig.keybindings?.math);
} catch(error) { console.warn(t('配置','Configuration'),error); }
const configuredLanguage=appConfig.interface?.language;
const initialLanguage=['zh-CN','en'].includes(configuredLanguage)
  ? configuredLanguage
  : ((navigator.language??'').toLowerCase().startsWith('zh')?'zh-CN':'en');
setLanguage(initialLanguage);
function saveConfig(patch) {
  appConfig={...appConfig,interface:{...appConfig.interface,...patch}};
  try { localStorage.setItem('lineae.config',toYaml(appConfig)); } catch {}
}
const theme=createThemeController({root:document.documentElement,storage:localStorage});
const prefersReducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
let editor;
// Insert into the live field so MathLive selects the first placeholder.
// Creating the node with the source already set leaves the caret at offset 0.
function insertLiveMath(field, latex, notify = true) {
  const apply = () => {
    if (!field.isConnected) return;
    field.executeCommand(['insert', latex]);
    if (latex === '\\text{x}') {
      const end = field.selection?.ranges?.[0]?.[1];
      if (end > 0) field.selection = { ranges: [[end - 1, end]], direction: 'none' };
    }
    if (notify) field.dispatchEvent(new Event('input', { bubbles: true }));
  };
  if (field.hasFocus()) apply();
  else {
    field.focus();
    requestAnimationFrame(apply);
  }
}
function insertMath(display = false, latex = '') {
  if (!latex) return insertFormula(editor, display, '');
  insertFormula(editor, display, '', undefined, field => insertLiveMath(field, latex));
}
function insertEquation() {
  insertFormula(editor, true, '', undefined, field => insertLiveMath(field, '\\placeholder{}'), { delimiter:'equation' });
}
const matrixEnvironments = new Set(['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix']);
function matrixSource(name, content = '\\placeholder{}') {
  const environment = matrixEnvironments.has(name) ? name : 'matrix';
  return `\\begin{${environment}}${content}\\end{${environment}}`;
}
function matrixShortcut(modifiers) {
  return { c:'matrix', cs:'pmatrix', ca:'bmatrix', csa:'Bmatrix' }[modifiers] ?? null;
}
function codeBlockAt($from) {
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'codeBlock') return node;
  }
  return null;
}
function looksLikeYaml(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines.length < 2) return false;
  const mappings = lines.filter(line => /^[\w."'/-]+\s*:(\s|$)/.test(line) || /^-\s+\S/.test(line));
  return mappings.length >= Math.ceil(lines.length * 0.6);
}
function indentWidthAt($from) {
  const block = codeBlockAt($from);
  if (!block) return 4;
  const language = (block.attrs.language ?? '').toLowerCase();
  if (language === 'yaml' || language === 'yml') return 2;
  if (!language && looksLikeYaml(block.textContent)) return 2;
  return 4;
}
function outdentCurrentLine(editor) {
  const { selection } = editor.state;
  const { $from } = selection;
  if (!$from.parent.isTextblock) return false;
  const width = indentWidthAt($from);
  const text = $from.parent.textContent.slice(0, $from.parentOffset);
  const lineStart = text.lastIndexOf('\n') + 1;
  const line = text.slice(lineStart);
  let remove = 0;
  while (remove < width && line[remove] === ' ') remove++;
  if (!remove && line[0] === '\t') remove = 1;
  if (remove) {
    const from = $from.pos - line.length;
    editor.view.dispatch(editor.state.tr.delete(from, from + remove));
    return true;
  }
  if ($from.parent.type.name === 'paragraph' && (($from.parent.attrs.indentLevel ?? 0) > 0)) {
    editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(), undefined, { ...$from.parent.attrs, indentLevel:0 }));
  }
  return true;
}
let backticks = null;
const Shortcuts = Extension.create({
  name:'documentShortcuts',
  addProseMirrorPlugins:()=>[new Plugin({props:{
    handleTextInput(view,from,to,text) {
      const parent = view.state.doc.resolve(from).parent;
      if (text === '`' && parent.type.name !== 'codeBlock') {
        const now=performance.now();
        const continued=backticks && now-backticks.time<650 && backticks.doc===view.state.doc && backticks.pos===from;
        if (continued && backticks.count===2 && parent.textContent==='`') {
          editor.chain().deleteRange({from:from-1,to:from}).setCodeBlock().run();
          backticks=null;
        } else if (continued && backticks.count===1) {
          view.dispatch(view.state.tr.insertText('`',from,to));
          backticks={time:now,count:2,doc:view.state.doc,pos:view.state.selection.from};
        } else {
          editor.commands.toggleCode();
          backticks={time:now,count:1,doc:view.state.doc,pos:view.state.selection.from};
        }
        return true;
      }
      backticks=null;
      if (parent.type.name === 'codeBlock') return false;
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
      const { selection, doc }=this.editor.state;
      if(!selection.empty)return false;
      const $from=selection.$from;
      const isMath=node=>['math','mathBlock'].includes(node?.type.name);
      let position=-1;
      if(isMath(forward?$from.nodeAfter:$from.nodeBefore)) {
        const node=forward?$from.nodeAfter:$from.nodeBefore;
        position=selection.from-(forward?0:node.nodeSize);
      } else if($from.parent.inlineContent) {
        // A click just past a formula can land after its trailing space.
        // Cross that whitespace in the same keypress so entering needs one arrow.
        const textOffset=$from.textOffset;
        const textNode=$from.parent.maybeChild($from.index());
        if(!textNode?.isText)return false;
        if(forward) {
          const rest=$from.parent.textBetween($from.parentOffset,$from.parentOffset+textNode.nodeSize-textOffset,'\0','\0');
          if(!/^\s*$/.test(rest))return false;
          const boundary=$from.pos+textNode.nodeSize-textOffset;
          if(isMath(doc.resolve(boundary).nodeAfter))position=boundary;
        } else if(textOffset>0) {
          const prefix=$from.parent.textBetween($from.parentOffset-textOffset,$from.parentOffset,'\0','\0');
          if(!/^\s*$/.test(prefix))return false;
          const boundary=$from.pos-textOffset;
          const node=doc.resolve(boundary).nodeBefore;
          if(isMath(node))position=boundary-node.nodeSize;
        }
      }
      if(position<0)return false;
      const field=this.editor.view.nodeDOM(position)?.querySelector('math-field');
      if(!field)return false;
      field.focus();
      field.executeCommand(forward?'moveToMathfieldStart':'moveToMathfieldEnd');
      return true;
    };
    return {
      'Alt-`':()=>this.editor.commands.insertContent('`'),
      ArrowRight:()=>enterFormula(true),
      ArrowLeft:()=>enterFormula(false),
      Backspace:()=>{
        const { selection, doc }=this.editor.state;
        if(!selection.empty)return false;
        const $from=selection.$from;
        const node=$from.nodeBefore;
        if(['math','mathBlock'].includes(node?.type.name)) {
          // Treat a formula as one object: the first press selects it whole,
          // the next press lets ProseMirror delete the selection.
          const position=selection.from-node.nodeSize;
          this.editor.view.focus();
          this.editor.view.dispatch(this.editor.state.tr.setSelection(NodeSelection.create(doc,position)));
          return true;
        }
        const paragraph=$from.parent;
        if(paragraph.type.name==='paragraph'&&$from.parentOffset===0&&paragraph.content.size===0) {
          const indentLevel=paragraph.attrs.indentLevel??0;
          if(indentLevel>0) {
            const position=$from.before();
            this.editor.view.dispatch(this.editor.state.tr.setNodeMarkup(position,undefined,{...paragraph.attrs,indentLevel:0}));
            this.editor.view.focus();
            return true;
          }
          let listItemDepth=0;
          const listDepths=[];
          for(let depth=1;depth<=$from.depth;depth++) {
            const type=$from.node(depth).type.name;
            if(type==='listItem')listItemDepth=depth;
            if(type==='bulletList'||type==='orderedList')listDepths.push(depth);
          }
          if(listItemDepth&&listDepths.length) {
            const item=$from.node(listItemDepth);
            const hasNestedList=item.content.content.some(child=>['bulletList','orderedList'].includes(child.type.name));
            if(!item.textContent.trim()&&!hasNestedList) {
              const level=listDepths.length;
              this.editor.view.focus();
              let lifted=false;
              // Lift the empty block out of one list level at a time. This
              // keeps the paragraph at the caret position instead of moving
              // it to the end of the outermost list.
              while(this.editor.commands.liftEmptyBlock()) lifted=true;
              if(lifted) {
                const position=this.editor.state.selection.$from.before();
                const paragraph=this.editor.state.doc.nodeAt(position);
                if(paragraph?.type.name==='paragraph') {
                  this.editor.view.dispatch(this.editor.state.tr.setNodeMarkup(position,undefined,{...paragraph.attrs,indent:false,indentLevel:level}));
                }
              }
              return lifted;
            }
          }
        }
        return false;
      },
      Tab:()=>{
        if(this.editor.isActive('table'))return false;
        if (this.editor.isActive('listItem')) {
          const { $from }=this.editor.state.selection;
          let depth=0;
          for (let level=1; level<=$from.depth; level++) {
            if ($from.node(level).type.name==='listItem') depth++;
          }
          return depth>=10 || this.editor.commands.sinkListItem('listItem');
        }
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.insertContent(' '.repeat(indentWidthAt(this.editor.state.selection.$from)));
        }
        return this.editor.commands.insertContent('    ');
      },
      'Shift-Tab':()=>{
        if (this.editor.isActive('listItem')) {
          this.editor.commands.liftListItem('listItem');
          return true;
        }
        outdentCurrentLine(this.editor);
        return true;
      },
    };
  },
});
const paper=document.querySelector('#editor');
const documentPage=document.createElement('div');documentPage.className='document-page';
paper.before(documentPage);documentPage.append(paper);
paper.replaceChildren();
editor=new Editor({
  element:paper,
  extensions:[StarterKit.configure({heading:{levels:[1,2,3]},codeBlock:false}),LanguageCodeBlock,MultiSelection,PaperBehavior,TextStyle,TextCommand,Underline,Superscript,Subscript,SmallCaps,Boxed,Table.configure({resizable:true}),TableRow,TableCell,TableHeader,Raw,DocumentImage,TheoremBlock,DescriptionList,DescriptionItem,MathNode,MathBlock,Ref,Cite,Footnote,Label,TableOfContents,Shortcuts],
  content:'<p></p>',
});
function syncTableAttributes() {
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== 'table') return;
    const dom = editor.view.nodeDOM(position);
    const table = dom?.tagName === 'TABLE' ? dom : dom?.querySelector?.('table');
    if (!table) return;
    if (node.attrs.columns) table.dataset.columns = node.attrs.columns;
    else delete table.dataset.columns;
    if (node.attrs.booktabs) table.dataset.booktabs = 'true';
    else delete table.dataset.booktabs;
    table.dataset.borderMode=node.attrs.borderMode??'';
    table.style.setProperty('--table-rule-width',node.attrs.borderWidth??'1px');
  });
}
editor.on('update',()=>{refreshReferences(paper);syncTableAttributes();});
syncTableAttributes();
installTableHoverAddRow(editor, paper);
installImageDrop(editor,paper);
installDocumentFind(editor);
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
headingMenu.setAttribute('aria-label', t('段落样式','Paragraph style'));
const textStyleOption = new Option(t('正文','Text'), '0');
textStyleOption.dataset.zh='正文';textStyleOption.dataset.en='Text';
headingMenu.append(textStyleOption);
for (const [value, label] of [['1','section'],['2','subsection'],['3','subsubsection']]) headingMenu.append(new Option(label, value));
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
  if (event.target.closest?.('.delimiter-input-embedded')) return;
  const field=event.composedPath().find(element=>element?.tagName==='MATH-FIELD');
  if(field || paper.contains(event.target) || event.target.classList?.contains('source-view')) {
    if(editingMath && editingMath!==field) editingMath.dispatchEvent(new Event('lineae-commit-fences'));
    editingMath=field ?? null;
  }
},true);
function activeMath() {
  if(document.activeElement?.tagName==='MATH-FIELD') return document.activeElement;
  return editingMath?.isConnected ? editingMath : null;
}
function matrixCells(value) {
  const match=value.match(/\\begin\{(pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|matrix|array)\}/);
  if(!match)return null;
  const name=match[1], open=match[0], close='\\end{'+name+'}';
  const start=match.index+open.length, end=value.lastIndexOf(close);
  if(end<start)return null;
  let body=value.slice(start,end);
  if(/\\(?:begin|end)\{/.test(body))return null;
  const spec=name==='array'?(body.match(/^\s*\{[^{}]*\}/)?.[0]??''):'';
  body=body.slice(spec.length);
  return {
    prefix:value.slice(0,match.index), open, spec, close, suffix:value.slice(end+close.length),
    rows:body.split(/\\\\/).map(row=>row.split(/(?<!\\)&/)),
  };
}
function joinMatrix(info) {
  return info.prefix+info.open+info.spec+info.rows.map(row=>row.join(' & ')).join('\\\\')+info.close+info.suffix;
}
function fillMatrixAxis(field, axis) {
  const before=matrixCells(field.value);
  field.executeCommand(axis==='row'?'addRowAfter':'addColumnAfter');
  if(!before)return;
  const after=matrixCells(field.value);
  if(!after)return;
  let changed=false;
  if(axis==='column') {
    const oldRow=before.rows[0], newRow=after.rows[0];
    let index=-1;
    for(let i=0;i<newRow.length;i++) {
      const trial=newRow.filter((_,j)=>j!==i);
      if(trial.length===oldRow.length&&trial.every((cell,j)=>cell===oldRow[j])) { index=i; break; }
    }
    if(index<0)index=newRow.findIndex(cell=>!cell.trim());
    if(index<0)return;
    for(const row of after.rows) {
      if(!row[index]?.trim()) { row[index]=' \\placeholder{} '; changed=true; }
    }
  } else {
    let index=-1;
    for(let i=0;i<after.rows.length;i++) {
      const trial=after.rows.filter((_,j)=>j!==i);
      if(trial.length===before.rows.length&&trial.every((row,j)=>
        row.length===before.rows[j].length&&row.every((cell,k)=>cell===before.rows[j][k]))) { index=i; break; }
    }
    if(index<0)index=after.rows.length-1;
    for(let i=0;i<after.rows[index].length;i++) {
      if(!after.rows[index][i].trim()) { after.rows[index][i]=' \\placeholder{} '; changed=true; }
    }
  }
  if(!changed)return;
  field.value=joinMatrix(after);
  field.dispatchEvent(new Event('input',{bubbles:true}));
}
function addMatrixRow() {
  const field=activeMath();
  if(field)fillMatrixAxis(field,'row');
  else editor.chain().focus().addRowAfter().run();
}
function addMatrixColumn() {
  const field=activeMath();
  if(field)fillMatrixAxis(field,'column');
  else editor.chain().focus().addColumnAfter().run();
}
button('＋ Row',addMatrixRow);
button('＋ Column',addMatrixColumn);
button('$',()=>insertMath());
button('$$',()=>insertMath(true));
const sourceView=document.createElement('textarea');
sourceView.className='source-view'; sourceView.hidden=true;
documentPage.after(sourceView);
let documentParts=parseDocument('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\end{document}\n');
let pageSetup=readPageSetup(documentParts.start);
let pagePaper,pageOrientation,pageMarginPreset,pageMarginTop,pageMarginRight,pageMarginBottom,pageMarginLeft;
function applyPageSetup(){
  const metrics=pageMetrics(pageSetup);
  documentPage.style.setProperty('--page-width',metrics.width);
  documentPage.style.setProperty('--page-height',metrics.height);
  documentPage.style.setProperty('--page-margin-top',metrics.margins.top);
  documentPage.style.setProperty('--page-margin-right',metrics.margins.right);
  documentPage.style.setProperty('--page-margin-bottom',metrics.margins.bottom);
  documentPage.style.setProperty('--page-margin-left',metrics.margins.left);
  if(pagePaper){
    pagePaper.value=pageSetup.paper;
    pageOrientation.value=pageSetup.orientation;
    pageMarginTop.value=pageSetup.margins.top;
    pageMarginRight.value=pageSetup.margins.right;
    pageMarginBottom.value=pageSetup.margins.bottom;
    pageMarginLeft.value=pageSetup.margins.left;
    pageMarginPreset.value=Object.keys(MARGIN_PRESETS).find(key=>MARGIN_PRESETS[key]===pageSetup.margin)??'custom';
  }
}
function updatePageSetup(patch){
  if(patch.margins)pageSetup={...pageSetup,...patch,margins:{...pageSetup.margins,...patch.margins}};
  else if(patch.margin)pageSetup={...pageSetup,...patch,margins:{top:patch.margin,right:patch.margin,bottom:patch.margin,left:patch.margin}};
  else pageSetup={...pageSetup,...patch};
  const sides=Object.values(pageSetup.margins);
  pageSetup.margin=sides.every(value=>value===sides[0])?sides[0]:'custom';
  documentParts.start=writePageSetup(documentParts.start,pageSetup);
  if(importedSource)importedSource=writePageSetup(importedSource,pageSetup);
  applyPageSetup();
}
let filename='lineae.tex';
let fileHandle=null;
let savedSource='';
let importedSource=null;
let importedSnapshot=null;
function readMeta(key) {
  const match=documentParts.start.match(new RegExp('\\\\'+key+'\\{([^{}]*)\\}'));
  return match?match[1]:'';
}
function writeMeta(key,value) {
  const line='\\'+key+'{'+value+'}';
  const pattern=new RegExp('\\\\'+key+'\\{([^{}]*)\\}');
  const apply=text=>pattern.test(text)
    ? text.replace(pattern,line)
    : text.replace(/\\begin\{document\}/,line+'\n\\begin{document}');
  documentParts.start=apply(documentParts.start);
  if(importedSource)importedSource=apply(importedSource);
  renderMeta();
}
const metaBar=document.createElement('section');metaBar.id='document-meta';
const metaTitle=document.createElement('div');metaTitle.className='doc-title';
const metaAuthor=document.createElement('div');metaAuthor.className='doc-author';
metaBar.append(metaTitle,metaAuthor);documentPage.prepend(metaBar);
function editMeta(element,key){
  element.contentEditable='true';element.spellcheck=false;
  element.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();element.blur();}});
  element.addEventListener('blur',()=>{
    const value=element.textContent.trim();
    if(value!==readMeta(key))writeMeta(key,value);
    else renderMeta();
  });
}
editMeta(metaTitle,'title');editMeta(metaAuthor,'author');
function renderMeta() {
  metaTitle.textContent=readMeta('title');
  metaAuthor.textContent=readMeta('author');
  metaTitle.dataset.placeholder=t('标题','Title');
  metaAuthor.dataset.placeholder=t('作者','Author');
}
renderMeta();
function recordFormulaLineBreaks(document) {
  if (documentPage.hidden) return false;
  let changed=false;
  editor.state.doc.forEach((paragraph,position,index)=>{
    if (paragraph.type.name!=='paragraph') return;
    paragraph.forEach((node,offset,childIndex)=>{
      if (node.type.name!=='math') return;
      const start=position+1+offset;
      const startsLine=childIndex===0||paragraph.child(childIndex-1).type.name==='hardBreak';
      let breakBefore=false;
      if (!startsLine) {
        const formula=editor.view.nodeDOM(start)?.getBoundingClientRect();
        if (formula?.width) {
          const preceding=editor.view.coordsAtPos(start-1,1);
          // The browser wraps an inline-block that does not fit the remaining
          // space. TeX does not, so record the same break as \newline.
          breakBefore=formula.left<=preceding.left+.5;
        }
      }
      if (Boolean(node.attrs.breakBefore)!==breakBefore) {
        const target=document.content[index].content[childIndex];
        target.attrs={...target.attrs,breakBefore:breakBefore||null};
        changed=true;
      }
    });
  });
  return changed;
}
function source() {
  const document=editor.getJSON();
  const untouched=importedSnapshot===JSON.stringify(document);
  if (!recordFormulaLineBreaks(document) && untouched) return importedSource;
  return exportDocument(documentParts,serialize(document),{chineseTypesetting:true});
}
savedSource=source();
function identifyImportedBoxes(node) {
  for (const child of node.content ?? []) {
    const mark=child.marks?.find(mark=>mark.type==='boxed');
    // The importer shares this mark object across the text in one source group.
    if (mark && !mark.attrs?.boxId) mark.attrs={...mark.attrs,boxId:crypto.randomUUID()};
    identifyImportedBoxes(child);
  }
}
function load(text, markSaved = true) {
  const parsed=parseDocument(text);
  if(!parsed)throw new Error(t('无法识别文档','Invalid document'));
  // Preserve imported source exactly. Unsupported blocks remain directly accessible in source mode.
  documentParts=parsed;
  const content=parsed.blocks.flatMap(importBlocks);
  for (const block of content) identifyImportedBoxes(block);
  editor.commands.setContent({type:'doc',content:content.length?content:[{type:'paragraph'}]});
  refreshReferences(paper);syncTableAttributes();
  importedSource=text;importedSnapshot=JSON.stringify(editor.getJSON());
  if(markSaved) savedSource=text;
  if(!sourceView.hidden) sourceView.value=text;
  renderMeta();
  pageSetup=readPageSetup(documentParts.start);
  applyPageSetup();
}
function toggleSourceView(){
  if(sourceView.hidden) {
    sourceView.value=source(); sourceView.hidden=false; documentPage.hidden=true;
  } else {
    try {load(sourceView.value,false);sourceView.hidden=true;documentPage.hidden=false;editor.commands.focus();}
    catch(error){document.querySelector('#status').hidden=false;document.querySelector('#status').textContent=error.message;}
  }
  updateSourceButton();
}
document.querySelector('#download').disabled=false;
async function downloadProject() {
  const text=sourceView.hidden?source():sourceView.value;
  const status=document.querySelector('#status');
  try {
    const assets=new Map(projectAssets().filter(([path])=>safeProjectPath(path)));
    const dependencies=new Set(projectDependencies(text));
    const required=new Map();
    const missing=[];
    for(const path of dependencies) {
      const actual=assets.has(path)?path:[...assets.keys()].find(key=>key.replace(/\.[^.\/]+$/,'')===path);
      if(!actual) {missing.push(path);continue;}
      if(required.has(actual) || actual===filename)continue;
      const file=assets.get(actual);
      required.set(actual,file);
      if(actual.endsWith('.tex'))for(const dependency of projectDependencies(await file.text()))dependencies.add(dependency);
    }
    if(missing.length) {
      status.hidden=false;status.textContent=t('缺少项目资源','Missing project assets')+': '+missing.join(', ');
      return;
    }
    const name=safeProjectPath(filename)?filename:'lineae.tex';
    const zip=await buildProjectZip([[name,text],...[...required].filter(([path])=>path!==name)]);
    const url=URL.createObjectURL(zip);
    const a=document.createElement('a');a.href=url;a.download=name.replace(/\.tex$/i,'')+'.zip';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch(error) {
    status.hidden=false;status.textContent=error.message;
  }
}
async function saveDocument() {
  const text=sourceView.hidden?source():sourceView.value;
  if(window.showSaveFilePicker) {
    try {
      if(!fileHandle)fileHandle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'LaTeX',accept:{'text/plain':['.tex']}}]});
      let writable;
      try { writable=await fileHandle.createWritable(); }
      catch { await fileHandle.requestPermission?.({mode:'readwrite'}); writable=await fileHandle.createWritable(); }
      await writable.write(text);await writable.close();
      if(fileHandle.name)filename=fileHandle.name;
      savedSource=text;
      const status=document.querySelector('#status');
      status.hidden=false;status.textContent=t('已保存','Saved');
      return;
    } catch(error) {
      if(error?.name==='AbortError')return;
      console.warn(t('保存','Save'),error);
    }
  }
  await downloadProject();
}
async function openDocument() {
  try {
    const [handle]=await window.showOpenFilePicker({types:[{description:'LaTeX',accept:{'text/plain':['.tex']}}],multiple:false});
    const file=await handle.getFile();
    fileHandle=handle;filename=file.name;
    load(await file.text());
    return true;
  } catch(error) {
    if(error?.name==='AbortError')return true;
    console.warn(t('打开','Open'),error);
    return false;
  }
}
document.querySelector('#download').addEventListener('click',downloadProject);
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='s') {
    event.preventDefault(); event.stopPropagation(); saveDocument();
  }
},true);
document.querySelector('.open').addEventListener('click',event=>{
  if(!window.showOpenFilePicker)return;
  event.preventDefault();
  openDocument().then(opened=>{if(!opened)document.querySelector('#file').click();});
});
window.addEventListener('beforeunload',event=>{
  try { if((sourceView.hidden?source():sourceView.value)===savedSource)return; } catch {}
  event.preventDefault();
  event.returnValue='';
});
document.querySelector('#file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {fileHandle=null;load(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer()));filename=file.name;}
  catch(error){const status=document.querySelector('#status');status.hidden=false;status.textContent=error.message;}
});
const commands = document.createElement('div');
commands.className = 'command-menu';
commands.hidden = true;
commands.setAttribute('role', 'dialog');
commands.setAttribute('aria-label', t('LaTeX 补全','LaTeX completion'));
const filter = document.createElement('input');
filter.placeholder = t('LaTeX 命令','LaTeX command');
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
  int: '\\int', lim: '\\lim', matrix: '\\begin{matrix}#?\\end{matrix}',
  pmatrix: '\\begin{pmatrix}#?\\end{pmatrix}', bmatrix: '\\begin{bmatrix}#?\\end{bmatrix}',
  Bmatrix: '\\begin{Bmatrix}#?\\end{Bmatrix}', vmatrix: '\\begin{vmatrix}#?\\end{vmatrix}',
  Vmatrix: '\\begin{Vmatrix}#?\\end{Vmatrix}',
  mathbf: '\\mathbf{x}', mathrm: '\\mathrm{x}', mathit: '\\mathit{x}',
  mathcal: '\\mathcal{x}', mathbb: '\\mathbb{x}', text: '\\text{x}',
  mathsf: '\\mathsf{x}', mathtt: '\\mathtt{x}', mathfrak: '\\mathfrak{x}', mathscr: '\\mathscr{x}',
  boldsymbol: '\\boldsymbol{x}', operatorname: '\\operatorname{}', op: '\\operatorname{}',
  leftparen: '\\left(\\placeholder{}\\right)', leftbracket: '\\left[\\placeholder{}\\right]',
  leftbrace: '\\left\\{\\placeholder{}\\right\\}', leftdot: '\\left.\\placeholder{}\\right|',
  rightparen: '\\left(\\placeholder{}\\right)', rightbracket: '\\left[\\placeholder{}\\right]',
  rightbrace: '\\left\\{\\placeholder{}\\right\\}', rightdot: '\\left|\\placeholder{}\\right.',
  overline: '\\overline{\\placeholder{}}', hat: '\\hat{\\placeholder{}}', vec: '\\vec{\\placeholder{}}', dot: '\\dot{\\placeholder{}}',
  partial: '\\partial', nabla: '\\nabla', prod: '\\prod', iint: '\\iint', oint: '\\oint',
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta', theta: '\\theta',
  lambda: '\\lambda', mu: '\\mu', pi: '\\pi', sigma: '\\sigma', omega: '\\omega',
  varepsilon: '\\varepsilon', varphi: '\\varphi', vartheta: '\\vartheta',
  Gamma: '\\Gamma', Delta: '\\Delta', Theta: '\\Theta', Lambda: '\\Lambda',
  Xi: '\\Xi', Pi: '\\Pi', Sigma: '\\Sigma', Phi: '\\Phi', Psi: '\\Psi', Omega: '\\Omega',
  infty: '\\infty', leq: '\\leq', geq: '\\geq', neq: '\\neq', times: '\\times',
  in: '\\in', notin: '\\notin', subset: '\\subset', subseteq: '\\subseteq',
  cup: '\\cup', cap: '\\cap', forall: '\\forall', exists: '\\exists',
  to: '\\to', rightarrow: '\\rightarrow', leftarrow: '\\leftarrow',
  sin: '\\sin', cos: '\\cos', tan: '\\tan', log: '\\log', ln: '\\ln',
  displaystyle: '\\displaystyle', textstyle: '\\textstyle', space: '\\space',
};
for (const name of mathSymbols) {
  if (/^[A-Za-z]+$/.test(name) && !(name in formulaCommands)) formulaCommands[name] = '\\' + name;
}
const structureCommands = {
  indent: () => editor.chain().focus().updateAttributes('paragraph',{indent:true}).run(),
  noindent: () => editor.chain().focus().updateAttributes('paragraph',{indent:false}).run(),
  par: () => editor.chain().focus().splitBlock().run(),
  ...Object.fromEntries(Object.keys(theoremNames).map(kind=>[kind,()=>editor.chain().focus().wrapIn('theoremBlock',{kind}).run()])),
  section: () => editor.chain().focus().setHeading({ level: 1 }).run(),
  subsection: () => editor.chain().focus().setHeading({ level: 2 }).run(),
  subsubsection: () => editor.chain().focus().setHeading({ level: 3 }).run(),
  itemize: () => editor.chain().focus().toggleBulletList().run(),
  enumerate: () => editor.chain().focus().toggleOrderedList().run(),
  table: () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run(),
  inline: () => insertMath(),
  equation: () => insertMath(true),
  gather: () => insertMath(true, '\\begin{gather}\\placeholder{}\\\\ \\placeholder{}\\end{gather}'),
  multline: () => insertMath(true, '\\begin{multline}\\placeholder{}\\\\ \\placeholder{}\\end{multline}'),
  flalign: () => insertMath(true, '\\begin{flalign}\\placeholder{} &= \\placeholder{}\\\\ \\placeholder{} &= \\placeholder{}\\end{flalign}'),
  eqnarray: () => insertMath(true, '\\begin{eqnarray}\\placeholder{} &=& \\placeholder{}\\\\ \\placeholder{} &=& \\placeholder{}\\end{eqnarray}'),
  alignat: () => insertMath(true, '\\begin{alignat}{2}\\placeholder{} &= \\placeholder{} & \\quad \\placeholder{} &= \\placeholder{}\\end{alignat}'),
  smallmatrix: () => insertMath(false, '\\begin{smallmatrix}\\placeholder{}\\end{smallmatrix}'),
  quote: () => editor.chain().focus().toggleBlockquote().run(),
  hrule: () => editor.chain().focus().setHorizontalRule().run(),
  description: () => editor.chain().focus().insertContent({type:'descriptionList',content:[{type:'descriptionItem',attrs:{term:''},content:[{type:'paragraph'}]}]}).run(),
  toc: () => {
    if(editor.isActive('tableOfContents'))editor.chain().focus().deleteSelection().run();
    else editor.chain().focus().insertContent({type:'tableOfContents'}).run();
  },
  label: async () => {
    if(editor.isActive('heading')) {
      const value=await askText(t('标签键','Label key'),editor.getAttributes('heading').label??'');
      if(value!==null)editor.chain().focus().updateAttributes('heading',{label:value||null}).run();
    } else {
      const value=await askText(t('标签键','Label key'));
      if(value)editor.chain().focus().insertContent({type:'label',attrs:{key:value}}).run();
    }
  },
  ref: async () => {
    const value=await askText(t('引用标签','Reference label'));
    if(value)editor.chain().focus().insertContent({type:'ref',attrs:{key:value}}).run();
  },
  eqref: async () => {
    const labels=collectReferenceLabels(editor.state.doc).filter(item=>item.kind==='equation');
    const value=labels.length?await chooseReference(labels):await askText(t('公式标签','Equation label'));
    if(value)editor.chain().focus().insertContent({type:'ref',attrs:{key:value,equation:true}}).run();
  },
  footnote: async () => {
    const value=await askText(t('脚注内容','Footnote text'));
    if(value)editor.chain().focus().insertContent({type:'footnote',attrs:{text:value}}).run();
  },
  includegraphics: () => insertLocalImage(editor),
  tableofcontents: () => editor.chain().focus().insertContent({type:'tableOfContents'}).run(),
  title: async () => {
    const value=await askText(t('标题','Title'),readMeta('title'));
    if(value!==null)writeMeta('title',value);
  },
  author: async () => {
    const value=await askText(t('作者','Author'),readMeta('author'));
    if(value!==null)writeMeta('author',value);
  },
  textbf: () => editor.chain().focus().toggleBold().run(),
  textit: () => editor.chain().focus().toggleItalic().run(),
  emph: () => editor.chain().focus().toggleItalic().run(),
  textsl: () => editor.chain().focus().toggleItalic().run(),
  sout: () => editor.chain().focus().toggleStrike().run(),
  underline: () => editor.chain().focus().toggleMark('underline').run(),
  textsc: () => editor.chain().focus().toggleMark('smallcaps').run(),
  fbox: () => editor.chain().focus().toggleMark('boxed').run(),
  textsuperscript: () => editor.chain().focus().toggleMark('superscript').run(),
  textsubscript: () => editor.chain().focus().toggleMark('subscript').run(),
  texttt: () => editor.chain().focus().toggleCode().run(),
  matrix: () => insertMath(false,matrixSource('matrix')),
  pmatrix: () => insertMath(false,matrixSource('pmatrix')),
  bmatrix: () => insertMath(false,matrixSource('bmatrix')),
  Bmatrix: () => insertMath(false,matrixSource('Bmatrix')),
  vmatrix: () => insertMath(false,matrixSource('vmatrix')),
  Vmatrix: () => insertMath(false,matrixSource('Vmatrix')),
  cases: () => insertMath(true,'\\begin{cases}\\placeholder{} & \\placeholder{}\\\\ \\placeholder{} & \\placeholder{}\\end{cases}'),
  align: () => insertMath(true,'\\begin{align}\\placeholder{} &= \\placeholder{}\\\\ \\placeholder{} &= \\placeholder{}\\end{align}'),
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
  fadeIn(commands, { prefersReducedMotion: prefersReducedMotion() });
  filter.value = '';
  renderCommands();
  positionCommands();
  filter.focus();
}
function insertFormulaCommand(latex) {
  const fragment = latex.replaceAll('#?', '\\placeholder{}');
  if (completionField?.isConnected) {
    insertLiveMath(completionField, fragment);
  } else insertMath(false, fragment);
}
async function chooseMathDelimiters(field, rightFirst = false) {
  const selection = field && structuredClone(field.selection);
  const value = field?.value;
  const documentBefore = editor.state.doc;
  const anchor = field?.getBoundingClientRect() ?? editor.view.coordsAtPos(editor.state.selection.from);
  const pair = await readDelimiterPair(anchor, rightFirst, field?.closest('[data-math-view]'));
  if (!pair) {
    if (document.activeElement === document.body) {
      if (field?.isConnected) field.focus(); else editor.view.focus();
    }
    return;
  }
  if (field?.isConnected) field.focus();
  else editor.view.focus();
  if (field) {
    if (!field.isConnected || field.value !== value) return;
    field.selection = selection;
    const content = selection.ranges.map(range => field.getValue(range)).join('');
    insertLiveMath(field, wrapMathWithDelimiters(pair, content));
  } else if (editor.state.doc === documentBefore) {
    insertMath(false, wrapMathWithDelimiters(pair, ''));
  }
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
  actions.left = () => chooseMathDelimiters(completionField);
  actions.right = () => chooseMathDelimiters(completionField, true);
  for(const name of Object.keys(mathFontStyles)) actions[name]=()=>{
    editor.view.dispatch(closeHistory(editor.state.tr));
    if(completionField?.isConnected) applyMathFont(completionField,name);
    else insertFormula(editor,false,'',undefined,field=>applyMathFont(field,name));
  };
  actions.displaystyle=()=>{
    editor.view.dispatch(closeHistory(editor.state.tr));
    if(completionField?.isConnected) toggleDisplayStyle(completionField);
    else insertFormula(editor,false,'',undefined,field=>toggleDisplayStyle(field));
  };
  if (!completionField) {
    Object.assign(actions, structureCommands);
    for (const name of Object.keys(textCommands)) actions[name] = () => insertTextCommand(name);
  }
  const exactQuery = filter.value.replace(/^\\/, '');
  const query = exactQuery.toLowerCase();
  for (const [name, action] of Object.entries(actions).filter(([name]) => name.toLowerCase().startsWith(query)).sort(([a],[b]) => Number(b===exactQuery)-Number(a===exactQuery) || Number(b.toLowerCase()===query)-Number(a.toLowerCase()===query))) {
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
    empty.textContent = t('无匹配命令','No matching command');
    candidates.append(empty);
  }
  highlightCandidate(0);
}
document.addEventListener('focusin', event => {
  if (commands.hidden || commands.contains(event.target)) return;
  queueMicrotask(() => { if (!commands.hidden) filter.focus(); });
}, true);
filter.addEventListener('input', renderCommands);
filter.addEventListener('keydown', event => {
  if (event.key === '\\' && !filter.value && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
    event.preventDefault();
    closeCommands(true);
    if (completionField?.isConnected) insertLiveMath(completionField,'\\backslash');
    else insertTextCommand('textbackslash');
    return;
  }
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
const literalFences = { '(': '(', ')': ')', '[':'[', ']':']', '{':'\\{', '}':'\\}', '|':'\\vert' };
function armLiteralFence(field) {
  if (!field) return;
  field.focus();
  const controller = new AbortController();
  const options = { signal:controller.signal, capture:true };
  field.addEventListener('blur',()=>controller.abort(),options);
  field.addEventListener('keydown',event=>{
    if (event.key === 'Escape') { controller.abort(); return; }
    if (['Shift','Alt','Control','Meta'].includes(event.key)) return;
    controller.abort();
    const fence=literalFences[event.key];
    if (!fence || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    insertLiveMath(field,fence);
  },options);
}
const mathOperatorKeys = { 'cs:s':'sum', 'ca:s':'sum', 'cs:p':'prod', 'cs:i':'iint', 'csa:i':'iiint', 'a:i':'oint', 'sa:i':'oiint' };
window.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.metaKey || event.isComposing) return;
  const field = event.composedPath().find(node => node?.tagName === 'MATH-FIELD');
  if (!field || !paper.contains(field)) return;
  const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
  const modifiers = `${event.ctrlKey ? 'c' : ''}${event.shiftKey ? 's' : ''}${event.altKey ? 'a' : ''}`;
  const operator = mathOperatorKeys[`${modifiers}:${key}`];
  const matrix = key === 'm' ? matrixShortcut(modifiers) : null;
  if (!operator && !matrix && (modifiers !== 'c' || !['f','i','l','r'].includes(key))) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.repeat) return;
  if (operator) {
    insertLiveMath(field, '\\'+operator);
    return;
  }
  if (key === 'l' || key === 'r') {
    chooseMathDelimiters(field, key === 'r');
    return;
  }
  const selected = field.selection.ranges.map(range => field.getValue(range)).join('');
  const slot = '\\placeholder{}';
  if (matrix) {
    insertLiveMath(field, matrixSource(matrix, selected || slot));
    return;
  }
  const fragments = {
    f: `\\frac{${selected || slot}}{${slot}}`,
    i: `\\int${selected ? ' '+selected : ''}`,
  };
  insertLiveMath(field, fragments[key]);
}, true);
document.addEventListener('pointerdown', event => { if (!commands.contains(event.target)) closeCommands(); }, true);
document.addEventListener('scroll', event => {
  if (!commands.hidden && !commands.contains(event.target)) closeCommands();
}, true);
window.addEventListener('resize', () => closeCommands());
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!editor.state.storedMarks?.some(mark => mark.type.name === 'boxed')) return;
  editor.view.dispatch(editor.state.tr.removeStoredMark(editor.schema.marks.boxed));
}, true);

const footer=document.createElement('footer');footer.className='document-status';
const count=document.createElement('span');
const zoom=document.createElement('input');zoom.type='range';zoom.min='50';zoom.max='300';zoom.value='100';
const percent=document.createElement('output');
const themeButton=document.createElement('button');
themeButton.type='button';themeButton.className='theme-toggle';
themeButton.addEventListener('mousedown',event=>event.preventDefault());
themeButton.addEventListener('click',()=>{
  const next={light:'dark',dark:'system',system:'light'}[theme.getPreference()];
  theme.set(next);updateThemeButton();
});
function updateThemeButton(){
  const chinese=document.documentElement.lang.startsWith('zh');
  const label={light:['浅色','Light'],dark:['深色','Dark'],system:['跟随系统','System']}[theme.getPreference()];
  const description=(chinese?'主题：':'Theme: ')+label[chinese?0:1];
  themeButton.setAttribute('aria-label',description);
  themeButton.dataset.tooltipZh=description;
  themeButton.dataset.tooltipEn=description;
  themeButton.replaceChildren(icon({light:'sun',dark:'moon',system:'system'}[theme.getPreference()]));
}
const sourceButton=document.createElement('button');
sourceButton.type='button';sourceButton.className='source-toggle';
sourceButton.setAttribute('aria-label','LaTeX');
sourceButton.addEventListener('mousedown',event=>event.preventDefault());
sourceButton.addEventListener('click',toggleSourceView);
function updateSourceButton(){
  const chinese=document.documentElement.lang.startsWith('zh');
  sourceButton.textContent=sourceView.hidden?(chinese?'源码':'Source'):(chinese?'富文本':'Rich text');
  const description=sourceView.hidden
    ? (chinese?'切换到 LaTeX 源码视图':'Switch to the LaTeX source view')
    : (chinese?'返回富文本编辑':'Return to rich-text editing');
  sourceButton.dataset.tooltipZh=description;
  sourceButton.dataset.tooltipEn=description;
  sourceButton.setAttribute('aria-pressed',String(!sourceView.hidden));
}
function scale() {
  documentPage.style.zoom=Number(zoom.value)/100;
  percent.textContent=zoom.value+'%';
  requestAnimationFrame(()=>{
    const brand=document.querySelector('header h1');
    brand.style.opacity=documentPage.hidden ? '1' : String(Math.max(0,Math.min(1,(documentPage.getBoundingClientRect().left-brand.getBoundingClientRect().right)/28)));
  });
}
window.addEventListener('resize',scale);
zoom.addEventListener('input',scale);
let wheelZoom = Number(zoom.value);
const configuredZoom=Number(appConfig.interface?.zoom);
if(Number.isFinite(configuredZoom)&&configuredZoom>=50&&configuredZoom<=300) { zoom.value=String(configuredZoom); wheelZoom=configuredZoom; }
document.addEventListener('keydown', event => {
  if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase()==='j'
    && editor.view.hasFocus() && !event.composedPath().some(node=>node?.tagName==='MATH-FIELD')) {
    editor.view.domObserver.flush();
    if (editor.isActive('codeBlock')) {
      event.preventDefault(); event.stopPropagation();
      exitCode(editor.state, editor.view.dispatch);
      return;
    }
    if (editor.isActive('code')) {
      event.preventDefault(); event.stopPropagation();
      editor.commands.unsetCode();
      return;
    }
    for (const mark of ['boxed','smallcaps','superscript','subscript','bold','italic','underline','strike']) {
      if (!editor.isActive(mark)) continue;
      event.preventDefault(); event.stopPropagation();
      // Move past the whole marked range before continuing outside the command.
      editor.chain().focus().extendMarkRange(mark).command(({tr}) => {
        tr.setSelection(tr.selection.constructor.near(tr.doc.resolve(tr.selection.to)));
        tr.removeStoredMark(editor.schema.marks[mark]);
        return true;
      }).unsetMark(mark).run();
      return;
    }
    const { $from }=editor.state.selection;
    for (let depth=$from.depth; depth>0; depth--) {
      if (!['blockquote','theoremBlock','bulletList','orderedList','descriptionList','table'].includes($from.node(depth).type.name)) continue;
      event.preventDefault(); event.stopPropagation();
      const after=$from.after(depth);
      const tr=editor.state.tr;
      if (!tr.doc.resolve(after).nodeAfter) tr.insert(after,editor.schema.nodes.paragraph.create());
      tr.setSelection(Selection.near(tr.doc.resolve(after),1));
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      return;
    }
  }
  if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key==='0'
    && editor.view.hasFocus() && !event.composedPath().some(node=>node?.tagName==='MATH-FIELD')) {
    event.preventDefault();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || activeMath() || event.composedPath().some(node=>node?.tagName==='MATH-FIELD') || !['+','=','-'].includes(event.key)) return;
  event.preventDefault();
  wheelZoom = Math.max(50, Math.min(300, Number(zoom.value) + (event.key === '-' ? -10 : 10)));
  zoom.value = String(wheelZoom); scale();
}, true);
zoom.addEventListener('input', () => { wheelZoom = Number(zoom.value); });
zoom.addEventListener('change', () => saveConfig({ zoom: Number(zoom.value) }));
function formulaAtSelection() {
  let { selection } = editor.state;
  const domSelection = window.getSelection();
  if (domSelection?.isCollapsed && editor.view.dom.contains(domSelection.anchorNode)) {
    const position = editor.view.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset);
    if (position >= 0 && !selection.node) selection = { empty:true, $from:editor.state.doc.resolve(position) };
  }
  const { $from } = selection;
  const math = node => ['math','mathBlock'].includes(node?.type.name);
  if (math(selection.node)) return { position:selection.from, start:true };
  if (!selection.empty) return null;
  if (math($from.nodeAfter)) return { position:$from.pos, start:true };
  if (math($from.nodeBefore)) return { position:$from.pos-$from.nodeBefore.nodeSize, start:false };
  if ($from.depth === 1) {
    const before = editor.state.doc.resolve($from.before());
    const after = editor.state.doc.resolve($from.after());
    if (!$from.parentOffset && math(before.nodeBefore)) return { position:before.pos-before.nodeBefore.nodeSize, start:false };
    if ($from.parentOffset === $from.parent.content.size && math(after.nodeAfter)) return { position:after.pos, start:true };
  }
  return null;
}
let matrixChord=0;
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.altKey || event.metaKey || event.isComposing) { matrixChord=0; return; }
  if (event.key==='Control') return;
  const editingMatrix=Boolean(activeMath())||editor.isActive('table');
  if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase()==='e') {
    if (!editingMatrix && !(editor.view.hasFocus() && formulaAtSelection())) { matrixChord=0; return; }
    event.preventDefault(); event.stopPropagation(); matrixChord=performance.now()+1500; return;
  }
  if (performance.now()>matrixChord) return;
  const key=event.key.toLowerCase();
  matrixChord=0;
  if (key==='t' && document.activeElement?.tagName==='MATH-FIELD') {
    event.preventDefault(); event.stopPropagation();
    armLiteralFence(document.activeElement);
    return;
  }
  if (key==='e' && editor.view.hasFocus()) {
    const target=formulaAtSelection();
    const field=target && editor.view.nodeDOM(target.position)?.querySelector('math-field');
    if (!field) return;
    event.preventDefault(); event.stopPropagation();
    field.focus();
    field.executeCommand(target.start?'moveToMathfieldStart':'moveToMathfieldEnd');
    return;
  }
  if (!editingMatrix || !['r','c'].includes(key)) return;
  event.preventDefault(); event.stopPropagation();
  if (key==='r') addMatrixRow(); else addMatrixColumn();
}, true);
document.querySelector('main').addEventListener('wheel', event => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  const speed = event.deltaMode === 0 && Math.abs(event.deltaY) < 50 ? 0.24 : 0.12;
  wheelZoom = Math.max(50, Math.min(300, wheelZoom - event.deltaY * units * speed));
  zoom.value = String(Math.round(wheelZoom));
  scale();
}, { passive: false });
const environment = document.createElement('span'); environment.className='environment-tag';
function updateEnvironment() {
  const field=activeMath();
  const name=field ? (field.value.includes('matrix}')?'matrix':field.closest('.math-display')?'display math':'inline math') :
    !sourceView.hidden?'LaTeX': ['table','listItem','heading'].find(type=>editor.isActive(type)) ?? 'text';
  const labels={matrix:t('矩阵','Matrix'),'display math':t('行间公式','Display math'),'inline math':t('行内公式','Inline math'),table:t('表格','Table'),listItem:t('列表','List'),heading:t('标题','Heading'),text:t('正文','Text'),LaTeX:t('源码','Source')};
  environment.textContent=labels[name]; environment.dataset.environment=name;
}
footer.append(count,environment,zoom,percent,themeButton,sourceButton);document.body.append(footer);scale();
editor.on('transaction',updateEnvironment);
document.addEventListener('focusin',updateEnvironment);paper.addEventListener('input',updateEnvironment);
updateEnvironment();
editor.on('update',()=>{count.textContent=editor.getText().length+' '+t('字符','characters');});
const tableGroup=document.createElement('div');tableGroup.className='tools';
const layoutGroup=document.createElement('div');layoutGroup.className='tools';layoutGroup.id='layout-panel';
const formatGroup=document.createElement('div');formatGroup.className='tools';
const referenceGroup=document.createElement('div');referenceGroup.className='tools';
const mathGroup=document.createElement('div');mathGroup.className='tools';
function groupButton(container,label,action) {
  const control=document.createElement('button');
  control.type='button';control.textContent=label;
  control.addEventListener('mousedown',event=>event.preventDefault());
  control.addEventListener('click',action);
  container.append(control);
  return control;
}
pagePaper=document.createElement('select');
for(const [value,label] of [['a4','A4'],['a5','A5'],['letter','Letter'],['legal','Legal']])pagePaper.append(new Option(label,value));
pagePaper.setAttribute('aria-label',t('纸张','Paper'));
pageOrientation=document.createElement('select');
pageOrientation.setAttribute('aria-label',t('方向','Orientation'));
pageMarginPreset=document.createElement('select');
for(const value of ['normal','narrow','wide','custom'])pageMarginPreset.append(new Option(value,value));
pageMarginPreset.setAttribute('aria-label',t('页边距预设','Margin preset'));
function marginInput(label){
  const input=document.createElement('input');
  input.type='text';input.style.width='64px';input.setAttribute('aria-label',label);
  return input;
}
pageMarginTop=marginInput(t('上边距','Top margin'));
pageMarginRight=marginInput(t('右边距','Right margin'));
pageMarginBottom=marginInput(t('下边距','Bottom margin'));
pageMarginLeft=marginInput(t('左边距','Left margin'));
layoutGroup.append(pagePaper,pageOrientation,pageMarginPreset,pageMarginTop,pageMarginRight,pageMarginBottom,pageMarginLeft);
pagePaper.addEventListener('change',()=>updatePageSetup({paper:pagePaper.value}));
pageOrientation.addEventListener('change',()=>updatePageSetup({orientation:pageOrientation.value}));
pageMarginPreset.addEventListener('change',()=>{
  if(MARGIN_PRESETS[pageMarginPreset.value])updatePageSetup({margin:MARGIN_PRESETS[pageMarginPreset.value]});
});
for(const [side,input] of [['top',pageMarginTop],['right',pageMarginRight],['bottom',pageMarginBottom],['left',pageMarginLeft]])input.addEventListener('change',()=>{
  const value=input.value.trim();
  if(/^\d+(?:\.\d+)?(?:mm|cm|in|pt)$/.test(value))updatePageSetup({margins:{[side]:value}});
  else input.value=pageSetup.margins[side];
});
applyPageSetup();
groupButton(tableGroup,'▦',()=>editor.chain().focus().insertTable({rows:2,cols:2,withHeaderRow:false}).run());
groupButton(tableGroup,'＋ Row',addMatrixRow);
groupButton(tableGroup,'＋ Column',addMatrixColumn);
groupButton(tableGroup,'－ Row',()=>editor.chain().focus().deleteRow().run());
groupButton(tableGroup,'－ Column',()=>editor.chain().focus().deleteColumn().run());
groupButton(tableGroup,'删除表格',()=>editor.chain().focus().deleteTable().run());
groupButton(tableGroup,'merge',()=>editor.chain().focus().mergeCells().run());
groupButton(tableGroup,'split',()=>editor.chain().focus().splitCell().run());
groupButton(tableGroup,'booktabs',()=>{if(editor.isActive('table'))editor.chain().focus().updateAttributes('table',{booktabs:!editor.getAttributes('table').booktabs}).run();});
groupButton(tableGroup,t('题注','Caption'),async()=>{
  if(!editor.isActive('table'))return;
  const value=await askText(t('表格题注（LaTeX）','Table caption (LaTeX)'),editor.getAttributes('table').caption??'');
  if(value!==null)editor.chain().focus().updateAttributes('table',{caption:value||null,centered:true,placement:editor.getAttributes('table').placement??'htbp'}).run();
});
groupButton(tableGroup,'label',async()=>{
  if(!editor.isActive('table'))return;
  const value=await askText(t('表格标签键','Table label key'),editor.getAttributes('table').label??'');
  if(value!==null)editor.chain().focus().updateAttributes('table',{label:value||null}).run();
});
groupButton(tableGroup,t('边框','Borders'),async()=>{
  if(!editor.isActive('table'))return;
  const mode=await askText(t('边框：grid 全部、outer 外框、horizontal 横线、none 无','Borders: grid, outer, horizontal, none'),editor.getAttributes('table').borderMode??'grid');
  if(mode && ['grid','outer','horizontal','none'].includes(mode)) editor.chain().focus().updateAttributes('table',{borderMode:mode,booktabs:false}).run();
});
groupButton(tableGroup,t('线宽','Rule width'),async()=>{
  if(!editor.isActive('table'))return;
  const width=await askText(t('表格线宽（例如 0.8pt）','Table rule width (e.g. 0.8pt)'),editor.getAttributes('table').borderWidth??'0.4pt');
  if(width!==null && (!width || /^\d+(?:\.\d+)?pt$/.test(width))) editor.chain().focus().updateAttributes('table',{borderWidth:width||null}).run();
});
for(const [label,align] of [['左','left'],['中','center'],['右','right']]) groupButton(tableGroup,label,()=>{
  if(!editor.isActive('table'))return;
  const type=editor.isActive('tableHeader')?'tableHeader':'tableCell';
  editor.chain().focus().updateAttributes(type,{align}).run();
});
groupButton(formatGroup,'B',()=>editor.chain().focus().toggleBold().run());
groupButton(formatGroup,'I',()=>editor.chain().focus().toggleItalic().run());
groupButton(formatGroup,'U',()=>editor.chain().focus().toggleMark('underline').run());
groupButton(formatGroup,'S',()=>editor.chain().focus().toggleStrike().run());
groupButton(formatGroup,t('清除格式','Clear formatting'),()=>editor.chain().focus().unsetAllMarks().run());
groupButton(formatGroup,'code',()=>editor.chain().focus().toggleCode().run());
groupButton(formatGroup,'quote',()=>editor.chain().focus().toggleBlockquote().run());
groupButton(formatGroup,'hr',()=>editor.chain().focus().setHorizontalRule().run());
groupButton(formatGroup,'x²',()=>editor.chain().focus().toggleMark('superscript').run());
groupButton(formatGroup,'x₂',()=>editor.chain().focus().toggleMark('subscript').run());
groupButton(formatGroup,'sc',()=>editor.chain().focus().toggleMark('smallcaps').run());
groupButton(formatGroup,'box',()=>editor.chain().focus().toggleMark('boxed').run());
groupButton(formatGroup,'\\LaTeX',()=>insertTextCommand('LaTeX'));
groupButton(formatGroup,'\\TeX',()=>insertTextCommand('TeX'));
let showFormattingMarks = true;
const setSpaceOverlay=installSpaceOverlay(editor,paper);
documentPage.dataset.formattingMarks = 'true';
const formattingMarks = groupButton(formatGroup,'¶',()=>{
  showFormattingMarks = !showFormattingMarks;
  documentPage.dataset.formattingMarks = String(showFormattingMarks);
  setSpaceOverlay(showFormattingMarks);
  formattingMarks.setAttribute('aria-pressed',String(showFormattingMarks));
});
formattingMarks?.setAttribute('aria-pressed','true');
document.addEventListener('keydown',event=>{
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.key.toLowerCase() !== 'i') return;
  if (!editor.view.hasFocus() || !editor.isActive('paragraph') || event.composedPath().some(node=>node?.tagName==='MATH-FIELD')) return;
  event.preventDefault(); event.stopPropagation();
  editor.commands.updateAttributes('paragraph',{indent:editor.getAttributes('paragraph').indent === false});
},true);
groupButton(formatGroup,'desc',()=>editor.chain().focus().insertContent({type:'descriptionList',content:[{type:'descriptionItem',attrs:{term:''},content:[{type:'paragraph'}]}]}).run());
function setListStyle(style) {
  if(editor.isActive('orderedList'))editor.chain().focus().updateAttributes('orderedList',{labelStyle:style}).run();
  else if(editor.isActive('bulletList'))editor.chain().focus().updateAttributes('bulletList',{marker:style}).run();
}
groupButton(formatGroup,'1.',()=>setListStyle('decimal'));
groupButton(formatGroup,'a.',()=>setListStyle('lower-alpha'));
groupButton(formatGroup,'A.',()=>setListStyle('upper-alpha'));
groupButton(formatGroup,'I.',()=>setListStyle('upper-roman'));
groupButton(formatGroup,'甲',()=>setListStyle('cjk-heavenly-stem'));
groupButton(formatGroup,'•',async()=>{const value=await askText(t('项目符号','Bullet marker'),'•');if(value)setListStyle(value);});
groupButton(referenceGroup,'label',async()=>{
  if(editor.isActive('heading')){
    const value=await askText(t('标签键','Label key'),editor.getAttributes('heading').label??'');
    if(value!==null)editor.chain().focus().updateAttributes('heading',{label:value||null}).run();
  } else {
    const value=await askText(t('标签键','Label key'));
    if(value)editor.chain().focus().insertContent({type:'label',attrs:{key:value}}).run();
  }
});
groupButton(referenceGroup,'ref',async()=>{
  const labels=collectReferenceLabels(editor.state.doc);
  const value=labels.length?await chooseReference(labels):await askText(t('引用标签','Reference label'));
  if(value)editor.chain().focus().insertContent({type:'ref',attrs:{key:value}}).run();
});
groupButton(referenceGroup,'refs',async()=>{
  const labels=collectReferenceLabels(editor.state.doc);
  const value=labels.length?await chooseReference(labels):null;
  if(value)editor.chain().focus().insertContent({type:'ref',attrs:{key:value}}).run();
});
groupButton(referenceGroup,'eqref',async()=>{
  const labels=collectReferenceLabels(editor.state.doc).filter(item=>item.kind==='equation');
  const value=labels.length?await chooseReference(labels):await askText(t('公式标签','Equation label'));
  if(value)editor.chain().focus().insertContent({type:'ref',attrs:{key:value,equation:true}}).run();
});
groupButton(referenceGroup,'fn',async()=>{
  const value=await askText(t('脚注内容','Footnote text'));
  if(value)editor.chain().focus().insertContent({type:'footnote',attrs:{text:value}}).run();
});
groupButton(referenceGroup,'cite',async()=>{
  try{
    const documentBefore=editor.state.doc;
    const citation=await insertCitationDialog();
    if(!citation || editor.state.doc!==documentBefore)return;
    const {key,file}=citation;
    if(!/^[\p{L}\p{N}_. -]+\.bib$/iu.test(file.name))throw new Error(t('文献文件名不受支持','Unsupported bibliography filename'));
    const tex=source();
    const resources=[...tex.matchAll(/\\addbibresource(?:\[[^\]]*\])?\{([^{}]+)\}/g)].map(match=>match[1]);
    const classic=[...tex.matchAll(/\\bibliography\{([^{}]+)\}/g)].flatMap(match=>match[1].split(',').map(name=>name.trim()).filter(Boolean).map(name=>name.endsWith('.bib')?name:name+'.bib'));
    const linked=[...resources,...classic].filter(path=>path.split('/').at(-1)===file.name);
    if(linked.length>1 || (!linked.length && classic.length))throw new Error(t('请关联文档中声明的文献文件','Attach the bibliography declared in the document'));
    rememberAsset(linked[0]??file.name,file);
    if(!linked.length) {
      const eol=documentParts.eol;
      const hasBiblatex=/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^{}]*\bbiblatex\b[^{}]*\}/.test(documentParts.start);
      const declarations=(hasBiblatex?'':'\\usepackage{biblatex}'+eol)+'\\addbibresource{'+file.name+'}'+eol;
      documentParts={...documentParts,start:documentParts.start.replace(/^\\begin\{document\}/m,()=>declarations+'\\begin{document}')};
    }
    editor.chain().focus().insertContent({type:'cite',attrs:{key}}).run();
  }catch(error){
    document.querySelector('#status').hidden=false;
    document.querySelector('#status').textContent=error.message;
  }
});
groupButton(referenceGroup,'toc',()=>{
  if(editor.isActive('tableOfContents'))editor.chain().focus().deleteSelection().run();
  else editor.chain().focus().insertContent({type:'tableOfContents'}).run();
});
groupButton(referenceGroup,'short',async()=>{
  if(!editor.isActive('heading'))return;
  const value=await askText(t('短标题','Short title'),editor.getAttributes('heading').shortTitle??'');
  if(value!==null)editor.chain().focus().updateAttributes('heading',{shortTitle:value||null}).run();
});
groupButton(referenceGroup,'title',async()=>{
  const value=await askText(t('标题','Title'),readMeta('title'));
  if(value!==null)writeMeta('title',value);
});
groupButton(referenceGroup,'author',async()=>{
  const value=await askText(t('作者','Author'),readMeta('author'));
  if(value!==null)writeMeta('author',value);
});
groupButton(mathGroup,'$',()=>insertMath());
groupButton(mathGroup,'$$',()=>insertMath(true));
groupButton(mathGroup,'equation',()=>insertEquation());
groupButton(mathGroup,'equation label',async()=>{
  const field=activeMath();
  const position=field?.closest('[data-math-view]')?.getMathPosition?.() ?? editor.state.selection.from;
  const documentBefore=editor.state.doc;
  const node=documentBefore.nodeAt(position);
  if(node?.type.name!=='mathBlock' || node.attrs.delimiter!=='equation')return;
  const label=await askText(t('公式标签','Equation label'),node.attrs.label??'');
  if(label===null || !/^[\p{L}\p{N}:_.-]*$/u.test(label) || editor.state.doc!==documentBefore)return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(position,undefined,{...node.attrs,label:label||null}));
  field?.focus();
});
groupButton(mathGroup,'frac',()=>insertMath(false,'\\frac{\\placeholder{}}{\\placeholder{}}'));
groupButton(mathGroup,'sqrt',()=>insertMath(false,'\\sqrt{\\placeholder{}}'));
groupButton(mathGroup,'sum',()=>{
  const field=activeMath();
  if(field)insertLiveMath(field,'\\sum'); else insertMath(false,'\\sum');
});
groupButton(mathGroup,'int',()=>insertMath(false,'\\int'));
for (const operator of ['prod','iint','iiint','oint','oiint']) {
  groupButton(mathGroup,'\\'+operator,()=>{
    const field=activeMath();
    if(field)insertLiveMath(field,'\\'+operator);
    else insertMath(false,'\\'+operator);
  });
}
groupButton(mathGroup,'\\left',()=>chooseMathDelimiters(activeMath()));
groupButton(mathGroup,'\\right',()=>chooseMathDelimiters(activeMath(),true));
groupButton(mathGroup,'单括号 / Literal fence',()=>armLiteralFence(activeMath()));
groupButton(mathGroup,'matrix',()=>insertMath(false,matrixSource('matrix')));
groupButton(mathGroup,'cases',()=>insertMath(true,'\\begin{cases}\\placeholder{} & \\placeholder{}\\\\ \\placeholder{} & \\placeholder{}\\end{cases}'));
groupButton(mathGroup,'align',()=>insertMath(true,'\\begin{align}\\placeholder{} &= \\placeholder{}\\\\ \\placeholder{} &= \\placeholder{}\\end{align}'));

const header=document.querySelector('header');
const ribbon=document.createElement('div');ribbon.className='ribbon';
const tabs=document.createElement('nav');tabs.className='ribbon-tabs';
const home=document.createElement('div');home.className='tools';
const insert=document.createElement('div');insert.className='tools';
groupButton(insert,t('图片','Image'),()=>insertLocalImage(editor));
groupButton(insert,t('代码块','Code block'),async()=>{
  const language=await askText(t('代码语言，例如 Python、Java 或 C++','Code language, e.g. Python, Java or C++'),editor.getAttributes('codeBlock').language??'');
  if(language===null || (language && !/^[A-Za-z0-9+_-]+$/.test(language))) return;
  if(editor.isActive('codeBlock')) editor.chain().focus().updateAttributes('codeBlock',{language:language||null}).run();
  else editor.chain().focus().setCodeBlock({language:language||null}).run();
});
const files=header.querySelector('.tools');
const attachFolder=groupButton(files,t('关联资源目录','Attach asset folder'),()=>{
  const picker=document.createElement('input');
  picker.type='file';picker.webkitdirectory=true;
  picker.addEventListener('change',()=>{
    for(const file of picker.files) {
      const path=file.webkitRelativePath.split('/').slice(1).join('/');
      if(safeProjectPath(path))rememberAsset(path,file);
    }
  },{once:true});
  picker.click();
});
for(const control of [...tools.children]) {
  (control.hasAttribute('data-home') || control.tagName==='SELECT' || ['↶','↷','B','I','U','H'].includes(control.textContent)?home:insert).append(control);
}
const groups={files,home,insert,layout:layoutGroup,table:tableGroup,format:formatGroup,reference:referenceGroup,math:mathGroup};
const captions={files:['文件','File'],home:['主页','Home'],insert:['插入','Insert'],layout:['布局','Layout'],table:['表格','Table'],format:['格式','Format'],reference:['引用','Reference'],math:['数学','Math']};
const language=document.querySelector('#language');
const exportConfig=document.createElement('button');
exportConfig.type='button';
exportConfig.addEventListener('mousedown',event=>event.preventDefault());
exportConfig.addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([toYaml(appConfig)+'\n'],{type:'text/yaml;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='config.yaml';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
files.append(exportConfig);
language.value=initialLanguage;
function updateLanguage() {
  setLanguage(language.value);
  const chinese=language.value==='zh-CN';
  document.documentElement.lang=language.value;
  localize(document);
  for(const tab of tabs.children)tab.textContent=captions[tab.dataset.group][chinese?0:1];
  download.textContent=chinese?'下载项目 .zip':'Download project .zip';
  attachFolder.textContent=chinese?'关联资源目录':'Attach asset folder';
  exportConfig.textContent=chinese?'配置':'Config';
  header.querySelector('.open span').textContent=chinese?'打开 .tex':'Open .tex';
  commands.setAttribute('aria-label',t('LaTeX 补全','LaTeX completion'));
  filter.placeholder=t('LaTeX 命令','LaTeX command');
  filter.setAttribute('aria-label',filter.placeholder);
  headingMenu.setAttribute('aria-label',t('段落样式','Paragraph style'));
  pagePaper.setAttribute('aria-label',t('纸张','Paper'));
  pageOrientation.replaceChildren(new Option(t('纵向','Portrait'),'portrait'),new Option(t('横向','Landscape'),'landscape'));
  pageOrientation.value=pageSetup.orientation;
  pageOrientation.setAttribute('aria-label',t('方向','Orientation'));
  pageMarginPreset.replaceChildren(
    new Option(t('常规边距','Normal margins'),'normal'),
    new Option(t('窄边距','Narrow margins'),'narrow'),
    new Option(t('宽边距','Wide margins'),'wide'),
    new Option(t('自定义','Custom'),'custom'),
  );
  pageMarginPreset.value=Object.keys(MARGIN_PRESETS).find(key=>MARGIN_PRESETS[key]===pageSetup.margin)??'custom';
  pageMarginPreset.setAttribute('aria-label',t('页边距预设','Margin preset'));
  pageMarginTop.setAttribute('aria-label',t('上边距','Top margin'));
  pageMarginRight.setAttribute('aria-label',t('右边距','Right margin'));
  pageMarginBottom.setAttribute('aria-label',t('下边距','Bottom margin'));
  pageMarginLeft.setAttribute('aria-label',t('左边距','Left margin'));
  tooltips?.setLanguage(language.value);
  updateThemeButton();
  updateSourceButton();
  renderMeta();
  updateEnvironment();
  count.textContent=editor.getText().length+' '+t('字符','characters');
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
ribbon.append(tabs,files,home,insert,layoutGroup,tableGroup,formatGroup,referenceGroup,mathGroup);header.append(ribbon);tools.remove();
decorateToolbar(ribbon);
const tooltips=installTooltips(document.body,{document,language:language.value});
for(const control of ribbon.querySelectorAll('button'))control.dataset.rovingItem='';
installRovingFocus(tabs,{initial:Object.keys(groups).indexOf('home'),onActivate:control=>control.click()});
for(const panel of Object.values(groups))installRovingFocus(panel,{onActivate:control=>control.click()});
const download=document.querySelector('#download');
language.addEventListener('change',()=>{updateLanguage();saveConfig({language:language.value});});updateLanguage();applyToolbarDescriptions(ribbon);selectGroup('home');

installContextMenu(editor, paper, language, message => {
  const status = document.querySelector('#status');
  status.hidden = false;
  status.textContent = message;
});
