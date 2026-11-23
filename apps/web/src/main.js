import {AppendixStart,MatterStart,LayoutCommand} from './editor/appendix.js';
import {Lipsum} from './editor/lipsum.js';
import {CounterDirective} from './editor/counter-directive.js';
import {projectLayoutPreamble} from './project/page-context.mjs';
import {projectInputSource} from './project/input-support.mjs';
import {installProjectPresentation} from './project/presentation.js';
import {ProjectRegion} from './project/region-node.js';
import {canIndentList} from './project/list-policy.js';
import {createCompositionController} from './project/composition-controller.js';
import {applicationCommandActions} from './editor/application-commands.js';
import {captureRichSession,restoreRichSession,copyModeHistory,readModeHistory} from './project/rich-session.js';
import {changePageLayout,mergePageLayout,PageLayoutHistory,textPatch} from './editor/page-layout-history.js';
import {setParagraphIndent,paragraphHasIndent} from './editor/paragraph-format.js';
import {installProjectNavigation} from './project/navigation.js';
import {ProjectWorkspaceState} from './project/workspace-state.mjs';
import {exitProjectHeading} from './project/editing.js';
import {ProjectDocumentSession} from './project/document-session.mjs';
import {installFloatingToolbar} from './ui/floating-toolbar.js';
import {installShortcutPriority} from './ui/shortcut-priority.mjs';
import {installSettingsPanel} from './ui/settings-panel.js';
import { buildHomeRibbon } from './ui/home-ribbon.js';
import { activeStyleKey, documentClassFromSource } from './ui/style-presets.mjs';
import { buildRibbonGroups } from './ui/ribbon-groups.js';
import {installHeaderFooterPanel} from './ui/header-footer-panel.js';
import { sourceProjection, richSourceChanges, standaloneParagraphDraft } from './editor/source-sync.js';
import { installSourceToolbar } from './editor/source-toolbar.js';
import { createSourceWorkspace } from './editor/source-workspace.js';
import { DEFAULT_DOCUMENT_SOURCE } from './editor/default-document.mjs';
import { indentLatex } from './editor/latex-indent.mjs';
import { installContextMenu } from './editor/context-menu.js';
import { textCommands } from '../latex/inline.mjs';
import { markerInput, listMarker } from '../latex/list-numbering.mjs';
import { closeHistory } from '@tiptap/pm/history';
import { exitCode } from '@tiptap/pm/commands';
import { mathFontStyles, applyMathFont } from './editor/math-formatting.js';
import { installFormatControls } from './editor/format-controls.js';
import { selectionTypography } from './editor/selection-typography.js';
import { createClipboard } from './editor/clipboard.js';
import { installFormatPainter } from './editor/format-painter.js';
import { decorateToolbar, applyToolbarDescriptions, icon } from './editor/icons.js';
import { PaperBehavior } from './editor/paper-behavior.js';
import { MathNode, MathBlock, configureMathFences, focusInsertedOperator, insertFormula, isMathOperatorWithBody, mathEnvironment, toggleDisplayStyle } from './editor/math-node.js';
import { MathGlue } from './editor/math-glue.js';
import { Ref, Label, Cite, Footnote, TableOfContents, refreshReferences, collectReferenceLabels, installDocumentOutline } from './editor/references.js';
import { createCitationLibrary, openCitationPanel } from './editor/citation-library.js';
import { installProjectExplorer } from './project/explorer.js';
import { applyCitationRenames } from '../bib/index.mjs';
import { chooseReference } from './editor/reference-index.js';
import { installTableHoverAddRow } from './editor/table-hover.js';
import { createConfigStore } from './editor/config.mjs';
import { compileKeybindings, installKeybindings } from './editor/keybindings.mjs';
import defaultConfigYaml from '../config.yaml';
import { askText } from './editor/dialog.js';
import { installDocumentFind } from './editor/find.js';
import { DocumentImage, Subfigures, insertLocalImage, insertSubfigures, replaceLocalImage, startImageCrop, installImageDrop } from './editor/image-node.js';
import { installImagePanel } from './ui/image-panel.js';
import { installSubfigurePanel } from './ui/subfigure-panel.js';
import { MultiColumn } from './editor/multi-column.js';
import { readGlobalColumns, writeGlobalColumns } from '../latex/columns.mjs';
import { readImageSpacing, writeImageSpacing, IMAGE_SPACING_DEFAULTS } from '../latex/images.mjs';
import {
  clearProjectAssets,
  projectAssets,
  readBibliographyMetadata,
  rememberAsset,
  writeBibliographyMetadata,
} from './editor/project-assets.js';
import { buildProjectZip, safeProjectPath, projectDependencies } from './editor/project-zip.mjs';
import { theoremNames } from '../latex/theorem.mjs';
import { MultiSelection } from './editor/multi-selection.js';
import { installSpaceOverlay } from './editor/space-overlay.js';
import { getTypesettingProfile } from './typesetting/engine-profile.mjs';
import { installTypesetPagination } from './editor/typeset-pagination.js';
import { wrapMathWithDelimiters } from '../latex/delimiters.mjs';
import { readDelimiterPair } from './editor/delimiter-input.js';
import { serialize, importBlocks, parseTableFloat, setSerializationClass } from './editor/latex-codec.js';
import {TblrSource} from './editor/tblr-extension.js';
import {TabularxSource,syncTabularxWidths} from './editor/tabularx-extension.js';
import { setHeadingBase } from '../latex/blocks.mjs';
import { Editor, Node, Extension, Mark, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Plugin, Selection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { parseDocument } from '../latex/document.mjs';
import { exportDocument } from '../latex/packages.mjs';
import { appendAlignmentPair, displayEnvironment, numberedMathRows } from '../latex/math-environments.mjs';
import { MARGIN_PRESETS, readPageSetup, writePageSetup, pageMetrics } from '../latex/geometry.mjs';
import { readPageFurniture, writePageFurniture } from '../latex/page-furniture.mjs';
import { mathSymbols } from '../latex/math-symbols.mjs';
import { createThemeController } from './ui/theme.mjs';
import { installTooltips } from './ui/tooltips.mjs';
import { installRovingFocus } from './ui/keyboard-nav.mjs';
import { fadeIn } from './ui/motion.mjs';
import { getLanguage, localize, normalizeLanguage, setLanguage, t } from './ui/i18n.mjs';
import { TikzEditor } from './tikz/controllers/tikzEditor.js';
import { openTikzStudio } from './ui/tikz-studio.js';

const citationLibrary = createCitationLibrary();

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
    backgroundColor:{default:null,parseHTML:element=>cssColor(element.style.backgroundColor)},
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
  name:'underline',
  addAttributes:()=>({
    style:{default:'single',parseHTML:element=>element.dataset.underlineStyle??'single',
      renderHTML:({style})=>style&&style!=='single'?{'data-underline-style':style}:{}},
  }),
  parseHTML:()=>[{tag:'u'}],
  renderHTML:({mark,HTMLAttributes})=>['u',{
    ...HTMLAttributes,
    ...(mark.attrs.style&&mark.attrs.style!=='single'?{'data-underline-style':mark.attrs.style}:{}),
  },0],
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
const Circled = Mark.create({
  name:'circled',parseHTML:()=>[{tag:'span[data-circled]'}],
  renderHTML:()=>['span',{'data-circled':'',style:'display:inline-flex;align-items:center;justify-content:center;min-width:1.35em;height:1.35em;border:1px solid currentColor;border-radius:50%;line-height:1;padding:0 .12em'},0],
});
const PageBreak = Node.create({
  name:'pageBreak',
  group:'block',
  atom:true,
  selectable:true,
  parseHTML:()=>[{tag:'div[data-page-break]'}],
  renderHTML:()=>['div',{'data-page-break':'','class':'page-break'}],
});
function withoutModShortcuts(extension) {
  return extension.extend({
    addKeyboardShortcuts() {
      return Object.fromEntries(Object.entries(this.parent()).filter(([key]) => !key.split('-').includes('Mod')));
    },
  });
}
const configurableExtensions = new Set([
  'bold', 'blockquote', 'bulletList', 'code', 'hardBreak', 'heading', 'history', 'italic',
  'orderedList', 'paragraph', 'strike',
]);
const ConfigurableStarterKit = StarterKit.extend({
  addExtensions() {
    return this.parent().map(extension => {
      if (!configurableExtensions.has(extension.name)) return extension;
      const configured = withoutModShortcuts(extension);
      return extension.name === 'orderedList' ? configured.extend({
        addInputRules() {
          return [wrappingInputRule({
            find: text => {
              const match=markerInput.exec(text);
              const data=match && listMarker(match);
              return data && {text:match[0],index:0,data};
            },
            type: this.type,
            getAttributes: match => match.data,
            joinPredicate: ({data}, node) => node.attrs.labelStyle===data.labelStyle && node.childCount+node.attrs.start===data.start,
          })];
        },
      }) : configured;
    });
  },
});
const LanguageCodeBlock = withoutModShortcuts(CodeBlock).extend({
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
  parseHTML:()=>[{tag:'pre[data-raw]',priority:1000,getAttrs:element=>{
    try {
      const source=JSON.parse(element.getAttribute('data-raw-source'));
      return {source:typeof source==='string'?source:element.textContent};
    } catch { return {source:element.textContent}; }
  }}],
  // HTML parsers normalize literal CRLF text; JSON in an attribute preserves it.
  renderHTML:({node})=>{
    const float=parseTableFloat(node.attrs.source);
    return ['pre',{'data-raw':'','data-raw-source':JSON.stringify(node.attrs.source),contenteditable:'false',
      ...(float && {'data-table-float':float.environment,'data-table-placement':float.placement,
        'data-table-caption':float.caption,'data-table-label':float.label,'data-table-centered':String(float.centered)}),
    },node.attrs.source];
  },
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
function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const config = createConfigStore(defaultConfigYaml, {
  storage: browserStorage(),
  isMac,
  onError: error => console.warn(t('配置','Configuration'),error),
});
function configuredLanguage() {
  const value = config.value.interface.language;
  if (value !== 'auto') return normalizeLanguage(value);
  const tag = navigator.language?.toLowerCase() ?? '';
  if (!tag.startsWith('zh')) return 'en';
  return normalizeLanguage(tag);
}
setLanguage(configuredLanguage());
const theme=createThemeController({root:document.documentElement,storage:null,preference:config.value.interface.theme});
configureMathFences(config.value.editing.smartFences);
const prefersReducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
let editor;
// Insert into the live field so MathLive selects the first placeholder.
// Creating the node with the source already set leaves the caret at offset 0.
function insertLiveMath(field, latex, notify = true) {
  const apply = () => {
    if (!field.isConnected) return;
    const name = /^\\([a-z]+)(?=$|\\mathord\{)/.exec(latex)?.[1];
    const operator = isMathOperatorWithBody(name);
    const start = field.selection.ranges[0]?.[0] ?? field.position;
    const source = operator && latex === '\\'+name
      ? latex+'\\mathord{\\placeholder{}}' : latex;
    field.executeCommand(['insert', source]);
    if (operator) focusInsertedOperator(field, start);
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
  if (display) {
    if (!latex) return insertFormula(editor, true, '');
    if (displayEnvironment(latex)) {
      return insertFormula(editor,true,latex,undefined,field=>field.executeCommand('moveToNextPlaceholder'));
    }
    return insertFormula(editor, true, '', undefined, field => insertLiveMath(field, latex));
  }
  if (!latex) {
    return insertFormula(editor, false, '', undefined, field => {
      field.toggleAttribute('data-lineae-default-displaystyle', true);
      field.focus();
    });
  }
  insertFormula(editor, false, '', undefined, field => insertLiveMath(field, latex));
}
const HistoryTable = Table.extend({
  addCommands() {
    const commands=this.parent();
    for (const name of ['insertTable','addColumnBefore','addColumnAfter','deleteColumn',
      'addRowBefore','addRowAfter','deleteRow','deleteTable','mergeCells','splitCell',
      'toggleHeaderRow','toggleHeaderColumn','toggleHeaderCell']) {
      const command=commands[name];
      commands[name]=(...args)=>props=>{
        const changed=command(...args)(props);
        if (changed && props.dispatch) closeHistory(props.tr);
        return changed;
      };
    }
    return commands;
  },
});
function insertDefaultTable() {
  return editor.chain().focus()
    .insertTable({rows:2,cols:2,withHeaderRow:false})
    .updateAttributes('table',{borderMode:'grid'}).run();
}
function insertEquation() {
  insertFormula(editor, true, '', undefined, field => insertLiveMath(field, '\\placeholder{}'), { delimiter:'equation' });
}
const matrixEnvironments = new Set(['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix']);
function matrixSource(name, content = '\\placeholder{}') {
  const environment = matrixEnvironments.has(name) ? name : 'matrix';
  return `\\begin{${environment}}${content}\\end{${environment}}`;
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
    editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(), undefined, {
      ...$from.parent.attrs, indentLevel:0, indent:true,
    }));
  }
  return true;
}
let backticks = null;
function replaceTypedLigatures(view, from, to, text, defaultTransaction) {
  const { autoReplaceLigatures, ligatures } = config.value.editing;
  if (!autoReplaceLigatures || from !== to || !/^[\s.,;:!?)]$/u.test(text)) return false;
  const before = view.state.doc.resolve(from).nodeBefore;
  if (!before?.isText || before.marks.some(mark => ['code', 'textCommand'].includes(mark.type.name)) || editor.isActive('code')) return false;
  const word = /[a-zA-Z]+$/.exec(before.text)?.[0];
  if (!word) return false;
  const patterns = Object.keys(ligatures).filter(key => ligatures[key]).sort((a,b) => b.length-a.length);
  if (!patterns.length) return false;
  const replacement = word.replace(new RegExp(patterns.join('|'), 'g'), letters => ligatures[letters]);
  if (replacement === word || defaultTransaction().getMeta('composition')) return false;
  view.dispatch(closeHistory(view.state.tr.insertText(replacement + text, from - word.length, to)));
  return true;
}
function listItemDepthAt($pos) {
  for(let depth=$pos.depth;depth>0;depth--) if($pos.node(depth).type.name==='listItem') return depth;
  return 0;
}
function listItemLevelAt($pos) {
  let level=0;
  for(let depth=$pos.depth;depth>0;depth--) if($pos.node(depth).type.name==='listItem') level++;
  return level;
}
function indentListItem(editor) {
  return canIndentList(editor,listItemLevelAt) && editor.chain().focus().sinkListItem('listItem').run();
}
function wholeBlockSelection(selection) {
  if (selection.empty) return false;
  let blocks=0, whole=true;
  selection.$from.doc.nodesBetween(selection.from,selection.to,(node,position)=>{
    if (!node.isTextblock) return;
    blocks++;
    if (position+1<selection.from || position+node.nodeSize-1>selection.to) whole=false;
    return false;
  });
  return blocks>0 && whole;
}
function exitEmptyListItem(editor) {
  const { selection }=editor.state;
  if (!selection.empty) return false;
  const $from=selection.$from;
  if ($from.parent.type.name!=='paragraph' || $from.parent.content.size) return false;
  const itemDepth=listItemDepthAt($from);
  if (!itemDepth) return false;
  const item=$from.node(itemDepth);
  const hasNestedList=item.content.content.some(child=>['bulletList','orderedList'].includes(child.type.name));
  if (item.textContent.trim() || hasNestedList) return false;
  let listLevels=0;
  for (let depth=1;depth<=$from.depth;depth++) {
    if (['bulletList','orderedList'].includes($from.node(depth).type.name)) listLevels++;
  }
  editor.view.focus();
  let lifted=false;
  while (editor.commands.liftEmptyBlock()) lifted=true;
  if (!lifted) return false;
  const position=editor.state.selection.$from.before();
  const paragraph=editor.state.doc.nodeAt(position);
  if (paragraph?.type.name==='paragraph') {
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position,undefined,{
      ...paragraph.attrs, indent:false, indentLevel:listLevels,
    }));
  }
  return true;
}
const codeFenceLanguages = new Set(('bash c cpp csharp css dart dockerfile elixir erlang go haskell html ini '+
  'java javascript js json jsonc kotlin latex less lua makefile markdown md perl php plaintext py python r ruby '+
  'rust sass scala scss shell sql swift tex toml typescript ts vue xml yaml yml zig').split(' '));
function applyCodeFenceLanguage(editor) {
  const { selection }=editor.state;
  if (!selection.empty) return false;
  const $from=selection.$from;
  if ($from.parent.type.name!=='codeBlock') return false;
  const text=$from.parent.textContent;
  const language=text.trim().toLowerCase();
  if ($from.parentOffset!==text.length || !codeFenceLanguages.has(language)) return false;
  const position=$from.before();
  const transaction=editor.state.tr
    .delete(position+1,position+1+text.length)
    .setNodeMarkup(position,undefined,{...$from.parent.attrs,language});
  transaction.setSelection(TextSelection.create(transaction.doc,position+1));
  editor.view.dispatch(transaction);
  return true;
}
const Shortcuts = Extension.create({
  name:'documentShortcuts',
  addProseMirrorPlugins:()=>[new Plugin({props:{
    handleTextInput(view,from,to,text,defaultTransaction) {
      const commandTrigger = text === '`' || text === '\\' || text === '$';
      if (view.composing || (commandTrigger && defaultTransaction().getMeta('composition'))) {
        backticks=null;
        return false;
      }
      const parent = view.state.doc.resolve(from).parent;
      if (text === '`' && parent.type.name !== 'codeBlock') {
        const now=performance.now();
        const continued=backticks && now-backticks.time<900 && backticks.doc===view.state.doc && backticks.pos===from;
        if (continued && backticks.count===2 && view.state.doc.textBetween(from-1,from)==='`') {
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
      if (replaceTypedLigatures(view,from,to,text,defaultTransaction)) return true;
      if(text==='\\') {showCommands();return true;}
      const mathInput=config.bindings.scopes.get('editor').some(binding=>binding.command==='dollar' &&
        !binding.second && binding.first===text);
      if(!mathInput)return false;
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
      ArrowRight:()=>enterFormula(true),
      ArrowLeft:()=>enterFormula(false),
      Backspace:()=>{
        const { selection, doc }=this.editor.state;
        if (selection instanceof NodeSelection && selection.node.type.name === 'mathBlock') {
          const previous=Selection.findFrom(doc.resolve(selection.from),-1,true);
          const tr=this.editor.state.tr.deleteSelection();
          if (previous) tr.setSelection(previous.map(tr.doc,tr.mapping));
          this.editor.view.dispatch(tr.scrollIntoView());
          return true;
        }
        if(!selection.empty)return false;
        const $from=selection.$from;
        if($from.parent.type.name==='paragraph' && $from.parentOffset===0 &&
            ['center','right'].includes($from.parent.attrs.align)) {
          this.editor.view.dispatch(this.editor.state.tr.setNodeMarkup($from.before(),undefined,{
            ...$from.parent.attrs,align:'left',
          }));
          return true;
        }
        if(this.editor.commands.undoInputRule())return true;
        const node=$from.nodeBefore;
        // A hard break with an empty line after it keeps the paragraph one line
        // tall. Deleting the last character of that line also removes the break,
        // so the text returns to the previous line instead of leaving a gap.
        if($from.parentOffset===$from.parent.content.size) {
          const parent=$from.parent;
          const last=parent.childCount>0?parent.child(parent.childCount-1):null;
          const before=parent.childCount>1?parent.child(parent.childCount-2):null;
          const trailingBreak=last?.type.name==='hardBreak'?last
            :last?.isText&&last.nodeSize===1&&before?.type.name==='hardBreak'?before:null;
          if(trailingBreak) {
            const from=selection.from-(last?.type.name==='hardBreak'?last.nodeSize:last.nodeSize+trailingBreak.nodeSize);
            this.editor.view.dispatch(this.editor.state.tr.delete(from,selection.from).scrollIntoView());
            return true;
          }
        }
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
            this.editor.view.dispatch(this.editor.state.tr.setNodeMarkup(position,undefined,{
              ...paragraph.attrs,indentLevel:0,indent:true,
            }));
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
          if(!listItemDepth && ['bulletList','orderedList'].includes(doc.resolve($from.before()).nodeBefore?.type.name)) {
            const before=$from.before();
            const previous=Selection.findFrom(doc.resolve(before),-1,true);
            if(previous) {
              const tr=this.editor.state.tr.delete(before,$from.after());
              this.editor.view.dispatch(tr.setSelection(previous.map(tr.doc,tr.mapping)).scrollIntoView());
              return true;
            }
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
      Enter:()=>Boolean(projectExplorer?.active && this.editor.state.selection.empty && this.editor.state.selection.$from.parentOffset===this.editor.state.selection.$from.parent.content.size && exitProjectHeading(this.editor))||applyCodeFenceLanguage(this.editor)||exitEmptyListItem(this.editor),
      Tab:()=>{
        if(this.editor.isActive('table'))return false;
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.insertContent(' '.repeat(indentWidthAt(this.editor.state.selection.$from)));
        }
        const { selection }=this.editor.state;
        if (!selection.empty && !wholeBlockSelection(selection)) {
          this.editor.view.dispatch(this.editor.state.tr.insertText('    '));
          return true;
        }
        if (listItemDepthAt(selection.$from)) {
          if (indentListItem(this.editor)) return true;
          // A single-item list has no previous sibling to sink under. Fall back
          // to plain text indentation instead of letting Tab move the focus
          // out of the editor.
          this.editor.view.dispatch(this.editor.state.tr.insertText('    '));
          return true;
        }
        if (!selection.empty) {
          if (setParagraphIndent(this.editor,true)) return true;
          this.editor.view.dispatch(this.editor.state.tr.insertText('    '));
          return true;
        }
        this.editor.view.dispatch(this.editor.state.tr.insertText('    '));
        return true;
      },
      'Shift-Tab':()=>{
        if(this.editor.isActive('table'))return false;
        const { selection }=this.editor.state;
        const { $from, empty }=selection;
        if (this.editor.isActive('codeBlock')) {
          if (empty && !$from.parent.type.spec.code) {
            const spaces=/ {1,4}$/.exec($from.parent.textBetween(0,$from.parentOffset,'\0','\0'));
            if (spaces) this.editor.view.dispatch(this.editor.state.tr.delete($from.pos-spaces[0].length,$from.pos));
          } else outdentCurrentLine(this.editor);
          return true;
        }
        if (!selection.empty && !wholeBlockSelection(selection)) {
          this.editor.view.dispatch(this.editor.state.tr.deleteSelection());
          return true;
        }
        if (listItemDepthAt($from)) {
          // At the outermost level there is nothing left to lift; keep the
          // focus in the editor instead of falling through to the browser.
          this.editor.chain().focus().liftListItem('listItem').run();
          return true;
        }
        if (!selection.empty) return setParagraphIndent(this.editor,false);
        if (empty && !$from.parent.type.spec.code) {
          const spaces=/ {1,4}$/.exec($from.parent.textBetween(0,$from.parentOffset,'\0','\0'));
          if (spaces) this.editor.view.dispatch(this.editor.state.tr.delete($from.pos-spaces[0].length,$from.pos));
        } else outdentCurrentLine(this.editor);
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
  extensions:[CounterDirective,AppendixStart,MatterStart,LayoutCommand,Lipsum,ProjectRegion,PageLayoutHistory,ConfigurableStarterKit.configure({heading:{levels:[1,2,3]},codeBlock:false}),LanguageCodeBlock,MultiSelection,PaperBehavior,TextStyle,TextCommand,Underline,Superscript,Subscript,SmallCaps,Boxed,Circled,PageBreak,MultiColumn,HistoryTable.configure({resizable:true}),TableRow,TableCell,TableHeader,TblrSource,TabularxSource,Raw,DocumentImage,TheoremBlock,DescriptionList,DescriptionItem,MathNode,MathBlock,MathGlue,Ref,Cite.configure({library:citationLibrary}),Footnote,Label,Subfigures,TableOfContents,Shortcuts],
  content:'<p></p>',
});
function installMarginSelection(editor,page,paper) {
  let drag=null;
  const blockAt=(clientY)=>{
    const paperRect=paper.getBoundingClientRect();
    const hit=editor.view.posAtCoords({left:paperRect.left+2,top:clientY});
    if (!hit) return null;
    const $pos=editor.state.doc.resolve(Math.max(0,Math.min(hit.pos,editor.state.doc.content.size)));
    let depth=$pos.depth;
    while(depth>0 && !$pos.node(depth).isTextblock) depth--;
    if (!depth) return null;
    return {from:$pos.before(depth)+1,to:$pos.after(depth)-1};
  };
  const extend=(clientY)=>{
    if (!drag) return;
    const block=blockAt(clientY);
    if (!block) return;
    const doc=editor.state.doc;
    const from=Math.min(drag.from,block.from), to=Math.max(drag.to,block.to);
    editor.view.dispatch(editor.state.tr
      .setSelection(TextSelection.between(doc.resolve(from),doc.resolve(to)))
      .scrollIntoView());
  };
  page.addEventListener('mousedown',event=>{
    if (event.button!==0 || event.isComposing) return;
    const paperRect=paper.getBoundingClientRect();
    const pageRect=page.getBoundingClientRect();
    if (event.clientX>=paperRect.left || event.clientX<pageRect.left) return;
    const block=blockAt(event.clientY);
    if (!block) return;
    event.preventDefault();
    drag={...block};
    editor.view.focus();
    extend(event.clientY);
    const move=pointer=>{ if(pointer.buttons)extend(pointer.clientY); };
    const finish=()=>{
      document.removeEventListener('mousemove',move,true);
      document.removeEventListener('mouseup',finish,true);
      drag=null;
    };
    document.addEventListener('mousemove',move,true);
    document.addEventListener('mouseup',finish,true);
  });
}
installMarginSelection(editor,documentPage,paper);
function syncTableAttributes() {
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== 'table') return;
    const dom = editor.view.nodeDOM(position);
    const table = dom?.tagName === 'TABLE' ? dom : dom?.querySelector?.('table');
    if (!table) return;
    syncTabularxWidths(table,node.attrs.tabularx);
    if(node.attrs.tblr)table.dataset.tblr='';
    else delete table.dataset.tblr;
    if (node.attrs.columns) table.dataset.columns = node.attrs.columns;
    else delete table.dataset.columns;
    if (node.attrs.booktabs) table.dataset.booktabs = 'true';
    else delete table.dataset.booktabs;
    table.dataset.borderMode=node.attrs.borderMode??'';
    if(node.attrs.leftRule)table.dataset.leftRule='true';
    else delete table.dataset.leftRule;
    if(node.attrs.rightRule)table.dataset.rightRule='true';
    else delete table.dataset.rightRule;
    if(node.attrs.middleVerticalRule)table.dataset.middleVerticalRule='true';
    else delete table.dataset.middleVerticalRule;
    table.dataset.verticalFirstRow=node.attrs.verticalFirstRow===false?'false':'true';
    if(node.attrs.topRule)table.dataset.topRule='true';
    else delete table.dataset.topRule;
    if(node.attrs.bottomRule)table.dataset.bottomRule='true';
    else delete table.dataset.bottomRule;
    if(node.attrs.midRuleMode&&node.attrs.midRuleMode!=='none')table.dataset.midRuleMode=node.attrs.midRuleMode;
    else delete table.dataset.midRuleMode;
    table.dataset.ruleStyle=node.attrs.ruleStyle??'solid';
    table.dataset.arrayStretch=String(node.attrs.arrayStretch??1);
    table.dataset.tableScale=String(node.attrs.tableScale??1);
    table.dataset.tableFontSize=node.attrs.fontSize??'';
    if(node.attrs.captionEnabled)table.dataset.captionEnabled='true';
    else delete table.dataset.captionEnabled;
    table.style.setProperty('--table-line-width',node.attrs.ruleWidth??node.attrs.borderWidth??'0.4pt');
    table.style.setProperty('--table-array-stretch',String(node.attrs.arrayStretch??1));
    const fontSizes={small:'0.9em',footnotesize:'0.8em',scriptsize:'0.7em'};
    table.style.setProperty('--table-font-size',fontSizes[node.attrs.fontSize]??node.attrs.fontSize??'inherit');
    table.style.setProperty('--table-scale',String(node.attrs.tableScale??1));
    if(node.attrs.columnLayout)table.dataset.columnLayout=node.attrs.columnLayout;
    else delete table.dataset.columnLayout;
    if(node.attrs.columnRules)table.dataset.columnRules='true';
    else delete table.dataset.columnRules;
    if(node.attrs.horizontalRuleMode)table.dataset.horizontalRuleMode=node.attrs.horizontalRuleMode;
    else delete table.dataset.horizontalRuleMode;
    const trailingRule=(node.attrs.trailingRules??[]).find(rule=>/^\\?(toprule|midrule|bottomrule|hline)$/.test(String(rule)));
    if(trailingRule)table.dataset.trailingRule=String(trailingRule).replace(/^\\/,'');
    else delete table.dataset.trailingRule;
    if(node.attrs.align)table.dataset.tableAlign=node.attrs.align;
    else delete table.dataset.tableAlign;
    table.style.setProperty('--table-rule-width',node.attrs.borderWidth??'0.4pt');
    table.style.setProperty('--arrayrulewidth',node.attrs.borderWidth??'0.4pt');
  });
}
editor.on('update',()=>{refreshReferences(paper,editor);syncTableAttributes();});
syncTableAttributes();
installTableHoverAddRow(editor, paper);
installImageDrop(editor,paper);
const documentFind = installDocumentFind(editor);
const documentOutline = installDocumentOutline(editor);
const tools=document.querySelector('#insert');
tools.replaceChildren();
function button(label, action) {
  const control=document.createElement('button');
  control.type='button'; control.textContent=label; control.dataset.sourceAction=label;
  control.addEventListener('mousedown',event=>event.preventDefault());
  control.addEventListener('click',action);
  tools.append(control);
  return control;
}
const undoButton=button('↶',undoDocument);
const redoButton=button('↷',redoDocument);
const boldButton=button('B',()=>editor.chain().focus().toggleBold().run());
const italicButton=button('I',()=>editor.chain().focus().toggleItalic().run());
const underlineButton=button('U',()=>editor.chain().focus().toggleMark('underline').run());
function syncUndoButtons(){
  try{
    const source=!sourceView.hidden;
    const canUndo=source?sourceModeCommits.length||sourceView.canUndo?.():editor.can().undo();
    const canRedo=source?sourceModeRedos.length||sourceView.canRedo?.():editor.can().redo();
    undoButton.disabled=!canUndo;
    redoButton.disabled=!canRedo;
    if(homeRibbon?.refs){
      homeRibbon.refs.undo.disabled=!canUndo;
      homeRibbon.refs.redo.disabled=!canRedo;
    }
  }catch{}
}
editor.on('transaction',()=>{
  for(const [button,mark] of [[boldButton,'bold'],[italicButton,'italic'],[underlineButton,'underline']]) {
    button.setAttribute('aria-pressed',String(editor.isActive(mark)));
  }
  syncUndoButtons();
});
let editingMath = null;
installFormatControls(editor, tools, {isUnavailable:()=>Boolean(activeMath())});
const headingMenu = document.createElement('select');
headingMenu.setAttribute('aria-label', t('段落样式','Paragraph style'));
const textStyleOption = new Option(t('正文','Text'), '0');
textStyleOption.dataset.zh='正文';textStyleOption.dataset.en='Text';
headingMenu.append(textStyleOption);
for (const [value, label] of [['1','section'],['2','subsection'],['3','subsubsection']]) headingMenu.append(new Option(label, value));
headingMenu.addEventListener('change', () => {
  const level = Number(headingMenu.value);
  if (level) editor.chain().focus().setHeading({ level, command:null }).run();
  else editor.chain().focus().setParagraph().run();
});
editor.on('transaction', () => { headingMenu.value = String(editor.getAttributes('heading').level ?? 0); });
// 旧工具栏不再挂载 headingMenu（样式下拉已从主页-样式移除）。
button('itemize',()=>editor.chain().focus().toggleBulletList().run());
button('enumerate',()=>editor.chain().focus().toggleOrderedList().run());
button('▦',()=>insertDefaultTable());
document.addEventListener('focusin', event => {
  if (event.target.closest?.('.delimiter-input-embedded')) return;
  const field=event.composedPath().find(element=>element?.tagName==='MATH-FIELD');
  if(field || paper.contains(event.target) || event.target.closest?.('.tex-workspace')) {
    if(editingMath && editingMath!==field) editingMath.dispatchEvent(new Event('lineae-commit-fences'));
    editingMath=field ?? null;
  }
},true);
function activeMath() {
  if(document.activeElement?.tagName==='MATH-FIELD') return document.activeElement;
  return editingMath?.isConnected ? editingMath : null;
}
function mathPositionPath(model, offset) {
  const path=[];
  for (let atom=model.at(offset); atom?.parent; atom=atom.parent) {
    const branch=atom.parentBranch;
    path.unshift([branch,atom.parent.branch(branch).indexOf(atom)]);
  }
  return path;
}
function preserveMathSelection(field, update) {
  const model=field._mathfield?.model;
  const selection=structuredClone(field.selection);
  const paths=model && selection.ranges.map(range=>range.map(offset=>mathPositionPath(model,offset)));
  update();
  const updated=field._mathfield?.model;
  if (!paths || !updated) return;
  const ranges=paths.map((range,index)=>range.map((path,end)=>{
    let atom=updated.root;
    for (const [branch,child] of path) {
      if (Array.isArray(branch) && (!atom || atom.type!=='array' || branch[0]>=atom.rowCount || branch[1]>=atom.colCount)) {
        atom=null;
        break;
      }
      atom=atom?.branch(branch)?.[child];
    }
    const offset=atom ? updated.offsetOf(atom) : -1;
    return offset>=0 ? offset : Math.min(selection.ranges[index][end],field.lastOffset);
  }));
  field.selection={...selection,ranges};
}
function addAlignmentPair(field) {
  const position=field.closest('[data-math-view]')?.getMathPosition?.();
  const node=typeof position==='number' && editor.state.doc.nodeAt(position);
  const latex=node && appendAlignmentPair(node.attrs.latex);
  if (!latex) return false;
  preserveMathSelection(field,()=>editor.view.dispatch(
    editor.state.tr.setNodeMarkup(position,undefined,{...node.attrs,latex}),
  ));
  return true;
}
function arrayAtCaret(field) {
  const model=field._mathfield?.model;
  if(!model)return null;
  for(let atom=model.at(field.position);atom;atom=atom.parent) {
    if(atom.type==='array')return atom;
  }
  return null;
}
function emptyCell(array,row,col) {
  const branch=array.branch([row,col]);
  return Array.isArray(branch)&&branch.length===1&&branch[0]?.type==='first';
}
// Add a row or column to the matrix that holds the caret. MathLive inserts the
// structure; the cells it leaves empty get a visible placeholder box. Doing this
// on the model keeps the change local: rewriting field.value reparsed the whole
// formula and could land the box in a different matrix.
// Returns false when the caret is not inside a matrix, so the caller can apply
// the command to the surrounding table instead.
function fillMatrixAxis(field, axis) {
  if (axis==='column' && addAlignmentPair(field)) return true;
  field.focus();
  const model=field._mathfield?.model;
  const array=arrayAtCaret(field);
  const branch=model?.at(field.position)?.parentBranch;
  const caret=Array.isArray(branch)?branch:null;
  if (!array || !caret) return false;
  const [row,col]=caret;
  const selection=structuredClone(field.selection);
  const original=selection.ranges.map(range=>range.map(offset=>model.at(offset)));
  field.executeCommand(axis==='row'?'addRowAfter':'addColumnAfter');
  // MathLive may replace the array atom when the structure changes, so look it
  // up again instead of mutating the one captured before the command.
  const updated=arrayAtCaret(field) ?? array;
  const rows=updated.rowCount, cols=updated.colCount;
  const added=[];
  if (axis==='row') {
    const target=Math.min(row+1,rows-1);
    for (let column=0;column<cols;column++) added.push([target,column]);
  } else {
    const target=Math.min(col+1,cols-1);
    for (let line=0;line<rows;line++) added.push([line,target]);
  }
  for (const [line,column] of added) {
    if (!emptyCell(updated,line,column)) continue;
    const offset=model.offsetOf(updated.branch([line,column])[0]);
    if (offset<0) continue;
    field.position=offset;
    field.executeCommand(['insert','\\placeholder{}']);
  }
  // Keep the caret where the author left it; only the new cells are filled.
  const ranges=original.map(range=>range.map(atom=>model.offsetOf(atom)));
  if (ranges.every(range=>range.every(offset=>offset>=0))) field.selection={...selection,ranges};
  field.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
}
// Ctrl+E R / C inside a table cell that holds a formula: the formula has no
// matrix to grow, so the command belongs to the table around it.
function editTableAxis(axis) {
  if (!editor.isActive('table')) return;
  const chain=editor.chain().focus(undefined,{scrollIntoView:false});
  if (axis==='row') chain.addRowAfter().run();
  else chain.addColumnAfter().run();
}
function addMatrixRow() {
  const field=activeMath();
  if(!field) { editor.chain().focus(undefined,{scrollIntoView:false}).addRowAfter().run(); return; }
  if(!fillMatrixAxis(field,'row')) editTableAxis('row');
}
function addMatrixColumn() {
  const field=activeMath();
  if(!field) { editor.chain().focus(undefined,{scrollIntoView:false}).addColumnAfter().run(); return; }
  if(!fillMatrixAxis(field,'column')) editTableAxis('column');
}
button('＋ Row',addMatrixRow);
button('＋ Column',addMatrixColumn);
button('$',()=>insertMath());
button('$$',()=>insertMath(true)).dataset.shortcut='editor.insertDisplayMath';
const projectDocument=new ProjectDocumentSession();
let projection, syncApplying = false, syncPending = false, sourceToolbar, projectExplorer, projectFileKind, projectPresentation;
let splitMapping;
function splitBlocks(text) {
  if (syncPending || projection?.text !== text) return [];
  const doc=editor.state.doc;
  if (splitMapping?.doc === doc && splitMapping.projection === projection) return splitMapping.blocks;
  const positions=[];
  doc.forEach((_,position)=>positions.push(position));
  const crlf=text.includes('\r\n');
  const normalize=offset=>crlf ? text.slice(0,offset).replace(/\r\n/g,'\n').length : offset;
  const blocks=projection.blocks.filter(block=>block.count).map(block=>({
    from:normalize(block.from), to:normalize(block.to),
    first:positions[block.index], last:positions[block.index+block.count-1],
  }));
  splitMapping={doc,projection,blocks};
  return blocks;
}
const sourceView = createSourceWorkspace({
  configurableKeys: true,
  page: documentPage,
  previewRange(offset, text) {
    const blocks = splitBlocks(text);
    const block = blocks.find(entry => offset < entry.to) ?? blocks.at(-1);
    if (!block) return;
    const first=editor.view.nodeDOM(block.first);
    const last=editor.view.nodeDOM(block.last);
    if (first?.getBoundingClientRect && last?.getBoundingClientRect)
      return [first.getBoundingClientRect().top,last.getBoundingClientRect().bottom];
  },
  sourceRange(y, text) {
    const blocks = splitBlocks(text);
    return (blocks.find(entry => editor.view.nodeDOM(entry.last)?.getBoundingClientRect?.().bottom > y) ?? blocks.at(-1))?.from;
  },
  getPreferences:()=>config.value,
  onSourceFontChange:value=>{if(config.value.interface.sourceFontSize!==value)config.updateInterface({sourceFontSize:value});},
  render: text => {
    if (projectFileKind === 'bib') return;
    if (editor.view.composing) return false;
    // Opening Split can request the preview that load() has just mounted.
    if (!projectExplorer?.active && !syncPending && text === importedSource &&
        projection?.text === text && importedSnapshot === JSON.stringify(editor.getJSON())) return;
    const selection = editor.state.selection;
    syncApplying = true;
    try {
      load(text, false);
      const max = editor.state.doc.content.size;
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.between(
        editor.state.doc.resolve(Math.min(selection.anchor,max)), editor.state.doc.resolve(Math.min(selection.head,max)))));
      projection = sourceProjection(text,editor.getJSON(), {fragment:projectFileKind === 'tex'});
      syncPending = false;
    } finally { syncApplying = false; }
  },
  onPreviewZoom: value => setZoom(value),
  onChange: () => { syncPending = true; projectExplorer?.changed(); },
  onLayout: () => updateSourceButton(),
  metadata: () => ({name: filename, saved: savedSource}),
});
let sourceModeEntry,sourceModeCommits=[],sourceModeRedos=[];
function checkpointLayoutMatches(checkpoint,expected){
  if(!checkpoint.owner||checkpoint.owner===projectExplorer?.model?.activeFileId)return true;
  const current=projectExplorer.model.file(checkpoint.owner).draft;
  return JSON.stringify(readPageSetup(parseDocument(current,{fragment:true})?.start??''))===JSON.stringify(readPageSetup(parseDocument(expected,{fragment:true})?.start??''));
}
function restoreSourceCheckpoint(text,owner,expected) {
  if(owner&&projectExplorer?.active&&owner!==projectExplorer.model.activeFileId){
    const current=projectExplorer.model.file(owner).draft;
    const next=current===expected?text:writePageSetup(current,readPageSetup(parseDocument(text,{fragment:true})?.start??''));
    projectExplorer.model.edit(owner,next);applyPageSetup();projectExplorer.changed();if(sourceView.hidden)editor.view.focus();return;
  }
  const selection=editor.state.selection;
  if(projectExplorer?.active)projectExplorer.model.edit(projectExplorer.model.activeFileId,text);
  load(text,false);sourceView.reset(text);
  const max=editor.state.doc.content.size;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.between(
    editor.state.doc.resolve(Math.min(selection.anchor,max)),editor.state.doc.resolve(Math.min(selection.head,max)))));
  showProjectComposition();
  editor.commands.focus();
}
function undoDocument() {
  if(sourceView.hidden&&!editor.view.composing)editor.view.domObserver.flush();
  const checkpoint=sourceModeCommits.at(-1);
  if(!sourceView.hidden&&!(checkpoint?.owner&&checkpoint.sourceText===sourceView.value)){sourceView.undo();sourceView.flush();return true;}
  if(checkpoint && editor.state.doc===checkpoint.afterDoc && documentParts.start===checkpoint.afterPreamble&&checkpointLayoutMatches(checkpoint,checkpoint.after)){
    sourceModeCommits.pop();sourceModeRedos.push(checkpoint);restoreSourceCheckpoint(checkpoint.before,checkpoint.owner,checkpoint.after);
  syncUndoButtons();
    checkpoint.beforeDoc=editor.state.doc;checkpoint.beforePreamble=documentParts.start;return true;
  }
  if(!sourceView.hidden){sourceView.undo();sourceView.flush();syncUndoButtons();return true;}
  const done=editor.commands.undo();syncUndoButtons();return done;
}
function redoDocument() {
  const checkpoint=sourceModeRedos.at(-1);
  if(!sourceView.hidden&&!(checkpoint?.owner&&checkpoint.sourceText===sourceView.value)){sourceView.redo();sourceView.flush();return true;}
  if(checkpoint && editor.state.doc===checkpoint.beforeDoc && documentParts.start===checkpoint.beforePreamble&&checkpointLayoutMatches(checkpoint,checkpoint.before)){
    sourceModeRedos.pop();sourceModeCommits.push(checkpoint);restoreSourceCheckpoint(checkpoint.after,checkpoint.owner,checkpoint.before);
  syncUndoButtons();
    checkpoint.afterDoc=editor.state.doc;checkpoint.afterPreamble=documentParts.start;return true;
  }
  if(!sourceView.hidden){sourceView.redo();sourceView.flush();syncUndoButtons();return true;}
  const done=editor.commands.redo();syncUndoButtons();return done;
}
paper.addEventListener('focusin', () => { if (!sourceView.hidden && syncPending) sourceView.flush(); syncUndoButtons(); });
function usesSourceProjection() {
  let referenceSource=false;
  editor.state.doc.descendants(node=>{if(node.attrs.sourceCommand||node.attrs.labelSource||node.attrs.environmentSource)referenceSource=true;});
  return referenceSource || !sourceView.hidden || (projectExplorer?.active && projectFileKind==='tex') ||
    editor.getJSON().content.some(node=>node.type==='raw'||node.attrs?.tblr||node.attrs?.tabularx||node.attrs?.figureSource);
}
// Limit standalone writeback to text edits within one top-level paragraph.
function standaloneParagraphEdit(tr) {
  if (!sourceView.hidden || projectExplorer?.active || importedSource===null) return -1;
  const {before,doc}=tr;
  if (!before.sameMarkup(doc) || before.childCount!==doc.childCount) return -1;
  const start=before.content.findDiffStart(doc.content);
  if (start===null) return -1;
  const end=before.content.findDiffEnd(doc.content);
  const a=before.resolve(start), b=doc.resolve(start);
  if (a.depth!==1 || b.depth!==1 || a.parent.type.name!=='paragraph' || !a.parent.sameMarkup(b.parent) ||
      a.parent.textContent===b.parent.textContent) return -1;
  // Identical runs can make the diff endpoints overlap on insertion/deletion.
  const oldEnd=Math.max(start,end.a), newEnd=Math.max(start,end.b);
  // Introducing a new formatting mark is an authoring command (for example,
  // creating a new box), with its own package-generation behavior.
  const priorRuns=a.parent.content.content;
  const inline = a.sameParent(before.resolve(oldEnd)) && b.sameParent(doc.resolve(newEnd)) &&
    a.parent.content.cut(a.parentOffset,oldEnd-a.start()).content.every(node=>node.isText) &&
    b.parent.content.cut(b.parentOffset,newEnd-b.start()).content.every(node=>node.isText &&
      (!node.marks.length || priorRuns.some(run=>run.sameMarkup(node))));
  return inline ? a.index(0) : -1;
}
function refuseStandaloneWriteback() {
  const status=document.querySelector('#status');
  status.hidden=false;
  status.textContent=t('该修改无法无损回写，请在源码中编辑；原文已保留。','This edit cannot round-trip safely. Edit the source; original text is preserved.');
  return false;
}
editor.registerPlugin(new Plugin({
  state: {
    init:()=>false,
    apply:tr=>!!(tr.getMeta('standaloneParagraph') || tr.getMeta('appendedTransaction')?.getMeta('standaloneParagraph')),
  },
  props: {handleKeyDown(view,event) {
    if (sourceView.hidden || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return false;
    if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (event.key.toLowerCase() === 'y' || event.shiftKey) sourceView.redo(); else sourceView.undo();
      sourceView.flush(); return true;
    }
    return false;
  }},
  filterTransaction(transaction,state) {
    if (!transaction.docChanged || syncApplying) return true;
    // A plugin may append transactions before Tiptap emits the original update.
    // Its extra document changes have no authority over the approved source range.
    if(state!==editor.state && this.getState(state) && !transaction.doc.eq(state.doc))return refuseStandaloneWriteback();
    if(projectDocument.composition){
      const valid=projectDocument.changes(transaction.doc.toJSON());
      if(!valid)sourceView.error(t('请在对应文件的源码中修改此结构','Edit this structure in its source file'));
      return !!valid;
    }
    if(!usesSourceProjection()) {
      const index=standaloneParagraphEdit(transaction);
      if (index<0) return true;
      const current=transaction.before.toJSON();
      const prepared=!syncPending && transaction.before===editor.state.doc &&
        standaloneParagraphDraft(importedSource,projection,importedSnapshot,current,transaction.doc.toJSON(),index);
      if (prepared) {
        transaction.setMeta('standaloneParagraph',prepared);
        return true;
      }
      return refuseStandaloneWriteback();
    }
    const changes = !syncPending && richSourceChanges(projection,transaction.doc.toJSON());
    if (!changes) {
      sourceView.error(t('该修改无法无损回写，请在源码中编辑；原文已保留','This edit cannot round-trip safely. Edit the source; original text is preserved.'));
      return false;
    }
    return true;
  },
}));
editor.on('update', ({transaction}) => {
  if (syncApplying) return;
  const paragraph=transaction.getMeta('standaloneParagraph');
  if (paragraph && editor.state.doc.eq(transaction.doc)) {
    if(sourceView.value===importedSource)sourceView.applyChanges(paragraph.changes);
    importedSource=paragraph.draft;
    importedSnapshot=JSON.stringify(editor.getJSON());
    documentParts=parseDocument(importedSource);
    projection=paragraph.projection;
    return;
  }
  if(projectDocument.composition){
    const updates=projectDocument.changes(editor.getJSON());
    if(updates){
      const rootId=projectDocument.composition.rootId;
      const original=projectDocument.composition.sources.get(rootId);
      const oldPreamble=parseDocument(original,{fragment:true})?.start??'';
      const storedLayout=editor.state.doc.attrs.layoutPreamble;
  const preamble=typeof storedLayout==='string' && JSON.stringify(readPageSetup(storedLayout))!==JSON.stringify(readPageSetup(documentParts.start)) ? writePageSetup(documentParts.start,readPageSetup(storedLayout)) : documentParts.start;
      if(typeof preamble==='string' && preamble!==oldPreamble){
        updates.set(rootId,preamble+updates.get(rootId).slice(oldPreamble.length));
      }
      if(typeof preamble==='string' && preamble!==documentParts.start){
        documentParts.start=preamble;pageSetup=readPageSetup(preamble);applyPageSetup();
      }
      for(const [id,text] of updates)projectExplorer.model.edit(id,text);
      const text=updates.get(projectDocument.composition.rootId);
      if(text!==undefined)sourceView.reset(text);
      projectExplorer.changed();
    }
    return;
  }
  const storedLayout=editor.state.doc.attrs.layoutPreamble;
  const preamble=typeof storedLayout==='string' && JSON.stringify(readPageSetup(storedLayout))!==JSON.stringify(readPageSetup(documentParts.start)) ? writePageSetup(documentParts.start,readPageSetup(storedLayout)) : documentParts.start;
  if (typeof preamble==='string' && preamble!==documentParts.start) {
    const previous=documentParts.start;
    documentParts.start=preamble;
    if(importedSource?.startsWith(previous))importedSource=preamble+importedSource.slice(previous.length);
    if(projectExplorer?.active){
      const old=sourceView.value;
      if(old.startsWith(previous))sourceView.applyChanges([{from:0,to:previous.length,insert:preamble}]);
    }
    pageSetup=readPageSetup(preamble);applyPageSetup();projectExplorer?.changed();
  }
  if(!usesSourceProjection())return;
  const changes = richSourceChanges(projection,editor.getJSON());
  if (!changes?.length) return;
  sourceView.applyChanges(changes);
  importedSource = sourceView.value;
  importedSnapshot = JSON.stringify(editor.getJSON());
  documentParts = parseDocument(importedSource,{fragment:projectFileKind==='tex'});
  projection = sourceProjection(importedSource,editor.getJSON(), {fragment:projectFileKind === 'tex'});
  projectExplorer?.changed();
  sourceView.error('');
});
let documentParts=parseDocument(DEFAULT_DOCUMENT_SOURCE);
let pageSetup=readPageSetup(documentParts.start);
let typesetPagination;
let headerFooterPanel;
let homeRibbon;
let imagePanel;
let imageSelection = null;
let pagePaper,pageOrientation,pageMarginPreset,pageMarginTop,pageMarginRight,pageMarginBottom,pageMarginLeft,layoutColumns,layoutLocalColumns;
function applyFurnitureState(state){
  const before=documentParts.start;
  const after=writePageFurniture(before,state);
  if(after===before)return;
  if(!sourceView.hidden){
    const current=sourceView.value;
    const preamble=parseDocument(current,{fragment:true})?.start??'';
    sourceView.applyChanges([{from:0,to:preamble.length,insert:after}]);
    sourceView.flush();
  }
  documentParts.start=after;
  if(importedSource?.startsWith(before))importedSource=after+importedSource.slice(before.length);
  if(JSON.stringify(editor.state.doc.attrs.pageFurniture)!==JSON.stringify(state)){
    editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute('pageFurniture',state));
  }
  if(projection)projection=sourceProjection(importedSource??source(),editor.getJSON(),{fragment:projectFileKind==='tex'});
  pageSetup=readPageSetup(documentParts.start);
  applyPageSetup();
  projectExplorer?.changed();
}
function updateImageSpacing(spacing){
  const before=documentParts.start;
  const after=writeImageSpacing(before,spacing);
  if(after===before)return;
  if(!sourceView.hidden){
    const current=sourceView.value;
    const preamble=parseDocument(current,{fragment:true})?.start??'';
    sourceView.applyChanges([{from:0,to:preamble.length,insert:after}]);
    sourceView.flush();
  }
  documentParts.start=after;
  if(importedSource?.startsWith(before))importedSource=after+importedSource.slice(before.length);
  applyPageSetup();
  projectExplorer?.changed();
}
function tikzMacroNames(source) {
  const names = new Set();
  const pattern = /\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand|def|gdef|edef|xdef)\*?\s*\{?\s*\\([A-Za-z@]+)/g;
  for (const match of source.matchAll(pattern)) names.add(match[1]);
  for (const match of source.matchAll(/\\(?:newenvironment|renewenvironment)\s*\{([^{}]+)\}/g)) names.add(match[1]);
  return names;
}

function tikzLibraries(source) {
  const names = [];
  for (const match of source.matchAll(/\\usetikzlibrary(?:\[[^\]]*\])?\{([^{}]+)\}/g)) {
    names.push(...match[1].split(',').map(item => item.trim()).filter(Boolean));
  }
  return names;
}

function applyTikzPreamble(after) {
  const before = documentParts.start;
  if (after === before) return;
  if (!sourceView.hidden) {
    const current = sourceView.value;
    const preamble = parseDocument(current, { fragment: true })?.start ?? '';
    sourceView.applyChanges([{ from: 0, to: preamble.length, insert: after }]);
    sourceView.flush();
  }
  documentParts.start = after;
  if (importedSource?.startsWith(before)) importedSource = after + importedSource.slice(before.length);
  if (editor.state.doc.attrs.layoutPreamble !== after) {
    editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute('layoutPreamble', after));
  }
  pageSetup = readPageSetup(documentParts.start);
  applyPageSetup();
  projectExplorer?.changed();
}

function insertTikzStudioBlock({ libraries = [], macros = [], declarations = '', body = '' } = {}) {
  body = body
    .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^{}]+\}[^\n]*(?:\r?\n|$)/m, '')
    .replace(/^\s*\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^{}]*\}[^\n]*(?:\r?\n|$)/gm, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .trim();
  const before = documentParts.start;
  const existingMacros = tikzMacroNames(before);
  const seen = new Set();
  const duplicates = [];
  for (const macro of macros) {
    if (existingMacros.has(macro.name) || seen.has(macro.name)) duplicates.push(macro.name);
    seen.add(macro.name);
  }
  if (duplicates.length) return { duplicates: [...new Set(duplicates)] };

  const allLibraries = [...new Set([...tikzLibraries(before), ...libraries])]
    .sort((a, b) => a.localeCompare(b));
  const sortedMacros = [...macros].sort((a, b) => a.name.localeCompare(b.name)).map(macro => macro.text.trim());
  const declarationText = String(declarations || '')
    .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^{}]+\}[^\n]*(?:\r?\n|$)/gm, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .replace(/^\s*\\usetikzlibrary(?:\[[^\]]*\])?\{[^{}]*\}[ \t]*$/gm, '')
    .trim();
  const preambleAdditions = declarationText ? [declarationText] : sortedMacros;
  const beginAt = before.indexOf('\\begin{document}');
  if (beginAt >= 0) {
    let preamble = before.slice(0, beginAt)
      .replace(/\\usetikzlibrary(?:\[[^\]]*\])?\{[^{}]*\}[ \t]*(?:\r?\n)?/g, '');
    const additions = [
      allLibraries.length ? `\\usetikzlibrary{${allLibraries.join(',')}}` : '',
      ...preambleAdditions,
    ].filter(Boolean).join('\n');
    const after = preamble.replace(/\s+$/, '') + (additions ? `\n${additions}` : '') + '\n' + before.slice(beginAt);
    applyTikzPreamble(after);
  } else {
    body = [allLibraries.length ? `\\usetikzlibrary{${allLibraries.join(',')}}` : '', ...preambleAdditions, body]
      .filter(Boolean).join('\n');
  }
  if (body.trim()) {
    editor.chain().focus().insertContent({
      type: 'codeBlock', attrs: { language: 'tikz-general' },
      content: [{ type: 'text', text: body.trim() }],
    }).run();
  }
  return { ok: true };
}

function updateGlobalColumns(count){  const before=documentParts.start;
  const after=writeGlobalColumns(before,count);
  if(after===before)return;
  if(!sourceView.hidden){
    const current=sourceView.value;
    const preamble=parseDocument(current,{fragment:true})?.start??'';
    sourceView.applyChanges([{from:0,to:preamble.length,insert:after}]);
    sourceView.flush();
  }
  documentParts.start=after;
  if(importedSource?.startsWith(before))importedSource=after+importedSource.slice(before.length);
  applyPageSetup();
}
function applyPageSetup(){
  const layoutPreamble=projectFileKind==='tex'?projectLayoutPreamble(projectExplorer?.model,documentParts.start):documentParts.start;
  if(layoutPreamble!==documentParts.start)pageSetup=readPageSetup(layoutPreamble);
  documentPage.dataset.indentFirst=String(new RegExp("\\\\usepackage(?:\\[[^\\]]*\\])?\\{[^}]*\\bindentfirst\\b[^}]*\\}").test(layoutPreamble));
  const imageSpacing=readImageSpacing(layoutPreamble);
  const spacingCss=value=>String(value??'').match(/-?\d+(?:\.\d+)?(?:pt|mm|cm|in)/)?.[0]??'0pt';
  documentPage.style.setProperty('--image-textfloatsep',spacingCss(imageSpacing.textfloatsep));
  documentPage.style.setProperty('--image-intextsep',spacingCss(imageSpacing.intextsep));
  documentPage.style.setProperty('--image-floatsep',spacingCss(imageSpacing.floatsep));
  documentPage.style.setProperty('--image-columnsep',spacingCss(imageSpacing.columnsep));
  imagePanel?.setSpacing?.(imageSpacing);
  const globalColumns=readGlobalColumns(layoutPreamble);
  documentPage.dataset.globalColumns=String(globalColumns);
  documentPage.dataset.captionLanguage=/\\usepackage(?:\[[^\]]*\])?\{ctex\}/.test(layoutPreamble)?'zh':'en';
  if(layoutColumns)layoutColumns.value=String(globalColumns);
  const metrics=pageMetrics(pageSetup);
  documentPage.style.setProperty('--page-width',metrics.width);
  documentPage.style.setProperty('--page-height',metrics.height);
  documentPage.style.setProperty('--page-margin-top',metrics.margins.top);
  documentPage.style.setProperty('--page-margin-right',metrics.margins.right);
  documentPage.style.setProperty('--page-margin-bottom',metrics.margins.bottom);
  documentPage.style.setProperty('--page-margin-left',metrics.margins.left);
  typesetPagination?.update(layoutPreamble);
  typesetPagination?.setMaketitle(/\\maketitle\b/.test((documentParts.blocks??[]).join('\n')));
  if(headerFooterPanel && !headerFooterPanel.active)headerFooterPanel.refresh();
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
  const project=projectExplorer?.model;
  if(projectFileKind==='tex'&&project&&project.activeFileId!==project.mainFileId){
    if(sourceView.composing||editor.view.composing)return;
    if(!sourceView.hidden)sourceView.flush();
    const owner=project.mainFileId,before=project.file(owner).draft;
    const preamble=parseDocument(before,{fragment:true})?.start;
    if(!preamble)return;
    const after=writePageSetup(before,mergePageLayout(readPageSetup(preamble),patch));
    if(after!==before){project.edit(owner,after);sourceModeCommits.push({owner,before,after,afterDoc:editor.state.doc,afterPreamble:documentParts.start,sourceText:sourceView.value});
syncUndoButtons();sourceModeRedos=[];}
    applyPageSetup();projectExplorer.changed();return;
  }
  pageSetup=changePageLayout({editor,sourceView,current:pageSetup,preamble:documentParts.start,patch});
  applyPageSetup();
}
let filename='lineae.tex';
let fileHandle=null;
let savedSource='';
let documentGeneration=0;
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
function persistCitationState() {
  const paths = projectDependencies(source()).filter(path => path.endsWith('.bib'));
  const metadata = writeBibliographyMetadata(documentParts.start, citationLibrary.exportState({ paths }));
  documentParts.start = metadata;
  if (importedSource) importedSource = writeBibliographyMetadata(importedSource, citationLibrary.exportState({ paths }));
  refreshReferences(paper);
}
const metaBar=document.createElement('section');metaBar.id='document-meta';
const metaTitle=document.createElement('div');metaTitle.className='doc-title';
const metaAuthor=document.createElement('div');metaAuthor.className='doc-author';
const metaDate=document.createElement('div');metaDate.className='doc-date';
metaBar.append(metaTitle,metaAuthor,metaDate);documentPage.prepend(metaBar);
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
let metaDateDisplay='';
function todayText(){
  const locale=document.documentElement.lang?.toLowerCase().startsWith('zh')?'zh-CN':'en-US';
  return new Intl.DateTimeFormat(locale,{year:'numeric',month:'long',day:'numeric'}).format(new Date());
}
function displayDate(raw){return raw.replace(/\\today\b/g,todayText()).trim();}
metaDate.contentEditable='true';metaDate.spellcheck=false;
metaDate.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();metaDate.blur();}});
metaDate.addEventListener('blur',()=>{
  const value=metaDate.textContent.trim();
  if(value!==metaDateDisplay)writeMeta('date',value);
  else renderMeta();
});
function renderMeta() {
  metaTitle.textContent=readMeta('title');
  metaAuthor.textContent=readMeta('author');
  const hasDate=/\\date\s*\{/.test(documentParts.start);
  const rawDate=readMeta('date');
  const showDefault=!hasDate&&Boolean(readMeta('title'));
  metaDateDisplay=hasDate?displayDate(rawDate):showDefault?todayText():'';
  metaDate.textContent=metaDateDisplay;
  metaDate.hidden=!metaDateDisplay;
  metaTitle.dataset.zhPlaceholder='标题';metaTitle.dataset.enPlaceholder='Title';metaTitle.dataset.placeholder=t('标题','Title');
  metaAuthor.dataset.zhPlaceholder='作者';metaAuthor.dataset.enPlaceholder='Author';metaAuthor.dataset.placeholder=t('作者','Author');
  metaDate.dataset.zhPlaceholder='日期';metaDate.dataset.enPlaceholder='Date';metaDate.dataset.placeholder=t('日期','Date');
}
renderMeta();
const engineProfile = getTypesettingProfile(document.documentElement.dataset.typesettingEngine ?? 'xelatex');
if (engineProfile.capabilities.browserLayout !== 'supported') throw new Error('Browser layout pending calibration: '+engineProfile.engine);
const precisionStatus = document.createElement('span');
precisionStatus.id = 'typesetting-precision';
precisionStatus.setAttribute('role', 'status');
precisionStatus.hidden = true;
function reportCjkPrecision(family) {
  precisionStatus.hidden = !family;
  if (!family) return;
  precisionStatus.dataset.zh = family + ' 中文排版预览：字距和断行尚未校准';
  precisionStatus.dataset.en = family + ' CJK preview: spacing and line breaks are uncalibrated';
  precisionStatus.textContent = t(precisionStatus.dataset.zh, precisionStatus.dataset.en);
}
typesetPagination=installTypesetPagination(documentPage,paper,metaBar,editor,engineProfile,
  engineProfile.engine === 'lualatex' ? reportCjkPrecision : null);
typesetPagination.setTableContinuation(config.value.interface.continuedTables);
window.addEventListener('lineae-image-layout',()=>{typesetPagination?.refresh();syncImageTab?.();});
function source() {
  if(projectDocument.composition)return projectExplorer.model.file(projectDocument.composition.rootId).draft;
  const document=editor.getJSON();
  const untouched=importedSnapshot===JSON.stringify(document);
  // Viewing an imported document must not repair its TeX or serialize visual
  // wrapping. Safe rich edits already update this source and its snapshot.
  if (untouched) return importedSource;
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
  projectDocument.composition=null;
  const wasApplying = syncApplying; syncApplying = true;
  try {
  const parsed=parseDocument(text, {fragment:projectFileKind === 'tex'});
  if(!parsed)throw new Error(t('无法识别文档','Invalid document'));
  if (markSaved) {clearProjectAssets();sourceModeEntry=undefined;sourceModeCommits=[];sourceModeRedos=[];}
  citationLibrary.restoreState(readBibliographyMetadata(text));
  // The book/report heading mapping must be active before blocks are imported;
  // applyProfile() runs later, during pagination, which is too late for the
  // initial \chapter -> heading conversion.
  const documentClass = documentClassFromSource(parsed.start);
  setSerializationClass(documentClass);
  setHeadingBase(documentClass === 'book' || documentClass === 'report' ? 'chapter' : null);
  // Project include fragments have no preamble; keep the class of the main file.
  if (/\\documentclass/.test(parsed.start)) homeRibbon?.setDocumentClass?.(documentClass);
  // Preserve imported source exactly. Unsupported blocks remain directly accessible in source mode.
  documentParts=parsed;
  const content=parsed.blocks.flatMap((block,index)=>importBlocks(index===0 && readMeta('title')
    ? block.replace(/^\s*\\maketitle\b[ \t]*(?:\r?\n|$)/gm,'') : block));
  for (const block of content) identifyImportedBoxes(block);
  editor.chain().setMeta('addToHistory', false).setContent({type:'doc',attrs:{layoutPreamble:parsed.start,pageFurniture:readPageFurniture(parsed.start)},content:content.length?content:[{type:'paragraph'}]}).command(({tr})=>{tr.setDocAttribute('layoutPreamble',parsed.start);tr.setDocAttribute('pageFurniture',readPageFurniture(parsed.start));return true;}).run();
  refreshReferences(paper,editor);syncTableAttributes();
  importedSource=text;importedSnapshot=JSON.stringify(editor.getJSON());
  if(markSaved) {savedSource=text;documentGeneration++;}
  if (markSaved) sourceView.reset(text);
  projection=sourceProjection(text,editor.getJSON(),{fragment:projectFileKind==='tex'});
  syncPending=false;
  renderMeta();
  pageSetup=readPageSetup(documentParts.start);
  applyPageSetup();
  } finally { syncApplying = wasApplying; }
}
let returnedDraft, sourceModeDoc, sourceModeComposition;
function setSourceMode(active) {
  if (!active && projectFileKind==='bib') {sourceView.error(t('BibTeX 文件只能使用源码模式','BibTeX files use Source mode'));return;}
  if (editor.view.composing || sourceView.composing) { sourceView.error(t("请先完成当前输入。","Finish the current composition before switching modes.")); return; }
  if (active === !sourceView.hidden) return;
  if(active && headerFooterMode)setHeaderFooterMode(false);
  if(projectExplorer?.active)projectWorkspace.select(active?'source':'body',projectFileKind);
  if (active) {
    sourceModeComposition=null;
    if(projectDocument.composition){
      const text=source(), project=projectExplorer.model;
      sourceModeComposition={project,fileId:project.activeFileId,
        session:captureRichSession(editor,projectDocument.composition,project,text)};
      projectDocument.composition=null;load(text,false);
    }
    const unchanged = returnedDraft?.doc === editor.state.doc && returnedDraft?.imported === importedSource && returnedDraft?.preamble === documentParts.start;
    sourceModeEntry=unchanged ? returnedDraft.text : source();
    projection=sourceProjection(sourceModeEntry,editor.getJSON(),{fragment:projectFileKind==='tex'});
    sourceModeDoc=editor.state.doc;
    sourceView.open(sourceModeEntry, true);
    sourceToolbar?.sourceTarget();
  } else {
    try {
      const text = sourceView.value;
      const untouched = text === sourceModeEntry && editor.state.doc === sourceModeDoc;
      if (!untouched && (text !== importedSource || importedSnapshot !== JSON.stringify(editor.getJSON()))) load(text, false);
      projection=sourceProjection(text,editor.getJSON(),{fragment:projectFileKind==='tex'});syncPending=false;
      if(sourceModeEntry!==undefined && sourceModeEntry!==text){
        sourceModeCommits.push({before:sourceModeEntry,after:text,afterDoc:editor.state.doc,afterPreamble:documentParts.start});sourceModeRedos=[];
syncUndoButtons();
      }
      sourceModeEntry=undefined;
      sourceModeDoc=undefined;
      returnedDraft = {doc: editor.state.doc, imported: importedSource, preamble: documentParts.start, text};
      sourceView.close();
      const cached=sourceModeComposition;
      sourceModeComposition=null;
      if(cached && cached.project===projectExplorer?.model && cached.fileId===cached.project.activeFileId &&
          cached.session.richSource===text &&
          restoreRichSession(editor,cached.session,cached.project.file(cached.fileId),cached.project,projectDocument)){
        refreshReferences(paper);syncTableAttributes();documentOutline.relocalize();syncUndoButtons();
      }
      showProjectComposition();
      editor.commands.focus(undefined,{scrollIntoView:false});
    } catch (error) {
      sourceView.error(error.message);
      return;
    }
  }
  updateSourceButton();
  updateEnvironment();
  syncImageTab?.();
}
function locateMissingCitation(missing) {
  setSourceMode(true);
  sourceView.select(missing.start, missing.start + missing.key.length);
}
document.querySelector('#download').disabled=false;
function confirmMathPlaceholders() {
  const text=sourceView.hidden?null:sourceView.value;
  let count=text?(text.match(/\\placeholder\{/g)?.length??0):0;
  if(text===null)editor.state.doc.descendants(node=>{
    if(['math','mathBlock'].includes(node.type.name))count+=(node.attrs.latex?.match(/\\placeholder\{/g)?.length??0);
  });
  return !count || confirm(t(`仍有 ${count} 个公式占位符未填写；保存后这些位置将留空。是否继续？`,
    `${count} formula placeholders are unfinished and will be empty after saving. Continue?`));
}
async function downloadProject(checkPlaceholders=true, snapshot, nameAtSave=filename) {
  if(checkPlaceholders && !confirmMathPlaceholders())return;
  const text=snapshot ?? (sourceView.hidden?source():sourceView.value);
  const status=document.querySelector('#status');
  try {
    const assets=new Map(projectAssets().filter(([path])=>safeProjectPath(path)));
    const dependencies=new Set(projectDependencies(text));
    const required=new Map();
    const missing=[];
    for(const path of dependencies) {
      const actual=assets.has(path)?path:[...assets.keys()].find(key=>key.replace(/\.[^.\/]+$/,'')===path);
      if(!actual) {missing.push(path);continue;}
      if(required.has(actual) || actual===nameAtSave)continue;
      const file=assets.get(actual);
      required.set(actual,file);
      if(actual.endsWith('.tex'))for(const dependency of projectDependencies(await file.text()))dependencies.add(dependency);
    }
    if(missing.length) {
      status.hidden=false;status.textContent=t('缺少项目资源','Missing project assets')+': '+missing.join(', ');
      return;
    }
    const name=safeProjectPath(nameAtSave)?nameAtSave:'lineae.tex';
    const zip=await buildProjectZip([[name,text],...[...required].filter(([path])=>path!==name)]);
    const url=URL.createObjectURL(zip);
    const a=document.createElement('a');a.href=url;a.download=name.replace(/\.tex$/i,'')+'.zip';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch(error) {
    status.hidden=false;status.textContent=error.message;
  }
}
function prepareExplicitSave() {
  if (sourceView.composing || editor.view.composing || !confirmMathPlaceholders()) return null;
  const readDraft=()=>sourceView.hidden ? source() : sourceView.value;
  const original=readDraft();
  const project=projectExplorer?.model;
  const input=project && projectFileKind==='tex' ? projectInputSource(project,project.activeFileId,original) : original;
  const formatted=sourceView.indentOnSave && projectFileKind!=='bib' ? indentLatex(input) : null;
  const generation=documentGeneration;
  const isCurrentDocument=()=>generation===documentGeneration;
  return {
    original, text:formatted?.text ?? input, isCurrentDocument,
    commit() {
      // The saved snapshot is authoritative on disk. Only apply its changes
      // to the editor if it still holds that snapshot's original source.
      if(!isCurrentDocument() || sourceView.composing || editor.view.composing || readDraft()!==original)return;
      if(input===original && !formatted?.changes.length)return;
      // CodeMirror positions count a CRLF pair as one logical newline.
      const preamble=input===original ? [] : textPatch(original.replace(/\r\n?/g,'\n'),input.replace(/\r\n?/g,'\n'));
      const rich=sourceView.hidden;
      if(rich)setSourceMode(true);
      sourceView.applySaveFormatting(preamble,formatted?.changes ?? [],input);
      if(rich)setSourceMode(false);
    }
  };
}
let savingFile=false;
async function saveDocument(saveAs=false) {
  if (projectExplorer?.active && !saveAs) return projectExplorer.save();
  if (savingFile) {
    const status=document.querySelector('#status');
    status.hidden=false;status.textContent=t('正在保存，请稍候','Save in progress');
    return;
  }
  const snapshot=prepareExplicitSave();
  if (!snapshot) return;
  savingFile=true;
  try {await writeDocument(snapshot,saveAs);}
  finally {savingFile=false;}
}
async function writeDocument(snapshot,saveAs) {
  const name=filename;
  const status=document.querySelector('#status');
  if(window.showSaveFilePicker) {
    let handle=saveAs?null:fileHandle;
    try {
      if(!handle)handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'LaTeX',accept:{'text/plain':['.tex']}}]});
      let writable;
      try { writable=await handle.createWritable(); }
      catch { await handle.requestPermission?.({mode:'readwrite'}); writable=await handle.createWritable(); }
      try {await writable.write(snapshot.text);await writable.close();}
      catch(error){try {await writable.abort?.();} catch {} throw error;}
    } catch(error) {
      if(!snapshot.isCurrentDocument())return;
      status.hidden=false;
      if(error?.name==='AbortError'){status.textContent=t('已取消保存','Save cancelled');return;}
      status.textContent=t('保存失败','Save failed')+' · '+String(error?.message ?? error);
      console.warn(t('保存','Save'),error);
      await downloadProject(false,snapshot.text,name);
      return;
    }
    if(!snapshot.isCurrentDocument())return;
    fileHandle=handle;
    if(handle.name)filename=handle.name;
    savedSource=snapshot.text;
    snapshot.commit();
    sourceView.refresh();
    status.hidden=false;status.textContent=t('已保存','Saved');
    return;
  }
  await downloadProject(false,snapshot.text,name);
}
async function openDocument() {
  if (projectExplorer?.active && !projectExplorer.close()) return true;
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
document.querySelector('#download').addEventListener('click',()=>projectExplorer?.active?projectExplorer.save():downloadProject());
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
  if (projectExplorer?.active && !projectExplorer.close()) return;
  const file=event.target.files[0];if(!file)return;
  try {fileHandle=null;load(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer()));filename=file.name;sourceView.refresh();}
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
  int: '\\int', intbody: '\\int\\mathord{\\placeholder{}}', lim: '\\lim', matrix: '\\begin{matrix}#?\\end{matrix}',
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
  appendix:()=>editor.chain().focus().insertContent({type:'appendixStart'}).run(),
  chapter:()=>editor.chain().focus().setHeading({level:1}).updateAttributes('heading',{command:'chapter'}).run(),
  indent: () => { editor.view.focus(); return setParagraphIndent(editor,true); },
  noindent: () => { editor.view.focus(); return setParagraphIndent(editor,false); },
  par: () => editor.chain().focus().splitBlock().run(),
  ...Object.fromEntries(Object.keys(theoremNames).map(kind=>[kind,()=>editor.chain().focus().wrapIn('theoremBlock',{kind}).run()])),
  section: () => editor.chain().focus().setHeading({ level: 1, command:null }).run(),
  subsection: () => editor.chain().focus().setHeading({ level: 2, command:null }).run(),
  subsubsection: () => editor.chain().focus().setHeading({ level: 3, command:null }).run(),
  itemize: () => editor.chain().focus().toggleBulletList().run(),
  enumerate: () => editor.chain().focus().toggleOrderedList().run(),
  table: () => insertDefaultTable(),
  inline: () => insertMath(),
  equation: insertEquation,
  'equation*': () => insertFormula(editor,true,'',undefined,undefined,{delimiter:'equation*'}),
  smallmatrix: () => insertMath(false, '\\begin{smallmatrix}\\placeholder{}\\end{smallmatrix}'),
  quote: () => editor.chain().focus().toggleBlockquote().run(),
  hrule: () => editor.chain().focus().setHorizontalRule().run(),
  description: () => editor.chain().focus().insertContent({type:'descriptionList',content:[{type:'descriptionItem',attrs:{term:''},content:[{type:'paragraph'}]}]}).run(),
  toc: () => {
    if(editor.isActive('tableOfContents'))editor.chain().focus().deleteSelection().run();
    else editor.chain().focus().insertContent({type:'tableOfContents'}).run();
  },
  label: async () => {
    if (activeMath() || formulaAtSelection()) return editFormulaLabel();
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
  fbox: () => spaceOverlay.toggleBox(),
  find: () => documentFind.show(),
  input:()=>requestProjectInclude('input'),
  include:()=>requestProjectInclude('include'),
  ...applicationCommandActions(),
  importconfig: () => importConfig.click(),
  exportconfig: () => exportConfig.click(),
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
};
const mathSlot = '\\placeholder{}';
const alignedRow = mathSlot + ' & ' + mathSlot;
for (const [environment, row] of Object.entries({
  align:alignedRow, alignat:alignedRow, flalign:alignedRow,
  eqnarray:mathSlot + ' & ' + mathSlot + ' & ' + mathSlot,
  gather:mathSlot, multline:mathSlot,
})) {
  for (const suffix of ['', '*']) {
    const name=environment+suffix;
    const columns=environment==='alignat' ? '{1}' : '';
    structureCommands[name]=()=>insertMath(true,'\\begin{'+name+'}'+columns+row+'\\\\'+row+'\\end{'+name+'}');
  }
}
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
  if (field?.isConnected) {
    field.focus();
    // MathLive only paints a caret for a collapsed selection.
    if (selection.ranges.some(([start,end])=>start!==end)) {
      const position=field.position;
      field.selection={ranges:[[position,position]],direction:'forward'};
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }
  const documentBefore = editor.state.doc;
  const anchor = field?.getBoundingClientRect() ?? editor.view.coordsAtPos(editor.state.selection.from);
  const pair = await readDelimiterPair(anchor, rightFirst, field?.closest('[data-math-view]'));
  if (!pair) {
    if (field?.isConnected && field.value===value && document.activeElement===field) field.selection=selection;
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
  if (completionField) {
    actions.label = editFormulaLabel;
    actions.textasciicircum = () => insertLiveMath(completionField,'\\text{ˆ}');
    if (completionField.closest('.math-display')) actions.newline = () => completionField.dispatchEvent(new Event('lineae-math-newline'));
  }
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
    actions.togglemarker = () => shortcutActions.editor.toggleContextMarker();
    actions.indentitem = () => indentListItem(editor);
    actions.outdentitem = () => editor.chain().focus().liftListItem('listItem').run();
    for (const name of Object.keys(textCommands)) actions[name] = () => insertTextCommand(name);
  }
  const exactQuery = filter.value.replace(/^\\/, '').replace(/^begin\{([^{}]*)\}?$/, '$1');
  const query = exactQuery.toLowerCase();
  for (const [name, action] of Object.entries(actions).filter(([name]) => name.toLowerCase().startsWith(query)).sort(([a],[b]) => Number(b===exactQuery)-Number(a===exactQuery) || Number(b.startsWith(exactQuery))-Number(a.startsWith(exactQuery)) || Number(b.toLowerCase()===query)-Number(a.toLowerCase()===query))) {
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
function runMathShortcut(command, field, event) {
  if (['palette','nextSlot','previousSlot','enterLine','eraseObject'].includes(command)) {
    const detail={command,backward:event.key!=='Delete',handled:false};
    field.dispatchEvent(new CustomEvent('lineae-math-builtin',{detail}));
    return detail.handled;
  }
  if (event.repeat && !['undo','redo','leaveEnvironment','superscript','subscript'].includes(command)) return;
  switch (command) {
    case 'undo': editor.commands.undo(); return;
    case 'redo': editor.commands.redo(); return;
    case 'superscript': field.executeCommand('moveToSuperscript'); return;
    case 'subscript': field.executeCommand('moveToSubscript'); return;
    case 'leaveEnvironment': field.dispatchEvent(new Event('lineae-leave-math-environment')); return;
    case 'leaveFormula': field.dispatchEvent(new Event('lineae-leave-formula')); return;
    case 'leaveFile': if(projectPresentation?.canExitFile(field)){field.dispatchEvent(new Event('lineae-leave-formula'));return projectPresentation.exitFile();}return !!projectExplorer?.active;
    case 'addRow': if (!fillMatrixAxis(field,'row')) editTableAxis('row'); return;
    case 'addColumn': if (!fillMatrixAxis(field,'column')) editTableAxis('column'); return;
    case 'literalFence': armLiteralFence(field); return;
    case 'toggleDisplayStyle': toggleDisplayStyle(field); return;
    case 'left': case 'right': chooseMathDelimiters(field,command==='right'); return;
  }
  const selected = field.selection.ranges.map(range => field.getValue(range)).join('');
  const slot = '\\placeholder{}';
  if (matrixEnvironments.has(command)) insertLiveMath(field, matrixSource(command,selected || slot));
  else if (command==='frac') insertLiveMath(field, `\\frac{${selected || slot}}{${slot}}`);
  else if (command==='sqrt') insertLiveMath(field, `\\sqrt{${selected || slot}}`);
  else if (command==='indexedRoot') insertLiveMath(field, `\\sqrt[${slot}]{${selected || slot}}`);
  else if (isMathOperatorWithBody(command)) {
    insertLiveMath(field, `\\${command}\\mathord{${selected || slot}}`);
  }
  else insertLiveMath(field, '\\'+command);
}
document.addEventListener('pointerdown', event => { if (!commands.contains(event.target)) closeCommands(); }, true);
document.addEventListener('scroll', event => {
  if (!commands.hidden && !commands.contains(event.target)) closeCommands();
}, true);
window.addEventListener('resize', () => closeCommands());
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || editor.view.composing) return;
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
  config.updateInterface({theme:next});
  theme.set(next);updateThemeButton();
});
function updateThemeButton(){
  const label={light:['浅色','Light'],dark:['深色','Dark'],system:['跟随系统','System']}[theme.getPreference()];
  const description=t('主题：','Theme: ')+t(label[0],label[1]);
  themeButton.setAttribute('aria-label',description);
  themeButton.dataset.tooltipZh='主题：'+label[0];
  themeButton.dataset.tooltipEn='Theme: '+label[1];
  themeButton.replaceChildren(icon({light:'sun',dark:'moon',system:'system'}[theme.getPreference()]));
}
const modes = document.createElement('div');
modes.className = 'tex-modes';
modes.setAttribute('role','group');
const [bodyButton,sourceButton,splitButton] = ['body','source','split'].map(mode => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.sourceMode = mode;
  button.onclick = () => { if (projectFileKind === 'bib' && mode !== 'source') return; setSourceMode(mode !== 'body'); if (mode !== 'body') sourceView.setSplit(mode === 'split'); if(projectExplorer?.active)projectWorkspace.select(mode,projectFileKind); };
  modes.append(button);
  return button;
});
modes.addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const buttons=[bodyButton,sourceButton,splitButton];
  const index=buttons.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;
  buttons[next].click(); buttons[next].focus();
});
function updateSourceButton() {
  if(sourceView.hidden)documentPage.inert=false;
  for (const [key, group] of Object.entries(groups)) {
    if (key !== 'files') group.inert = false;
  }
  modes.setAttribute('aria-label', t('编辑模式','Editing mode'));
  bodyButton.textContent = t('正文','Document');
  sourceButton.textContent = t('源码','Source');
  bodyButton.setAttribute('aria-pressed',String(sourceView.hidden));
  sourceButton.setAttribute('aria-pressed',String(!sourceView.hidden && !sourceView.split));
  splitButton.textContent = t('分栏','Split');
  splitButton.setAttribute('aria-pressed',String(!sourceView.hidden && sourceView.split));
  sourceToolbar?.refresh();
  metaBar.inert = !sourceView.hidden;
  sourceView.refresh();
}
let continueTablesButton;
function updateContinueTablesButton(){
  if(!continueTablesButton)return;
  const enabled=typesetPagination.getTableContinuation();
  continueTablesButton.textContent=enabled?t('续表 开','Continue on'):t('续表 关','Continue off');
  continueTablesButton.setAttribute('aria-pressed',String(enabled));
  continueTablesButton.dataset.tooltipZh=enabled?'超过一页的表格自动拆分并重复表头':'表格不自动拆分';
  continueTablesButton.dataset.tooltipEn=enabled?'Split long tables across pages and repeat the header':'Keep long tables as one block';
}
const paginationButton=document.createElement('button');
paginationButton.type='button';paginationButton.className='pagination-toggle';
paginationButton.addEventListener('mousedown',event=>event.preventDefault());
paginationButton.addEventListener('click',()=>{
  typesetPagination.toggle();
  updatePaginationButton();
});
function updatePaginationButton(){
  const pages=typesetPagination.getMode()==='pages';
  paginationButton.textContent=pages?t('分页','Pages'):t('连续流','Continuous');
  paginationButton.dataset.mode=pages?'pages':'flow';
  paginationButton.setAttribute('aria-pressed',String(pages));
  paginationButton.dataset.tooltipZh=pages?'切换到连续流预览':'切换到分页预览';
  paginationButton.dataset.tooltipEn=pages?'Switch to continuous flow':'Switch to paginated pages';
}
function scale() {
  documentPage.style.zoom=Number(zoom.value)/100;
  sourceView.setPreviewZoom(Number(zoom.value));
  percent.textContent=zoom.value+'%';
  requestAnimationFrame(()=>{
    const brand=document.querySelector('header h1');
    brand.style.opacity=documentPage.hidden ? '1' : String(Math.max(0,Math.min(1,(documentPage.getBoundingClientRect().left-brand.getBoundingClientRect().right)/28)));
  });
}
window.addEventListener('resize',scale);
let wheelZoom = config.value.interface.zoom;
let zoomSaveTimer;
zoom.value = String(wheelZoom);
function saveZoom() {
  clearTimeout(zoomSaveTimer);
  const value = Number(zoom.value);
  if (value !== config.value.interface.zoom) config.updateInterface({zoom:value});
}
function setZoom(value) {
  wheelZoom = Math.max(50, Math.min(300, value));
  zoom.value = String(Math.round(wheelZoom));
  scale();
}
zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
zoom.addEventListener('change',saveZoom);
function leaveTextEnvironment() {
  if(projectExplorer?.active && exitProjectHeading(editor))return true;
  if (editor.isActive('codeBlock')) return exitCode(editor.state,editor.view.dispatch);
  if (editor.isActive('code')) return editor.commands.unsetCode();
  for (const mark of ['boxed','smallcaps','superscript','subscript','bold','italic','underline','strike']) {
    if (!editor.isActive(mark)) continue;
    return editor.chain().focus().extendMarkRange(mark).command(({tr}) => {
      tr.setSelection(tr.selection.constructor.near(tr.doc.resolve(tr.selection.to)));
      tr.removeStoredMark(editor.schema.marks[mark]);
      return true;
    }).unsetMark(mark).run();
  }
  const { $from }=editor.state.selection;
  for (let depth=$from.depth; depth>0; depth--) {
    if (!['blockquote','theoremBlock','bulletList','orderedList','descriptionList','table'].includes($from.node(depth).type.name)) continue;
    const after=$from.after(depth);
    const tr=editor.state.tr;
    if (!tr.doc.resolve(after).nodeAfter) tr.insert(after,editor.schema.nodes.paragraph.create());
    tr.setSelection(Selection.near(tr.doc.resolve(after),1));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    return true;
  }
  return false;
}
function leaveAllTextEnvironments() {
  if (editor.isActive('codeBlock')) return exitCode(editor.state,editor.view.dispatch);
  const { $from }=editor.state.selection;
  let outerDepth=0;
  for (let depth=1; depth<=$from.depth; depth++) {
    if (['blockquote','theoremBlock','bulletList','orderedList','descriptionList','table'].includes($from.node(depth).type.name)) outerDepth=depth;
  }
  if (!outerDepth) return leaveTextEnvironment();
  const after=$from.after(outerDepth);
  const tr=editor.state.tr;
  if (!tr.doc.resolve(after).nodeAfter) tr.insert(after,editor.schema.nodes.paragraph.create());
  tr.setSelection(Selection.near(tr.doc.resolve(after),1));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}
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
function editMathAtSelection() {
  const target=formulaAtSelection();
  const field=target && editor.view.nodeDOM(target.position)?.querySelector('math-field');
  if (!field) return false;
  field.focus();
  field.executeCommand('moveToMathfieldEnd');
  return true;
}
function selectedParagraphPositions() {
  const { selection } = editor.state;
  const positions = [];
  if (selection.empty) {
    for (let depth = selection.$from.depth; depth > 0; depth--) {
      if (selection.$from.node(depth).type.name === 'paragraph') {
        positions.push(selection.$from.before(depth));
        break;
      }
    }
  } else {
    editor.state.doc.nodesBetween(selection.from,selection.to,(node,position) => {
      if (node.type.name !== 'paragraph') return true;
      positions.push(position);
      return false;
    });
  }
  return [...new Set(positions)];
}
function updateSelectedParagraphs(attributes) {
  const positions = selectedParagraphPositions();
  if (!positions.length) return false;
  const transaction = editor.state.tr;
  for (const position of positions) {
    const node = transaction.doc.nodeAt(position);
    if (node?.type.name === 'paragraph') {
      transaction.setNodeMarkup(position,undefined,{...node.attrs,...attributes});
    }
  }
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}
function setParagraphAlignment(align) {
  const { selection }=editor.state;
  if (align==='justify' && (editor.isActive('table') ||
      (selection instanceof NodeSelection && ['table','documentImage'].includes(selection.node.type.name)))) return false;
  if (selection instanceof NodeSelection && selection.node.type.name==='table') {
    editor.view.dispatch(editor.state.tr.setNodeMarkup(selection.from,undefined,{
      ...selection.node.attrs,align,
    }));
    editor.view.focus();
    return true;
  }
  if (editor.isActive('table')) {
    if(selection.isRowSelection?.()&&selection.isColSelection?.())
      return editor.chain().focus().updateAttributes('table',{align}).run();
    const type=editor.isActive('tableHeader')?'tableHeader':'tableCell';
    return editor.chain().focus().updateAttributes(type,{align}).run();
  }
  if (selection instanceof NodeSelection && selection.node.type.name==='documentImage') {
    editor.view.dispatch(editor.state.tr.setNodeMarkup(selection.from,undefined,{
      ...selection.node.attrs,align,centered:align==='center',
    }));
    editor.view.focus();
    return true;
  }
  if (!editor.isActive('paragraph')) return false;
  return updateSelectedParagraphs({align});
}
function indentSelectedParagraph(direction) {
  if (editor.isActive('listItem')) {
    return direction > 0
      ? indentListItem(editor)
      : editor.chain().focus().liftListItem('listItem').run();
  }
  return setParagraphIndent(editor,direction > 0);
}
function insertMultiColumn(count=2) {  const {from,to}=editor.state.selection;
  const doc=editor.state.doc;
  let start,end;
  try {
    start=doc.resolve(from).before(1);
    end=doc.resolve(to).after(1);
  } catch {
    return false;
  }
  if(end<=start)return false;
  const content=doc.slice(start,end).content;
  const node=content.size
    ? editor.schema.nodes.multiColumn.create({count},content)
    : editor.schema.nodes.multiColumn.create({count},[editor.schema.nodes.paragraph.create()]);
  return editor.chain().focus().insertContentAt({from:start,to:end},node).run();
}
function updateSelectedImageAttrs(patch){
  if(imageSelection===null)return false;
  const current=editor.state.doc.nodeAt(imageSelection);
  if(current?.type.name!=='documentImage')return false;
  const clean=Object.fromEntries(Object.entries(patch).filter(([,value])=>value!==undefined));
  if(Object.entries(clean).every(([key,value])=>current.attrs[key]===value))return false;
  editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(imageSelection,undefined,{...current.attrs,...clean}));
  const updated=editor.state.doc.nodeAt(imageSelection);
  if(updated?.type.name==='documentImage')imagePanel?.setValues?.(updated.attrs);
  return true;
}
function sortParagraphs(mode) {
  const { from,to }=editor.state.selection;
  const items=[];
  editor.state.doc.forEach((node,offset) => {
    const end=offset+node.nodeSize;
    if (end<=from || offset>=to) return;
    items.push({node,offset});
  });
  if (items.length<2 || items.some(item=>item.node.type.name!=='paragraph')) return false;
  let collator;
  try {
    collator = mode==='alphabet' ? new Intl.Collator(undefined,{sensitivity:'base'})
      : mode==='stroke' ? new Intl.Collator('zh-Hans-u-co-stroke',{usage:'sort'})
        : new Intl.Collator('zh-Hans',{usage:'sort'});
  } catch {
    collator = new Intl.Collator('zh-Hans',{usage:'sort'});
  }
  const sorted=[...items].sort((left,right) => {
    if (mode==='alphabet') {
      const leftLatin=/^[\x00-\x7F]/.test(left.node.textContent) ? 0 : 1;
      const rightLatin=/^[\x00-\x7F]/.test(right.node.textContent) ? 0 : 1;
      if (leftLatin!==rightLatin) return leftLatin-rightLatin;
    }
    return collator.compare(left.node.textContent,right.node.textContent);
  });
  if (sorted.every((item,index) => item===items[index])) return false;
  const first=items[0].offset;
  const last=items.at(-1).offset+items.at(-1).node.nodeSize;
  editor.view.dispatch(editor.state.tr.replaceWith(first,last,sorted.map(item=>item.node)).scrollIntoView());
  editor.view.focus();
  return true;
}
function zoomByKeyboard(amount, {source}={}) {
  if(source)return false;
  setZoom(Number(zoom.value)+amount);
  saveZoom();
}
function resetPageZoom({source}={}) {
  if(source)return false;
  setZoom(100);
  saveZoom();
}
const shortcutActions = {
  global: {
    save: (_context,event) => { if (!event.repeat) saveDocument(); },
    open: () => document.querySelector('#file').click(),
    saveAs: () => saveDocument(true),
    newProject: () => document.querySelector('#project-new')?.click(),
    openProject: () => document.querySelector('#project-open')?.click(),
    toggleFiles: () => document.querySelector('#project-toggle')?.click(),
    documentMode: () => bodyButton.click(),
    sourceMode: () => sourceButton.click(),
    splitMode: () => splitButton.click(),
    settings: () => settingsPanel.show(),
    toggleRibbon: () => document.querySelector('#toolbar-collapse')?.click(),
    shortcutPriority: (_context,event) => event.repeat ? true : shortcutPriority.toggle(),
    formattingMarks: () => formattingMarks.click(),
    zoomIn: context => zoomByKeyboard(10,context),
    zoomOut: context => zoomByKeyboard(-10,context),
    zoomReset: resetPageZoom,
  },
  editor: {
    insertDisplayMath: () => insertMath(true),
    insertInlineMath: () => insertMath(),
    insertEquation,
    insertCases: () => insertMath(true,'\\begin{cases}\\placeholder{} & \\placeholder{}\\\\ \\placeholder{} & \\placeholder{}\\end{cases}'),
    dollar: (_context,event) => {
      if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey)return 'native';
      insertMath();
    },
    toggleBox: () => spaceOverlay.toggleBox(),
    editMath: editMathAtSelection,
    alignLeft: () => setParagraphAlignment('left'),
    alignRight: () => setParagraphAlignment('right'),
    alignCenter: () => setParagraphAlignment('center'),
    find: documentFind.show,
    leaveEnvironment: leaveTextEnvironment,
    leaveAllEnvironments: leaveAllTextEnvironments,
    leaveFile:()=>projectPresentation?.exitFile()??false,
    toggleContextMarker: () => {
      const { $from }=editor.state.selection;
      for (let depth=$from.depth;depth>0;depth--) {
        const node=$from.node(depth);
        const key={orderedList:'labelStyle',bulletList:'marker',heading:'numbered'}[node.type.name];
        if (!key) continue;
        const choices={orderedList:[null,'decimal-parens','lower-alpha','lower-roman'],bulletList:[null,'◦','▪'],heading:[true,false]}[node.type.name];
        const value=choices[(choices.indexOf(node.attrs[key])+1)%choices.length];
        editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(depth),undefined,{...node.attrs,[key]:value}));
        return true;
      }
      return false;
    },
    ignoreBrowserZoomReset: resetPageZoom,
    literalBacktick: () => editor.commands.insertContent('`'),
    undo: undoDocument,
    redo: redoDocument,
    toggleBold: () => editor.commands.toggleBold(),
    toggleItalic: () => editor.commands.toggleItalic(),
    toggleUnderline: () => editor.commands.toggleMark('underline'),
    toggleStrike: () => editor.commands.toggleStrike(),
    toggleCode: () => editor.commands.toggleCode(),
    toggleCodeBlock: () => editor.commands.toggleCodeBlock(),
    toggleBlockquote: () => editor.commands.toggleBlockquote(),
    toggleBulletList: () => editor.commands.toggleBulletList(),
    toggleOrderedList: () => editor.commands.toggleOrderedList(),
    paragraph: () => editor.commands.setParagraph(),
    section: () => editor.commands.toggleHeading({level:1,command:null}),
    subsection: () => editor.commands.toggleHeading({level:2,command:null}),
    subsubsection: () => editor.commands.toggleHeading({level:3,command:null}),
    hardBreak: () => editor.commands.setHardBreak(),
    toggleSuperscript: () => editor.commands.toggleMark('superscript'),
    toggleSubscript: () => editor.commands.toggleMark('subscript'),
    codeLanguage: () => codeLanguageButton.click(),
    insertTable: insertDefaultTable,
    openTikz: () => tikzButton.click(),
  },
  paragraph: {
    toggleIndent: () => setParagraphIndent(editor,!paragraphHasIndent(editor)),
  },
  table: {
    addRow: () => editor.commands.addRowAfter(),
    addColumn: () => editor.commands.addColumnAfter(),
    deleteRow: () => editor.commands.deleteRow(),
    deleteColumn: () => editor.commands.deleteColumn(),
  },
};
const nativeBindings=compileKeybindings({
  system:{copy:'mod+c',cut:'mod+x',paste:'mod+v',selectAll:'mod+a'},
  source:{find:'mod+f',replace:'mod+h',undo:'mod+z',redo:['mod+y','mod+shift+z'],complete:'ctrl+space',
    indent:'tab',outdent:'shift+tab',zoomIn:['mod+equal','mod+plus'],zoomOut:'mod+minus',zoomReset:'mod+0'},
  math:{undo:['ctrl+z','meta+z'],redo:['ctrl+y','meta+y','ctrl+shift+z','meta+shift+z'],
    palette:'backslash',nextSlot:'tab',previousSlot:'shift+tab'},
},{isMac});
installKeybindings(window, {
  getBindings: () => config.bindings,
  nativeBindings,
  getContext(event) {
    if (event.target.closest?.('.tex-code .cm-content'))
      return {element:sourceView.editorView?.contentDOM,source:true,scopes:['source','system','global']};
    if (event.target.closest?.('.tex-code'))return {element:event.target,scopes:['global'],only:'save'};
    // Let the pane's local font handler own these keys before the global
    // capture-phase router can turn them into whole-document zoom actions.
    if (event.target.closest?.('.tex-preview') && (event.ctrlKey || event.metaKey) &&
        !event.altKey && ['+', '=', '-', '0'].includes(event.key)) return {element:event.target,scopes:[]};
    const field = event.composedPath().find(node => node?.tagName === 'MATH-FIELD');
    if (field && paper.contains(field)) return { element:field, field, scopes:['math','system','global'] };
    if (documentFind.panel.contains(event.target)) return { element:documentFind.panel, scopes:['editor'], only:'find' };
    // A dialog or project mutation can leave focus on the body while Source mode
    // is still the visible editing surface. Keep its shortcuts available.
    if (!sourceView.hidden && document.activeElement === document.body)
      return { element:sourceView.editorView?.contentDOM ?? document.body, source:true, scopes:['source','system','global'] };
    if (!editor.view.hasFocus()) return { element:document.activeElement, scopes:['global'] };
    if (editor.view.composing) return { element:editor.view.dom, scopes:[] };
    editor.view.domObserver.flush();
    const scopes = ['editor','system','global'];
    if (editor.isActive('paragraph')) scopes.unshift('paragraph');
    if (editor.isActive('table')) scopes.unshift('table');
    return { element:editor.view.dom, scopes };
  },
  run({scope,command},context,event) {
    if (scope === 'math') return runMathShortcut(command,context.field,event);
    if (scope === 'source') return sourceView.runShortcut(command);
    if (scope === 'system') {
      if(command==='selectAll') {
        if(context.source)return sourceView.runShortcut('selectAll');
        if(context.field)return context.field.executeCommand('selectAll');
        return editor.commands.selectAll();
      }
      const key={copy:'c',cut:'x',paste:'v'}[command];
      if(!event.altKey&&!event.shiftKey&&event.key.toLowerCase()===key&&
          (isMac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey))return 'native';
      clipboard[command]().catch(reportClipboardError);
      return true;
    }
    return shortcutActions[scope][command](context,event);
  },
});
// Trackpad pinch arrives as a ctrl+wheel event. Listening on the window keeps
// the document zoom in charge everywhere in the app; otherwise the desktop
// webview would zoom its own UI when the pointer is outside the paper.
window.addEventListener('wheel', event => {
  if (event.defaultPrevented || !event.ctrlKey || !config.value.interface.zoomOnCtrlWheel) return;
  event.preventDefault();
  const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  const speed = event.deltaMode === 0 && Math.abs(event.deltaY) < 50 ? 0.24 : 0.12;
  setZoom(wheelZoom-event.deltaY*units*speed);
  clearTimeout(zoomSaveTimer);
  zoomSaveTimer=setTimeout(saveZoom,200);
}, { passive: false });
const environment = document.createElement('span'); environment.className='environment-tag';
function updateEnvironment() {
  const field=document.activeElement?.tagName==='MATH-FIELD' ? document.activeElement : null;
  const name=field ? (field.closest('.math-display')?'display math':'inline math') :
    !sourceView.hidden?'LaTeX': ['table','listItem','heading'].find(type=>editor.isActive(type)) ?? 'text';
  const labels={matrix:t('矩阵','Matrix'),'display math':t('行间公式','Display math'),'inline math':t('行内公式','Inline math'),table:t('表格','Table'),listItem:t('列表','List'),heading:t('标题','Heading'),text:t('正文','Text'),LaTeX:t('源码','Source')};
  environment.textContent=[labels[name],...(field ? mathEnvironment(field) : [])].join(' › ');
  environment.dataset.environment=name;
}
footer.append(count,document.querySelector('#status'),precisionStatus,environment,zoom,percent,paginationButton,themeButton,modes);document.body.append(footer);sourceView.mountStatus(footer);scale();updatePaginationButton();
const shortcutPriority=installShortcutPriority({host:footer,before:modes,getBindings:()=>config.bindings});
const compositionController=createCompositionController({
  explorer:()=>projectExplorer,fileKind:()=>projectFileKind,session:projectDocument,
  sourceHidden:()=>sourceView.hidden,composing:()=>editor.view.composing||sourceView.composing,
  read:()=>sourceView.hidden?source():sourceView.value,report:text=>sourceView.error(text),ask:askText,
  present(composed){
    syncApplying=true;
    try{
      editor.chain().setMeta('addToHistory',false).setContent({type:'doc',attrs:editor.state.doc.attrs,content:composed.content}).run();
      projectDocument.hydrate(composed,editor.getJSON());
      refreshReferences(paper,editor);documentOutline.relocalize();
    }finally{syncApplying=false;}
    // The composition is hydrated after setContent; force one layout pass so
    // the project presentation sees the new regions and renders their badges.
    requestAnimationFrame(()=>typesetPagination?.refresh());
  },
  replace(before,after,show,owner){
    if(owner!==projectExplorer.model.activeFileId){
      if(sourceView.hidden){const root=projectExplorer.model.file(projectExplorer.model.activeFileId).draft;projectDocument.clear();load(root,false);sourceView.reset(root);show();}
      return;
    }
    if(!sourceView.hidden){sourceView.applyChanges([{from:0,to:before.length,insert:after}]);sourceView.flush();return;}
    projectDocument.clear();load(after,false);sourceView.reset(after);
    const checkpoint={before,after,afterDoc:editor.state.doc,afterPreamble:documentParts.start};
    sourceModeCommits.push(checkpoint);sourceModeRedos=[];
syncUndoButtons();
    show();checkpoint.afterDoc=editor.state.doc;
  },
});
function showProjectComposition(){return compositionController.show();}
function editIncludeSource(transform,owner){return compositionController.edit(transform,owner);}
function requestProjectInclude(command){return compositionController.request(command);}
function appendInclude(id,beforePath,command){return compositionController.append(id,beforePath,command);}
installProjectNavigation({outline:documentOutline.panel,paper,sourceView,editor,getProjection:()=>projection,appendInclude,editIncludeSource});
const projectWorkspace=new ProjectWorkspaceState();
let standaloneSession;
projectExplorer = installProjectExplorer({footer, filePanel:document.querySelector('header .tools'), sessions:{
  prepareSave:prepareExplicitSave,
  outline:documentOutline,preferences:()=>config.value,
  sidebarChanged:(key,open)=>config.updateInterface({sidebar:{[key]:open}}),
  editIncludes:editIncludeSource,citations:()=>manageCitations(),
  saveFileIds:()=>{const project=projectExplorer.model;const ids=projectDocument.composition?projectDocument.composition.regions.map(region=>region.id):[project.activeFileId];if([...sourceModeCommits,...sourceModeRedos].some(item=>item.owner===project.mainFileId)&&project.file(project.mainFileId).dirty)ids.push(project.mainFileId);return [...new Set(ids)];},
  includeFile:appendInclude,
  ensureIdle() { if (editor.view.composing || sourceView.composing) throw new Error(t('请先完成当前输入','Finish composition first')); },
  text:() => sourceView.hidden ? source() : sourceView.value,
  capture:text => {
    if(sourceView.hidden && sourceView.value!==text)sourceView.reset(text);
    return {...sourceView.captureSession(),split:sourceView.split,sourceVisible:!sourceView.hidden,
      richSelection:{anchor:editor.state.selection.anchor,head:editor.state.selection.head},
      ...captureRichSession(editor,projectDocument.composition,projectExplorer.model,text),
      modeHistory:copyModeHistory(sourceModeEntry,sourceModeCommits,sourceModeRedos)};
  },
  focusNewFile(file){
    if(sourceView.hidden){editor.view.dispatch(editor.state.tr.setSelection(Selection.atStart(editor.state.doc)));editor.commands.focus();}
    else {const parsed=parseDocument(file.draft,{fragment:true});const offset=parsed?.start.length??0;sourceView.select(offset,offset);}
  },
  applyChanges:changes => sourceView.applyChanges(changes),
  approveOpen:newOrOpen => (sourceView.hidden?source():sourceView.value) === savedSource || confirm(newOrOpen
    ? t('保留当前单文件草稿并新建或打开工程？','Keep the current single-file draft and create or open a project?')
    : t('保留当前单文件草稿并打开工程？','Keep the current single-file draft and open a project?')),
  begin() {
    projectWorkspace.select('body');
    if (!standaloneSession) standaloneSession = {
      text:sourceView.hidden?source():sourceView.value, filename, fileHandle, savedSource,
      sourceVisible:!sourceView.hidden, sourceSession:sourceView.captureSession(), split:sourceView.split,
      richState:editor.state,modeHistory:copyModeHistory(sourceModeEntry,sourceModeCommits,sourceModeRedos),
    };
  },
  open(file) {
    documentGeneration++;
    projectFileKind = file.kind;
    returnedDraft = undefined; syncPending = false;
    filename = file.path; fileHandle = null; savedSource = file.saved;
    const session=file.session,sourceVisible=projectWorkspace.modeFor(file.kind)!=='body';
    const history=readModeHistory(session?.modeHistory);
    sourceModeEntry=history.entry;sourceModeCommits=history.commits;sourceModeRedos=history.redos;
    if(file.kind==='tex'){
      load(file.draft,false);
      if(restoreRichSession(editor,session,file,projectExplorer.model,projectDocument)){
        importedSnapshot=JSON.stringify(editor.getJSON());refreshReferences(paper,editor);syncTableAttributes();
      }
      projection=sourceProjection(file.draft,editor.getJSON(),{fragment:true});
    }
    if(sourceVisible){
      if(sourceView.hidden)sourceView.open(file.draft);
      sourceView.restoreSession(session,file.draft);
      sourceView.setSplit(projectWorkspace.modeFor(file.kind)==='split');
      sourceView.focus();
    }else{
      sourceView.close();sourceView.restoreSession(session,file.draft);editor.commands.focus();
    }
    if (file.kind === 'tex' && session?.richSelection && !session.richState) {
      const {anchor,head} = session.richSelection, max = editor.state.doc.content.size;
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.between(editor.state.doc.resolve(Math.min(anchor,max)),editor.state.doc.resolve(Math.min(head,max)))));
    }
    if (file.kind === 'bib') sourceView.setSplit(false);
    updateSourceButton();
    showProjectComposition();

  },
  saved(text) { savedSource = text; sourceView.refresh(); },
  error(text) { const status = document.querySelector('#status'); status.hidden = false; status.textContent = text; },
  end() {
    documentGeneration++;
    projectDocument.composition=null;
    projectFileKind = undefined; returnedDraft = undefined;
    projectWorkspace.select('body');
    if (standaloneSession) {
      const previous = standaloneSession; standaloneSession = null;
      filename = previous.filename; fileHandle = previous.fileHandle;
      // The standalone workspace is suspended while a project is open. Restore
      // its immutable editor states, including undo and selection, rather than
      // treating the same draft as a newly imported document.
      load(previous.text, false); savedSource = previous.savedSource;
      const history=readModeHistory(previous.modeHistory);
      sourceModeEntry=history.entry;sourceModeCommits=history.commits;sourceModeRedos=history.redos;
      if(previous.sourceVisible && sourceView.hidden)sourceView.open(previous.text);
      sourceView.restoreSession(previous.sourceVisible ? previous.sourceSession : null, previous.text);
      if (previous.sourceVisible) {
        sourceView.setSplit(previous.split);
        // Source edits may have had a preview render pending on project open.
        // The restored CodeMirror state is authoritative; retain only the old
        // rich selection, never overwrite its newly rebuilt projection.
        const {anchor,head} = previous.richState.selection, max = editor.state.doc.content.size;
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.between(
          editor.state.doc.resolve(Math.min(anchor,max)),editor.state.doc.resolve(Math.min(head,max)))));
      } else {
        sourceView.close();
        editor.view.updateState(previous.richState);
      }
    }

    updateSourceButton();
  },
}});
projectPresentation=installProjectPresentation({editor,page:documentPage,getProject:()=>projectExplorer.model,openMain:()=>projectExplorer.openFile(projectExplorer.model.mainFileId),getComposition:()=>projectDocument.composition,requestLayout:()=>typesetPagination?.refresh(),ensureDocument:()=>{if(!sourceView.hidden)setSourceMode(false);showProjectComposition();}});
editor.on('transaction',updateEnvironment);
document.addEventListener('focusin',updateEnvironment);paper.addEventListener('input',updateEnvironment);
paper.addEventListener('selection-change',updateEnvironment,true);
paper.addEventListener('lineae-math-position',updateEnvironment);
updateEnvironment();
editor.on('update',()=>{count.textContent=editor.getText().length+' '+t('字符','characters');});
const tableGroup=document.createElement('div');tableGroup.className='tools';
const layoutGroup=document.createElement('div');layoutGroup.className='tools home-ribbon layout-ribbon';layoutGroup.id='layout-panel';
let syncLayoutParagraph;
const formatGroup=document.createElement('div');formatGroup.className='tools';
const referenceGroup=document.createElement('div');referenceGroup.className='tools';
const mathGroup=document.createElement('div');mathGroup.className='tools';
function groupButton(container,label,action,sourceAction) {
  const control=document.createElement('button');
  const [zh,en]=Array.isArray(label)?label:[label,label];
  control.type='button';control.dataset.sourceAction=sourceAction??zh;
  if(Array.isArray(label)){control.dataset.zh=zh;control.dataset.en=en;}
  control.textContent=Array.isArray(label)?t(zh,en):label;
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
  input.type='text';input.style.width='64px';input.setAttribute('aria-label',label);input.placeholder=label;
  return input;
}
pageMarginTop=marginInput(t('上边距','Top margin'));
pageMarginRight=marginInput(t('右边距','Right margin'));
pageMarginBottom=marginInput(t('下边距','Bottom margin'));
pageMarginLeft=marginInput(t('左边距','Left margin'));
layoutColumns=document.createElement('select');
layoutColumns.setAttribute('aria-label',t('全局分栏','Global columns'));
layoutColumns.append(new Option(t('1 栏','1 column'),'1'),new Option(t('2 栏（twocolumn）','2 columns (twocolumn)'),'2'));
layoutLocalColumns=document.createElement('select');
layoutLocalColumns.setAttribute('aria-label',t('局部分栏','Local columns'));
for(const value of ['2','3','4'])layoutLocalColumns.append(new Option(t(value+' 栏',value+' columns'),value));
const insertColumnsButton=document.createElement('button');
insertColumnsButton.type='button';
insertColumnsButton.textContent=t('应用到选区','Apply to selection');
const layoutPageSetup=document.createElement('section');
layoutPageSetup.className='layout-group';
layoutPageSetup.id='layout-page-setup';
const layoutPageSetupTitle=document.createElement('div');
layoutPageSetupTitle.className='layout-group-title';
layoutPageSetupTitle.dataset.zh='页面设置';
layoutPageSetupTitle.dataset.en='Page Setup';
layoutPageSetupTitle.textContent=t('页面设置','Page Setup');
const layoutPageSetupControls=document.createElement('div');
layoutPageSetupControls.className='layout-group-controls';
const paperLabel=document.createElement('label');
paperLabel.className='layout-field';
paperLabel.append(t('纸张大小','Paper size'),pagePaper);
const orientationLabel=document.createElement('label');
orientationLabel.className='layout-field';
orientationLabel.append(t('纸张方向','Orientation'),pageOrientation);
const marginLabel=document.createElement('label');
marginLabel.className='layout-field';
marginLabel.append(t('页边距','Margins'),pageMarginPreset);
layoutPageSetupControls.append(paperLabel,orientationLabel,marginLabel);
for(const [sideText,input] of [[t('上边距','Top'),pageMarginTop],[t('右边距','Right'),pageMarginRight],[t('下边距','Bottom'),pageMarginBottom],[t('左边距','Left'),pageMarginLeft]]){
  const field=document.createElement('label');
  field.className='layout-field layout-margin-field';
  const caption=document.createElement('span');
  caption.textContent=sideText;
  field.append(caption,input);
  layoutPageSetupControls.append(field);
}
const columnsField=document.createElement('label');
columnsField.className='layout-field';
const columnsCaption=document.createElement('span');
columnsCaption.textContent=t('全局分栏','Global columns');
columnsField.append(columnsCaption,layoutColumns);
const localColumnsField=document.createElement('label');
localColumnsField.className='layout-field';
const localColumnsCaption=document.createElement('span');
localColumnsCaption.textContent=t('局部分栏','Local columns');
localColumnsField.append(localColumnsCaption,layoutLocalColumns,insertColumnsButton);
layoutPageSetupControls.append(columnsField,localColumnsField);
layoutPageSetup.append(layoutPageSetupTitle,layoutPageSetupControls);
const layoutParagraph=document.createElement('section');
layoutParagraph.className='layout-group';
layoutParagraph.id='layout-paragraph';
const layoutParagraphTitle=document.createElement('div');
layoutParagraphTitle.className='layout-group-title';
layoutParagraphTitle.dataset.zh='段落';
layoutParagraphTitle.dataset.en='Paragraph';
layoutParagraphTitle.textContent=t('段落','Paragraph');
const layoutParagraphControls=document.createElement('div');
layoutParagraphControls.className='layout-group-controls';
const layoutIndentDecrease=groupButton(layoutParagraphControls,['减少缩进','Decrease indent'],()=>indentSelectedParagraph(-1));
const layoutIndentIncrease=groupButton(layoutParagraphControls,['增加缩进','Increase indent'],()=>indentSelectedParagraph(1));
const layoutBefore=document.createElement('select');
layoutBefore.setAttribute('aria-label',t('段前间距','Space before'));
layoutBefore.append(new Option(t('段前 0pt','Before 0pt'),'0pt'),new Option(t('段前 6pt','Before 6pt'),'6pt'),new Option(t('段前 12pt','Before 12pt'),'12pt'));
const layoutAfter=document.createElement('select');
layoutAfter.setAttribute('aria-label',t('段后间距','Space after'));
layoutAfter.append(new Option(t('段后 0pt','After 0pt'),'0pt'),new Option(t('段后 6pt','After 6pt'),'6pt'),new Option(t('段后 12pt','After 12pt'),'12pt'));
layoutBefore.addEventListener('change',()=>updateSelectedParagraphs({spaceBefore:layoutBefore.value==='0pt'?null:layoutBefore.value}));
layoutAfter.addEventListener('change',()=>updateSelectedParagraphs({spaceAfter:layoutAfter.value==='0pt'?null:layoutAfter.value}));
layoutParagraphControls.append(layoutBefore,layoutAfter);
layoutParagraph.append(layoutParagraphTitle,layoutParagraphControls);
buildRibbonGroups(layoutGroup,[
  {id:'layout-page-setup',zh:'页面设置',en:'Page Setup',iconName:'layout',width:840,body:layoutPageSetupControls},
  {id:'layout-paragraph',zh:'段落',en:'Paragraph',iconName:'paragraph',width:300,body:layoutParagraphControls},
],['layout-paragraph','layout-page-setup']);
syncLayoutParagraph=()=>{
  if(!layoutBefore||!layoutAfter)return;
  const attrs=editor.getAttributes('paragraph');
  layoutBefore.value=attrs.spaceBefore??'0pt';
  layoutAfter.value=attrs.spaceAfter??'0pt';
};
pagePaper.addEventListener('change',()=>updatePageSetup({paper:pagePaper.value}));
pageOrientation.addEventListener('change',()=>updatePageSetup({orientation:pageOrientation.value}));
layoutColumns.addEventListener('change',()=>updateGlobalColumns(layoutColumns.value));
insertColumnsButton.addEventListener('click',()=>insertMultiColumn(Number(layoutLocalColumns.value)||2));
pageMarginPreset.addEventListener('change',()=>{
  if(MARGIN_PRESETS[pageMarginPreset.value])updatePageSetup({margin:MARGIN_PRESETS[pageMarginPreset.value]});
});
for(const [side,input] of [['top',pageMarginTop],['right',pageMarginRight],['bottom',pageMarginBottom],['left',pageMarginLeft]])input.addEventListener('change',()=>{
  const value=input.value.trim();
  if(/^\d+(?:\.\d+)?(?:mm|cm|in|pt)$/.test(value))updatePageSetup({margins:{[side]:value}});
  else input.value=pageSetup.margins[side];
});
editor.on('transaction',()=>syncLayoutParagraph?.());
editor.on('selectionUpdate',()=>syncLayoutParagraph?.());
applyPageSetup();
groupButton(tableGroup,'▦',()=>insertDefaultTable());
continueTablesButton=groupButton(tableGroup,['续表','Continue'],()=>{
  const enabled=!typesetPagination.getTableContinuation();
  typesetPagination.setTableContinuation(enabled);
  config.updateInterface({continuedTables:enabled});
  updateContinueTablesButton();
});
updateContinueTablesButton();
groupButton(tableGroup,['＋ 行','＋ Row'],addMatrixRow,'＋ Row');
groupButton(tableGroup,['＋ 列','＋ Column'],addMatrixColumn,'＋ Column');
groupButton(tableGroup,['－ 行','－ Row'],()=>editor.chain().focus().deleteRow().run(),'－ Row');
groupButton(tableGroup,['－ 列','－ Column'],()=>editor.chain().focus().deleteColumn().run(),'－ Column');
groupButton(tableGroup,['删除表格','Delete table'],()=>editor.chain().focus().deleteTable().run());
groupButton(tableGroup,['合并','Merge'],()=>editor.chain().focus().mergeCells().run(),'merge');
groupButton(tableGroup,['拆分','Split'],()=>editor.chain().focus().splitCell().run(),'split');
groupButton(tableGroup,'booktabs',()=>{if(editor.isActive('table'))editor.chain().focus().updateAttributes('table',{booktabs:!editor.getAttributes('table').booktabs}).run();});
groupButton(tableGroup,['题注','Caption'],async()=>{
  if(!editor.isActive('table'))return;
  const value=await askText(t('表格题注（LaTeX）','Table caption (LaTeX)'),editor.getAttributes('table').caption??'');
  if(value!==null)editor.chain().focus().updateAttributes('table',{caption:value||null,centered:true,placement:editor.getAttributes('table').placement??'htbp'}).run();
});
groupButton(tableGroup,'label',async()=>{
  if(!editor.isActive('table'))return;
  const value=await askText(t('表格标签键','Table label key'),editor.getAttributes('table').label??'');
  if(value!==null)editor.chain().focus().updateAttributes('table',{label:value||null}).run();
});
groupButton(tableGroup,['边框','Borders'],async()=>{
  if(!editor.isActive('table'))return;
  const mode=await askText(t('边框：grid 全部、outer 外框、horizontal 横线、none 无','Borders: grid, outer, horizontal, none'),editor.getAttributes('table').borderMode??'grid');
  if(mode && ['grid','outer','horizontal','none'].includes(mode)) editor.chain().focus().updateAttributes('table',{borderMode:mode,booktabs:false}).run();
});
groupButton(tableGroup,['线宽','Rule width'],async()=>{
  if(!editor.isActive('table'))return;
  const width=await askText(t('表格线宽（例如 0.8pt）','Table rule width (e.g. 0.8pt)'),editor.getAttributes('table').borderWidth??'0.4pt');
  if(width!==null && (!width || /^\d+(?:\.\d+)?pt$/.test(width))) editor.chain().focus().updateAttributes('table',{borderWidth:width||null}).run();
});
for(const [label,align] of [[['左','Left'],'left'],[['中','Center'],'center'],[['右','Right'],'right']]) groupButton(tableGroup,label,()=>{
  if(!editor.isActive('table'))return;
  const type=editor.isActive('tableHeader')?'tableHeader':'tableCell';
  editor.chain().focus().updateAttributes(type,{align}).run();
});
function tableOption(label,control){
  const field=document.createElement('label');
  field.className='table-option';
  const text=document.createElement('span');
  text.textContent=label;
  control.setAttribute('aria-label',label);
  field.append(text,control);
  return field;
}
function tableSection(title){
  const section=document.createElement('section');
  section.className='table-style-group';
  const heading=document.createElement('div');
  heading.className='table-style-group-title';
  heading.textContent=title;
  const body=document.createElement('div');
  body.className='table-style-group-body';
  section.append(heading,body);
  tableGroup.append(section);
  return body;
}
const tableCaptionSection=tableSection('表格样式');
const tableCaptionEnabled=document.createElement('input');tableCaptionEnabled.type='checkbox';
const tableCaptionInput=document.createElement('input');tableCaptionInput.type='text';tableCaptionInput.placeholder='Caption';
tableCaptionEnabled.setAttribute('aria-label',t('启用表格题注','Enable table caption'));
tableCaptionInput.setAttribute('aria-label',t('表格题注','Table caption'));
const tableCaptionToggleField=document.createElement('label');tableCaptionToggleField.className='table-option';
const tableCaptionToggleText=document.createElement('span');tableCaptionToggleText.textContent=t('题注','Caption');
tableCaptionToggleField.append(tableCaptionEnabled,tableCaptionToggleText);
const tableCaptionField=document.createElement('div');tableCaptionField.className='table-caption-field';tableCaptionField.append(tableCaptionInput);
tableCaptionSection.append(tableCaptionToggleField,tableCaptionField);
const tableRuleSection=tableSection('样式');
const tableLeftRule=document.createElement('input');tableLeftRule.type='checkbox';
const tableRightRule=document.createElement('input');tableRightRule.type='checkbox';
const tableMiddleVerticalRule=document.createElement('input');tableMiddleVerticalRule.type='checkbox';
const tableVerticalFirstRow=document.createElement('input');tableVerticalFirstRow.type='checkbox';
const tableTopRule=document.createElement('input');tableTopRule.type='checkbox';
const tableBottomRule=document.createElement('input');tableBottomRule.type='checkbox';
const tableRuleStyle=document.createElement('select');
for(const [value,label] of [['solid','实线'],['dashed','虚线'],['dotted','点线'],['double','双线']])tableRuleStyle.append(new Option(t(label,value),value));
const tableRuleWidth=document.createElement('select');
for(const value of ['0.2pt','0.4pt','0.8pt','1pt'])tableRuleWidth.append(new Option(value,value));
const tableMidRule=document.createElement('select');
tableMidRule.append(new Option(t('无','None'),'none'),new Option(t('首行下方','After first row'),'first'),new Option(t('所有行下方','All rows'),'all'));
const tableRuleGrid=document.createElement('div');tableRuleGrid.className='table-options-grid';
tableRuleGrid.append(
  tableOption(t('左竖线','Left rule'),tableLeftRule),
  tableOption(t('右竖线','Right rule'),tableRightRule),
  tableOption(t('中间竖线','Middle vertical rule'),tableMiddleVerticalRule),
  tableOption(t('竖线含首行','Rules in first row'),tableVerticalFirstRow),
  tableOption(t('上边线','Top rule'),tableTopRule),
  tableOption(t('下边线','Bottom rule'),tableBottomRule),
  tableOption(t('中间线','Middle rule'),tableMidRule),
  tableOption(t('线型','Line style'),tableRuleStyle),
  tableOption(t('线宽','Line width'),tableRuleWidth),
);
tableRuleSection.append(tableRuleGrid);
const tableStretchSection=tableSection('伸缩');
const tableArrayStretch=document.createElement('input');tableArrayStretch.type='number';tableArrayStretch.min='0.5';tableArrayStretch.max='3';tableArrayStretch.step='0.1';tableArrayStretch.value='1';
const tableFontSize=document.createElement('select');
for(const [value,label] of [['','默认'],['small','small'],['footnotesize','footnotesize'],['scriptsize','scriptsize'],['10pt','10pt'],['9pt','9pt']])tableFontSize.append(new Option(t(label,value),value));
const tableScale=document.createElement('input');tableScale.type='number';tableScale.min='0.3';tableScale.max='1.5';tableScale.step='0.05';tableScale.value='1';
const tableStretchGrid=document.createElement('div');tableStretchGrid.className='table-options-grid';
tableStretchGrid.append(
  tableOption(t('行距','Row stretch'),tableArrayStretch),
  tableOption(t('字号','Font size'),tableFontSize),
  tableOption(t('缩放','Scale'),tableScale),
);
tableStretchSection.append(tableStretchGrid);
function updateTableAttributes(patch,focus=true){
  const lineKeys=['leftRule','rightRule','middleVerticalRule','verticalFirstRow','topRule','bottomRule','midRuleMode','ruleStyle','ruleWidth'];
  if(Object.keys(patch).some(key=>lineKeys.includes(key)))patch={...patch,borderMode:null,booktabs:false,horizontalRuleMode:null};
  if(editor.isActive('table')){
    const current=editor.getAttributes('table');
    if(Object.entries(patch).every(([key,value])=>current[key]===value))return;
    const chain=editor.chain();
    if(focus)chain.focus().command(({tr})=>Boolean(closeHistory(tr)));
    chain.updateAttributes('table',patch).run();
  }
}
function syncTableControls(){
  const attrs=editor.isActive('table')?editor.getAttributes('table'):null;
  const disabled=!attrs;
  tableCaptionEnabled.checked=Boolean(attrs?.captionEnabled??(attrs?.caption!=null));
  tableCaptionInput.disabled=disabled||!tableCaptionEnabled.checked;
  if(document.activeElement!==tableCaptionInput)tableCaptionInput.value=attrs?.caption??'';
  tableLeftRule.checked=Boolean(attrs?.leftRule);
  tableRightRule.checked=Boolean(attrs?.rightRule);
  tableMiddleVerticalRule.checked=Boolean(attrs?.middleVerticalRule);
  tableVerticalFirstRow.checked=attrs?.verticalFirstRow!==false;
  tableTopRule.checked=Boolean(attrs?.topRule);
  tableBottomRule.checked=Boolean(attrs?.bottomRule);
  tableMidRule.value=attrs?.midRuleMode??'none';
  tableRuleStyle.value=attrs?.ruleStyle??'solid';
  tableRuleWidth.value=attrs?.ruleWidth??(attrs?.borderWidth??'0.4pt');
  tableArrayStretch.value=attrs?.arrayStretch??'1';
  tableFontSize.value=attrs?.fontSize??'';
  tableScale.value=attrs?.tableScale??'1';
}
tableCaptionEnabled.addEventListener('change',()=>updateTableAttributes({captionEnabled:tableCaptionEnabled.checked,caption:tableCaptionEnabled.checked?(editor.getAttributes('table').caption??''):null,centered:true,placement:editor.getAttributes('table').placement??'htbp'}));
tableCaptionInput.addEventListener('input',()=>{if(editor.isActive('table'))updateTableAttributes({caption:tableCaptionInput.value,captionEnabled:true,centered:true},false);});
tableCaptionInput.addEventListener('focus',()=>editor.view.dispatch(closeHistory(editor.state.tr)));
tableCaptionInput.addEventListener('blur',()=>editor.view.dispatch(closeHistory(editor.state.tr)));
for(const [control,key] of [[tableLeftRule,'leftRule'],[tableRightRule,'rightRule'],[tableMiddleVerticalRule,'middleVerticalRule'],[tableVerticalFirstRow,'verticalFirstRow'],[tableTopRule,'topRule'],[tableBottomRule,'bottomRule']])control.addEventListener('change',()=>updateTableAttributes({[key]:control.checked}));
tableMidRule.addEventListener('change',()=>updateTableAttributes({midRuleMode:tableMidRule.value}));
tableRuleStyle.addEventListener('change',()=>updateTableAttributes({ruleStyle:tableRuleStyle.value}));
tableRuleWidth.addEventListener('change',()=>updateTableAttributes({ruleWidth:tableRuleWidth.value}));
tableArrayStretch.addEventListener('change',()=>updateTableAttributes({arrayStretch:Number(tableArrayStretch.value)||1}));
tableFontSize.addEventListener('change',()=>updateTableAttributes({fontSize:tableFontSize.value||null}));
tableScale.addEventListener('change',()=>updateTableAttributes({tableScale:Number(tableScale.value)||1}));
editor.on('transaction',syncTableControls);editor.on('selectionUpdate',syncTableControls);syncTableControls();
groupButton(formatGroup,'B',()=>editor.chain().focus().toggleBold().run());
for (const [align,label] of [['left',['左对齐','Align left']],['right',['右对齐','Align right']],['center',['居中','Center']]]) {
  groupButton(formatGroup,label,()=>setParagraphAlignment(align));
}
groupButton(formatGroup,'I',()=>editor.chain().focus().toggleItalic().run());
groupButton(formatGroup,'U',()=>editor.chain().focus().toggleMark('underline').run());
groupButton(formatGroup,'S',()=>editor.chain().focus().toggleStrike().run());
groupButton(formatGroup,['清除格式','Clear formatting'],()=>editor.chain().focus().unsetAllMarks().run());
groupButton(formatGroup,'code',()=>editor.chain().focus().toggleCode().run());
groupButton(formatGroup,'quote',()=>editor.chain().focus().toggleBlockquote().run());
groupButton(formatGroup,'hr',()=>editor.chain().focus().setHorizontalRule().run());
groupButton(formatGroup,'x²',()=>editor.chain().focus().toggleMark('superscript').run());
groupButton(formatGroup,'x₂',()=>editor.chain().focus().toggleMark('subscript').run());
groupButton(formatGroup,'sc',()=>editor.chain().focus().toggleMark('smallcaps').run());
groupButton(formatGroup,'box',()=>spaceOverlay.toggleBox()).dataset.shortcut='editor.toggleBox';
groupButton(formatGroup,'\\LaTeX',()=>insertTextCommand('LaTeX'));
groupButton(formatGroup,'\\TeX',()=>insertTextCommand('TeX'));
const spaceOverlay=installSpaceOverlay(editor,paper,{selectionFocus:zoom});
const formattingMarks = groupButton(formatGroup,'¶',()=>{
  config.updateInterface({formattingMarks:!config.value.interface.formattingMarks});
  updateEditorDisplayPreferences();
});
function updateEditorDisplayPreferences() {
  const { formattingMarks:showMarks, caretMotion }=config.value.interface;
  documentPage.dataset.formattingMarks=String(showMarks);
  documentPage.dataset.caretMotion=String(caretMotion);
  spaceOverlay.setFormattingMarks(showMarks);
  formattingMarks.setAttribute('aria-pressed',String(showMarks));
}
updateEditorDisplayPreferences();
groupButton(formatGroup,'desc',()=>editor.chain().focus().insertContent({type:'descriptionList',content:[{type:'descriptionItem',attrs:{term:''},content:[{type:'paragraph'}]}]}).run());
function setListStyle(style) {
  if(editor.isActive('orderedList'))editor.chain().focus().updateAttributes('orderedList',{labelStyle:style}).run();
  else if(editor.isActive('bulletList'))editor.chain().focus().updateAttributes('bulletList',{marker:style}).run();
}
groupButton(formatGroup,'1.',()=>setListStyle('decimal'));
groupButton(formatGroup,['切换标记','Cycle marker'],()=>{ editor.view.focus(); shortcutActions.editor.toggleContextMarker(); }).dataset.shortcut='editor.toggleContextMarker';
groupButton(formatGroup,['列表降一级','Indent list item'],()=>indentListItem(editor));
groupButton(formatGroup,['列表升一级','Outdent list item'],()=>editor.chain().focus().liftListItem('listItem').run());
groupButton(formatGroup,'a.',()=>setListStyle('lower-alpha'));
groupButton(formatGroup,'A.',()=>setListStyle('upper-alpha'));
groupButton(formatGroup,'I.',()=>setListStyle('upper-roman'));
groupButton(formatGroup,'甲',()=>setListStyle('cjk-heavenly-stem'));
groupButton(formatGroup,'•',async()=>{const value=await askText(t('项目符号','Bullet marker'),'•');if(value)setListStyle(value);});
groupButton(referenceGroup,'label',async()=>{
  if (activeMath() || formulaAtSelection()) return editFormulaLabel();
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
async function manageCitations(){
  try{
    const documentBefore=editor.state.doc;
    const entry=await openCitationPanel({
      library: citationLibrary,
      texSource: source(),
      onLocateMissing: locateMissingCitation,
      onChange: persistCitationState,
      onRename: ({ oldKey, newKey }) => {
        const applied = applyCitationRenames(source(), { [oldKey]: newKey });
        if (applied.count) load(applied.text, false);
      },
      onInsertCitation: ({ command }) => {
        editor.chain().focus().insertContent(command).run();
      },
      onInsertBibliography: ({ command }) => {
        editor.chain().focus().insertContent(command).run();
      },
    });
    if(!entry || editor.state.doc!==documentBefore)return;
    const {key,file:sourcePath,blob}=entry;
    const sourceName=sourcePath.split('/').at(-1);
    if(!/^[\p{L}\p{N}_. -]+\.bib$/iu.test(sourceName))throw new Error(t('文献文件名不受支持','Unsupported bibliography filename'));
    const tex=source();
    const resources=[...tex.matchAll(/\\addbibresource(?:\[[^\]]*\])?\{([^{}]+)\}/g)].map(match=>match[1]);
    const classic=[...tex.matchAll(/\\bibliography\{([^{}]+)\}/g)].flatMap(match=>match[1].split(',').map(name=>name.trim()).filter(Boolean).map(name=>name.endsWith('.bib')?name:name+'.bib'));
    const linked=[...resources,...classic].filter(path=>path.split('/').at(-1)===sourceName);
    if(linked.length>1 || (!linked.length && classic.length))throw new Error(t('请关联文档中声明的文献文件','Attach the bibliography declared in the document'));
    const linkedPath=linked[0]??sourcePath;
    if (linkedPath !== sourcePath) citationLibrary.setSourcePath(sourcePath, linkedPath);
    rememberAsset(linkedPath,blob);
    if(!linked.length) {
      const eol=documentParts.eol;
      const hasBiblatex=/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^{}]*\bbiblatex\b[^{}]*\}/.test(documentParts.start);
      const declarations=(hasBiblatex?'':'\\usepackage{biblatex}'+eol)+'\\addbibresource{'+sourceName+'}'+eol;
      documentParts={...documentParts,start:documentParts.start.replace(/^\\begin\{document\}/m,()=>declarations+'\\begin{document}')};
    }
    persistCitationState();
    editor.chain().focus().insertContent({type:'cite',attrs:{key}}).run();
  }catch(error){
    document.querySelector('#status').hidden=false;
    document.querySelector('#status').textContent=error.message;
  }finally{
    refreshReferences(paper);
  }
}
groupButton(referenceGroup,'cite',manageCitations);

groupButton(referenceGroup,'toc',()=>{
  if(editor.isActive('tableOfContents'))editor.chain().focus().deleteSelection().run();
  else editor.chain().focus().insertContent({type:'tableOfContents'}).run();
});
groupButton(referenceGroup,['大纲','Outline'],documentOutline.show);
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
groupButton(mathGroup,'$$',()=>insertMath(true)).dataset.shortcut='editor.insertDisplayMath';
groupButton(mathGroup,'equation',()=>insertEquation());
async function editFormulaLabel() {
  const field=activeMath();
  const position=field?.closest('[data-math-view]')?.getMathPosition?.() ?? formulaAtSelection()?.position;
  if (position === undefined) return;
  const node=editor.state.doc.nodeAt(position);
  if(node?.type.name!=='mathBlock')return;
  const alignment=/^(?:align|alignat|flalign)$/.test(displayEnvironment(node.attrs.latex) ?? '');
  if(node.attrs.delimiter!=='equation' && !alignment)return;
  const model=field?._mathfield?.model;
  const cursorRow=model && mathPositionPath(model,field.position).find(([branch])=>Array.isArray(branch))?.[0][0];
  const numbered=numberedMathRows(node.attrs).filter(row=>!row.unnumbered && !row.label);
  const row=numbered.find(item=>item.index===cursorRow) ?? numbered.find(item=>item.index===node.attrs.labelRow) ?? numbered[0];
  if(!row)return;
  const label=await askText(t('公式标签','Equation label'),node.attrs.label??'');
  const currentPosition=field?.closest('[data-math-view]')?.getMathPosition?.() ?? position;
  const current=editor.state.doc.nodeAt(currentPosition);
  if(label===null || !/^[\p{L}\p{N}:_.-]*$/u.test(label) ||
      current?.type!==node.type || current.attrs.delimiter!==node.attrs.delimiter ||
      (current!==node && (!field?.isConnected || current.attrs.id!==node.attrs.id)))return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(currentPosition,undefined,{...current.attrs,label:label||null,labelRow:label?row.index:null}));
  field?.focus();
}
groupButton(mathGroup,'equation label',editFormulaLabel);
groupButton(mathGroup,'frac',()=>insertMath(false,'\\frac{\\placeholder{}}{\\placeholder{}}'));
groupButton(mathGroup,['公式换行','Math line break'],()=>activeMath()?.dispatchEvent(new Event('lineae-math-newline')));
groupButton(mathGroup,['退出公式','Exit formula'],()=>activeMath()?.dispatchEvent(new Event('lineae-leave-formula'))).dataset.shortcut='math.leaveFormula';
for (const [label,command,latex] of [
  ['sqrt','sqrt','\\sqrt{\\placeholder{}}'],
  ['ⁿ√','indexedRoot','\\sqrt[\\placeholder{}]{\\placeholder{}}'],
  ...['sum','int','prod','iint','iiint','oint','oiint'].map(name=>[
    ['sum','int'].includes(name) ? name : '\\'+name,name,'\\'+name+'\\mathord{\\placeholder{}}',
  ]),
]) {
  groupButton(mathGroup,label,()=>{
    const field=activeMath();
    if(field)runMathShortcut(command,field,{repeat:false});
    else insertMath(false,latex);
  }).dataset.shortcut='math.'+command;
}
groupButton(mathGroup,'\\left',()=>chooseMathDelimiters(activeMath()));
groupButton(mathGroup,'\\right',()=>chooseMathDelimiters(activeMath(),true));
groupButton(mathGroup,['单括号','Literal fence'],()=>armLiteralFence(activeMath()));
groupButton(mathGroup,'matrix',()=>insertMath(false,matrixSource('matrix')));
groupButton(mathGroup,'cases',()=>insertMath(true,'\\begin{cases}\\placeholder{} & \\placeholder{}\\\\ \\placeholder{} & \\placeholder{}\\end{cases}'));
groupButton(mathGroup,'align',structureCommands.align);
groupButton(mathGroup,'align*',structureCommands['align*']);

const header=document.querySelector('header');
const ribbon=document.createElement('div');ribbon.className='ribbon';
const tabs=document.createElement('nav');tabs.className='ribbon-tabs';
const home=document.createElement('div');home.className='tools';
const insert=document.createElement('div');insert.className='tools';
groupButton(insert,['分页','New page'],()=>editor.chain().focus().insertContent({type:'pageBreak'}).run());
groupButton(insert,['图片','Image'],()=>insertLocalImage(editor));
groupButton(insert,['子图','Subfigure'],()=>insertSubfigures(editor));
const codeLanguageButton=groupButton(insert,['代码块','Code block'],async()=>{
  const language=await askText(t('代码语言，例如 Python、Java 或 C++','Code language, e.g. Python, Java or C++'),editor.getAttributes('codeBlock').language??'');
  if(language===null || (language && !/^[A-Za-z0-9+_-]+$/.test(language))) return;
  if(editor.isActive('codeBlock')) editor.chain().focus().updateAttributes('codeBlock',{language:language||null}).run();
  else editor.chain().focus().setCodeBlock({language:language||null}).run();
});
groupButton(insert,['CircuiTikZ','CircuiTikZ'],()=>{
  try{
    const editorEl=document.querySelector('.document-page .ProseMirror');
    const textwidthCm=editorEl?editorEl.clientWidth*2.54/96:15;
    const tikz=new TikzEditor({getTextwidthCm:()=>textwidthCm});
    tikz.open(code=>{ if(code) editor.chain().focus().insertContent({type:'codeBlock',attrs:{language:'tikz'},content:[{type:'text',text:code}]}).run(); });
  }catch(error){ console.error(error); alert('CircuiTikZ editor failed: '+(error?.message||error)); }
});
const tikzButton=groupButton(insert,['TikZ','TikZ'],()=>{
  try{
    openTikzStudio({
      onInsert:payload=>insertTikzStudioBlock(payload),
    });
  }catch(error){ console.error(error); alert('TikZ editor failed: '+(error?.message||error)); }
});
import { installMathFloatToolbar } from './ui/math-float-toolbar.js';
const files=header.querySelector('.tools');
const attachFolder=groupButton(files,['关联资源目录','Attach asset folder'],()=>{
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
attachFolder.dataset.tool='assets';
for(const control of [...tools.children]) {
  (control.hasAttribute('data-home') || control.tagName==='SELECT' || ['↶','↷','B','I','U','H'].includes(control.textContent)?home:insert).append(control);
}
const groups={files,home,insert,layout:layoutGroup,table:tableGroup,format:formatGroup,reference:referenceGroup,math:mathGroup};
headerFooterPanel=installHeaderFooterPanel({
  readState:()=>readPageFurniture(documentParts.start),
  onChange:applyFurnitureState,
});
groups.headerFooter=headerFooterPanel.panel;
headerFooterPanel.refresh();
imagePanel=installImagePanel({
  getSpacing:()=>readImageSpacing(documentParts.start),
  onSpacing:updateImageSpacing,
  onReplace:()=>{if(imageSelection!==null)replaceLocalImage(editor,imageSelection);},
  onCrop:()=>{if(imageSelection!==null)startImageCrop(editor,imageSelection);},
  onGroup:groupSelectedImages,
  onUngroup:ungroupSelectedImages,
  onUpdate:patch=>updateSelectedImageAttrs(patch),
});
groups.image=imagePanel.panel;
let subfigurePanel=null;
subfigurePanel=installSubfigurePanel({onUpdate:patch=>updateSelectedSubfigureAttrs(patch),onUngroup:ungroupSelectedImages});
groups.subfigure=subfigurePanel.panel;
imagePanel.setSpacing(readImageSpacing(documentParts.start));
const captions={files:['文件','File'],home:['主页','Home'],insert:['插入','Insert'],layout:['布局','Layout'],table:['表格','Table'],format:['格式','Format'],reference:['引用','Reference'],math:['数学','Math'],headerFooter:['页眉页脚','Header & Footer'],image:['图片','Image'],subfigure:['子图','Subfigure']};
const language=document.querySelector('#language');
const fontFamilyControl=home.querySelector('[data-format-attribute="fontFamily"]');
const fontSizeControl=home.querySelector('[data-format-attribute="fontSize"]');
const colorControl=home.querySelector('.color-control');
const clipboard=createClipboard(editor,{getField:activeMath,getSource:()=>sourceView.editorView});
let formatPainter;
let clipboardStatusTimer;
function reportClipboardError(error){
  const status=document.querySelector('#status');
  status.hidden=false;
  status.textContent=error?.message??t('剪贴板操作失败','Clipboard operation failed');
  clearTimeout(clipboardStatusTimer);
  clipboardStatusTimer=setTimeout(()=>{status.hidden=true;},4000);
}
const textOnly = callback => (...args) => activeMath() ? false : callback(...args);
function changeFontSize(direction) {
  if (activeMath()) return false;
  const sizes=[8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72];
  const current=Number.parseFloat(selectionTypography(editor).fontSize)||10;
  const next=direction>0
    ? sizes.find(size => size>current+0.01)
    : [...sizes].reverse().find(size => size<current-0.01);
  if (!next) return false;
  return editor.chain().focus().setMark('textStyle',{fontSize:next+'pt'}).run();
}
homeRibbon=buildHomeRibbon(home,{documentClass:documentClassFromSource(documentParts.start),actions:{
  copy:()=>clipboard.copy().catch(reportClipboardError),
  cut:()=>clipboard.cut().catch(reportClipboardError),
  paste:mode=>clipboard.paste(mode).catch(reportClipboardError),
  formatPainter:event=>formatPainter?.activate(event),
  undo:undoDocument,
  redo:redoDocument,
  bold:textOnly(()=>editor.chain().focus().toggleBold().run()),
  italic:textOnly(()=>editor.chain().focus().toggleItalic().run()),
  underline:textOnly(()=>editor.chain().focus().toggleMark('underline').run()),
  underlineStyle:textOnly(style=>editor.chain().focus().setMark('underline',{style}).run()),
  strike:textOnly(()=>editor.chain().focus().toggleStrike().run()),
  subscript:textOnly(()=>editor.chain().focus().toggleMark('subscript').run()),
  superscript:textOnly(()=>editor.chain().focus().toggleMark('superscript').run()),
  clearFormatting:textOnly(()=>editor.chain().focus().unsetAllMarks().run()),
  characterBorder:textOnly(()=>spaceOverlay.toggleBox()),
  fontGrow:textOnly(()=>changeFontSize(1)),
  fontShrink:textOnly(()=>changeFontSize(-1)),
  highlight:textOnly(color=>editor.chain().focus().setMark('textStyle',{backgroundColor:color??null}).run()),
  circled:textOnly(()=>editor.chain().focus().toggleMark('circled').run()),
  bullets:()=>editor.chain().focus().toggleBulletList().run(),
  numbering:()=>editor.chain().focus().toggleOrderedList().run(),
  bulletStyle:marker=>setListStyle(marker),
  numberStyle:style=>setListStyle(style),
  indentDecrease:()=>indentSelectedParagraph(-1),
  indentIncrease:()=>indentSelectedParagraph(1),
  alignLeft:()=>setParagraphAlignment('left'),
  alignCenter:()=>setParagraphAlignment('center'),
  alignRight:()=>setParagraphAlignment('right'),
  alignJustify:()=>setParagraphAlignment('justify'),
  lineSpacing:value=>updateSelectedParagraphs({lineSpacing:value&&value!==1?value:null}),
  paragraphSpacing:(before,after)=>updateSelectedParagraphs({spaceBefore:before??null,spaceAfter:after??null}),
  paragraphShading:color=>updateSelectedParagraphs({shading:color??null}),
  paragraphBorder:()=>{
    const position=selectedParagraphPositions()[0];
    const border=Boolean(position!==undefined && editor.state.doc.nodeAt(position)?.attrs.border);
    return updateSelectedParagraphs({border:!border});
  },
  sort:mode=>sortParagraphs(mode),
  formattingMarks:()=>{
    config.updateInterface({formattingMarks:!config.value.interface.formattingMarks});
    updateEditorDisplayPreferences();
    syncHomeToolbar();
  },
  style:preset=>{
    const level=Number(typeof preset==='number'?preset:preset?.level??0);
    if(!level)return editor.chain().focus().setParagraph().run();
    const command=typeof preset==='object'?preset?.command??null:null;
    return editor.chain().focus().setHeading({level,command:null}).updateAttributes('heading',{command}).run();
  },
  find:documentFind.show,
}});
formatPainter=installFormatPainter(editor,{button:homeRibbon.refs.formatPainter,getField:activeMath});
if (fontFamilyControl) homeRibbon.slots.font.prepend(fontFamilyControl);
if (fontSizeControl) homeRibbon.slots.font.insertBefore(fontSizeControl,fontFamilyControl?.nextSibling??homeRibbon.slots.font.firstChild);
if (colorControl) homeRibbon.slots.color.append(colorControl);
// styleSelect 槽已移除：headingMenu 仅由源码模式工具栏使用。
homeRibbon.refs.find.dataset.shortcut='editor.find';
function syncHomeToolbar() {
  if (!sourceView.hidden) return;
  const pressed=(control,value)=>control?.setAttribute('aria-pressed',String(Boolean(value)));
  pressed(homeRibbon.refs.bold,editor.isActive('bold'));
  pressed(homeRibbon.refs.italic,editor.isActive('italic'));
  pressed(homeRibbon.refs.underline,editor.isActive('underline'));
  pressed(homeRibbon.refs.strike,editor.isActive('strike'));
  pressed(homeRibbon.refs.subscript,editor.isActive('subscript'));
  pressed(homeRibbon.refs.superscript,editor.isActive('superscript'));
  pressed(homeRibbon.refs.highlight,Boolean(editor.getAttributes('textStyle').backgroundColor));
  pressed(homeRibbon.refs.circled,editor.isActive('circled'));
  const textBlocked=Boolean(activeMath());
  for (const name of ['bold','italic','underline','strike','subscript','superscript','clearFormatting','characterBorder','highlight','circled','fontGrow','fontShrink']) {
    if (homeRibbon.refs[name]) homeRibbon.refs[name].disabled=textBlocked;
  }
  pressed(homeRibbon.refs.bullets,editor.isActive('bulletList'));
  pressed(homeRibbon.refs.numbering,editor.isActive('orderedList'));
  pressed(homeRibbon.refs.formattingMarks,config.value.interface.formattingMarks);
  const align=editor.getAttributes('paragraph').align??'left';
  for (const key of ['left','center','right','justify']) pressed(homeRibbon.refs.align[key],align===key);
  pressed(homeRibbon.refs.shading,Boolean(editor.getAttributes('paragraph').shading));
  pressed(homeRibbon.refs.border,Boolean(editor.getAttributes('paragraph').border));
  const heading=editor.getAttributes('heading');
  const activeStyle=activeStyleKey(heading,homeRibbon.refs.stylePresets??[]);
  for (const [key,control] of homeRibbon.refs.styles) pressed(control,key===activeStyle);
}
editor.on('transaction',syncHomeToolbar);
document.addEventListener('focusin',()=>{ if(sourceView.hidden) syncHomeToolbar(); },true);
document.addEventListener('focusout',()=>{ if(sourceView.hidden) setTimeout(syncHomeToolbar,0); },true);
syncHomeToolbar();
const importConfig=groupButton(files,['导入 YAML','Import YAML'],()=>{
  const picker=document.createElement('input');
  picker.type='file';
  picker.accept='.yaml,.yml,application/yaml,text/yaml';
  picker.addEventListener('change',async()=>{
    const file=picker.files[0];
    if (!file) return;
    const status=document.querySelector('#status');
    try {
      config.importYaml(await file.text());
      applyImportedPreferences();
      status.textContent=t('已应用 YAML 配置','YAML settings applied');
    } catch (error) {
      status.textContent=t('无法读取 YAML 配置','Could not load YAML settings')+' · '+error.message;
    }
    status.hidden=false;
  },{once:true});
  picker.click();
});
importConfig.hidden=true;
const exportConfig=groupButton(files,['导出 YAML','Export YAML'],()=>{
  saveZoom();
  const url=URL.createObjectURL(new Blob([config.exportYaml()],{type:'application/yaml;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='config.yaml';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
exportConfig.hidden=true;
const saveAsButton=groupButton(files,['另存为','Save as'],()=>saveDocument(true));
saveAsButton.dataset.tool='saveAs';
let releaseFileNavigation;
function updateFileTools() {
  const order=config.value.interface.toolbar;
  for (const control of files.querySelectorAll('[data-tool]')) control.hidden=control.dataset.tool==='language'||!order.includes(control.dataset.tool);
  for (const name of order) files.insertBefore(files.querySelector(`[data-tool="${name}"]`),importConfig);
  releaseFileNavigation?.();
  releaseFileNavigation=installRovingFocus(files,{onActivate:control=>control.click()});
}
function applyImportedPreferences() {
  clearTimeout(zoomSaveTimer);
  language.value=configuredLanguage();
  theme.set(config.value.interface.theme);
  setZoom(config.value.interface.zoom);
  updateEditorDisplayPreferences();
  const { smartFences }=config.value.editing;
  configureMathFences(smartFences);
  for (const field of paper.querySelectorAll('math-field')) field.smartFence=smartFences;
  sourceView.configure();
  shortcutPriority.refresh();
  toolbarController.refresh();
  updateFileTools();
  updateLanguage();
}
function updateShortcutHints() {
  const display={ctrl:'Ctrl',meta:'Meta',alt:'Alt',shift:'Shift',equal:'=',plus:'+',minus:'−'};
  const format=stroke=>stroke.split('+').map(key=>display[key] ?? key.toUpperCase()).join('+');
  for (const control of ribbon.querySelectorAll('[data-shortcut]')) {
    const [scope,command]=control.dataset.shortcut.split('.');
    const binding=config.bindings.scopes.get(scope)?.find(entry=>entry.command===command);
    control.dataset.tooltipZh=control.dataset.tooltipBaseZh??control.dataset.tooltipZh??'';
    control.dataset.tooltipEn=control.dataset.tooltipBaseEn??control.dataset.tooltipEn??'';
    if (!binding) continue;
    const shortcut=[binding.first,binding.second].filter(Boolean).map(format).join(' ');
    control.dataset.tooltipZh+=' · '+shortcut;
    control.dataset.tooltipEn+=' · '+shortcut;
  }
}
language.value=configuredLanguage();
function updateLanguage() {
  setLanguage(language.value);
  document.documentElement.lang=getLanguage();
  localize(document);
  shortcutPriority.relocalize();
  for(const tab of tabs.children)tab.textContent=t(captions[tab.dataset.group][0],captions[tab.dataset.group][1]);
  commands.setAttribute('aria-label',t('LaTeX 补全','LaTeX completion'));
  filter.placeholder=t('LaTeX 命令','LaTeX command');
  filter.setAttribute('aria-label',filter.placeholder);
  headingMenu.setAttribute('aria-label',t('段落样式','Paragraph style'));
  const styleLabels=[['正文','Normal'],['标题 1','Heading 1'],['标题 2','Heading 2'],['标题 3','Heading 3']];
  [...headingMenu.options].forEach((option,index)=>{if(styleLabels[index])option.text=t(...styleLabels[index]);});
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
  projectExplorer?.relocalize?.();
  documentFind.relocalize();
  documentOutline.relocalize();
  sourceView.relocalize();toolbarController.relocalize();settingsPanel.relocalize();settingsButton.title=t('设置','Settings');settingsButton.setAttribute('aria-label',settingsButton.title);
  applyToolbarDescriptions(ribbon);
  updateShortcutHints();
  updateThemeButton();
  updateSourceButton();
  updatePaginationButton();
  updateContinueTablesButton();
  renderMeta();
  updateEnvironment();
  syncHomeToolbar();
  homeRibbon.refreshLayout?.();
  count.textContent=editor.getText().length+' '+t('字符','characters');
}
let headerFooterMode=false;
function setHeaderFooterMode(active){
  if(active===headerFooterMode)return;
  if(active && !sourceView.hidden)setSourceMode(false);
  headerFooterMode=active;
  documentPage.classList.toggle('header-footer-mode',active);
  editor.setEditable(!active);
  if(active){
    headerFooterPanel.enter();
  }else{
    headerFooterPanel.leave();
    if(sourceView.hidden)editor.chain().focus().run();
  }
}
function selectGroup(name) {
  ribbon.dataset.ribbonPage=name;
  for(const [key,panel] of Object.entries(groups)) panel.hidden=key!==name;
  for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.group===name));
  setHeaderFooterMode(name==='headerFooter');
  groups[name]?.refreshLayout?.();
  if(name==='home')homeRibbon.refreshLayout?.();
}
for(const name of Object.keys(groups)) {
  const tab=document.createElement('button');tab.type='button';tab.dataset.group=name;
  tab.addEventListener('mousedown',event=>event.preventDefault());
  tab.addEventListener('click',()=>{toolbarController.show();selectGroup(name);});tabs.append(tab);
}
const imageTab=tabs.querySelector('[data-group=image]');
if(imageTab)imageTab.hidden=true;
const subfigureTab=tabs.querySelector('[data-group=subfigure]');
if(subfigureTab)subfigureTab.hidden=true;
const tableTab=tabs.querySelector('[data-group=table]');
if(tableTab)tableTab.hidden=true;
function syncTableTab(){
  if(!tableTab)return;
  const active=sourceView.hidden&&editor.isActive('table');
  tableTab.hidden=!active;
  if(active)syncTableControls();
  else if(ribbon.dataset.ribbonPage==='table')selectGroup('home');
}
editor.on('selectionUpdate',syncTableTab);
editor.on('transaction',({transaction})=>{if(transaction.selectionSet)syncTableTab();});
function currentImageSelection(){
  const selection=editor.state.selection;
  return selection instanceof NodeSelection && selection.node.type.name==='documentImage'
    ? {position:selection.from,node:selection.node} : null;
}
function imageBlocksInSelection(){
  const selection=editor.state.selection;
  if(!sourceView.hidden||selection instanceof NodeSelection||selection.empty)return [];
  const blocks=[];
  editor.state.doc.forEach((node,offset)=>{
    if(node.type.name==='documentImage'&&offset<selection.to&&offset+node.nodeSize>selection.from)blocks.push({node,position:offset});
  });
  return blocks;
}
function selectedImageBlocks(){
  const blocks=imageBlocksInSelection();
  if(blocks.length<2)return [];
  const first=blocks[0].position;
  const last=blocks.at(-1).position+blocks.at(-1).node.nodeSize;
  let valid=true;
  editor.state.doc.forEach((node,offset)=>{
    if(offset<first||offset+node.nodeSize>last||node.type.name==='documentImage')return;
    if(!(node.type.name==='paragraph'&&!node.textContent.trim()))valid=false;
  });
  return valid?blocks:[];
}
function subfiguresAncestor(position){
  const $pos=editor.state.doc.resolve(position);
  for(let depth=$pos.depth;depth>0;depth-=1){
    if($pos.node(depth).type.name==='subfigures')return $pos.before(depth);
  }
  return null;
}
function groupSelectedImages(){
  const blocks=selectedImageBlocks();
  if(blocks.length<2)return false;
  const width=(Math.min(0.48,0.94/blocks.length)).toFixed(2)+'\\textwidth';
  const children=blocks.map(({node})=>editor.schema.nodes.documentImage.create({
    ...node.attrs,
    figure:false,wrap:false,figureSource:null,placement:null,fixed:false,
    centered:true,align:'center',height:null,scale:null,width,
  }));
  const subfigures=editor.schema.nodes.subfigures.create({
    placement:null,fixed:false,caption:null,captionEnabled:false,captionNumbered:true,label:null,
  },children);
  const from=blocks[0].position,to=blocks.at(-1).position+blocks.at(-1).node.nodeSize;
  const transaction=editor.state.tr.replaceWith(from,to,subfigures);
  try{transaction.setSelection(NodeSelection.create(transaction.doc,from));}catch{}
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}
function ungroupSubfigures(position){
  const node=editor.state.doc.nodeAt(position);
  if(node?.type.name!=='subfigures')return false;
  const source=node.content.content;
  const mainCaption=node.attrs.captionEnabled||node.attrs.caption!=null?node.attrs.caption:null;
  const mainLabel=node.attrs.label??null;
  const images=source.map((child,index)=>{
    const attrs={...child.attrs};
    if(index===source.length-1){
      if(mainCaption!=null&&!(attrs.captionEnabled&&attrs.caption)){attrs.caption=mainCaption;attrs.captionEnabled=true;}
      if(mainLabel&&!attrs.label)attrs.label=mainLabel;
    }
    const figure=Boolean(attrs.captionEnabled||attrs.caption!=null||attrs.label);
    return editor.schema.nodes.documentImage.create({
      ...attrs,figure,wrap:false,figureSource:null,placement:null,fixed:false,centered:true,
    });
  });
  const transaction=editor.state.tr.replaceWith(position,position+node.nodeSize,images);
  try{transaction.setSelection(NodeSelection.create(transaction.doc,position));}catch{}
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}
function ungroupSelectedImages(){
  const selection=editor.state.selection;
  if(selection instanceof NodeSelection&&selection.node.type.name==='subfigures')return ungroupSubfigures(selection.from);
  const found=currentImageSelection();
  if(found){
    const parent=subfiguresAncestor(found.position);
    if(parent!==null)return ungroupSubfigures(parent);
  }
  return false;
}
function updateSelectedSubfigureAttrs(patch){
  const selection=editor.state.selection;
  if(!(selection instanceof NodeSelection)||selection.node.type.name!=='subfigures')return;
  editor.commands.updateAttributes('subfigures',patch);
  subfigurePanel?.setValues({...selection.node.attrs,...patch});
}
function syncImageTab(){
  if(!imageTab)return;
  const found=sourceView.hidden ? currentImageSelection() : null;
  imageSelection=found?.position??null;
  const selectedImages=sourceView.hidden && !found ? imageBlocksInSelection() : [];
  const multi=selectedImages.length>=2 ? selectedImageBlocks() : [];
  imageTab.hidden=!found&&selectedImages.length<2;
  const subSel=sourceView.hidden&&editor.state.selection instanceof NodeSelection&&editor.state.selection.node.type.name==='subfigures'?editor.state.selection.node:null;
  if(subfigureTab)subfigureTab.hidden=!subSel;
  subfigurePanel?.setValues(subSel?.attrs??null);
  if(subSel&&ribbon.dataset.ribbonPage!=='subfigure'&&ribbon.dataset.ribbonPage!=='headerFooter')selectGroup('subfigure');
  else if(!subSel&&ribbon.dataset.ribbonPage==='subfigure')selectGroup('home');
  if(found){
    imagePanel.setMultiSelection(0);
    imagePanel.setPath(found.node.attrs.path);
    const figure=editor.view.nodeDOM(found.position);
    const imageElement=figure?.querySelector?.('img');
    const frame=figure?.querySelector?.('.document-image-frame');
    const relativeWidth=/^(\d+(?:\.\d+)?)\\(?:textwidth|linewidth|columnwidth)$/.exec(String(found.node.attrs.width??''));
    const fullWidth=imageElement?.offsetWidth||frame?.clientWidth;
    const textWidth=fullWidth&&relativeWidth&&Number(relativeWidth[1])>0
      ? fullWidth/Number(relativeWidth[1])
      : figure?.closest?.('.ProseMirror')?.clientWidth||editor.view.dom.clientWidth||0;
    imagePanel.setValues(found.node.attrs,{
      naturalWidth:imageElement?.naturalWidth||0,
      naturalHeight:imageElement?.naturalHeight||0,
      textWidth,
    });
    imagePanel.setGroupState(subfiguresAncestor(found.position)!==null?'ungroup':'none');
    if(ribbon.dataset.ribbonPage!=='image' && ribbon.dataset.ribbonPage!=='headerFooter')selectGroup('image');
  }else if(selectedImages.length>=2){
    imagePanel.setMultiSelection(selectedImages.length);
    imagePanel.setGroupState(multi.length>=2?'group':'none');
    if(ribbon.dataset.ribbonPage!=='image' && ribbon.dataset.ribbonPage!=='headerFooter')selectGroup('image');
  }else{
    imagePanel.setMultiSelection(0);
    imagePanel.setGroupState('none');
    if(ribbon.dataset.ribbonPage==='image')selectGroup('home');
  }
}
editor.on('selectionUpdate',syncImageTab);
editor.on('transaction',({transaction})=>{if(transaction.selectionSet)syncImageTab();});
ribbon.append(tabs,files,home,insert,layoutGroup,tableGroup,formatGroup,referenceGroup,mathGroup,imagePanel.panel,subfigurePanel.panel,headerFooterPanel.panel);header.append(ribbon);tools.remove();
groupButton(insert,'figure',()=>insertLocalImage(editor));
sourceToolbar = installSourceToolbar({ribbon,groups,source:sourceView,rich:paper,heading:headingMenu});
const toolbarController=installFloatingToolbar({header,ribbon,sourceView,getAutoHide:()=>sourceView.hidden?config.value.interface.toolbarAutoHide:config.value.interface.sourceToolbarAutoHide});
installMathFloatToolbar({ editor });
const settingsPanel=installSettingsPanel({config,onApply:applyImportedPreferences,onImport:()=>importConfig.click(),onExport:()=>exportConfig.click(),getDocument:()=>{sourceView.flush();return documentParts.start?structuredClone(pageSetup):null;},applyDocument:updatePageSetup});
const settingsButton=document.createElement('button');settingsButton.id='settings-open';settingsButton.type='button';settingsButton.append(icon('settings'));settingsButton.onclick=()=>settingsPanel.show();footer.insertBefore(settingsButton,footer.querySelector(':scope>.tex-foot')??count);
document.addEventListener('lineae-open-settings',()=>settingsPanel.show());
document.addEventListener('lineae-open-outline',()=>projectExplorer.showOutline());
document.addEventListener('lineae-open-includes',()=>projectExplorer.showIncludes());
decorateToolbar(ribbon);
const tooltips=installTooltips(document.body,{document,language:language.value});
for(const control of ribbon.querySelectorAll('button')) if(!control.closest('.ribbon-menu')) control.dataset.rovingItem='';
installRovingFocus(tabs,{initial:Object.keys(groups).indexOf('home'),onActivate:control=>control.click()});
for(const [name,panel] of Object.entries(groups)) {
  if (name!=='files') installRovingFocus(panel,{onActivate:control=>control.click()});
}
const download=document.querySelector('#download');
language.addEventListener('change',()=>{config.updateInterface({language:language.value});updateLanguage();});
updateFileTools();updateLanguage();selectGroup('home');
syncUndoButtons();

installContextMenu(editor, paper, language, message => {
  const status = document.querySelector('#status');
  status.hidden = false;
  status.textContent = message;
});
