import {nativeEditorRange} from './editor/native-text/editor-range.mjs';
import {projectMixedDocument,projectTextDocument} from './editor/native-text/projection.mjs';
import {nativeMathCommandNames,projectMath} from './editor/native-math/source.mjs';
import {nativeMathContext} from './editor/native-math/resolve.mjs';
import {documentMetadata,writeDocumentMetadata} from '../latex/document-metadata.mjs';
import {resolvePackages} from '../latex/packages.mjs';
import {referenceAt} from '../latex/reference-commands.mjs';
import {sourceStructure} from '../latex/source-structure.mjs';
import {insertTableSourceColumn,insertTableSourceRow,mergeTableSourceCells,mergeTableSourceRows,removeTableSourceColumn,removeTableSourceRow,splitTableSourceCell,splitTableSourceRowspan} from '../latex/tabularx.mjs';
import {editTblrColumn,editTblrRow,mergeTblrCells,splitTblrCell} from '../latex/tblr.mjs';
import {rasterDrawingRanges,tikzDrawingRanges} from '../latex/images.mjs';
import {loadLegacyMath,nativeOnlyAcceptance,nativeWorkspaceRequested} from './editor/native-surface/acceptance-mode.mjs';
import {sameTable} from './editor/native-surface/document-session.mjs';
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
import {installNativeTexPreview} from './ui/native-tex-preview.mjs';
import {matchesRichFormula,richSlotPosition} from './editor/native-math/rich-slot.mjs';
import {nativeAttachedSnapshot,nativeProjectSnapshot} from './typesetting/rtex/project-snapshot.mjs';
import {stagedRasterPath} from './typesetting/rtex/raster-assets.mjs';
import {installSettingsPanel} from './ui/settings-panel.js';
import { buildHomeRibbon } from './ui/home-ribbon.js';
import { activeStyleKey, documentClassFromSource } from './ui/style-presets.mjs';
import { buildRibbonGroups } from './ui/ribbon-groups.js';
import {installHeaderFooterPanel} from './ui/header-footer-panel.js';
import { sourceProjection, richSourceChanges, standaloneParagraphDraft, standaloneMathChanges, matchesParagraphGap } from './editor/source-sync.js';
import { installSourceToolbar } from './editor/source-toolbar.js';
import { createSourceWorkspace } from './editor/source-workspace.js';
import { DEFAULT_DOCUMENT_SOURCE } from './editor/default-document.mjs';
import { indentLatex } from './editor/latex-indent.mjs';
import { installContextMenu } from './editor/context-menu.js';
import { textCommands } from '../latex/inline.mjs';
import { markerInput, listMarker } from '../latex/list-numbering.mjs';
import { closeHistory, isHistoryTransaction } from '@tiptap/pm/history';
import { exitCode } from '@tiptap/pm/commands';
import { mathFontStyles, applyMathFont } from './editor/math-formatting.js';
import { installFormatControls } from './editor/format-controls.js';
import { selectionTypography } from './editor/selection-typography.js';
import { createClipboard } from './editor/clipboard.js';
import { installFormatPainter } from './editor/format-painter.js';
import { decorateToolbar, applyToolbarDescriptions, icon } from './editor/icons.js';
import { PaperBehavior } from './editor/paper-behavior.js';
import { MathNode, MathBlock, configureMathFences, focusInsertedOperator, insertFormula, isMathOperatorWithBody, mathEnvironment, mathPositionPath, mathOffsetAtPath, toggleDisplayStyle } from './editor/math-node.js';
import { MathGlue } from './editor/math-glue.js';
import { Ref, Label, Cite, Footnote, TableOfContents, refreshReferences, collectReferenceLabels, installDocumentOutline } from './editor/references.js';
import { createCitationLibrary, openCitationPanel } from './editor/citation-library.js';
import { installProjectExplorer } from './project/explorer.js';
import { applyCitationRenames } from '../bib/index.mjs';
import { chooseReference } from './editor/reference-index.js';
import { installTableHoverAddRow } from './editor/table-hover.js';
import { deleteTableKeepingScroll } from './editor/table-utils.js';
import { createConfigStore } from './editor/config.mjs';
import { compileKeybindings, installKeybindings } from './editor/keybindings.mjs';
import defaultConfigYaml from '../config.yaml';
import { askText } from './editor/dialog.js';
import { installDocumentFind } from './editor/find.js';
import { DocumentImage, Subfigures, insertLocalImage, insertSubfigures, insertSubfigureImage, replaceLocalImage, startImageCrop, installImageDrop, editTikzVisual } from './editor/image-node.js';
import { installImagePanel } from './ui/image-panel.js';
import { installSubfigurePanel } from './ui/subfigure-panel.js';
import { MultiColumn } from './editor/multi-column.js';
import { readGlobalColumns, writeGlobalColumns } from '../latex/columns.mjs';
import { readImageSpacing, writeImageSpacing, IMAGE_SPACING_DEFAULTS, imageWidthPattern } from '../latex/images.mjs';
import {
  clearProjectAssets,
  onAssetsChanged,
  projectAssets,
  readBibliographyMetadata,
  rememberAsset,
  writeBibliographyMetadata,
} from './editor/project-assets.js';
import { buildProjectZip, safeProjectPath, projectDependencies } from './editor/project-zip.mjs';
import { theoremNames } from '../latex/theorem.mjs';
import { MultiSelection } from './editor/multi-selection.js';
import { installSpaceOverlay } from './editor/space-overlay.js';
import { installTypesetPagination } from './editor/typeset-pagination.js';
import { wrapMathWithDelimiters } from '../latex/delimiters.mjs';
import { readDelimiterPair } from './editor/delimiter-input.js';
import { serialize, importBlocks, parseTableFloat, setSerializationClass } from './editor/latex-codec.js';
import {TblrSource} from './editor/tblr-extension.js';
import {TabularxSource,syncTabularxWidths} from './editor/tabularx-extension.js';
import { setHeadingBase } from '../latex/blocks.mjs';
import { CommandManager, Editor, Node, Extension, Mark, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Plugin, Selection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { DOMParser as ProseMirrorParser, Fragment } from '@tiptap/pm/model';
import { CellSelection } from '@tiptap/pm/tables';
import { parseDocument } from '../latex/document.mjs';
import { exportDocument } from '../latex/packages.mjs';
import { alignmentLabelRange, appendAlignmentPair, displayEnvironment, numberedMathRows } from '../latex/math-environments.mjs';
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

await loadLegacyMath();
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
  if(!latex&&nativeTexPreview?.hasNativeTextFocus?.())return nativeTexPreview.startFormula(display);
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
  return editor.chain().focus(undefined,{scrollIntoView:false})
    .insertTable({rows:2,cols:2,withHeaderRow:false})
    .updateAttributes('table',{borderMode:'grid'}).run();
}
function insertEquation() {
  if(nativeTexPreview?.hasNativeTextFocus?.())return nativeTexPreview.startFormula(true,'equation');
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
let nativeTexPreview;
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
        const continued=backticks && now-backticks.time<650 && backticks.doc===view.state.doc && backticks.pos===from && from===to;
        if (continued && backticks.count===2 && view.state.doc.textBetween(from-1,from)==='`') {
          backticks=null;
          insertFormula(editor,true,'',{from:from-1,to:from});
        } else if (continued && backticks.count===1) {
          // The first press only changed stored marks. Do not let that code
          // mark leak into the literal produced by the second press.
          view.dispatch(view.state.tr.setStoredMarks(backticks.marks).insertText('`',from,to).setStoredMarks(backticks.marks));
          backticks={time:now,count:2,doc:view.state.doc,pos:view.state.selection.from};
        } else {
          const marks=(view.state.storedMarks ?? view.state.selection.$from.marks()).filter(mark=>mark.type.name!=='code');
          editor.commands.toggleCode();
          backticks={time:now,count:1,doc:view.state.doc,pos:view.state.selection.from,marks};
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
const boldButton=button('B',withNativeTextCommand('toggleBold',()=>editor.chain().focus().toggleBold().run()));
const italicButton=button('I',withNativeTextCommand('toggleItalic',()=>editor.chain().focus().toggleItalic().run()));
const underlineButton=button('U',withNativeTextCommand('toggleUnderline',()=>editor.chain().focus().toggleMark('underline').run()));
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
button('itemize',withNativeTextCommand('toggleBulletList',()=>editor.chain().focus().toggleBulletList().run()));
button('enumerate',withNativeTextCommand('toggleOrderedList',()=>editor.chain().focus().toggleOrderedList().run()));
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
function preserveMathSelection(field, update) {
  const model=field._mathfield?.model;
  const selection=structuredClone(field.selection);
  const paths=model && selection.ranges.map(range=>range.map(offset=>mathPositionPath(model,offset)));
  update();
  const updated=field._mathfield?.model;
  if (!paths || !updated) return;
  const ranges=paths.map((range,index)=>range.map((path,end)=>{
    const offset=mathOffsetAtPath(updated,path);
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
  if(nativeTexPreview?.hasNativeMathFocus?.()&&nativeTexPreview.runMathCommand('addRow'))return true;
  const added=addNativeTableAxis('row');
  if(added!==undefined)return added;
  const field=activeMath();
  if(!field) { editor.chain().focus(undefined,{scrollIntoView:false}).addRowAfter().run(); return; }
  if(!fillMatrixAxis(field,'row')) editTableAxis('row');
}
function addMatrixColumn() {
  if(nativeTexPreview?.hasNativeMathFocus?.()&&nativeTexPreview.runMathCommand('addColumn'))return true;
  const added=addNativeTableAxis('column');
  if(added!==undefined)return added;
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
  onChange: () => { syncPending = true; projectExplorer?.changed(); nativeTexPreview?.refresh(); },
  onLayout: () => {updateSourceButton();nativeTexPreview?.documentModeChanged?.();},
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
  const done=applyEditorHistory('undo',activeMath());syncUndoButtons();return done;
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
  const done=applyEditorHistory('redo',activeMath());syncUndoButtons();return done;
}
function applyEditorHistory(command,field) {
  if(!field)return editor.commands[command]();
  field.dispatchEvent(new Event('lineae-before-math-history'));
  try {return editor.commands[command]();}
  finally {field.dispatchEvent(new Event('lineae-after-math-history'));}
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
  if (a.depth!==1 || b.depth!==1 || !['paragraph','heading'].includes(a.parent.type.name) || !a.parent.sameMarkup(b.parent) ||
      a.parent.textContent===b.parent.textContent) return -1;
  // Identical runs can make the diff endpoints overlap on insertion/deletion.
  const oldEnd=Math.max(start,end.a), newEnd=Math.max(start,end.b);
  // Introducing a new formatting mark is an authoring command (for example,
  // creating a new box), with its own package-generation behavior.
  const priorRuns=a.parent.content.content;
  const inline = a.sameParent(before.resolve(oldEnd)) && b.sameParent(doc.resolve(newEnd)) &&
    a.parent.content.cut(a.parentOffset,oldEnd-a.start()).content.every(node=>node.isText||node.type.name==='math') &&
    b.parent.content.cut(b.parentOffset,newEnd-b.start()).content.every(node=>node.type.name==='math'||(node.isText &&
      (!node.marks.length || priorRuns.some(run=>run.sameMarkup(node)))));
  return inline ? a.index(0) : -1;
}
function refuseStandaloneWriteback() {
  const status=document.querySelector('#status');
  status.hidden=false;
  status.textContent=t('该修改无法无损回写，请在源码中编辑；原文已保留。','This edit cannot round-trip safely. Edit the source; original text is preserved.');
  return false;
}
const nativeParagraphTransitions=[];
function dispatchNativeProjectChange(state,tr,project,drafts) {
  const composition=projectDocument.verify(project,tr.doc,drafts);
  if(!composition)return false;
  const before={doc:state.doc,drafts:new Map([...drafts.keys()].map(id=>[id,project.file(id).draft]))};
  tr.setMeta('nativeProjectDraft',{project,composition,drafts});
  editor.view.dispatch(closeHistory(tr));
  if(!editor.state.doc.eq(tr.doc))return false;
  projectDocument.record(project,{before,after:{doc:tr.doc,drafts}});
  return true;
}
function dispatchNativeParagraphChange(state,tr,source,draft,change,nextProjection) {
  tr.setMeta('standaloneParagraph',{draft,changes:[change],projection:nextProjection});
  editor.view.dispatch(closeHistory(tr));
  if(editor.state.doc===state.doc)return false;
  nativeParagraphTransitions.push({change,
    before:{source,snapshot:JSON.stringify(state.doc.toJSON())},
    after:{source:draft,snapshot:importedSnapshot}});
  if(nativeParagraphTransitions.length>100)nativeParagraphTransitions.shift();
  return true;
}
function prepareNativeParagraphHistory(transaction) {
  if(!isHistoryTransaction(transaction)||!nativeParagraphTransitions.length)return false;
  const before=JSON.stringify(transaction.before.toJSON()),after=JSON.stringify(transaction.doc.toJSON());
  for(let index=nativeParagraphTransitions.length-1;index>=0;index--){
    const transition=nativeParagraphTransitions[index];
    const forward=transition.before.snapshot===before;
    const previous=forward?transition.before:transition.after;
    const next=forward?transition.after:transition.before;
    if(previous.source!==importedSource||previous.snapshot!==before||next.snapshot!==after)continue;
    const {change}=transition;
    const patch=forward?change:{from:change.from,to:change.from+change.insert.length,
      insert:next.source.slice(change.from,change.to)};
    const nextProjection=sourceProjection(next.source,transaction.doc.toJSON(),{fragment:projectFileKind==='tex'});
    if(!nextProjection)return false;
    transaction.setMeta('standaloneParagraph',{draft:next.source,changes:[patch],projection:nextProjection});
    return true;
  }
  return false;
}
editor.registerPlugin(new Plugin({
  state: {
    init:()=>false,
    apply:tr=>['standaloneParagraph','nativeProjectDraft'].some(key=>
      tr.getMeta(key)||tr.getMeta('appendedTransaction')?.getMeta(key)),
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
      const project=projectExplorer.model;
      const verified=transaction.getMeta('nativeProjectDraft');
      if(verified)return transaction.before===state.doc&&verified.project===project;
      if(isHistoryTransaction(transaction)){
        const restored=projectDocument.restore(project,transaction);
        if(restored){
          transaction.setMeta('nativeProjectDraft',{...restored,project});
          return true;
        }
      }
      const valid=projectDocument.changes(transaction.doc.toJSON());
      if(!valid)sourceView.error(t('请在对应文件的源码中修改此结构','Edit this structure in its source file'));
      return !!valid;
    }
    const verified=transaction.getMeta('standaloneParagraph');
    if(verified)return !syncPending&&transaction.before===state.doc&&verified.projection?.text===verified.draft;
    if(sourceView.hidden&&prepareNativeParagraphHistory(transaction))return true;
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
  const nativeProject=transaction.getMeta('nativeProjectDraft');
  if(nativeProject&&editor.state.doc.eq(transaction.doc)){
    const {project,composition,drafts}=nativeProject;
    for(const [id,draft] of drafts)project.edit(id,draft);
    projectDocument.hydrate(composition,editor.getJSON());
    sourceView.reset(composition.sources.get(composition.rootId));
    projectExplorer.changed();
    return;
  }
  const paragraph=transaction.getMeta('standaloneParagraph');
  if (paragraph && editor.state.doc.eq(transaction.doc)) {
    if(sourceView.value===importedSource)sourceView.applyChanges(paragraph.changes);
    importedSource=paragraph.draft;
    importedSnapshot=JSON.stringify(editor.getJSON());
    const previousPreamble=documentParts.start;
    documentParts=parseDocument(importedSource,{fragment:projectFileKind==='tex'});
    projection=paragraph.projection;
    if(documentParts.start!==previousPreamble){
      renderMeta();
      typesetPagination?.setMaketitle(/\\maketitle\b/.test(documentParts.blocks.join('\n')));
    }
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
  const mathChanges=standaloneMathChanges(projection,editor.getJSON());
  if(!mathChanges?.length&&!usesSourceProjection())return;
  const changes = mathChanges?.length?mathChanges:richSourceChanges(projection,editor.getJSON());
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
      type: 'documentImage', attrs: { tikzSource: body.trim(), tikzEditor: 'general', centered: true, align: 'center' },
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
  return documentMetadata(documentParts.start,key)?.value??'';
}
async function editMetadata(key,label) {
  const raw=readMeta(key);
  const current=key==='date'&&raw==='\\today'?raw:metaDisplay(raw);
  const value=await askText(label,current);
  if(value!==null&&(value!==current||(key==='date'&&!documentMetadata(documentParts.start,key))))writeMeta(key,value);
}
function writeMeta(key,value) {
  const escaped=key==='date'&&value==='\\today'?value:serialize({type:'text',text:value});
  const before=sourceView.hidden?source():sourceView.value;
  const edited=writeDocumentMetadata(before,key,escaped);
  if(!edited||edited.draft===before){renderMeta();return;}
  if(projectDocument.composition){
    editIncludeSource(text=>text===before?edited.draft:text,projectDocument.composition.rootId);
    return;
  }
  if(!sourceView.hidden){sourceView.applyChanges([edited.change]);sourceView.flush();return;}
  const {state}=editor;
  const tr=state.tr.setDocAttribute('layoutPreamble',edited.preamble);
  if(edited.addMaketitle)tr.insert(0,editor.schema.nodes.layoutCommand.create({command:'\\maketitle'}));
  const projected=sourceProjection(edited.draft,tr.doc.toJSON());
  if(!projected||!dispatchNativeParagraphChange(state,tr,before,edited.draft,edited.change,projected)){
    refuseStandaloneWriteback();renderMeta();
  }
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
    if(value!==metaDisplay(readMeta(key)))writeMeta(key,value);
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
function metaDisplay(raw){
  const nodes=importBlocks(raw);
  const text=node=>node.type==='text'?node.text:(node.content??[]).map(text).join('');
  return nodes.some(node=>node.type==='raw')?raw:nodes.map(text).join('');
}
function renderMeta() {
  metaTitle.textContent=metaDisplay(readMeta('title'));
  metaAuthor.textContent=metaDisplay(readMeta('author'));
  const date=documentMetadata(documentParts.start,'date');
  metaDateDisplay=date?displayDate(date.value):readMeta('title')?todayText():'';
  metaDate.textContent=metaDateDisplay;
  metaDate.hidden=!metaDateDisplay;
  metaTitle.dataset.zhPlaceholder='标题';metaTitle.dataset.enPlaceholder='Title';metaTitle.dataset.placeholder=t('标题','Title');
  metaAuthor.dataset.zhPlaceholder='作者';metaAuthor.dataset.enPlaceholder='Author';metaAuthor.dataset.placeholder=t('作者','Author');
  metaDate.dataset.zhPlaceholder='日期';metaDate.dataset.enPlaceholder='Date';metaDate.dataset.placeholder=t('日期','Date');
}
renderMeta();
if(!nativeOnlyAcceptance())typesetPagination=installTypesetPagination(documentPage,paper,metaBar,editor);
typesetPagination?.setTableContinuation(config.value.interface.continuedTables);
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
  if(markSaved)nativeTexPreview?.documentChanged();
  projectDocument.composition=null;
  const wasApplying = syncApplying; syncApplying = true;
  try {
  const parsed=parseDocument(text, {fragment:projectFileKind === 'tex'});
  if(!parsed)throw new Error(t('无法识别文档','Invalid document'));
  if (markSaved) {clearProjectAssets();sourceModeEntry=undefined;sourceModeCommits=[];sourceModeRedos=[];nativeParagraphTransitions.length=0;}
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
  const content=parsed.blocks.flatMap(block=>importBlocks(block));
  for (const block of content) identifyImportedBoxes(block);
  editor.chain().setMeta('addToHistory', false).setContent({type:'doc',attrs:{layoutPreamble:parsed.start,pageFurniture:readPageFurniture(parsed.start)},content:content.length?content:[{type:'paragraph'}]}).command(({tr})=>{tr.setDocAttribute('layoutPreamble',parsed.start);tr.setDocAttribute('pageFurniture',readPageFurniture(parsed.start));return true;}).run();
  if(markSaved){
    // Mapping old history through a non-history import leaves undo steps that
    // can insert content from the previous file into the newly opened one.
    const state=editor.state,plugins=state.plugins;
    const withoutHistory=plugins.filter(plugin=>!plugin.key.startsWith('history$'));
    if(withoutHistory.length!==plugins.length){
      editor.view.updateState(state.reconfigure({plugins:withoutHistory}).reconfigure({plugins}));
    }
    syncUndoButtons();
  }
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
  nativeTexPreview?.documentModeChanged?.();
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
  title:()=>editMetadata('title',t('标题','Title')),
  author:()=>editMetadata('author',t('作者','Author')),
  date:()=>editMetadata('date',t('日期','Date')),
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
let completionNative = false;
let completionAnchor = null;
let completionOrigin = null;
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
function commandAnchor(field){
  if(!field)return editor.view.coordsAtPos(editor.state.selection.from);
  return (field.shadowRoot?.querySelector('.ML__caret')??field).getBoundingClientRect();
}
function showCommands(field = null, native = null) {
  completionField = field;
  completionNative = native;
  completionAnchor=commandAnchor(field);
  commands.hidden = false;
  fadeIn(commands, { prefersReducedMotion: prefersReducedMotion() });
  filter.value = '';
  renderCommands();
  positionCommands();
  filter.focus({preventScroll:true});
  completionOrigin=(field??editor.view.dom).getBoundingClientRect();
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
function insertNativePageBreak(){
  const range=nativeTexPreview.verifiedTextRange();
  if(!range)return false;
  const [first,last]=range,{paragraph}=first;
  if(paragraph.heading||paragraph.tableCell||paragraph.container)return false;
  const target=nativeProsePosition(paragraph,first.local,last.local);
  if(!target)return false;
  const {state}=editor,{from:start,to:end}=target.range;
  const $start=state.doc.resolve(start),$end=state.doc.resolve(end);
  if(!$start.sameParent($end)||$start.parent.type.name!=='paragraph')return false;
  const parent=$start.parent,left=parent.content.cut(0,$start.parentOffset),right=parent.content.cut($end.parentOffset);
  const {start:fromRun,end:toRun}=target.range.endpoints;
  const collapsed=state.selection.empty;
  if(left.size&&(!collapsed||right.size)&&fromRun.marks?.length||
     right.size&&(!collapsed||left.size)&&toRun.marks?.length)return false;
  const pageBreak=editor.schema.nodes.pageBreak.create();
  const nodes=[...(left.size?[parent.copy(left)]:[]),pageBreak,...(right.size?[parent.copy(right)]:[])];
  const tr=state.tr.replaceWith($start.before(),$end.after(),nodes);
  const afterBreak=$start.before()+(left.size?left.size+2:0)+pageBreak.nodeSize;
  tr.setSelection(TextSelection.near(tr.doc.resolve(afterBreak),right.size?1:-1));
  const source=paragraph.source,eol=parseDocument(source,{fragment:target.file?.kind==='tex'})?.eol;
  if(!eol)return false;
  const blockEnd=paragraph.from16+paragraph.text.length;
  const from=!left.size?paragraph.from16:collapsed&&!right.size?blockEnd:first.docOffset;
  const to=collapsed?from:right.size?last.docOffset:blockEnd;
  const insert=(left.size?eol+eol:'')+'\\newpage'+(right.size?eol+eol:'');
  const draft=source.slice(0,from)+insert+source.slice(to);
  if(target.composition){
    const updates=projectDocument.changes(tr.doc.toJSON());
    if(updates?.get(target.file.id)!==draft)return false;
    for(const [id,text] of updates)if(id!==target.file.id&&text!==target.project.file(id).draft)return false;
    editor.view.dispatch(closeHistory(tr));
    return editor.state.doc!==state.doc;
  }
  const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
  return Boolean(projected&&dispatchNativeParagraphChange(state,tr,source,draft,{from,to,insert},projected));
}
function completionActions() {
  if(completionNative==='math')return {
    ...Object.fromEntries([...nativeMathCommandNames,'left','right','newline'].map(name=>[
      name,()=>nativeTexPreview.runMathCommand(name==='newline'?'enterLine':name),
    ])),
    label:editFormulaLabel,
  };
  if(completionNative==='text'){
    const actions={chapter:structureCommands.chapter,section:structureCommands.section,
      subsection:structureCommands.subsection,subsubsection:structureCommands.subsubsection,
      appendix:structureCommands.appendix,title:structureCommands.title,
      author:structureCommands.author,date:structureCommands.date,
      newpage:insertNativePageBreak};
    if(projectExplorer?.active){actions.input=structureCommands.input;actions.include=structureCommands.include;}
    const input=completionField;
    return Object.fromEntries(Object.entries(actions).map(([name,action])=>[name,async()=>{
      if(!nativeTexPreview.useTextSelection())return;
      try{await action();}
      catch(error){sourceView.error(error?.message??String(error));}
      if(input.isConnected&&input.closest('#native-tex-preview')?.dataset.editing==='true')input.focus({preventScroll:true});
    }]));
  }
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
  return actions;
}
function renderCommands() {
  candidates.replaceChildren();
  const actions=completionActions();
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
    control.addEventListener('click', () => { closeCommands(completionNative); action(); });
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
  queueMicrotask(() => { if (!commands.hidden) filter.focus({preventScroll:true}); });
}, true);
filter.addEventListener('input', renderCommands);
filter.addEventListener('keydown', event => {
  if (event.key === '\\' && !filter.value && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
    event.preventDefault();
    closeCommands(true);
    if(completionNative==='text'){nativeTexPreview.insertLiteralText('\\');return;}
    if(completionNative)return;
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
    case 'undo': case 'redo': applyEditorHistory(command,field); return;
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
function commandViewportChanged(event){
  if(commands.hidden||event.target instanceof Node&&commands.contains(event.target))return;
  requestAnimationFrame(()=>{
    if(commands.hidden)return;
    if(completionField&&!completionField.isConnected){closeCommands();return;}
    const origin=(completionField??editor.view.dom).getBoundingClientRect();
    const dx=origin.left-completionOrigin.left,dy=origin.top-completionOrigin.top;
    completionAnchor={left:completionAnchor.left+dx,top:completionAnchor.top+dy,bottom:completionAnchor.bottom+dy};
    completionOrigin=origin;
    positionCommands();
  });
}
document.addEventListener('scroll',commandViewportChanged,true);
window.addEventListener('resize',commandViewportChanged);
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
  const enabled=typesetPagination?.getTableContinuation();
  continueTablesButton.textContent=enabled?t('续表 开','Continue on'):t('续表 关','Continue off');
  continueTablesButton.setAttribute('aria-pressed',String(enabled));
  continueTablesButton.dataset.tooltipZh=enabled?'超过一页的表格自动拆分并重复表头':'表格不自动拆分';
  continueTablesButton.dataset.tooltipEn=enabled?'Split long tables across pages and repeat the header':'Keep long tables as one block';
}
const paginationButton=document.createElement('button');
paginationButton.type='button';paginationButton.className='pagination-toggle';
paginationButton.addEventListener('mousedown',event=>event.preventDefault());
paginationButton.addEventListener('click',()=>{
  if(!nativeTexPreview?.togglePagePresentation?.())typesetPagination?.toggle();
  updatePaginationButton();
});
function updatePaginationButton(){
  const nativeMode=nativeTexPreview?.pagePresentation?.()??(nativeWorkspaceRequested()?'pages':null);
  const pages=(nativeMode??typesetPagination?.getMode())==='pages';
  paginationButton.textContent=pages?t('分页','Pages'):t('连续流','Continuous');
  paginationButton.dataset.mode=pages?'pages':'flow';
  paginationButton.setAttribute('aria-pressed',String(pages));
  paginationButton.dataset.tooltipZh=nativeMode?(pages?'连续显示原生页面':'显示原生页边界'):(pages?'切换到连续流预览':'切换到分页预览');
  paginationButton.dataset.tooltipEn=nativeMode?(pages?'Show native pages continuously':'Show native page boundaries'):
    (pages?'Switch to continuous flow':'Switch to paginated pages');
}
function scale() {
  const value=Number(zoom.value);
  documentPage.style.zoom=value/100;
  sourceView.setPreviewZoom(value);
  nativeTexPreview?.setDocumentZoom?.(value);
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
      return editor.chain().focus(undefined,{scrollIntoView:false}).updateAttributes('table',{align}).run();
    const type=editor.isActive('tableHeader')?'tableHeader':'tableCell';
    return editor.chain().focus(undefined,{scrollIntoView:false}).updateAttributes(type,{align}).run();
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
  const selection=editor.state.selection;
  if(selection instanceof NodeSelection&&selection.node.type.name==='subfigures'){
    const allowed=['placement','fixed','caption','captionEnabled','captionNumbered','label'];
    const clean=Object.fromEntries(Object.entries(patch).filter(([key,value])=>value!==undefined&&allowed.includes(key)));
    if(Object.entries(clean).every(([key,value])=>selection.node.attrs[key]===value))return false;
    editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(selection.from,undefined,{...selection.node.attrs,...clean}));
    const updated=editor.state.doc.nodeAt(selection.from);
    if(updated?.type.name==='subfigures'){
      imagePanel?.setValues?.({...updated.attrs,figure:true,centered:true,align:'center'});
      imagePanel?.setPath?.(t(updated.childCount+' 张子图',updated.childCount+' subfigures'));
      imagePanel?.setGroupMode?.(true);
    }
    return true;
  }
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
    clearFormatting: () => editor.commands.unsetAllMarks(),
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
    addRow: () => addNativeTableAxis('row')??editor.commands.addRowAfter(),
    addColumn: () => addNativeTableAxis('column')??editor.commands.addColumnAfter(),
    deleteRow: () => editNativeTable('deleteRow')??editor.commands.deleteRow(),
    deleteColumn: () => editNativeTable('deleteColumn')??editor.commands.deleteColumn(),
  },
};
const nativeBindings=compileKeybindings({
  system:{copy:'mod+c',cut:'mod+x',paste:'mod+v',selectAll:'mod+a'},
  source:{find:'mod+f',replace:'mod+h',undo:'mod+z',redo:['mod+y','mod+shift+z'],complete:'ctrl+space',
    indent:'tab',outdent:'shift+tab',zoomIn:['mod+equal','mod+plus'],zoomOut:'mod+minus',zoomReset:'mod+0'},
  math:{undo:['ctrl+z','meta+z'],redo:['ctrl+y','meta+y','ctrl+shift+z','meta+shift+z'],
    palette:'backslash',nextSlot:'tab',previousSlot:'shift+tab'},
},{isMac});
const nativeSelectionCommands=new Set(['toggleBold','toggleItalic','toggleUnderline','toggleStrike','toggleCode',
  'toggleSuperscript','toggleSubscript','clearFormatting','toggleContextMarker','insertTable']);
const nativeRangeCommands=new Set(['toggleBold','toggleItalic','toggleUnderline','toggleStrike','toggleCode',
  'toggleSuperscript','toggleSubscript','clearFormatting']);
const nativeTextStructures={
  paragraph:['setParagraph'],section:['toggleHeading',{level:1,command:null}],
  subsection:['toggleHeading',{level:2,command:null}],subsubsection:['toggleHeading',{level:3,command:null}],
  toggleBulletList:['toggleBulletList'],toggleOrderedList:['toggleOrderedList'],toggleBlockquote:['toggleBlockquote'],
  alignLeft:['updateAttributes','paragraph',{align:'left'}],
  alignRight:['updateAttributes','paragraph',{align:'right'}],
  alignCenter:['updateAttributes','paragraph',{align:'center'}],
};
function runNativeTextCommand(command,context,event){
  if(Object.hasOwn(nativeTextStructures,command))return runNativeTextStructure(...nativeTextStructures[command]);
  return nativeSelectionCommands.has(command)&&nativeTexPreview.useTextSelection(nativeRangeCommands.has(command))&&
    shortcutActions.editor[command](context,event);
}
function withNativeTextCommand(command,legacy){
  return (...args)=>nativeTexPreview?.hasNativeTextFocus?.()?runNativeTextCommand(command):legacy(...args);
}
installKeybindings(window, {
  getBindings: () => config.bindings,
  nativeBindings,
  getContext(event) {
    if(nativeTexPreview?.hasMathInput?.(event))
      return {element:event.target,nativeMath:true,scopes:['math','system','global']};
    if(nativeTexPreview?.hasTextInput?.(event))
      return {element:event.target,nativeText:true,
        scopes:nativeTexPreview.inTableCell()?['table','editor','system','global']:['editor','system','global']};
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
    if(context.nativeText&&scope==='editor'){
      if(command==='leaveFile')return nativeTexPreview.leaveFile();
      if(['insertDisplayMath','insertInlineMath','insertEquation'].includes(command))return shortcutActions.editor[command]();
      return runNativeTextCommand(command,context,event);
    }
    if(context.nativeText&&scope==='table'&&!nativeTexPreview.useTextSelection())return false;
    if (scope === 'math') {
      if(!context.nativeMath)return runMathShortcut(command,context.field,event);
      if(command==='palette'){showCommands(context.element,'math');return true;}
      return nativeTexPreview.runMathCommand(command)||
        (command==='addRow'&&addNativeTableAxis('row')===true)||(command==='addColumn'&&addNativeTableAxis('column')===true);
    }
    if (scope === 'source') return sourceView.runShortcut(command);
    if (scope === 'system') {
      if(command==='selectAll') {
        if(context.nativeText||context.nativeMath)return nativeTexPreview.selectAll();
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
  const native=nativeTexPreview?.focusedCaret?.();
  const name=native?.kind==='math'?(native.formula.kind==='displayMath'?'display math':'inline math'):
    field ? (field.closest('.math-display')?'display math':'inline math') :
    !sourceView.hidden?'LaTeX': ['table','listItem','heading'].find(type=>editor.isActive(type)) ?? 'text';
  const labels={matrix:t('矩阵','Matrix'),'display math':t('行间公式','Display math'),'inline math':t('行内公式','Inline math'),table:t('表格','Table'),listItem:t('列表','List'),heading:t('标题','Heading'),text:t('正文','Text'),LaTeX:t('源码','Source')};
  const nativeLabels={frac:t('分式','Fraction'),sqrt:t('根式','Radical'),numerator:t('分子','Numerator'),
    denominator:t('分母','Denominator'),radicand:t('被开方数','Radicand'),degree:t('根指数','Root degree'),
    superscript:t('上标','Superscript'),subscript:t('下标','Subscript'),integrand:t('被积式','Integrand'),operand:t('运算主体','Operand')};
  const location=({row,column})=>t('第 '+row+' 行，第 '+column+' 列','Row '+row+', column '+column);
  const context=native?.kind==='math'?nativeMathContext(native).map(entry=>entry.text??
    (entry.key==='cell'?location(entry):nativeLabels[entry.key])):
    native?.paragraph?.tableCell?[location({row:native.paragraph.tableCell.row+1,column:native.paragraph.tableCell.column+1})]:
    field?mathEnvironment(field):[];
  environment.textContent=[labels[name],...context].join(' › ');
  environment.dataset.environment=name;
}
footer.append(count,document.querySelector('#status'),environment,zoom,percent,paginationButton,themeButton,modes);document.body.append(footer);sourceView.mountStatus(footer);scale();updatePaginationButton();
const shortcutPriority=installShortcutPriority({host:footer,before:modes,getBindings:()=>config.bindings});
function nativeProsePosition(paragraph,from,to){
  if(!sourceView.hidden||!paragraph?.parts)return null;
  const project=projectExplorer?.model,composition=projectDocument.composition;
  const file=project?.files.get(paragraph.filePath);
  if(project&&(file?.draft!==paragraph.source||!composition&&file?.id!==project.activeFileId))return null;
  if(!composition&&source()!==paragraph.source)return null;
  const range=nativeEditorRange({doc:editor.state.doc,projection,composition,file,paragraph,from,to});
  return range?{range,project,composition,file}:null;
}
function refreshNativeTextEnvironment(tr,position,sourceBlock,source,change){
  if(!sourceBlock||change.from<sourceBlock.from||change.to>sourceBlock.to)return false;
  const raw=source.slice(sourceBlock.from,change.from)+change.insert+source.slice(change.to,sourceBlock.to);
  const [parsed,...rest]=importBlocks(raw);
  const node=tr.doc.nodeAt(position);
  if(rest.length||parsed?.type!=='blockquote'||!parsed.attrs.environmentSource||
     node?.type.name!=='blockquote'||parsed.attrs.latexEnvironment!==node.attrs.latexEnvironment)return false;
  const verified=tr.doc.type.schema.nodeFromJSON(parsed);
  if(!verified.content.eq(node.content))return false;
  tr.setNodeMarkup(position,undefined,verified.attrs);
  return true;
}
function runNativeTextStructure(command,...args){
  const started=performance.now();
  const verified=nativeTexPreview.verifiedTextRange?.();
  if(!verified||!nativeTexPreview.useTextSelection())return false;
  const [first,last]=verified,{paragraph}=first;
  if(paragraph.tableCell||paragraph.container&&!['bulletList','orderedList','blockquote'].includes(paragraph.container.type))return false;
  const target=nativeProsePosition(paragraph,first.local,last.local);
  if(!target)return false;
  const {state}=editor,tr=state.tr;
  const chain=new CommandManager({editor}).createChain(tr);
  if(!chain[command](...args).run()||!tr.docChanged)return false;
  const {source,filePath}=paragraph,{composition,project,file}=target;
  const fragment=projectFileKind==='tex';
  let draft,from,to;
  if(composition){
    const updates=projectDocument.changes(tr.doc.toJSON());
    draft=updates?.get(file.id);
    if(!draft||draft===source)return false;
    for(const [id,value] of updates)if(id!==file.id&&value!==project.file(id).draft)return false;
    editor.view.dispatch(closeHistory(tr));
    if(editor.state.doc===state.doc)return false;
    ({from,to}=textPatch(source,draft)[0]);
  }else {
    const owner=projection?.blocks.find(block=>block.from<=paragraph.from16&&
      block.to>=paragraph.from16+paragraph.text.length);
    const changes=richSourceChanges(projection,tr.doc.toJSON());
    if(!owner||changes?.length!==1)return false;
    const [change]=changes;
    if(change.from<owner.from||change.to>owner.to)return false;
    draft=source.slice(0,change.from)+change.insert+source.slice(change.to);
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment});
    if(!projected||!dispatchNativeParagraphChange(state,tr,source,draft,change,projected))return false;
    ({from,to}=change);
  }
  const changeEnd=to+draft.length-source.length;
  const projectedText=projectMixedDocument(draft,{fragment,filePath,splitIncludes:Boolean(composition)});
  const candidates=projectedText?.paragraphs.filter(next=>next.text===paragraph.text&&
    next.from16<=changeEnd&&next.from16+next.text.length>=from)??[];
  if(candidates.length===1)nativeTexPreview.preserveSourceCaret({source:draft,path:filePath,
    offset:candidates[0].from16+last.local},started,'text');
  return true;
}
function nativeFormulaPosition(formula){
  if(!sourceView.hidden)return null;
  const project=projectExplorer?.model,composition=projectDocument.composition;
  const file=project?.files.get(formula.filePath);
  if(project&&(file?.draft!==formula.source||!composition&&file?.id!==project.activeFileId))return null;
  if(!composition&&source()!==formula.source)return null;
  const type=formula.kind==='displayMath'?'mathBlock':'math',positions=[];
  editor.state.doc.descendants((node,position)=>{
    if(node.type.name!==type)return;
    if(composition){
      const at=editor.state.doc.resolve(position);
      let region;
      for(let depth=at.depth;depth>0;depth--){
        if(at.node(depth).type.name==='projectRegion'){region=at.node(depth);break;}
      }
      if(region?.attrs.path!==file.path)return;
    }
    positions.push(position);
  });
  if(positions.length!==formula.count)return null;
  const position=positions[formula.ordinal];
  return Number.isInteger(position)?{position,node:editor.state.doc.nodeAt(position),type,project,composition,file}:null;
}
function addNativeTableAxis(axis){
  return editNativeTable(axis==='row'?'insertRow':'insertColumn');
}
function nativeMultirowPackage(root){
  const {start,eol}=parseDocument(root,{fragment:true});
  if(!resolvePackages(start,'\\multirow').some(({name})=>name==='multirow'))return null;
  const from=start.lastIndexOf('\\begin{document}');
  return from<0?false:{from,insert:'\\usepackage{multirow}'+eol};
}
function editNativeTable(operation){
  const started=performance.now();
  const caret=nativeTexPreview?.verifiedCaret?.();
  if(!caret&&nativeTexPreview?.focusedCaret?.())return false;
  const owner=caret?.kind==='text'?caret.paragraph:caret?.formula;
  const cell=owner?.tableCell;
  if(!cell)return caret?false:undefined;
  const target=caret.kind==='text'?nativeProsePosition(owner,caret.local,caret.local):nativeFormulaPosition(owner);
  if(!target)return false;
  const {state}=editor,{project,composition,file}=target;
  const position=target.range?.from??target.position;
  const at=state.doc.resolve(position);
  let depth=at.depth;
  while(depth>0&&at.node(depth).type.name!=='table')depth--;
  if(!depth)return false;
  const node=at.node(depth);
  if(at.depth!==depth+3)return false;
  const start=cell.from16;
  const rawTable=owner.source.slice(start,cell.to16);
  const structured=node.attrs.tabularx||node.attrs.tblr;
  const original=structured?serialize(node.toJSON()):rawTable;
  const decode=source=>{
    const [table,...rest]=importBlocks(source);
    return table?.type==='table'&&!rest.length&&Boolean(table.attrs.tabularx)===Boolean(node.attrs.tabularx)&&
      Boolean(table.attrs.tblr)===Boolean(node.attrs.tblr)
      ?state.schema.nodeFromJSON(table):null;
  };
  if(structured?(original.trimEnd()!==rawTable||!owner.source.startsWith(original,start)):!decode(original)?.eq(node))return false;
  const tableFrom=at.before(depth);
  if(operation==='deleteTable'){
    const tr=state.tr.delete(tableFrom,tableFrom+node.nodeSize);
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(tableFrom,tr.doc.content.size))));
    const change={from:start,to:cell.to16,insert:''};
    const draft=owner.source.slice(0,change.from)+owner.source.slice(change.to);
    if(composition)return dispatchNativeProjectChange(state,tr,project,new Map([[file.id,draft]]));
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
    return Boolean(projected&&dispatchNativeParagraphChange(state,tr,owner.source,draft,change,projected));
  }
  const deleting=operation.startsWith('delete');
  const mergeRange=operation==='mergeCells'?nativeTexPreview.verifiedTableRange():null;
  if(operation==='mergeCells'&&!mergeRange)return false;
  const mergeStart=mergeRange?.[0].paragraph.tableCell,mergeEnd=mergeRange?.[1].paragraph.tableCell;
  const mergeColumn=mergeStart?.column;
  const verticalMerge=mergeStart&&mergeStart.row!==mergeEnd.row;
  const offsetInTable=caret.docOffset-start;
  const tabularrayCommands={
    insertRow:()=>editTblrRow(original,cell.row,false,offsetInTable),
    insertColumn:()=>editTblrColumn(original,cell.row,cell.column,offsetInTable),
    deleteRow:()=>editTblrRow(original,cell.row,true),
    deleteColumn:()=>editTblrColumn(original,cell.row,cell.column,offsetInTable,true),
    splitCell:()=>splitTblrCell(original,cell.row,cell.column,offsetInTable),
    mergeCells:()=>mergeTblrCells(original,cell.row,mergeColumn,mergeRange[1].paragraph.tableCell.column),
  };
  const columnTableCommands={
    insertRow:()=>insertTableSourceRow(original,cell.row),
    insertColumn:()=>insertTableSourceColumn(original,cell.row,cell.column,caret.docOffset-start),
    deleteRow:()=>removeTableSourceRow(original,cell.row),
    deleteColumn:()=>removeTableSourceColumn(original,cell.row,cell.column),
    splitCell:()=>splitTableSourceCell(original,cell.row,cell.column,offsetInTable)??
      splitTableSourceRowspan(original,cell.row,cell.column,offsetInTable),
    mergeCells:()=>verticalMerge?mergeTableSourceRows(original,mergeStart.row,mergeEnd.row,mergeColumn):
      mergeTableSourceCells(original,cell.row,mergeColumn,mergeEnd.column),
  };
  const patch=(node.attrs.tblr?tabularrayCommands:columnTableCommands)[operation]();
  if(!patch)return false;
  const raw=original.slice(0,patch.from)+patch.insert+original.slice(patch.to);
  const replacement=decode(raw);
  if(!replacement)return false;
  const tr=state.tr.replaceWith(tableFrom,tableFrom+node.nodeSize,replacement);
  const rowIndex=Math.min(mergeStart?.row??cell.row,replacement.childCount-1),row=replacement.child(rowIndex);
  const columnIndex=Math.min(mergeColumn??cell.column,row.childCount-1);
  let next=tableFrom+4+(mergeRange?row.child(columnIndex).firstChild.content.size:deleting?0:position-at.start(depth+3));
  replacement.forEach((before,_position,index)=>{if(index<rowIndex)next+=before.nodeSize;});
  row.forEach((before,_position,index)=>{if(index<columnIndex)next+=before.nodeSize;});
  tr.setSelection(TextSelection.create(tr.doc,next));
  let change={from:start+patch.from,to:start+patch.to,insert:patch.insert};
  let draft=owner.source.slice(0,change.from)+change.insert+owner.source.slice(change.to);
  let offset=patch.offset===undefined?caret.docOffset:start+patch.offset;
  const rootId=composition?.rootId;
  const root=rootId&&rootId!==file.id?project.file(rootId).draft:owner.source;
  const dependency=verticalMerge&&nativeMultirowPackage(root);
  if(verticalMerge&&dependency===false)return false;
  if(dependency&&(!rootId||rootId===file.id)){
    const {from,insert}=dependency;
    draft=draft.slice(0,from)+insert+draft.slice(from);
    offset+=insert.length;
    change={from,to:change.to,insert:insert+owner.source.slice(from,change.from)+change.insert};
  }
  const restoreCaret=()=>{
    if(!deleting)return nativeTexPreview.preserveSourceCaret({source:draft,offset,path:owner.filePath},started,caret.kind);
    const model=projectMixedDocument(draft,{fragment:projectFileKind==='tex',filePath:owner.filePath});
    const target=model?.paragraphs.find(({tableCell})=>tableCell?.from16===start&&tableCell.row===rowIndex&&tableCell.column===columnIndex);
    if(target?.glyphs.length)nativeTexPreview.preserveSourceCaret({source:draft,
      offset:target.from16+target.glyphs[0].from16,path:owner.filePath},started,'text');
    return true;
  };
  if(composition){
    if(dependency){
      const drafts=new Map([[file.id,draft]]);
      if(rootId!==file.id){
        const {from,insert}=dependency;
        drafts.set(rootId,root.slice(0,from)+insert+root.slice(from));
      }
      return dispatchNativeProjectChange(state,tr,project,drafts)&&restoreCaret();
    }
    const updates=projectDocument.changes(tr.doc.toJSON());
    if(updates?.get(file.id)!==draft)
      return dispatchNativeProjectChange(state,tr,project,new Map([[file.id,draft]]))&&restoreCaret();
    for(const [id,value] of updates)if(id!==file.id&&value!==project.file(id).draft)return false;
    editor.view.dispatch(closeHistory(tr));
    return editor.state.doc!==state.doc&&restoreCaret();
  }
  const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
  return Boolean(projected&&dispatchNativeParagraphChange(state,tr,owner.source,draft,change,projected)&&restoreCaret());
}
function currentNativeProjectComposition(){
  const active=projectDocument.composition,project=projectExplorer?.model;
  if(!active||!project)return null;
  const composition=projectDocument.compose(project,active.rootId,{boundariesOnly:true});
  return composition.issues.length?null:composition;
}
function emptyContinuation(region,composition,doc){
  const index=Number(region.key);
  const latest=composition?.regions[index];
  const node=Number.isInteger(index)&&index>=0&&index<doc.childCount?doc.child(index):null;
  if(!latest||latest.path!==region.path||latest.from!==region.from||latest.to!==region.to||
    node?.type.name!=='projectRegion'||node.attrs.regionKey!==region.key||node.attrs.path!==region.path||
    node.childCount!==1||node.firstChild.type.name!=='paragraph'||node.firstChild.content.size)return null;
  const source=composition.sources.get(region.id);
  if(source===undefined||source.slice(region.from,region.to).trim())return null;
  let start=1;
  for(let i=0;i<index;i++)start+=doc.child(i).nodeSize;
  return {source,start:start+1};
}
function forEachNativeDocumentBlock(type,visit){
  if(!sourceView.hidden)return;
  const composition=projectDocument.composition;
  editor.state.doc.forEach((node,position,index)=>{
    if(!composition){
      if(node.type.name===type){
        const project=projectExplorer?.model,file=project&&project.file(project.activeFileId);
        visit(node,position,projection?.blocks.find(block=>block.index===index&&block.count),
          file?.path??filename,projection?.text,0,file?.id);
      }
      return;
    }
    const region=composition.regions[index];
    if(node.type.name!=='projectRegion'||!region)return;
    const text=composition.sources.get(region.id);
    node.forEach((child,offset,childIndex)=>{
      if(child.type.name===type)visit(child,position+offset+1,region.projection?.blocks.find(block=>block.index===childIndex&&block.count),
        region.path,text,region.from,region.id);
    });
  });
}
function nativeDrawingTargets(ranges){
  const results=[];
  function collect(node,position,block,path,text,base){
    if(block?.count!==1||typeof text!=='string'||text.slice(base+block.from,base+block.to)!==block.raw)return;
    for(const range of ranges(block.raw,node.toJSON())){
      const child=range.child===null?node:node.child(range.child);
      let at=position;
      if(range.child!==null){
        at++;
        node.forEach((_,offset,index)=>{if(index===range.child)at+=offset;});
      }
      results.push({position:at,path,text,from:base+block.from+range.from,to:base+block.from+range.to,
        label:child.attrs.caption||child.attrs.label||path});
    }
  }
  forEachNativeDocumentBlock('documentImage',collect);
  forEachNativeDocumentBlock('subfigures',collect);
  return results;
}
function nativeTikzDrawings(){
  return nativeDrawingTargets(tikzDrawingRanges).map(({position,label})=>({position,label}));
}
function editNativeDrawing(position){
  if(!nativeTikzDrawings().some(drawing=>drawing.position===position))return;
  editTikzVisual(editor,position,tr=>{
    if(!tr.docChanged||tr.doc.eq(tr.before))return true;
    if(projectDocument.composition){
      if(!projectDocument.rebase(currentNativeProjectComposition(),editor.getJSON())||
        !projectDocument.changes(tr.doc.toJSON()))return refuseStandaloneWriteback();
    }else if(!standaloneMathChanges(projection,tr.doc.toJSON())?.length)return refuseStandaloneWriteback();
    editor.view.dispatch(tr);
    return editor.state.doc!==tr.before;
  });
}
function openNativeMeasuredDrawing(drawing){
  const matches=nativeDrawingTargets(drawing.raster?rasterDrawingRanges:tikzDrawingRanges).filter(target=>target.text===drawing.source&&
    (!drawing.filePath||target.path===drawing.filePath)&&target.from===drawing.from16&&target.to===drawing.to16);
  if(matches.length!==1)return;
  const [{position}]=matches;
  if(drawing.raster){
    const {state}=editor;
    editor.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc,position)));
  }else editNativeDrawing(position);
}
function nativeSourceBlocks(){
  const results=[];
  forEachNativeDocumentBlock('raw',(node,_position,block,path,text,base,fileId)=>{
    if(block?.count!==1||typeof text!=='string')return;
    const raw=block.raw.trim();
    if(!raw||raw!==node.attrs.source?.trim())return;
    const from=base+block.from+block.raw.length-block.raw.trimStart().length;
    const to=from+raw.length;
    if(text.slice(from,to)!==raw)return;
    const label=raw.split(/\r?\n/,1)[0].slice(0,64);
    results.push({path,fileId,text,from,to,label:label===raw?label:`${label}…`});
  });
  return results;
}
async function openNativeSourceBlock(block){
  if(!sourceView.hidden)return;
  const project=projectExplorer?.model;
  const file=block.fileId?project?.files.get(block.path):null;
  if(block.fileId&&file?.id!==block.fileId)return;
  if((file?.draft??source())!==block.text)return;
  setSourceMode(true);
  if(sourceView.hidden)return;
  if(file&&project.activeFileId!==file.id){
    await projectExplorer.openFile(file.id);
    if(projectExplorer.model!==project||project.activeFileId!==file.id)return;
  }
  if(!sourceView.hidden&&sourceView.value===block.text)sourceView.select(block.from,block.to);
}
function nativeProjectEntry(project){
  const main=project.file(project.mainFileId),active=project.file(project.activeFileId);
  const composition=projectDocument.compose(project,main.id,{boundariesOnly:true});
  if(active.id===main.id||active.kind!=='tex'||composition.sources.has(active.id))
    return {file:main,composition};
  const wrapFragment=!parseDocument(active.draft);
  if(wrapFragment&&!parseDocument(main.draft))return {file:main,composition};
  return {file:active,wrapFragment,composition:projectDocument.compose(project,active.id,{boundariesOnly:true})};
}
function canStartNativeText(){
  if(!sourceView.hidden||projectDocument.composition||editor.state.doc.childCount!==1)return false;
  const paragraph=editor.state.doc.firstChild,project=projectExplorer?.model;
  if(paragraph?.type.name!=='paragraph'||paragraph.content.size)return false;
  const entry=project&&nativeProjectEntry(project);
  if(entry&&entry.file.id!==project.activeFileId)return false;
  const value=source();
  const document=parseDocument(value,{fragment:entry?.wrapFragment});
  return Boolean(document&&value.slice(document.start.length,value.length-document.end.length).trim()==='');
}
function newNativeMath(text,display,numbering){
  if(!text.trim()||/[\r\n]/.test(text))return null;
  const model=projectMath(text);
  if(!model.supported)return null;
  const delimiter=numbering==='equation'?'equation':display?'\\[':'$';
  const [open,close]=delimiter==='equation'?['\\begin{equation}','\\end{equation}']:
    display?['\\[','\\]']:['$','$'];
  const empty=model.slots.find(slot=>['numerator','denominator','radicand','degree','superscript','subscript','cell']
    .includes(slot.role)&&slot.raw.length===0);
  const node=editor.schema.nodes[display?'mathBlock':'math'].create({latex:text,display,delimiter});
  return {node,open,close,initial:empty?.from16??text.length};
}
nativeTexPreview=installNativeTexPreview({host:footer,before:modes,primary:nativeWorkspaceRequested(),documentZoom:Number(zoom.value),
  isDocumentMode:()=>sourceView.hidden,
  splitHost:()=>!sourceView.hidden&&sourceView.split&&projectFileKind!=='bib'?sourceView.previewHost:null,
  getSnapshot:async()=>{
    if(projectExplorer?.active){
      const project=projectExplorer.model;
      if(!sourceView.hidden)sourceView.flush();
      else editor.view.domObserver.flush();
      projectExplorer.changed();
      const active=project.activeFileId,{file,composition,wrapFragment}=nativeProjectEntry(project);
      const snapshot=await nativeProjectSnapshot(project,{useModelAssets:true,includeGeneratedInputs:true,
        entryFileId:file.id,wrapFragment});
      if(projectExplorer.model!==project||project.activeFileId!==active)
        throw new Error(t('工程已改变，请重试。','Project changed; retry the preview.'));
      return {...snapshot,editablePaths:new Set(composition.regions.map(region=>region.path))};
    }
    if(projectFileKind==='bib')throw new Error(t('请打开 .tex 文档。','Open a .tex document.'));
    const text=sourceView.hidden?source():sourceView.value;
    return nativeAttachedSnapshot(text,projectAssets());
  },
  isComposing:()=>editor.view.composing||sourceView.composing,
  listTikzDrawings:nativeTikzDrawings,
  listSourceBlocks:nativeSourceBlocks,
  openSourceBlock:openNativeSourceBlock,
  editTikzDrawing:editNativeDrawing,
  openMeasuredDrawing:openNativeMeasuredDrawing,
  focusImage:path=>{
    if(!sourceView.hidden)return;
    const matches=[];
    editor.state.doc.descendants((node,position)=>{
      if(node.type.name!=='documentImage')return;
      const sourcePath=stagedRasterPath(node.attrs.path);
      if(sourcePath&&(sourcePath===path||sourcePath===path.replace(/\.(?:png|jpe?g)$/i,'')))
        matches.push(position);
      return false;
    });
    if(matches.length!==1)return;
    const {state}=editor;
    editor.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc,matches[0])));
  },
  continuationRegion:caret=>{
    if(!caret||!sourceView.hidden)return null;
    const composition=currentNativeProjectComposition();
    const owner=caret.formula??caret.paragraph;
    if(!composition||!owner.filePath)return null;
    const index=composition.regions.findIndex(region=>region.path===owner.filePath&&
      region.from<=caret.docOffset&&region.to>=caret.docOffset&&composition.sources.get(region.id)===owner.source);
    const parent=composition.content[index]?.attrs.trail?.at(-1);
    if(!parent)return null;
    const continuation=composition.regions.slice(index+1).find(region=>region.path===parent);
    if(!continuation)return null;
    return {...continuation,empty:Boolean(emptyContinuation(continuation,composition,editor.state.doc))};
  },
  selectionRegions:()=>{
    const composition=currentNativeProjectComposition();
    return composition?.regions.map((region,index)=>({...region,trail:composition.content[index]?.attrs.trail}));
  },
  foldedFiles:()=>projectPresentation?.foldedFiles()??[],
  serializeTextSelection:()=>editor.view.serializeForClipboard(editor.state.selection.content()).dom.innerHTML,
  commitInlinePaste:(first,last,html,mode)=>{
    if(first?.kind!=='text'||first.paragraph!==last?.paragraph)return null;
    const {paragraph}=first,{state}=editor;
    if(paragraph.heading||paragraph.tableCell||paragraph.container)return null;
    const target=nativeProsePosition(paragraph,first.local,last.local);
    if(!target||target.range.endpoints.start.marks?.length||target.range.endpoints.end.marks?.length)return null;
    const parsed=new DOMParser().parseFromString(html,'text/html');
    const slice=ProseMirrorParser.fromSchema(state.schema).parseSlice(parsed.body);
    const fragment=slice.content.childCount===1&&slice.content.firstChild.type.name==='paragraph'
      ?slice.content.firstChild.content:slice.content;
    if(!fragment.childCount||fragment.content.some(node=>!node.isText&&
       (node.type.name!=='math'||node.attrs.display||!projectMath(node.attrs.latex).supported)))return null;
    const keptMarks=new Set(mode==='merge'?['bold','italic','underline','strike']:
      ['bold','italic','underline','strike','code','superscript','subscript','smallcaps','textCommand','textStyle']);
    const content=Fragment.fromArray(fragment.content.map(node=>node.mark(node.marks.filter(mark=>keptMarks.has(mark.type.name)))));
    if(!content.content.some(node=>node.type.name==='math'||node.marks.length))return null;
    const insert=content.content.map(node=>serialize(node.toJSON())).join('');
    if(!insert||resolvePackages(documentParts.start,insert).length)return null;
    const {from:start,to:end}=target.range;
    const tr=state.tr.replaceWith(start,end,content);
    tr.setSelection(TextSelection.create(tr.doc,start+content.size));
    const from=first.docOffset,to=last.docOffset,source=paragraph.source;
    const draft=source.slice(0,from)+insert+source.slice(to),endOffset=from+insert.length;
    const fragmentSource=projectFileKind==='tex';
    const mixed=projectMixedDocument(draft,{fragment:fragmentSource,filePath:paragraph.filePath});
    const candidate=mixed?.paragraphs.find(next=>next.from16===paragraph.from16);
    if(!candidate)return null;
    const local=endOffset-candidate.from16;
    const direct=candidate.runs.some(run=>local>=run.from16&&local<=run.to16&&
      (!run.offsets||run.offsets.includes(local-run.from16)));
    const stop=direct?local:candidate.glyphs.findLast(glyph=>glyph.to16<=local)?.to16;
    if(stop===undefined)return null;
    const offset=candidate.from16+stop;
    if(target.composition){
      const updates=projectDocument.changes(tr.doc.toJSON());
      if(updates?.get(target.file.id)!==draft)return null;
      for(const [id,text] of updates)if(id!==target.file.id&&text!==target.project.file(id).draft)return null;
      editor.view.dispatch(closeHistory(tr));
      return editor.state.doc===state.doc?null:{source:draft,offset,path:paragraph.filePath};
    }
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:fragmentSource});
    const caret=offset-candidate.from16;
    if(!nativeEditorRange({doc:tr.doc,projection:projected,paragraph:candidate,from:caret,to:caret}))return null;
    return dispatchNativeParagraphChange(state,tr,source,draft,{from,to,insert},projected)
      ?{source:draft,offset,path:paragraph.filePath}:null;
  },
  selectText:(anchor,head)=>{
    if(!anchor||!head)return false;
    if(anchor.paragraph!==head.paragraph){
      if(!sameTable(anchor,head))return false;
      const {state}=editor;
      const address=stop=>{
        const target=nativeProsePosition(stop.paragraph,stop.local,stop.local);
        if(!target)return null;
        const pos=state.doc.resolve(target.range.from);
        return ['tableCell','tableHeader'].includes(pos.node(pos.depth-1).type.name)?pos.before(pos.depth-1):null;
      };
      const from=address(anchor),to=address(head);
      if(from===null||to===null)return false;
      const selected=CellSelection.create(state.doc,from,to);
      if(!selected.eq(state.selection))editor.view.dispatch(state.tr.setSelection(selected).setMeta('addToHistory',false));
      return true;
    }
    const forward=anchor.local<=head.local;
    const position=nativeProsePosition(head.paragraph,Math.min(anchor.local,head.local),Math.max(anchor.local,head.local));
    if(!position)return false;
    const {from,to}=position.range;
    const {state}=editor;
    const selection=TextSelection.create(state.doc,forward?from:to,forward?to:from);
    if(!selection.eq(state.selection))editor.view.dispatch(state.tr.setSelection(selection).setMeta('addToHistory',false));
    return true;
  },
  canStartText:canStartNativeText,
  commitInitialMath:(text,display,numbering)=>{
    if(!canStartNativeText())return null;
    const prepared=newNativeMath(text,display,numbering);
    if(!prepared)return null;
    const {state}=editor,original=source(),fragment=projectFileKind==='tex';
    const document=parseDocument(original,{fragment});
    if(!document)return null;
    const {node,open,close,initial}=prepared;
    const from=document.start.length;
    const eol=!document.end&&from===original.length?'':document.eol;
    const insert=open+text+close+eol;
    const draft=original.slice(0,from)+insert+original.slice(from);
    const tr=state.tr;
    if(display)tr.insert(0,node).setSelection(NodeSelection.create(tr.doc,0));
    else tr.insert(1,node).setSelection(TextSelection.create(tr.doc,2));
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment});
    if(!projected?.blocks.some(block=>block.editable&&block.from<=from&&block.to>=from+insert.trimEnd().length))return null;
    const project=projectExplorer?.model;
    const path=project?.file(project.activeFileId).path;
    return dispatchNativeParagraphChange(state,tr,original,draft,{from,to:from,insert},projected)
      ?{source:draft,offset:from+open.length+initial,path}:null;
  },
  commitInitialText:(text,region)=>{
    if(region){
      if(!text.trim()||/[\r\n]/.test(text))return null;
      const {state}=editor,project=projectExplorer?.model,composition=currentNativeProjectComposition();
      const target=emptyContinuation(region,composition,state.doc);
      if(!target||!project||!projectDocument.rebase(composition,editor.getJSON()))return null;
      const tr=state.tr.insertText(text,target.start);
      tr.setSelection(TextSelection.create(tr.doc,target.start+text.length));
      const updates=projectDocument.changes(tr.doc.toJSON());
      const draft=updates?.get(region.id);
      if(!draft||draft===target.source)return null;
      for(const [id,value] of updates)if(id!==region.id&&value!==project.file(id).draft)return null;
      const tail=region.to+draft.length-target.source.length;
      if(!draft.startsWith(target.source.slice(0,region.from))||draft.slice(tail)!==target.source.slice(region.to))return null;
      const candidate=projectMixedDocument(draft,{fragment:true,filePath:region.path})?.paragraphs.find(paragraph=>
        paragraph.from16>=region.from&&paragraph.from16+paragraph.text.length<=tail);
      if(!candidate?.glyphs.length)return null;
      const offset=candidate.from16+candidate.glyphs.at(-1).to16;
      editor.view.dispatch(closeHistory(tr));
      return editor.state.doc===state.doc?null:{source:draft,offset,path:region.path};
    }
    if(!text.trim()||/[\r\n]/.test(text)||!canStartNativeText())return null;
    const {state}=editor;
    const tr=state.tr.insertText(text,1);
    tr.setSelection(TextSelection.create(tr.doc,1+text.length));
    const prepared=standaloneParagraphDraft(importedSource,projection,importedSnapshot,
      state.doc.toJSON(),tr.doc.toJSON(),0);
    const project=projectExplorer?.model;
    const path=project?.file(project.activeFileId).path;
    const first=prepared&&projectTextDocument(prepared.draft,{filePath:path,fragment:projectFileKind==='tex'})?.paragraphs[0];
    if(!first)return null;
    const offset=first.from16+first.glyphs.at(-1).to16;
    editor.view.dispatch(closeHistory(tr.setMeta('standaloneParagraph',prepared)));
    return editor.state.doc===state.doc?null:{source:prepared.draft,offset,path};
  },
  commitParagraphBreak:(paragraph,from,to,text)=>{
    const theorem=paragraph.container?.type==='theoremBlock';
    const environment=paragraph.container?.type==='blockquote';
    if(paragraph.tableCell||paragraph.container&&!theorem&&!environment||paragraph.parts.length!==1||
       paragraph.parts[0].marks?.length||!from||/[\r\n]/.test(text))return null;
    if(paragraph.heading&&(!Number.isInteger(paragraph.headingEnd)||from!==to||to!==paragraph.text.length))return null;
    if(projectDocument.composition&&!projectDocument.rebase(currentNativeProjectComposition(),editor.getJSON()))return null;
    const target=nativeProsePosition(paragraph,from,to);
    if(!target)return null;
    const {range,project,composition,file}=target,{state}=editor;
    if(!text&&to===paragraph.text.length)return {awaitingText:true};
    if(text&&!text.trim())return null;
    const newline=paragraph.source.includes('\r\n')?'\r\n':'\n';
    const raw=serialize({type:'text',text});
    const start=paragraph.headingEnd??paragraph.from16+from,end=paragraph.headingEnd??paragraph.from16+to;
    const proseEnd=paragraph.from16+paragraph.text.length;
    const wrapper=paragraph.wrapped&&paragraph.wrapperEnd>proseEnd;
    if(wrapper&&paragraph.container)return null;
    const close=wrapper?paragraph.source.slice(proseEnd,paragraph.wrapperEnd):'';
    const insert=close+newline+newline+raw;
    const change={from:start,to:wrapper?paragraph.wrapperEnd:end,
      insert:insert+(wrapper?paragraph.source.slice(end,proseEnd):'')};
    const draft=paragraph.source.slice(0,change.from)+change.insert+paragraph.source.slice(change.to);
    const at=state.doc.resolve(range.from);
    const parent=environment?at.before(at.depth-1):null;
    const tr=state.tr;
    if(range.to>range.from)tr.delete(range.from,range.to);
    tr.split(range.from,1,[{type:editor.schema.nodes.paragraph}]);
    const next=range.from+2;
    if(text)tr.insertText(text,next);
    if(environment&&!refreshNativeTextEnvironment(tr,parent,range.match.sourceBlock,paragraph.source,change))return null;
    tr.setSelection(TextSelection.create(tr.doc,next+text.length));
    const offset=change.from+insert.length;
    if(composition){
      const drafts=projectDocument.changes(tr.doc.toJSON());
      if((wrapper||environment)&&drafts?.get(file.id)!==draft)return dispatchNativeProjectChange(state,tr,project,new Map([[file.id,draft]]))
        ?{source:draft,offset,path:paragraph.filePath}:null;
      if(drafts?.get(file.id)!==draft)return null;
      for(const [id,value] of drafts)if(id!==file.id&&value!==project.file(id).draft)return null;
      editor.view.dispatch(closeHistory(tr));
      return editor.state.doc===state.doc?null:{source:draft,offset,path:paragraph.filePath};
    }
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
    if(theorem){
      const patches=richSourceChanges(projection,tr.doc.toJSON());
      const owner=projectTextDocument(draft,{filePath:paragraph.filePath,fragment:projectFileKind==='tex'})?.paragraphs.find(next=>(
        next.from16<=offset&&offset<=next.from16+next.text.length&&next.container?.type==='theoremBlock'));
      if(!projected||patches?.length!==1||!owner||
        paragraph.source.slice(0,patches[0].from)+patches[0].insert+paragraph.source.slice(patches[0].to)!==draft)return null;
    }else if(!projected?.blocks.some(block=>block.index===tr.doc.resolve(next).index(0)&&
        block.from<=offset&&block.to>=offset&&block.editable))return null;
    return dispatchNativeParagraphChange(state,tr,paragraph.source,draft,change,projected)
      ?{source:draft,offset,path:paragraph.filePath}:null;
  },
  commitParagraphJoin:(first,last,text='')=>{
    if(first?.kind!=='text'||last?.kind!=='text'||first.paragraph===last.paragraph||
      first.paragraph.filePath!==last.paragraph.filePath||first.paragraph.source!==last.paragraph.source||
      /[\r\n]/.test(text))return null;
    const theorem=first.paragraph.container?.type==='theoremBlock'&&last.paragraph.container?.type==='theoremBlock';
    const environment=first.paragraph.container?.type==='blockquote'&&last.paragraph.container?.type==='blockquote';
    for(const stop of [first,last]){
      const {paragraph}=stop;
      if(paragraph.heading||paragraph.tableCell||paragraph.container&&!theorem&&!environment||paragraph.parts.length!==1||
        paragraph.parts[0].marks?.length)return null;
    }
    const from=first.docOffset,to=last.docOffset,source=first.paragraph.source;
    const gap=source.slice(first.paragraph.from16+first.paragraph.text.length,last.paragraph.from16);
    if(!(first.paragraph.text.slice(0,first.local)+text+last.paragraph.text.slice(last.local)).trim())return null;
    if(projectDocument.composition&&!projectDocument.rebase(currentNativeProjectComposition(),editor.getJSON()))return null;
    const left=nativeProsePosition(first.paragraph,first.local,first.local);
    const right=nativeProsePosition(last.paragraph,last.local,last.local);
    if(!left||!right)return null;
    const {state}=editor;
    const start=state.doc.resolve(left.range.from),end=state.doc.resolve(right.range.from),depth=start.depth-1;
    if(end.depth!==start.depth||start.start(depth)!==end.start(depth))return null;
    const middle=start.node(depth).content.content.slice(start.index(depth)+1,end.index(depth));
    const explicitBreak=environment&&/^\s*\\par\s*$/.test(gap);
    if((theorem||environment)&&middle.length||!explicitBreak&&!matchesParagraphGap(gap,middle.map(node=>node.toJSON())))return null;
    const tr=state.tr.insertText(text,left.range.from,right.range.from);
    const insert=serialize({type:'text',text}),offset=from+insert.length;
    const change={from,to,insert};
    if(environment&&!refreshNativeTextEnvironment(tr,start.before(depth),left.range.match.sourceBlock,source,change))return null;
    tr.setSelection(TextSelection.create(tr.doc,left.range.from+text.length));
    const draft=source.slice(0,from)+insert+source.slice(to);
    if(left.composition){
      if(left.file!==right.file)return null;
      const drafts=projectDocument.changes(tr.doc.toJSON());
      if(environment&&drafts?.get(left.file.id)!==draft)
        return dispatchNativeProjectChange(state,tr,left.project,new Map([[left.file.id,draft]]))
          ?{source:draft,offset,path:first.paragraph.filePath}:null;
      if(drafts?.get(left.file.id)!==draft)return null;
      for(const [id,value] of drafts)if(id!==left.file.id&&value!==left.project.file(id).draft)return null;
      editor.view.dispatch(closeHistory(tr));
      return editor.state.doc===state.doc?null:{source:draft,offset,path:first.paragraph.filePath};
    }
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
    if(theorem){
      const patches=richSourceChanges(projection,tr.doc.toJSON());
      if(!projected||patches?.length!==1||
         source.slice(0,patches[0].from)+patches[0].insert+source.slice(patches[0].to)!==draft)return null;
    }else if(!projected?.blocks.some(block=>block.index===left.range.match.index&&block.editable&&block.from<=from&&block.to>=from))return null;
    return dispatchNativeParagraphChange(state,tr,source,draft,change,projected)
      ?{source:draft,offset,path:first.paragraph.filePath}:null;
  },
  commitNewMath:(first,last,text,display,numbering)=>{
    if(first?.kind!=='text'||first.paragraph!==last?.paragraph)return null;
    const prepared=newNativeMath(text,display,numbering);
    if(!prepared)return null;
    const {paragraph}=first;
    if(paragraph.heading||paragraph.container||paragraph.tableCell||paragraph.parts.length!==1||paragraph.parts[0].marks?.length)return null;
    if(projectDocument.composition&&!projectDocument.rebase(currentNativeProjectComposition(),editor.getJSON()))return null;
    const target=nativeProsePosition(paragraph,first.local,last.local);
    if(!target)return null;
    const {state}=editor;
    const {range}=target;
    const {node:math,open,close,initial}=prepared;
    const tr=state.tr;
    let prefix=open,suffix=close;
    if(display){
      if(first!==last||first.local!==0&&first.local!==paragraph.text.length)return null;
      const head=first.local===0;
      const eol=paragraph.source.includes('\r\n')?'\r\n':'\n';
      prefix=(head?'':eol+eol)+open;
      suffix=close+(head?eol+eol:'');
      const at=head?range.match.offset:range.match.offset+range.match.node.nodeSize;
      tr.insert(at,math);
      tr.setSelection(NodeSelection.create(tr.doc,at));
    }else{
      tr.replaceWith(range.from,range.to,math);
      tr.setSelection(TextSelection.create(tr.doc,range.from+1));
    }
    const change={from:first.docOffset,to:last.docOffset,insert:prefix+text+suffix};
    const draft=paragraph.source.slice(0,change.from)+change.insert+paragraph.source.slice(change.to);
    const offset=change.from+prefix.length+initial;
    const result={source:draft,offset,path:paragraph.filePath};
    if(target.composition){
      const drafts=projectDocument.changes(tr.doc.toJSON());
      if(drafts?.get(target.file.id)!==draft)return null;
      for(const [id,value] of drafts)if(id!==target.file.id&&value!==target.project.file(id).draft)return null;
      editor.view.dispatch(closeHistory(tr));
      return editor.state.doc===state.doc?null:result;
    }
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
    if(!projected?.blocks.some(block=>block.editable&&block.from<=offset&&block.to>=offset))return null;
    return dispatchNativeParagraphChange(state,tr,paragraph.source,draft,change,projected)?result:null;
  },
  commitAfterFormulaText:(formula,text)=>{
    if(!text.trim()||/[\r\n]/.test(text))return null;
    const target=nativeFormulaPosition(formula);
    if(!target?.node)return null;
    const {state}=editor,{position,node,project,composition,file}=target;
    const {source,outerTo16:from}=formula;
    const fragment=projectFileKind==='tex',document=parseDocument(source,{fragment});
    if(!document)return null;
    const next=position+node.nodeSize,encoded=serialize({type:'text',text});
    let insert=encoded,caret=next+text.length;
    const tr=state.tr;
    if(formula.kind==='inlineMath')tr.insertText(text,next);
    else {
      const parent=state.doc.resolve(position).parent.type.name;
      if(parent!=='doc'&&parent!=='projectRegion')return null;
      const following=state.doc.nodeAt(next);
      if(following?.type.name==='paragraph'&&!following.content.size)tr.insertText(text,next+1);
      else tr.insert(next,state.schema.nodes.paragraph.create(null,state.schema.text(text)));
      caret++;
      insert=document.eol+document.eol+encoded;
    }
    tr.setSelection(TextSelection.create(tr.doc,caret));
    const draft=source.slice(0,from)+insert+source.slice(from);
    const offset=from+insert.length,path=formula.filePath;
    const candidate=projectMixedDocument(draft,{fragment,filePath:path,splitIncludes:Boolean(composition)})?.paragraphs.find(paragraph=>
      offset>=paragraph.from16&&offset<=paragraph.from16+paragraph.text.length);
    if(!candidate)return null;
    if(composition){
      const updates=projectDocument.changes(tr.doc.toJSON());
      if(updates?.get(file.id)!==draft)return null;
      for(const [id,value] of updates)if(id!==file.id&&value!==project.file(id).draft)return null;
      editor.view.dispatch(closeHistory(tr));
      return editor.state.doc!==state.doc?{source:draft,offset,path}:null;
    }
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment});
    const local=offset-candidate.from16;
    const projectedCaret=nativeEditorRange({doc:tr.doc,projection:projected,paragraph:candidate,from:local,to:local});
    if(projectedCaret?.from!==caret)return null;
    const change={from,to:from,insert};
    return projected&&dispatchNativeParagraphChange(state,tr,source,draft,change,projected)?{source:draft,offset,path}:null;
  },
  focusMathSlot:async(anchor,head,isCurrent)=>{    const project=projectExplorer?.model;
    const formula=head.formula;
    if(anchor.formula.filePath!==formula.filePath)return;
    const file=project?.files.get(formula.filePath);
    if(project&&(!file||file.draft!==formula.source))return;
    if(!sourceView.hidden){
      if(project&&project.activeFileId!==file.id){
        await projectExplorer.openFile(file.id);
        if(projectExplorer.model!==project||project.activeFileId!==file.id)return;
      }
      if(sourceView.hidden||sourceView.value!==formula.source)return;
      sourceView.select(anchor.position,head.position);
      return true;
    }
    if(!projectDocument.composition&&((project&&project.activeFileId!==file.id)||source()!==formula.source))return;
    if(anchor.formula!==formula)return;
    const fields=[...paper.querySelectorAll(formula.kind==='displayMath'?'.math-display math-field':'.math-inline math-field')]
      .filter(field=>!projectDocument.composition||field.closest('[data-project-region]')?.dataset.filePath===formula.filePath);
    const field=fields[formula.ordinal];
    if(fields.length!==formula.count||!matchesRichFormula(field,formula))return;
    const model=field._mathfield?.model;
    const from=model&&richSlotPosition(model,formula.math.atoms,anchor.owner,anchor.hit);
    const to=anchor===head?from:model&&richSlotPosition(model,formula.math.atoms,head.owner,head.hit);
    if(from==null||to==null)return;
    field.focus();
    if(from===to)field.position=from;
    else field.selection={ranges:[[Math.min(from,to),Math.max(from,to)]],direction:from<to?'forward':'backward'};
    return {field};
  },
  commitMath:({formula,patch,text,structure,needsAmsmath,cursor})=>{
    if(!text||text===formula.math.source)return false;
    const target=nativeFormulaPosition(formula);
    if(!target?.node)return false;
    const {position,node,type,project,composition,file}=target;
    const from=formula.from16+patch.from,to=formula.from16+patch.to;
    const expected=formula.source.slice(0,from)+patch.insert+formula.source.slice(to);
    let latex=text,detachedLabel=false;
    const environment=type==='mathBlock'&&displayEnvironment(formula.math.source);
    if(node.attrs.latex!==formula.math.source){
      if(type!=='mathBlock'||node.attrs.delimiter!=='equation'||!node.attrs.label)return false;
      const [original]=importBlocks(formula.source.slice(formula.outerFrom16,formula.outerTo16));
      const [revised]=importBlocks(expected.slice(formula.outerFrom16,formula.outerTo16+patch.insert.length-(to-from)));
      if(original?.type!=='mathBlock'||original.attrs.latex!==node.attrs.latex||original.attrs.label!==node.attrs.label||
        revised?.type!=='mathBlock'||revised.attrs.label!==node.attrs.label)return false;
      latex=revised.attrs.latex;detachedLabel=true;
    }
    const transaction=editor.state.tr.setNodeMarkup(position,undefined,{...node.attrs,latex});
    if(structure)closeHistory(transaction);
    if(needsAmsmath){
      const doc=!composition&&parseDocument(formula.source);
      if(!doc||!Number.isInteger(cursor))return false;
      const at=doc.start.lastIndexOf('\\begin{document}');
      if(at<0||from<doc.start.length)return false;
      const packageLine='\\usepackage{amsmath}'+doc.eol;
      const preamble=doc.start.slice(0,at)+packageLine+doc.start.slice(at);
      const draft=expected.slice(0,at)+packageLine+expected.slice(at);
      transaction.setDocAttribute('layoutPreamble',preamble);
      const projected=sourceProjection(draft,transaction.doc.toJSON());
      if(!projected)return false;
      const change={from:at,to,insert:packageLine+formula.source.slice(at,from)+patch.insert};
      return dispatchNativeParagraphChange(editor.state,transaction,formula.source,draft,change,projected)
        ?{source:draft,path:formula.filePath,offset:cursor+packageLine.length}:false;
    }
    if((detachedLabel||environment)&&!composition){
      if(environment){
        const revised=importBlocks(expected.slice(formula.outerFrom16,formula.outerTo16+patch.insert.length-(to-from)));
        if(revised.length!==1||revised[0].type!=='mathBlock'||revised[0].attrs.latex!==latex||
            displayEnvironment(latex)!==environment)return false;
      }
      const projected=sourceProjection(expected,transaction.doc.toJSON(),{fragment:projectFileKind==='tex'});
      return Boolean(projected&&dispatchNativeParagraphChange(editor.state,transaction,formula.source,expected,
        {from,to,insert:patch.insert},projected));
    }
    if(composition){
      const drafts=projectDocument.changes(transaction.doc.toJSON());
      if(drafts?.get(file.id)!==expected)return false;
      for(const [id,draft] of drafts)if(id!==file.id&&draft!==project.file(id).draft)return false;
    }else if(project){
      const changes=standaloneMathChanges(projection,transaction.doc.toJSON());
      if(!changes?.length||changes.reduceRight((source,change)=>
        source.slice(0,change.from)+change.insert+source.slice(change.to),formula.source)!==expected)return false;
    }
    editor.view.dispatch(transaction);
    return editor.state.doc.nodeAt(position)?.attrs.latex===latex;
  },
  commitText:({paragraph,patch,text})=>{
    if((!text&&!paragraph.tableCell)||text===paragraph.text)return false;
    const position=nativeProsePosition(paragraph,patch.from,patch.to);
    if(!position)return false;
    const {range,project,composition,file}=position;
    const {from:start,to:end,match,endpoints,marks}=range;
    const tr=editor.state.tr;
    if(end>start)tr.delete(start,end);
    if(patch.insert)tr.insert(start,editor.schema.text(patch.insert,marks));
    tr.setSelection(TextSelection.create(tr.doc,start+patch.insert.length));
    if(paragraph.wrapped&&!paragraph.container&&!paragraph.tableCell&&!paragraph.heading){
      const {state}=editor,{source}=paragraph;
      const change={from:paragraph.from16+patch.from,to:paragraph.from16+patch.to,insert:patch.latex??patch.insert};
      const draft=source.slice(0,change.from)+change.insert+source.slice(change.to);
      if(composition)return dispatchNativeProjectChange(state,tr,project,new Map([[file.id,draft]]));
      const owner=projection?.blocks.find(block=>block.index===match.index&&block.count===1&&
        change.from>=block.from&&change.to<=block.to);
      if(!owner)return false;
      const [updated,...rest]=importBlocks(draft.slice(owner.from,owner.to+draft.length-source.length));
      if(updated?.type!=='paragraph'||rest.length||!state.schema.nodeFromJSON(updated).eq(tr.doc.child(match.index)))return false;
      const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
      return Boolean(projected&&dispatchNativeParagraphChange(state,tr,source,draft,change,projected));
    }
    if(composition){
      const from=paragraph.from16+patch.from,to=paragraph.from16+patch.to;
      const expected=file.draft.slice(0,from)+(patch.latex??patch.insert)+file.draft.slice(to);
      const drafts=projectDocument.changes(tr.doc.toJSON());
      if(drafts?.get(file.id)!==expected)return false;
      for(const [id,draft] of drafts)if(id!==file.id&&draft!==project.file(id).draft)return false;
    }
    if(!composition&&(paragraph.tableCell||paragraph.container)){
      const patchList=standaloneMathChanges(projection,tr.doc.toJSON());
      const from=paragraph.from16+patch.from,to=paragraph.from16+patch.to;
      const expected=paragraph.source.slice(0,from)+patch.insert+paragraph.source.slice(to);
      if(!patchList?.length||patchList.reduceRight((source,change)=>
        source.slice(0,change.from)+change.insert+source.slice(change.to),paragraph.source)!==expected)return false;
    }else if(!composition&&(patch.latex||endpoints.start!==endpoints.end||
        paragraph.parts.some(part=>part.marks?.length||part.offsets))){
      const from=paragraph.from16+patch.from,to=paragraph.from16+patch.to;
      const expected=paragraph.source.slice(0,from)+(patch.latex??patch.insert)+paragraph.source.slice(to);
      const draft=standaloneParagraphDraft(importedSource,projection,importedSnapshot,
        editor.state.doc.toJSON(),tr.doc.toJSON(),match.index);
      if(draft?.draft!==expected)return false;
    }
    if(endpoints.start!==endpoints.end)closeHistory(tr);
    const before=editor.state.doc;
    editor.view.dispatch(tr);
    return editor.state.doc!==before;
  },
  commitTextLines:(first,last,text)=>{
    if(first?.kind!=='text'||first.paragraph!==last?.paragraph)return null;
    const {paragraph}=first;
    if(paragraph.heading||paragraph.tableCell||paragraph.container||
      paragraph.parts.some(part=>part.kind==='math'||part.marks?.length))return null;
    const lines=text.split(/\r\n|\r|\n/);
    if(lines.some(line=>!line||line!==line.trim()))return null;
    if(projectDocument.composition&&!projectDocument.rebase(currentNativeProjectComposition(),editor.getJSON()))return null;
    const target=nativeProsePosition(paragraph,first.local,last.local);
    if(!target||target.range.endpoints.start!==target.range.endpoints.end)return null;
    const {state}=editor,hardBreak=editor.schema.nodes.hardBreak;
    const content=lines.flatMap((line,index)=>index?[hardBreak.create(),editor.schema.text(line)]:[editor.schema.text(line)]);
    const {from:start,to:end,match}=target.range;
    const tr=state.tr.replaceWith(start,end,content);
    tr.setSelection(TextSelection.create(tr.doc,start+lines.join('').length+lines.length-1));
    const from=first.docOffset,to=last.docOffset,source=paragraph.source;
    const eol=source.includes('\r\n')?'\r\n':'\n';
    const insert=lines.map(line=>serialize({type:'text',text:line})).join(serialize({type:'hardBreak'}).replace('\n',eol));
    const draft=source.slice(0,from)+insert+source.slice(to),offset=from+insert.length;
    const candidate=projectTextDocument(draft,{fragment:projectFileKind==='tex',filePath:paragraph.filePath})
      ?.paragraphs.find(next=>next.from16===paragraph.from16);
    if(!candidate)return null;
    const local=offset-candidate.from16;
    if(!candidate.runs.some(run=>local>=run.from16&&local<=run.to16))return null;
    if(target.composition){
      const drafts=projectDocument.changes(tr.doc.toJSON());
      if(drafts?.get(target.file.id)!==draft)return null;
      for(const [id,value] of drafts)if(id!==target.file.id&&value!==target.project.file(id).draft)return null;
      editor.view.dispatch(closeHistory(tr));
      return editor.state.doc===state.doc?null:{source:draft,offset,path:paragraph.filePath};
    }
    const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
    const selection=nativeEditorRange({doc:tr.doc,projection:projected,paragraph:candidate,from:local,to:local});
    if(!projected||selection?.match.index!==match.index||selection.from!==tr.selection.from)return null;
    return dispatchNativeParagraphChange(state,tr,source,draft,{from,to,insert},projected)
      ?{source:draft,offset,path:paragraph.filePath}:null;
  },
  commitProjectRange:edits=>{
    const {state}=editor,project=projectExplorer?.model,composition=projectDocument.composition;
    if(!project||!composition||edits.length<2)return false;
    const mapped=edits.map(edit=>{
      if(edit.formula){
        const {formula,patch}=edit;
        const target=nativeFormulaPosition(formula);
        if(!target?.file||target.type!=='mathBlock'||target.node.attrs.labelSource)return null;
        const {position,node}=target;
        return {...edit,...target,range:{from:position,to:position+node.nodeSize},
          change:{from:formula.outerFrom16,to:formula.outerTo16,insert:patch.insert}};
      }
      const target=nativeProsePosition(edit.paragraph,edit.patch.from,edit.patch.to);
      const {paragraph,patch}=edit;
      return target?.file?{...edit,...target,change:{from:paragraph.from16+patch.from,
        to:paragraph.from16+patch.to,insert:patch.latex??patch.insert}}:null;
    });
    if(mapped.some(edit=>!edit))return false;
    const first=mapped[0];
    const positions=mapped.map(edit=>state.doc.resolve(edit.range.from));
    if(positions.some((position,index)=>{
      const {formula,paragraph,range}=mapped[index];
      if(!position.depth||position.node(1).type.name!=='projectRegion')return true;
      if(!paragraph?.container)return position.depth!==(formula?1:2);
      if(position.depth!==3)return true;
      const owner=position.node(2);
      return owner.type.name!==paragraph.container.type||owner.childCount!==1||!range.match.sourceBlock;
    }))return false;
    const firstRegion=positions[0].index(0),lastRegion=positions.at(-1).index(0);
    const expectedNodes=[];
    for(let index=firstRegion;index<=lastRegion;index++){
      const region=composition.regions[index],node=state.doc.child(index);
      const regionSource=region&&composition.sources.get(region.id);
      if(index>firstRegion&&index<lastRegion&&region&&node.childCount===1&&
         node.firstChild.type.name==='paragraph'&&!node.firstChild.content.size&&
         typeof regionSource==='string'&&!regionSource.slice(region.from,region.to).trim())continue;
      const start=index===firstRegion?positions[0].index(1):0;
      const end=index===lastRegion?positions.at(-1).index(1):node.childCount-1;
      for(let child=start;child<=end;child++)expectedNodes.push(`${index}/${child}`);
    }
    if(expectedNodes.length!==positions.length||positions.some((at,index)=>expectedNodes[index]!==`${at.index(0)}/${at.index(1)}`))return false;
    const tr=state.tr;
    const patches=new Map();
    for(let index=mapped.length-1;index>=0;index--){
      const {file,range,patch,change,paragraph}=mapped[index];
      if(range.to>range.from)tr.delete(range.from,range.to);
      if(patch.insert)tr.insert(range.from,editor.schema.text(patch.insert,range.marks));
      if(paragraph?.container?.type==='blockquote'&&!refreshNativeTextEnvironment(tr,positions[index].before(2),
         range.match.sourceBlock,paragraph.source,change))return false;
      if(!patches.has(file.id))patches.set(file.id,[]);
      patches.get(file.id).push(change);
    }
    tr.setSelection(TextSelection.create(tr.doc,first.range.from+first.patch.insert.length));
    const drafts=projectDocument.changes(tr.doc.toJSON());
    const expected=new Map([...patches].map(([id,changes])=>[id,changes.sort((a,b)=>b.from-a.from)
      .reduce((draft,change)=>draft.slice(0,change.from)+change.insert+draft.slice(change.to),project.file(id).draft)]));
    if(mapped.some(edit=>edit.formula||edit.paragraph.container))return dispatchNativeProjectChange(state,tr,project,expected);
    if(!drafts||[...expected].some(([id,value])=>drafts.get(id)!==value))return false;
    for(const [id,draft] of drafts)if(draft!==(expected.get(id)??project.file(id).draft))return false;
    editor.view.dispatch(closeHistory(tr));
    return editor.state.doc!==state.doc;
  },
  history:command=>{command==='redo'?redoDocument():undoDocument();},
  onEnvironmentChange:updateEnvironment,
  showTextCommands:field=>showCommands(field,'text'),
});
editor.on('update',()=>nativeTexPreview.refresh());
onAssetsChanged(()=>nativeTexPreview.refresh());
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
    nativeTexPreview?.documentChanged();
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
    nativeTexPreview?.refresh();

  },
  saved(text) { savedSource = text; sourceView.refresh(); },
  changed() { nativeTexPreview?.refresh(); },
  error(text) { const status = document.querySelector('#status'); status.hidden = false; status.textContent = text; },
  end() {
    nativeTexPreview?.documentChanged();
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
  const enabled=!typesetPagination?.getTableContinuation();
  typesetPagination?.setTableContinuation(enabled);
  config.updateInterface({continuedTables:enabled});
  updateContinueTablesButton();
});
updateContinueTablesButton();
groupButton(tableGroup,['＋ 行','＋ Row'],addMatrixRow,'＋ Row');
groupButton(tableGroup,['＋ 列','＋ Column'],addMatrixColumn,'＋ Column');
groupButton(tableGroup,['－ 行','－ Row'],()=>editNativeTable('deleteRow')??editor.chain().focus(undefined,{scrollIntoView:false}).deleteRow().run(),'－ Row');
groupButton(tableGroup,['－ 列','－ Column'],()=>editNativeTable('deleteColumn')??editor.chain().focus(undefined,{scrollIntoView:false}).deleteColumn().run(),'－ Column');
groupButton(tableGroup,['删除表格','Delete table'],()=>editNativeTable('deleteTable')??deleteTableKeepingScroll(editor));
groupButton(tableGroup,['合并','Merge'],()=>editNativeTable('mergeCells')??editor.chain().focus(undefined,{scrollIntoView:false}).mergeCells().run(),'merge');
groupButton(tableGroup,['拆分','Split'],()=>editNativeTable('splitCell')??editor.chain().focus(undefined,{scrollIntoView:false}).splitCell().run(),'split');
groupButton(tableGroup,'booktabs',()=>{if(editor.isActive('table'))editor.chain().focus(undefined,{scrollIntoView:false}).updateAttributes('table',{booktabs:!editor.getAttributes('table').booktabs}).run();});
groupButton(tableGroup,['题注','Caption'],async()=>{
  if(!editor.isActive('table'))return;
  const value=await askText(t('表格题注（LaTeX）','Table caption (LaTeX)'),editor.getAttributes('table').caption??'');
  if(value!==null)editor.chain().focus(undefined,{scrollIntoView:false}).updateAttributes('table',{caption:value||null,centered:true,placement:editor.getAttributes('table').placement??'htbp'}).run();
});
groupButton(tableGroup,'label',async()=>{
  if(!editor.isActive('table'))return;
  const value=await askText(t('表格标签键','Table label key'),editor.getAttributes('table').label??'');
  if(value!==null)editor.chain().focus(undefined,{scrollIntoView:false}).updateAttributes('table',{label:value||null}).run();
});
groupButton(tableGroup,['边框','Borders'],async()=>{
  if(!editor.isActive('table'))return;
  const mode=await askText(t('边框：grid 全部、outer 外框、horizontal 横线、none 无','Borders: grid, outer, horizontal, none'),editor.getAttributes('table').borderMode??'grid');
  if(mode && ['grid','outer','horizontal','none'].includes(mode)) editor.chain().focus(undefined,{scrollIntoView:false}).updateAttributes('table',{borderMode:mode,booktabs:false}).run();
});
groupButton(tableGroup,['线宽','Rule width'],async()=>{
  if(!editor.isActive('table'))return;
  const width=await askText(t('表格线宽（例如 0.8pt）','Table rule width (e.g. 0.8pt)'),editor.getAttributes('table').borderWidth??'0.4pt');
  if(width!==null && (!width || /^\d+(?:\.\d+)?pt$/.test(width))) editor.chain().focus(undefined,{scrollIntoView:false}).updateAttributes('table',{borderWidth:width||null}).run();
});
for(const [label,align] of [[['左','Left'],'left'],[['中','Center'],'center'],[['右','Right'],'right']]) groupButton(tableGroup,label,()=>{
  if(!editor.isActive('table'))return;
  const type=editor.isActive('tableHeader')?'tableHeader':'tableCell';
  editor.chain().focus(undefined,{scrollIntoView:false}).updateAttributes(type,{align}).run();
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
    if(focus)chain.focus(undefined,{scrollIntoView:false}).command(({tr})=>Boolean(closeHistory(tr)));
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
groupButton(formatGroup,'B',withNativeTextCommand('toggleBold',()=>editor.chain().focus().toggleBold().run()));
for (const [align,label] of [['left',['左对齐','Align left']],['right',['右对齐','Align right']],['center',['居中','Center']]]) {
  groupButton(formatGroup,label,withNativeTextCommand('align'+align[0].toUpperCase()+align.slice(1),()=>setParagraphAlignment(align)));
}
groupButton(formatGroup,'I',withNativeTextCommand('toggleItalic',()=>editor.chain().focus().toggleItalic().run()));
groupButton(formatGroup,'U',withNativeTextCommand('toggleUnderline',()=>editor.chain().focus().toggleMark('underline').run()));
groupButton(formatGroup,'S',withNativeTextCommand('toggleStrike',()=>editor.chain().focus().toggleStrike().run()));
groupButton(formatGroup,['清除格式','Clear formatting'],withNativeTextCommand('clearFormatting',()=>editor.chain().focus().unsetAllMarks().run()));
groupButton(formatGroup,'code',withNativeTextCommand('toggleCode',()=>editor.chain().focus().toggleCode().run()));
groupButton(formatGroup,'quote',withNativeTextCommand('toggleBlockquote',()=>editor.chain().focus().toggleBlockquote().run()));
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
groupButton(referenceGroup,'title',structureCommands.title);
groupButton(referenceGroup,'author',structureCommands.author);
groupButton(referenceGroup,'date',structureCommands.date);
groupButton(mathGroup,'$',()=>insertMath());
groupButton(mathGroup,'$$',()=>insertMath(true)).dataset.shortcut='editor.insertDisplayMath';
groupButton(mathGroup,'equation',()=>insertEquation());
const equationLabelKey=/^[\p{L}\p{N}:_.-]*$/u;
async function editNativeEquationLabel(caret) {
  const {formula,atom,slot}=caret;
  const target=nativeFormulaPosition(formula);
  if(target?.type!=='mathBlock')return false;
  const {node,position,composition,file,project}=target,{state}=editor;
  const {source,outerFrom16,outerTo16,math}=formula;
  const equation=node.attrs.delimiter==='equation';
  const cell=/^formula\/body\/0\/cell\.(\d+)\.\d+(?:\/|$)/.exec(`${atom.path}/${slot.role}`);
  const range=equation?{from:0,to:math.source.length}:node.attrs.latex===math.source&&cell&&
    alignmentLabelRange(math.source,Number(cell[1]));
  if(!range)return false;
  const body=math.source.slice(range.from,range.to);
  const tokens=[...sourceStructure(body)];
  const labels=tokens.flatMap(token=>{
    if(!token.topLevel||token.kind!=='command'||token.value!=='\\label')return [];
    const reference=referenceAt(body,token.index);
    return reference?[{...reference,from:token.index}]:[];
  });
  if(labels.length>1)return false;
  const [existing]=labels,field=document.activeElement;
  const label=await askText(t('公式标签','Equation label'),existing?.key??'');
  if(field?.isConnected&&sourceView.hidden)field.focus({preventScroll:true});
  if(label===null||label===(existing?.key??'')||!equationLabelKey.test(label)||
     editor.state.doc!==state.doc||!nativeFormulaPosition(formula))return false;
  let from,to,insert;
  if(existing&&label){
    from=existing.keyFrom;to=existing.keyTo;insert=label;
  }else if(existing){
    from=existing.from;to=existing.end;insert='';
    const lineStart=body.lastIndexOf('\n',from-1)+1;
    const ending=/^[ \t]*\r?\n/.exec(body.slice(to));
    if(ending&&!body.slice(lineStart,from).trim()){from=lineStart;to+=ending[0].length;}
  }else{
    from=to=body.trimEnd().length;
    const eol=source.includes('\r\n')?'\r\n':'\n';
    const lastLine=body.slice(body.lastIndexOf('\n',from-1)+1,from);
    const comment=/(^|[^\\])(?:\\\\)*%/.test(lastLine);
    insert=(comment?eol:'')+'\\label{'+label+'}';
  }
  from+=formula.from16+range.from;to+=formula.from16+range.from;
  const draft=source.slice(0,from)+insert+source.slice(to);
  const [updated]=importBlocks(draft.slice(outerFrom16,outerTo16+insert.length-(to-from)));
  if(updated?.type!=='mathBlock'||(equation?updated.attrs.delimiter!=='equation':
    displayEnvironment(updated.attrs.latex)!==displayEnvironment(math.source)))return false;
  const tr=editor.state.tr.setNodeMarkup(position,undefined,{...node.attrs,
    latex:updated.attrs.latex,label:updated.attrs.label??null,labelRow:null});
  if(composition){
    const updates=projectDocument.changes(tr.doc.toJSON());
    if(updates?.get(file.id)!==draft)return false;
    for(const [id,text] of updates)if(id!==file.id&&text!==project.file(id).draft)return false;
    editor.view.dispatch(closeHistory(tr));
    return editor.state.doc!==state.doc;
  }
  const projected=sourceProjection(draft,tr.doc.toJSON(),{fragment:projectFileKind==='tex'});
  return Boolean(projected&&dispatchNativeParagraphChange(editor.state,tr,source,draft,{from,to,insert},projected));
}
async function editFormulaLabel() {
  const native=nativeTexPreview.focusedCaret?.();
  if(native?.kind==='math')return editNativeEquationLabel(native);
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
  if(label===null || !equationLabelKey.test(label) ||
      current?.type!==node.type || current.attrs.delimiter!==node.attrs.delimiter ||
      (current!==node && (!field?.isConnected || current.attrs.id!==node.attrs.id)))return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(currentPosition,undefined,{...current.attrs,label:label||null,labelRow:label?row.index:null}));
  field?.focus();
}
groupButton(mathGroup,'equation label',editFormulaLabel);
function runNativeMathToolbarCommand(command,fallback){
  if(nativeTexPreview.hasNativeMathFocus?.())return nativeTexPreview.runMathCommand(command);
  return fallback();
}
groupButton(mathGroup,'frac',()=>runNativeMathToolbarCommand('frac',
  ()=>insertMath(false,'\\frac{\\placeholder{}}{\\placeholder{}}')));
groupButton(mathGroup,['公式换行','Math line break'],()=>nativeTexPreview.hasNativeMathFocus?.()
  ?nativeTexPreview.runMathCommand('enterLine'):activeMath()?.dispatchEvent(new Event('lineae-math-newline')));
groupButton(mathGroup,['退出公式','Exit formula'],()=>nativeTexPreview.hasNativeMathFocus?.()
  ?nativeTexPreview.runMathCommand('leaveFormula'):activeMath()?.dispatchEvent(new Event('lineae-leave-formula'))).dataset.shortcut='math.leaveFormula';
for (const [label,command,latex] of [
  ['sqrt','sqrt','\\sqrt{\\placeholder{}}'],
  ['ⁿ√','indexedRoot','\\sqrt[\\placeholder{}]{\\placeholder{}}'],
  ...['sum','int','prod','iint','iiint','oint','oiint'].map(name=>[
    ['sum','int'].includes(name) ? name : '\\'+name,name,'\\'+name+'\\mathord{\\placeholder{}}',
  ]),
]) {
  groupButton(mathGroup,label,()=>runNativeMathToolbarCommand(command,()=>{
    const field=activeMath();
    if(field)return runMathShortcut(command,field,{repeat:false});
    return insertMath(false,latex);
  })).dataset.shortcut='math.'+command;
}
groupButton(mathGroup,'\\left',()=>chooseMathDelimiters(activeMath()));
groupButton(mathGroup,'\\right',()=>chooseMathDelimiters(activeMath(),true));
groupButton(mathGroup,['单括号','Literal fence'],()=>armLiteralFence(activeMath()));
groupButton(mathGroup,'matrix',()=>runNativeMathToolbarCommand('matrix',()=>insertMath(false,matrixSource('matrix'))));
groupButton(mathGroup,'cases',()=>runNativeMathToolbarCommand('cases',
  ()=>insertMath(true,'\\begin{cases}\\placeholder{} & \\placeholder{}\\\\ \\placeholder{} & \\placeholder{}\\end{cases}')));
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
    tikz.open(code=>{ if(code) editor.chain().focus().insertContent({type:'documentImage',attrs:{tikzSource:code,tikzEditor:'circuit',centered:true,align:'center'}}).run(); });
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
  onInsertFigure:()=>insertSubfigureImage(editor),
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
const clipboard=createClipboard(editor,{getField:activeMath,getSource:()=>sourceView.editorView,
  getNative:()=>nativeTexPreview?.clipboardSelection?.()});
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
  bold:textOnly(withNativeTextCommand('toggleBold',()=>editor.chain().focus().toggleBold().run())),
  italic:textOnly(withNativeTextCommand('toggleItalic',()=>editor.chain().focus().toggleItalic().run())),
  underline:textOnly(withNativeTextCommand('toggleUnderline',()=>editor.chain().focus().toggleMark('underline').run())),
  underlineStyle:textOnly(style=>editor.chain().focus().setMark('underline',{style}).run()),
  strike:textOnly(withNativeTextCommand('toggleStrike',()=>editor.chain().focus().toggleStrike().run())),
  subscript:textOnly(withNativeTextCommand('toggleSubscript',()=>editor.chain().focus().toggleMark('subscript').run())),
  superscript:textOnly(withNativeTextCommand('toggleSuperscript',()=>editor.chain().focus().toggleMark('superscript').run())),
  clearFormatting:textOnly(withNativeTextCommand('clearFormatting',()=>editor.chain().focus().unsetAllMarks().run())),
  characterBorder:textOnly(()=>spaceOverlay.toggleBox()),
  fontGrow:textOnly(()=>changeFontSize(1)),
  fontShrink:textOnly(()=>changeFontSize(-1)),
  highlight:textOnly(color=>editor.chain().focus().setMark('textStyle',{backgroundColor:color??null}).run()),
  circled:textOnly(()=>editor.chain().focus().toggleMark('circled').run()),
  bullets:withNativeTextCommand('toggleBulletList',()=>editor.chain().focus().toggleBulletList().run()),
  numbering:withNativeTextCommand('toggleOrderedList',()=>editor.chain().focus().toggleOrderedList().run()),
  bulletStyle:marker=>setListStyle(marker),
  numberStyle:style=>setListStyle(style),
  indentDecrease:()=>indentSelectedParagraph(-1),
  indentIncrease:()=>indentSelectedParagraph(1),
  alignLeft:withNativeTextCommand('alignLeft',()=>setParagraphAlignment('left')),
  alignCenter:withNativeTextCommand('alignCenter',()=>setParagraphAlignment('center')),
  alignRight:withNativeTextCommand('alignRight',()=>setParagraphAlignment('right')),
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
  nativeTexPreview?.relocalize();
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
  const fallback=(Math.min(0.48,0.94/blocks.length)).toFixed(2)+'\\textwidth';
  const children=blocks.map(({node})=>editor.schema.nodes.documentImage.create({
    ...node.attrs,
    figure:false,wrap:false,figureSource:null,placement:null,fixed:false,
    centered:true,align:'center',height:null,scale:null,
    width:imageWidthPattern.test(String(node.attrs.width??'').trim())?node.attrs.width:fallback,
    pos:/^[tcb]$/.test(node.attrs.pos??'')?node.attrs.pos:'c',
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
  if(!(selection instanceof NodeSelection)||selection.node.type.name!=='documentImage')return;
  if(subfiguresAncestor(selection.from)===null)return;
  const current=selection.node;
  const clean=Object.fromEntries(Object.entries(patch).filter(([,value])=>value!==undefined));
  if(Object.entries(clean).every(([key,value])=>current.attrs[key]===value))return;
  editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(selection.from,undefined,{...current.attrs,...clean}));
  const updated=editor.state.doc.nodeAt(selection.from);
  subfigurePanel?.setValues(updated?.type.name==='documentImage'?updated.attrs:null);
}
function syncImageTab(){
  if(!imageTab)return;
  const found=sourceView.hidden ? currentImageSelection() : null;
  imageSelection=found?.position??null;
  const subSel=sourceView.hidden&&editor.state.selection instanceof NodeSelection&&editor.state.selection.node.type.name==='subfigures'?editor.state.selection.node:null;
  const insideSub=found?subfiguresAncestor(found.position)!==null:false;
  const selectedImages=sourceView.hidden && !found && !subSel ? imageBlocksInSelection() : [];
  const multi=selectedImages.length>=2 ? selectedImageBlocks() : [];
  const showSubfigure=Boolean(found&&insideSub);
  const showImage=Boolean(subSel)||Boolean(found&&!insideSub)||selectedImages.length>=2;
  if(subfigureTab)subfigureTab.hidden=!showSubfigure;
  imageTab.hidden=!showImage;

  if(showSubfigure){
    subfigurePanel?.setValues(found.node.attrs);
    imagePanel.setGroupMode(false);
    if(ribbon.dataset.ribbonPage!=='subfigure'&&ribbon.dataset.ribbonPage!=='headerFooter')selectGroup('subfigure');
    return;
  }
  subfigurePanel?.setValues(null);
  imagePanel.setGroupMode(false);

  if(subSel){
    imagePanel.setMultiSelection(0);
    imagePanel.setValues({...subSel.attrs,figure:true,centered:true,align:'center'});
    imagePanel.setPath(t(subSel.childCount+' 张子图',subSel.childCount+' subfigures'));
    imagePanel.setGroupMode(true);
    imagePanel.setGroupState('ungroup');
    if(ribbon.dataset.ribbonPage!=='image' && ribbon.dataset.ribbonPage!=='headerFooter')selectGroup('image');
    return;
  }

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
    imagePanel.setGroupState('none');
    if(ribbon.dataset.ribbonPage!=='image' && ribbon.dataset.ribbonPage!=='headerFooter')selectGroup('image');
  }else if(selectedImages.length>=2){
    imagePanel.setMultiSelection(selectedImages.length);
    imagePanel.setGroupState(multi.length>=2?'group':'none');
    if(ribbon.dataset.ribbonPage!=='image' && ribbon.dataset.ribbonPage!=='headerFooter')selectGroup('image');
  }else{
    imagePanel.setMultiSelection(0);
    imagePanel.setGroupState('none');
    if(ribbon.dataset.ribbonPage==='image'||ribbon.dataset.ribbonPage==='subfigure')selectGroup('home');
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
