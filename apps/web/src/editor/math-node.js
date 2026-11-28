import {nativeOnlyAcceptance} from './native-surface/acceptance-mode.mjs';
import {documentNumbers} from '../../latex/document-numbering.mjs';
import {localizedTitle} from '../ui/localized-control.mjs';
import { Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { t } from '../ui/i18n.mjs';
import { mathDocumentSource, mathEditorSource, numberedMathRows } from '../../latex/math-environments.mjs';

let mathPointerField=null;
if(typeof document!=='undefined')document.addEventListener('pointerdown',event=>{mathPointerField=event.composedPath().find(node=>node?.tagName==='MATH-FIELD')??null;},true);
let smartFences;
export function configureMathFences(value) { smartFences = value; }

export function mathPositionPath(model,offset) {
  const path=[];
  for(let atom=model.at(offset);atom?.parent;atom=atom.parent){
    const branch=atom.parentBranch;
    path.unshift([branch,atom.parent.branch(branch).indexOf(atom)]);
  }
  return path;
}

export function mathOffsetAtPath(model,path) {
  let atom=model.root;
  for(const [branch,child] of path){
    if(!atom||child<0||
      (Array.isArray(branch)&&(atom.type!=='array'||branch[0]>=atom.rowCount||branch[1]>=atom.colCount)))return -1;
    atom=atom.branch(branch)?.[child];
  }
  return atom?model.offsetOf(atom):-1;
}

const isIntegral = atom => /^\\(?:i{1,3}nt|oi{1,3}nt)$/.test(atom?.command ?? '');
export const isMathOperatorWithBody = name => /^(?:i{1,3}nt|oi{1,3}nt|sum|prod)$/.test(name);
function bodyOperator(atom) {
  if (atom?.type !== 'group' && atom?.command !== '\\mathord') return null;
  const left=atom.leftSibling;
  const operator=left?.type==='subsup' ? left.leftSibling : left;
  return isIntegral(operator) || /^\\(?:sum|prod)$/.test(operator?.command ?? '') ? operator : null;
}

export function focusInsertedOperator(field, start) {
  const model = field._mathfield?.model;
  if (!model) return;
  // The body is a separate atom. Scripts must attach to the operator before it.
  for (let offset = start + 1; offset <= field.lastOffset; offset++) {
    const atom = model.at(offset);
    if (isMathOperatorWithBody(atom?.command?.slice(1))) {
      field.position = offset;
      return;
    }
  }
}

function navigateEmptyMathSlot(field, backward) {
  const model = field._mathfield?.model;
  if (!model) return;
  const [from, to] = field.selection.ranges[0] ?? [field.position, field.position];
  const slots = [];
  for (let end = 0; end <= field.lastOffset; end++) {
    const atom = model.at(end);
    if (atom?.type === 'placeholder') {
      if (end > 0) slots.push([end - 1, end]);
    } else if (atom?.type === 'first' && atom.parent?.type !== 'root' &&
        atom.parent?.branch(atom.parentBranch)?.length === 1) {
      slots.push([end, end]);
    }
  }
  const next = backward
    ? slots.findLast(([start, end]) => end <= from && start < from) ?? slots.at(-1)
    : slots.find(([start, end]) => start >= to && end > to) ?? slots[0];
  if (next) field.selection = { ranges: [next], direction: 'forward' };
}

function enterEmptyOperatorBody(field) {
  if (!caretCollapsed(field)) return;
  const model = field._mathfield?.model;
  const caret = model?.at(field.position);
  const body = caret?.rightSibling;
  const operator = bodyOperator(body);
  if (!operator || operator !== (caret.type === 'subsup' ? caret.leftSibling : caret)) return;
  const children = body.body ?? [];
  const placeholder = children.find(atom => atom.type === 'placeholder');
  if (!placeholder || children.some(atom => !['first','placeholder'].includes(atom.type))) return;
  const end = model.offsetOf(placeholder);
  if (end > 0) field.selection = { ranges: [[end-1,end]], direction: 'forward' };
}

export function mathEnvironment(field) {
  const model=field._mathfield?.model;
  const labels=[];
  for (let atom=model?.at(field.position); atom; atom=atom.parent) {
    if (atom.parentBranch==='subscript') labels.unshift(t('下标','Subscript'));
    if (atom.parentBranch==='superscript') labels.unshift(t('上标','Superscript'));
    if (Array.isArray(atom.parentBranch)) labels.unshift(t(
      '第 '+(atom.parentBranch[0]+1)+' 行，第 '+(atom.parentBranch[1]+1)+' 列',
      'Row '+(atom.parentBranch[0]+1)+', column '+(atom.parentBranch[1]+1)));
    const operator=bodyOperator(atom);
    if (operator) labels.unshift('op/'+operator.command.slice(1),
      isIntegral(operator) ? t('被积式','Integrand') : t('运算主体','Operand'));
    if (atom.type==='genfrac') labels.unshift(t('分式','Fraction'));
    if (atom.type==='surd') labels.unshift(t('根式','Radical'));
    if (atom.type==='array') labels.unshift(atom.environmentName ?? t('矩阵','Matrix'));
    if (isIntegral(atom)) labels.unshift('op/'+atom.command.slice(1));
    else if (['operator','extensible-symbol'].includes(atom.type) && atom.command) labels.unshift('op/'+atom.command.replace(/^\\/,''));
  }
  return labels;
}

// An operator that was just inserted owns an empty \mathord body. Deleting
// inside it selects the whole operator first, so a second press removes it as
// one object instead of nibbling at its placeholder. The caret can sit either
// in the body or right behind the operator, where scripts attach.
function emptyOperatorRange(field, backward) {
  const model=field._mathfield?.model;
  if (!model) return null;
  const [from,to]=field.selection.ranges[0]??[field.position,field.position];
  const caret=model.at(from===to?field.position:to);
  if (!caret) return null;
  let operator=null, group=null;
  if ((backward&&caret.command==='\\mathord') || caret.parent?.command==='\\mathord') {
    group=caret.command==='\\mathord' ? caret : caret.parent;
    const left=group.leftSibling;
    operator=left?.type==='subsup' ? left.leftSibling : left;
  } else {
    const adjacent=!backward&&isMathOperatorWithBody(caret.rightSibling?.command?.slice(1))
      ?caret.rightSibling:caret;
    operator=adjacent.type==='subsup'?adjacent.leftSibling:adjacent;
    if(!isMathOperatorWithBody(operator?.command?.slice(1)))return null;
    const scripts=operator.rightSibling;
    const right=scripts?.type==='subsup'?scripts.rightSibling:scripts;
    group=right?.command==='\\mathord' ? right : null;
  }
  if (!group || !isMathOperatorWithBody(operator?.command?.slice(1))) return null;
  const children=group.branch('body') ?? [];
  if (children.some(child=>child.type!=='first'&&child.type!=='placeholder')) return null;
  const start=operator.leftSibling ? model.offsetOf(operator.leftSibling) : 0;
  const end=model.offsetOf(group);
  return start>=0&&end>start ? [start,end] : null;
}
// Use exact model ranges, not MathLive's deleteBackward/deleteForward, which
// can expand a one-character selection to its parent or unwrap a structure.
function deleteMathRange(field, range, backward) {
  const model=field._mathfield?.model;
  const [from,to]=range;
  if (!model || to<=from) return false;
  // getAtoms()/deleteAtoms() omit empty containers in MathLive 0.108. Include
  // them explicitly, but never expand a partial child selection to its parent.
  const atoms=new Set();
  for (let offset=from+1;offset<=to;offset++) {
    const atom=model.at(offset);
    if (atom?.parent && atom.type!=='first' && model.offsetOf(atom.leftSibling)>=from) atoms.add(atom);
  }
  const outermost=[...atoms].filter(atom=>{
    for(let parent=atom.parent;parent;parent=parent.parent) if(atoms.has(parent))return false;
    return true;
  });
  if (!outermost.length) return true;
  const inputType=backward?'deleteContentBackward':'deleteContentForward';
  if (!model.contentWillChange({inputType})) return true;
  model.deferNotifications({content:true,selection:true,type:inputType},()=>{
    for (const atom of outermost) atom.parent.removeChild(atom);
    // The public setter also schedules a repaint when forward deletion leaves
    // the caret at the same offset.
    field.position=from;
  });
  field._mathfield.snapshot();
  return true;
}

function eraseMathObject(field, backward) {
  const model=field._mathfield?.model;
  if (!model || emptyMath(field.value)) return false;
  const ranges=field.selection.ranges;
  if (!caretCollapsed(field)) {
    if (ranges.length!==1) return false;
    return deleteMathRange(field,ranges[0],backward);
  }
  const caret=model.at(field.position);
  const array=caret?.parent;
  if (array?.type==='array' && Array.isArray(caret.parentBranch) &&
      (backward ? caret.type==='first' : !caret.rightSibling)) {
    // A row/cell boundary is not the boundary of the enclosing array. In
    // particular, backspacing through an empty middle row must not select all
    // the other rows and delete them on the next press.
    const [row,column]=caret.parentBranch;
    const emptyRow=array.rows[row].every(cell=>!cell ||
      cell.every(atom=>atom.type==='first'||atom.type==='placeholder'));
    const multiline=/^(?:align(?:at|ed)?|flalign|gather(?:ed)?|multline|eqnarray|split|lines)\*?$/.test(array.environmentName??'');
    if (multiline && emptyRow && array.rowCount>1) {
      const before=array.rows[row-1]?.filter(Boolean).at(-1)?.at(-1);
      const after=array.rows[row+1]?.find(Boolean)?.[0];
      const destination=backward ? before??after : after??before;
      const inputType=backward?'deleteContentBackward':'deleteContentForward';
      if (!model.contentWillChange({inputType})) return true;
      model.deferNotifications({content:true,selection:true,type:inputType},()=>{
        array.removeRow(row);
        field.position=model.offsetOf(destination);
      });
      field._mathfield.snapshot();
    } else {
      // Nonempty rows and matrix cells keep their contents and shape. Move to
      // the adjacent cell (or outside the array) rather than expanding selection.
      const cells=array.rows.flat().filter(Boolean);
      const adjacent=cells[cells.indexOf(array.getCell(row,column))+(backward?-1:1)];
      const destination=adjacent ? (backward?adjacent.at(-1):adjacent[0]) :
        (backward?array.leftSibling:array);
      if (destination && destination!==model.root) field.position=model.offsetOf(destination);
    }
    return true;
  }
  const target=backward ? caret : caret?.rightSibling;
  let range=emptyOperatorRange(field,backward);
  if (!range) {
    // At a branch boundary only its immediate owner is eligible. Never climb
    // to the root: deleting a nested radical must not erase its outer fraction.
    const structure=target?.hasChildren ? target :
      (backward ? caret?.type==='first' : !target) ? caret?.parent : null;
    if (structure && structure!==model.root) {
      range=[model.offsetOf(structure.leftSibling),model.offsetOf(structure)];
    } else if (target && target.type!=='first' && !target.hasChildren) {
      const end=model.offsetOf(target);
      return deleteMathRange(field,[end-1,end],backward);
    } else return false;
  }
  if (range[0]<0 || range[1]<=range[0]) return false;
  field.selection={ranges:[range],direction:backward?'backward':'forward'};
  return true;
}

export function focusFormula(editor, id, onFocus) {
  requestAnimationFrame(() => {
    editor.state.doc.descendants((node, position) => {
      if (node.attrs.id === id) {
        const field=editor.view.nodeDOM(position)?.querySelector('math-field');
        field?.focus();
        if(field)onFocus?.(field);
        return false;
      }
    });
  });
}

export function insertFormula(editor, display = false, latex = '', range, onFocus, extra = {}) {
  const id = crypto.randomUUID();
  const content = { type: display ? 'mathBlock' : 'math', attrs: { latex, display, id, ...extra } };
  if (display) {
    const { doc, selection } = editor.state;
    const $start = doc.resolve(range?.from ?? selection.from);
    const $end = doc.resolve(range?.to ?? selection.to);
    if ($start.depth === 1 && $start.sameParent($end) && $start.parent.type.name === 'paragraph'
      && $start.parentOffset === 0 && $end.parentOffset === $start.parent.content.size) {
      range = { from:$start.before(), to:$start.after() };
    }
  }
  const chain = editor.chain().focus();
  if (range) chain.insertContentAt(range, content);
  else chain.insertContent(content);
  chain.run();
  focusFormula(editor, id, onFocus);
}

const mathFieldStyle = `
  .ML__text { font-family: inherit; }
  .ML__is-inline, .ML__container, .ML__content { text-indent: 0; }
  .ML__content { padding-left: 0 !important; padding-right: 0 !important; }
  /* MathLive adds a 1-2px scroll range around the baseline; on Windows that
     turns into a visible native scrollbar under an inline formula. */
  .ML__content { overflow: visible !important; scrollbar-width: none; }
  .ML__content::-webkit-scrollbar { display: none; }
  :host([data-lineae-editing]) [data-lineae-integrand] { background:light-dark(#e9f4ed,#304a3b); border-radius:.15em; }
  :host([data-empty-matrix-cell]) .ML__caret { position:relative; }
  :host([data-empty-matrix-cell]) .ML__caret::after {
    content:""; position:absolute; left:50%; top:-.8em; width:.66em; height:1em;
    box-sizing:border-box; transform:translateX(-50%);
    border:1px solid currentColor; border-radius:.16em;
    opacity:.45; pointer-events:none;
  }
  .delimiter-ghost { display:inline-flex; gap:.1em; pointer-events:none; vertical-align:baseline; }
  .delimiter-ghost-slot { position:relative; display:inline-flex; justify-content:center; align-items:center; width:.65em;
    height:1em; border-radius:.15em; line-height:1; color:inherit; background:light-dark(#e8effa,#37445c); }
  .delimiter-ghost-slot + .delimiter-ghost-slot { background:light-dark(#efe9f7,#483b58); }
  .delimiter-ghost-slot.is-active { box-shadow:inset 0 0 0 1px #749bd0; }
  .delimiter-ghost-slot.is-active::after { content:""; position:absolute; left:50%; top:12%; bottom:12%; width:1.5px;
    border-radius:1px; background:#2f6fd0; translate:-50% 0; animation:delimiter-caret-blink .9s steps(1) infinite; }
  @keyframes delimiter-caret-blink { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
  :host([data-lineae-editing]) :is(.ML__mathbf, .ML__mathbfit, .ML__bb, .ML__cal, .ML__frak, .ML__script, .ML__sans, .ML__tt) {
    background: light-dark(rgba(77,124,179,.10), rgba(120,170,230,.18));
    border-radius: 2px;
  }
  :host([data-lineae-editing]) .ML__mediumspace {
    background: light-dark(#d9f2df,#2f5138);
    border-radius: 2px;
    box-shadow: 0 0 0 1px light-dark(#b7e3c2,#3f6b4b) inset;
  }
`;

function installMathFieldStyle(field) {
  const root = field.shadowRoot;
  if (!root || root.querySelector('style[data-lineae-field]')) return;
  const style = document.createElement('style');
  style.dataset.lineaeField = '';
  style.textContent = mathFieldStyle;
  root.append(style);
}

function commitUnclosedFences(field) {
  // MathLive 0.108 serializes a pending delimiter as the suggested glyph.
  // Read the pinned model to distinguish a suggestion from an explicit keypress.
  const model = field._mathfield?.model;
  if (!model?.at) return;
  let changed = false;
  for (let offset = 0; offset <= field.lastOffset; offset++) {
    const atom = model.at(offset);
    if (atom?.type !== 'leftright') continue;
    if (atom.leftDelim !== '?' && atom.rightDelim !== '?') continue;
    if (atom.leftDelim === '?') atom.leftDelim = '.';
    if (atom.rightDelim === '?') atom.rightDelim = '.';
    atom.variant = 'left...right';
    atom.isDirty = true;
    changed = true;
  }
  if (changed) {
    const latex = field.getValue();
    field.setValue('', { silenceNotifications:true });
    field.setValue(latex, { silenceNotifications:true });
    field.dispatchEvent(new Event('input',{bubbles:true}));
  }
}

function leaveEnvironment(field) {
  // Font commands can be represented as adjacent styled atoms rather than
  // a parent group. Move past that style run before using group navigation.
  const styleAt = offset => /^(\\(?:math(?:bf|rm|it|cal|bb|sf|tt|frak|scr)|boldsymbol|operatorname)\*?)\{/.exec(
    field.getValue(offset - 1, offset),
  )?.[1];
  const style = field.position > 0 && styleAt(field.position);
  if (style) {
    let end = field.position;
    while (end < field.lastOffset && styleAt(end + 1) === style) end++;
    field.position = end;
    field.applyStyle({ variant: 'normal', variantStyle: '' });
    return true;
  }
  const before = JSON.stringify(field.selection.ranges);
  if (field.mode === 'text') {
    let end = field.position;
    while (end < field.lastOffset && /^\\text\{/.test(field.getValue(end, end + 1))) end++;
    field.position = end;
    field.executeCommand(['switchMode', 'math']);
    return true;
  } else {
    field.executeCommand('moveAfterParent');
  }
  if (JSON.stringify(field.selection.ranges) === before) field.executeCommand('moveToNextGroup');
  return JSON.stringify(field.selection.ranges) !== before;
}

// MathLive serializes a styled formula as {\displaystyle{...}} once it is
// re-parsed, so unwrapping has to look through redundant outer braces.
function unwrapBraces(value) {
  let text = value.trim();
  while (text.startsWith('{') && text.endsWith('}')) {
    let depth = 0;
    let closesAtEnd = true;
    for (let index = 0; index < text.length; index++) {
      if (text[index] === '\\') { index++; continue; }
      if (text[index] === '{') depth++;
      else if (text[index] === '}') {
        depth--;
        if (depth === 0 && index < text.length - 1) { closesAtEnd = false; break; }
      }
    }
    if (!closesAtEnd) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

function applyDefaultDisplayStyle(field) {
  if (!field.hasAttribute('data-lineae-default-displaystyle')) return;
  const value = field.value;
  const oldModel = field._mathfield?.model;
  if (!oldModel || !value.trim() || value.includes('\\')) return;
  const selection = field.selection;
  const paths = selection.ranges.map(range => range.map(offset => mathPositionPath(oldModel, offset)));
  field.removeAttribute('data-lineae-default-displaystyle');
  // MathLive may deliver one input notification after multiple typed letters.
  // The style creates an extra outer atom. Keep the same editable positions
  // inside it so the next Backspace deletes the letter beside the caret.
  field.setValue('\\displaystyle ' + value, {silenceNotifications: true});
  const model = field._mathfield.model;
  const wrapper = model.root.body.find(atom => atom.command === '\\displaystyle');
  const parent = wrapper ? mathPositionPath(model, model.offsetOf(wrapper)) : [];
  const endOfBody = model.offsetOf((wrapper ?? model.root).body.at(-1));
  const ranges = paths.map(range => range.map(path => {
    const offset = mathOffsetAtPath(model, [...parent, ...path]);
    return offset >= 0 ? offset : Math.max(0, endOfBody);
  }));
  field.selection = {direction: selection.direction, ranges};
}

export function toggleDisplayStyle(field) {
  field.removeAttribute('data-lineae-default-displaystyle');
  const latex = unwrapBraces(field.value);
  const grouped = /^\\displaystyle\{([\s\S]*)\}$/.exec(latex);
  const prefixed = /^\\displaystyle\s*([\s\S]*)$/.exec(latex);
  field.focus();
  if (grouped || prefixed) {
    field.value = (grouped ? grouped[1] : prefixed[1]).trim();
    field.executeCommand('moveToMathfieldEnd');
    const position = field.position;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => { if (field.isConnected) { field.focus(); field.position = position; } });
    return false;
  }
  field.value = '\\displaystyle{' + latex + '}';
  field.executeCommand('moveToMathfieldEnd');
  // The two closing braces of the wrapper are offsets of their own; the caret
  // belongs two steps earlier, inside the styled body, so typing keeps editing
  // the formula instead of appending after it.
  field.position = Math.max(0, field.lastOffset - 2);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => { if (field.isConnected) { field.focus(); field.position = Math.max(0, field.lastOffset - 2); } });
  return true;
}

function leaveFormula(editor, position, node, backward) {
  const target = position + (backward ? 0 : node.nodeSize);
  // Focus first: moving focus out of MathLive can otherwise restore the
  // browser's previous text selection over the destination we just set.
  editor.view.focus();
  let transaction = editor.state.tr;
  if (node.isBlock) {
    const resolved = transaction.doc.resolve(target);
    const neighbor = backward ? resolved.nodeBefore : resolved.nodeAfter;
    if (!neighbor?.isTextblock) transaction.insert(target, editor.schema.nodes.paragraph.create());
  }
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(target), backward ? -1 : 1));
  editor.view.dispatch(transaction);
}

// Typing "<" then "=" produces the relation symbol, matching the other pairs.
const operatorPairs = {
  '!=':'\\ne', '>=':'\\ge',
  '<-':'\\leftarrow', '->':'\\to',
  '<=':'\\le', '=>':'\\Rightarrow',
};
// Tab rotates an auto-inserted arrow counter-clockwise.
const arrowTurns = {
  '\\to':'\\uparrow',
  '\\leftarrow':'\\downarrow',
  '\\downarrow':'\\rightarrow',
  '\\rightarrow':'\\uparrow',
  '\\uparrow':'\\leftarrow',
  '\\leftrightarrow':'\\updownarrow',
  '\\updownarrow':'\\leftrightarrow',
  '\\Leftarrow':'\\Downarrow',
  '\\Downarrow':'\\Rightarrow',
  '\\Rightarrow':'\\Uparrow',
  '\\Uparrow':'\\Leftarrow',
  '\\Leftrightarrow':'\\Updownarrow',
  '\\Updownarrow':'\\Leftrightarrow',
};
const caretCollapsed = field => field.selection.ranges.every(([start,end]) => start === end);
const emptyMath = value => !value || /^\\displaystyle\{\s*\}$/.test(value) || /^\\displaystyle\s*$/.test(value);

function addDisplayLine(field) {
  const model = field._mathfield?.model;
  if (!model) return;
  for (let atom = model.at(field.position); atom; atom = atom.parent) {
    if (atom.type !== 'array') continue;
    if (/^(?:align(?:at|ed)?|flalign|gather(?:ed)?|multline|eqnarray)\*?$/.test(atom.environmentName ?? '')) {
      field.executeCommand('addRowAfter');
      return;
    }
  }
  const value=field.value;
  const caret=model.at(field.position);
  const split=caret?.parent?.type==='root';
  const before=split ? field.getValue(0,field.position) : value;
  const after=split ? field.getValue(field.position,field.lastOffset) : '';
  // Empty rows use the same baseline-anchored cell hint as addRowAfter.
  // A placeholder glyph has a different advance and shifts the empty-row caret.
  field.value='\\begin{gathered}'+before+'\\\\'+after+'\\end{gathered}';
  const updated=field._mathfield?.model;
  for(let i=0;i<=field.lastOffset;i++) {
    const atom=updated?.at(i);
    if(atom?.type==='first' && Array.isArray(atom.parentBranch) && atom.parentBranch[0]===1) {
      field.position=i; break;
    }
  }
  field.dispatchEvent(new Event('input',{bubbles:true}));
}

function clearEmptyScripts(field, keepActive = false) {
  const model=field._mathfield?.model;
  if (!model) return;
  const active=new Map();
  if (keepActive) {
    for (let atom=model.at(field.position);atom?.parent;atom=atom.parent) {
      active.set(atom.parent,atom.parentBranch);
    }
  }
  const empty=[];
  for(let i=0;i<=field.lastOffset;i++) {
    const atom=model.at(i);
    if(atom?.type!=='first' || !['subscript','superscript'].includes(atom.parentBranch) ||
      active.get(atom.parent)===atom.parentBranch) continue;
    const children=atom.parent.branch(atom.parentBranch).slice(1);
    if (children.every(child=>child.type==='placeholder')) empty.push([atom.parent,atom.parentBranch]);
  }
  if(!empty.length)return;
  model.deferNotifications({content:true,selection:true,type:'deleteContentBackward'},()=>{
    const caret=model.at(field.position);
    const fallback=caret?.parent;
    const previous=caret?.leftSibling ?? fallback?.leftSibling;
    for (const [owner,branch] of empty) owner.removeBranch(branch);
    for (const owner of new Set(empty.map(([owner])=>owner))) {
      if (owner.type==='subsup' && owner.hasEmptyBranch('subscript') &&
          owner.hasEmptyBranch('superscript') && owner.parent) owner.parent.removeChild(owner);
    }
    const offset=model.offsetOf(caret);
    model.position=offset>=0 ? offset : Math.max(0,model.offsetOf(fallback),model.offsetOf(previous));
  });
  field.dispatchEvent(new Event('input',{bubbles:true}));
}

export const MathNode = Node.create({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({
    latex: { default: '' },
    delimiter: { default: null },
    label: { default: null },
    labelRow: { default: null },
    display: { default: false },
    id: { default: null, rendered: false },
  }),
  parseHTML: () => [{ tag: 'span[data-math]', getAttrs: dom => ({ latex: dom.dataset.latex ?? dom.textContent,
    delimiter:dom.dataset.mathDelimiter??null,display:dom.dataset.mathDisplay==='true' }) }],
  renderHTML: ({ node }) => ['span', { 'data-math': '', 'data-latex': node.attrs.latex,
    'data-math-delimiter':node.attrs.delimiter,'data-math-display':String(node.attrs.display) }, node.attrs.latex],
  // Plain-text clipboard output keeps the source so formulas survive a copy.
  renderText: ({ node }) => node.attrs.display ? '\\[' + node.attrs.latex + '\\]' : '$' + node.attrs.latex + '$',
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement(node.isBlock ? 'div' : 'span');
      dom.className = node.isBlock ? 'math-display' : 'math-inline';
      dom.dataset.mathView = '';
      // Keep the source on the node view so copied HTML can be parsed back
      // into a formula node instead of pasting the rendered MathLive DOM.
      if (node.isBlock) dom.dataset.mathBlock = '';
      else dom.dataset.math = '';
      dom.dataset.latex = node.attrs.latex;
      dom.dataset.numbered = String(node.isBlock && node.attrs.delimiter === 'equation');
      dom.getMathPosition = getPos;
      dom.contentEditable = 'false';
      if (nativeOnlyAcceptance()) {
        // Keep the semantic node in the document and history without mounting
        // a MathLive editor in the native-only acceptance run.
        dom.textContent = node.attrs.latex;
        return {
          dom,
          update(next) {
            if (next.type !== node.type) return false;
            node = next;
            dom.dataset.latex = next.attrs.latex;
            dom.textContent = next.attrs.latex;
            return true;
          },
          ignoreMutation: () => true,
        };
      }
      // A draggable node view swallows pointer hit-testing inside MathLive, so
      // clicking a placeholder box or a matrix cell would not move its caret.
      // ProseMirror re-enables dragging temporarily on mousedown for the handle.
      dom.draggable = false;
      queueMicrotask(() => { dom.draggable = false; });

      const handle = document.createElement('span');
      handle.className = 'math-drag-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-label', t('拖动公式','Drag formula'));
      handle.dataset.tooltipZh = '拖动公式';
      handle.dataset.tooltipEn = 'Drag formula';
      handle.dataset.zhTitle = '拖动公式';
      handle.dataset.enTitle = 'Drag formula';
      handle.draggable = true;
      handle.dataset.dragHandle = '';
      handle.addEventListener('mousedown', () => editor.commands.setNodeSelection(getPos()));
      dom.addEventListener('dragstart', () => {
        editor.view.dispatch(closeHistory(editor.state.tr));
      });
      dom.addEventListener('dragend', () => {
        editor.view.dispatch(closeHistory(editor.state.tr));
        editor.view.focus();
      });

      const field = document.createElement('math-field');
      field.setAttribute('default-mode', node.isBlock ? 'math' : 'inline-math');
      field.textContent = mathEditorSource(node.attrs.latex, { inline:!node.isBlock });
      const historySelections=new Map();
      let applyingHistory=false;
      function rememberSelection(){
        const model=field._mathfield?.model;
        if(applyingHistory||!model||!field.hasFocus()||
          mathDocumentSource(field.value,node.attrs.latex,{inline:!node.isBlock}).trim()!==node.attrs.latex.trim())return;
        const {ranges,direction}=field.selection;
        historySelections.set(node.attrs.latex,{paths:ranges.map(range=>range.map(offset=>mathPositionPath(model,offset))),direction});
        if(historySelections.size>64)historySelections.delete(historySelections.keys().next().value);
      }
      field.addEventListener('lineae-before-math-history',()=>{
        rememberSelection();
        applyingHistory=true;
      });
      field.addEventListener('lineae-after-math-history',()=>{
        const selection=historySelections.get(node.attrs.latex);
        try {
          const model=field._mathfield?.model;
          if(field.isConnected&&selection&&model){
            const ranges=selection.paths.map(path=>path.map(endpoint=>mathOffsetAtPath(model,endpoint)));
            if(ranges.every(range=>range.every(offset=>offset>=0&&offset<=field.lastOffset))){
              field.selection={ranges,direction:selection.direction};
            }
          }
        }finally{applyingHistory=false;}
      });
      field.addEventListener('beforeinput',rememberSelection);
      dom.append(handle, field);
      const numbers = document.createElement('span');
      numbers.className = 'math-equation-numbers';
      function renderNumbers() {
        if (!node.isBlock) return;
        const rows = documentNumbers(editor.state.doc).objects.get(getPos())?.rows??numberedMathRows(node.attrs);
        dom.dataset.numbered = String(rows.some(row => row.tag !== undefined || !row.unnumbered));
        numbers.replaceChildren(...rows.map(row => {
          const number = document.createElement('span');
          if (row.tag !== undefined) {
            number.className = 'math-equation-tag';
            number.textContent = row.tagStar ? row.tag : '(' + row.tag + ')';
          } else if (!row.unnumbered) {
            number.className = 'math-equation-number';
            if(row.number!==undefined&&row.number!==null)number.dataset.equationValue=row.number;
          }
          return number;
        }));
      }
      dom.refreshNumbers=renderNumbers;
      if (node.isBlock) dom.append(numbers);
      renderNumbers();

      // A repeated structural key inserts the literal character.
      let pendingKey = null;
      let pendingDollar = false;
      let oneScript = null;
      let commandPalette = false;
      let exitedStyleAt = null;
      let replacedOperator = null;
      let pointerFocus = 0;
      let scriptCleanupQueued = false;
      let escaping = false;
      let escapingTimer = 0;
      const clearEscape=()=>{escaping=false;};
      document.addEventListener('pointerdown',clearEscape,true);
      const finish = backward => {
        pointerFocus++;
        commitUnclosedFences(field);
        clearEmptyScripts(field);
        escaping = true;
        clearTimeout(escapingTimer);
        escapingTimer = setTimeout(() => { escaping = false; }, 700);
        field.blur();
        leaveFormula(editor,getPos(),node,backward);
        // Pagination may re-render sheets around the caret. Keep the rich
        // editor focused instead of letting MathLive's blur path win the race.
        let attempts=0;
        const settleFocus=()=>{
          const active=editor.view.dom.ownerDocument.activeElement;
          if(!escaping||editor.isDestroyed||active!==field&&active!==field.ownerDocument.body)return;
          editor.view.focus();
          if(++attempts<4)requestAnimationFrame(settleFocus);
        };
        requestAnimationFrame(settleFocus);
      };
      const ambiguous = {
        '_': ['moveToSubscript', '\\_'],
        '^': ['moveToSuperscript', '\\text{ˆ}'],
        '/': [['insert', '\\frac{#@}{#?}'], '/'],
      };
      field.addEventListener('pointerdown', event => {
        escaping = false;
        pendingKey = null;
        pendingDollar = false;
        replacedOperator = null;
        oneScript = null;
        exitedStyleAt = null;
        // A freshly moved/undone node can still have a queued outer-editor focus.
        // Finish the explicit formula click after that frame without moving its caret.
        if (event.button !== 0 || event.shiftKey) return;
        const focusRequest=++pointerFocus;
        const model=field._mathfield?.model;
        const target=event.composedPath().find(element=>element?.dataset?.atomId);
        if (model && target) {
          let atom;
          for(let i=0;i<=field.lastOffset;i++) {
            const candidate=model.at(i);
            if(String(candidate?.id)===target.dataset.atomId) { atom=candidate; break; }
          }
          for (;atom;atom=atom.parent) {
            if(atom.type!=='genfrac') continue;
            const box=field.shadowRoot?.querySelector('[data-atom-id="'+atom.id+'"]')?.getBoundingClientRect();
            if(box && Math.abs(event.clientX-box.right)<=Math.max(3,box.height*.1) &&
                event.clientY>=box.top && event.clientY<=box.bottom) {
              event.preventDefault(); event.stopImmediatePropagation();
              field.focus();
              field.position=model.offsetOf(atom);
              return;
            }
          }
        }
        requestAnimationFrame(() => {
          if(field.isConnected&&focusRequest===pointerFocus&&mathPointerField===field){
            field.focus();
            // Moving a table row can leave MathLive's focus flag set while its
            // native keyboard sink is blurred. Restore the actual DOM focus.
            if(field.ownerDocument.activeElement!==field)
              field.shadowRoot?.querySelector('[part~="keyboard-sink"]')?.focus({preventScroll:true});
          }
        });
      },true);
      field.addEventListener('focus', () => {
        if (escaping) {
          queueMicrotask(() => {
            if (escaping && field.ownerDocument.activeElement !== editor.view.dom) editor.view.focus();
          });
          return;
        }
        commandPalette = false;
        field.setAttribute('data-lineae-editing','');
      });
      field.addEventListener('compositionstart', () => enterEmptyOperatorBody(field), true);
      field.addEventListener('blur', () => {
        field.removeAttribute('data-lineae-editing');
        pendingKey=null; pendingDollar=false; oneScript=null; replacedOperator=null;
        // The command palette takes focus, so a blank subscript typed with "_"
        // must survive until the chosen command is inserted into it.
        queueMicrotask(()=>{if(field.isConnected&&!field.hasFocus()&&!commandPalette)clearEmptyScripts(field);});
      });
      field.addEventListener('selection-change',()=>{
        rememberSelection();
        if (scriptCleanupQueued) return;
        scriptCleanupQueued=true;
        queueMicrotask(()=>{
          scriptCleanupQueued=false;
          if(field.isConnected && caretCollapsed(field))clearEmptyScripts(field,field.hasFocus());
        });
        queueMicrotask(()=>{
          if(!field.isConnected)return;
          const [from,to]=field.selection?.ranges?.[0]??[field.position,field.position];
          window.dispatchEvent(new CustomEvent('lineae-math-selection', {detail:{field, position:getPos(), from, to, collapsed:from===to}}));
        });
      });
      field.addEventListener('lineae-commit-fences', () => commitUnclosedFences(field));

      field.addEventListener('input', () => {
        applyDefaultDisplayStyle(field);
        const latex=mathDocumentSource(field.value,node.attrs.latex,{inline:!node.isBlock});
        if(node.attrs.latex===latex)return;
        const position = getPos();
        if (typeof position === 'number') {
          editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, latex }));
          rememberSelection();
        }
      });
      let leavingStructure = false;
      field.addEventListener('lineae-leave-formula',()=>finish(false));
      field.addEventListener('lineae-math-newline',()=>{if(node.isBlock){field.focus();addDisplayLine(field);}});
      field.addEventListener('lineae-leave-math-environment', () => {
        leavingStructure = true;
        try { if (leaveEnvironment(field)) clearEmptyScripts(field); }
        finally { leavingStructure = false; }
      });
      field.addEventListener('lineae-math-builtin', event => {
        const {command,backward}=event.detail;
        if(command==='palette') {
          commandPalette=true;
          dom.dispatchEvent(new CustomEvent('lineae-math-command',{bubbles:true,detail:{field}}));
        } else if(command==='nextSlot'||command==='previousSlot') {
          const next=command==='nextSlot'&&replacedOperator?.arrow&&caretCollapsed(field)&&
            field.value===replacedOperator.after&&field.position===replacedOperator.position
            ?arrowTurns[replacedOperator.arrow]:null;
          if(next) {
            field.selection={ranges:[[field.position-1,field.position]]};
            field.executeCommand(['insert',next]);
            replacedOperator={...replacedOperator,after:field.value,position:field.position,arrow:next};
            field.dispatchEvent(new Event('input',{bubbles:true}));
          } else {
            pendingKey=null;pendingDollar=false;oneScript=null;replacedOperator=null;
            navigateEmptyMathSlot(field,command==='previousSlot');
          }
        } else if(command==='enterLine') {
          if(!node.isBlock)return;
          field.focus();addDisplayLine(field);
        } else if(command==='eraseObject') {
          // Let replacement undo and deletion of an entirely empty field
          // continue through keydown.
          if(replacedOperator)return;
          if(!eraseMathObject(field,backward))return;
        } else return;
        event.detail.handled=true;
      });
      field.addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode===229 || event.getModifierState?.('AltGraph')) return;
        const plain=!event.ctrlKey&&!event.metaKey&&!event.altKey;
        const consume=()=>{event.preventDefault();event.stopImmediatePropagation();};
        if (plain && Array.from(event.key).length === 1 && !['^','_','$'].includes(event.key)) {
          enterEmptyOperatorBody(field);
        }
        const scriptCharacter=/^[^\s^_/$\\]$/u.test(event.key);
        if (oneScript && plain && scriptCharacter &&
            !(event.key==='-' && oneScript.branch==='subscript')) {
          const atom=field._mathfield?.model?.at(field.position);
          if (atom?.parent===oneScript.parent && atom.parentBranch===oneScript.branch) {
            consume();
            oneScript=null; pendingKey=null;
            field.executeCommand(['typedText',event.key]);
            field.executeCommand('moveAfterParent');
            field.dispatchEvent(new Event('input',{bubbles:true}));
            return;
          }
        }
        if(event.key!=='ArrowRight') exitedStyleAt=null;
        if (!['Shift','Control','Alt','Meta','^','_'].includes(event.key) &&
          (!plain || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape','Backspace','Enter','Tab'].includes(event.key))) oneScript=null;
        if (!['Shift','Control','Alt','Meta','$'].includes(event.key)) pendingDollar=false;
        if (replacedOperator && !['Shift','Control','Alt','Meta'].includes(event.key)) {
          const previous=replacedOperator;
          replacedOperator=null;
          if (plain && event.key==='Backspace' && field.value===previous.after && field.position===previous.position && caretCollapsed(field)) {
            consume();
            field.value=previous.before;
            field.selection=previous.selection;
            field.dispatchEvent(new Event('input',{bubbles:true}));
            return;
          }
        }
        if (plain && event.key === '>' && caretCollapsed(field) && field.position>0) {
          const pair=[['\\leftarrow','\\leftrightarrow'],['\\Leftarrow','\\Leftrightarrow'],['\\le','\\Leftrightarrow']]
            .find(([command])=>field.value.endsWith(command));
          if(pair) {
            consume();
            const before=replacedOperator?.before??field.value;
            const selection=replacedOperator?.selection;
            field.selection={ranges:[[field.position-1,field.position]]};
            field.executeCommand(['insert',pair[1]]);
            replacedOperator={before,selection,after:field.value,position:field.position,arrow:pair[1]};
            field.dispatchEvent(new Event('input',{bubbles:true}));
            return;
          }
        }
        if (plain && ['=','>','-'].includes(event.key) && caretCollapsed(field) && field.position>0) {
          const end=field.position;
          const prefix=field.getValue(end-1,end);
          const replacement=operatorPairs[prefix+event.key];
          if(replacement) {
            consume();
            field.selection={ranges:[[end-1,end]]};
            field.executeCommand(['insert',prefix+event.key]);
            const before=field.value, selection=structuredClone(field.selection);
            field.selection={ranges:[[end-1,field.position]]};
            field.executeCommand(['insert',replacement]);
            replacedOperator={before,selection,after:field.value,position:field.position,arrow:replacement};
            field.dispatchEvent(new Event('input',{bubbles:true}));
            return;
          }
        }
        if (plain && node.isBlock && event.key==='Enter') { consume(); return; }
        if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
            !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
            field.selection.ranges.every(([start,end])=>start===end)) {
          const backward=event.key==='ArrowLeft';
          const style=field.position>0 && /^\\(?:math(?:bf|rm|it|cal|bb|sf|tt|frak|scr)|boldsymbol|operatorname)\*?\{/.exec(field.getValue(field.position-1,field.position))?.[0];
          if (!backward && exitedStyleAt!==field.position && style &&
              !field.getValue(field.position,field.position+1).startsWith(style)) {
            consume(); leaveEnvironment(field); exitedStyleAt=field.position; return;
          }
          if (field.position===(backward?0:field.lastOffset)) {
            event.preventDefault(); event.stopImmediatePropagation();
            finish(backward);
            return;
          }
        }
        if (plain && !event.shiftKey && caretCollapsed(field) &&
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && field.mode === 'text') {
          consume();
          field.position=Math.max(0,Math.min(field.lastOffset,field.position+(event.key==='ArrowRight'?1:-1)));
          return;
        }
        if (!event.ctrlKey && !event.metaKey && !event.altKey && ambiguous[event.key]) {
          event.preventDefault(); event.stopPropagation();
          if (event.repeat) return;
          const [command, literal] = ambiguous[event.key];
          if (pendingKey?.key === event.key) {
            const previous = pendingKey;
            pendingKey = null;
            oneScript = null;
            field.value = previous.value;
            field.selection = previous.selection;
            field.executeCommand(['insert', literal]);
            field.dispatchEvent(new Event('input',{bubbles:true}));
          } else {
            pendingKey = { key: event.key, value: field.value, selection: structuredClone(field.selection) };
            field.executeCommand(command);
            if (event.key==='^' || event.key==='_') {
              const atom=field._mathfield?.model?.at(field.position);
              oneScript=atom && { parent:atom.parent, branch:atom.parentBranch };
            }
          }
          return;
        }
        if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) pendingKey = null;
        if (plain && event.key === '$') {
          event.preventDefault();
          event.stopPropagation();
          if (emptyMath(field.value) && !node.isBlock) {
            const position = getPos();
            insertFormula(editor, true, '', { from: position, to: position + node.nodeSize });
          } else if (!node.isBlock || pendingDollar) finish(false);
          else pendingDollar=true;
          return;
        }
        if (event.key === 'Backspace' && emptyMath(field.value)) {
          event.preventDefault();
          event.stopPropagation();
          const position = getPos();
          pointerFocus++;
          const previous=node.isBlock ? TextSelection.findFrom(editor.state.doc.resolve(position),-1,true) : null;
          const tr=editor.state.tr.delete(position,position+node.nodeSize);
          tr.setSelection(previous ? previous.map(tr.doc,tr.mapping) : TextSelection.near(tr.doc.resolve(position),-1));
          editor.view.focus();
          editor.view.dispatch(tr.scrollIntoView());
        }
      }, true);
      field.addEventListener('input', event => {
        if (!oneScript || event.isComposing || !['insertText','insertCompositionText'].includes(event.inputType)) return;
        if (event.data==='-' && oneScript.branch==='subscript') return;
        const script=oneScript;
        oneScript=null;
        const atom=field._mathfield?.model?.at(field.position);
        if(atom?.parent===script.parent && atom.parentBranch===script.branch) field.executeCommand('moveAfterParent');
      });
      field.addEventListener('move-out', event => {
        event.preventDefault();
        if (leavingStructure) return;
        if (['forward','backward'].includes(event.detail.direction)) finish(event.detail.direction === 'backward');
      });
      field.addEventListener('mount', () => {
        field.mathVirtualKeyboardPolicy = 'manual';
        field.popoverPolicy = 'off';
        field.inlineShortcuts = {};
        field.smartMode = false;
        if (smartFences !== undefined) field.smartFence = smartFences;
        field.smartSuperscript = false;
        field.environmentPopoverPolicy = 'off';
        field.mathModeSpace = '\\space';
        installMathFieldStyle(field);
        field.toggleAttribute('data-lineae-editing',field.hasFocus());
        const root=field.shadowRoot;
        if (!root) return;
        const markIntegrands=()=>{
          const model=field._mathfield?.model;
          if (!model) return;
          const caret=model.at(field.position);
          field.toggleAttribute('data-empty-matrix-cell', Boolean(caret?.type==='first' &&
            Array.isArray(caret.parentBranch) && caret.parent.branch(caret.parentBranch)?.length===1));
          const ids=new Set();
          for (let offset=0;offset<=field.lastOffset;offset++) {
            const atom=model.at(offset);
            if (bodyOperator(atom)) {
              if (atom.id) ids.add(String(atom.id));
              for (const child of atom.body ?? []) if (child.id) ids.add(String(child.id));
            }
          }
          for (const element of root.querySelectorAll('[data-atom-id]')) {
            element.toggleAttribute('data-lineae-integrand',ids.has(element.dataset.atomId));
          }
          dom.dispatchEvent(new Event('lineae-math-position',{bubbles:true}));
        };
        const observer=new MutationObserver(markIntegrands);
        observer.observe(root,{subtree:true,childList:true});
        field.addEventListener('unmount',()=>observer.disconnect(),{once:true});
        markIntegrands();
      });
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          dom.dataset.latex = node.attrs.latex;
          renderNumbers();
          if (mathDocumentSource(field.value,node.attrs.latex,{inline:!node.isBlock}) !== node.attrs.latex) {
            const latex=mathEditorSource(node.attrs.latex,{inline:!node.isBlock});
            if (field.value !== latex) field.value=latex;
          }
          return true;
        },
        stopEvent: event => !['dragstart','dragend','dragover','dragenter','dragleave','drop'].includes(event.type) && event.target !== handle,
        ignoreMutation: () => true,
        destroy() {
          document.removeEventListener('pointerdown',clearEscape,true);
          clearTimeout(escapingTimer);
        },
      };
    };
  },
});

export const MathBlock = MathNode.extend({
  name: 'mathBlock',
  group: 'block',
  inline: false,
  parseHTML: () => [{ tag: 'div[data-math-block]', getAttrs: dom => ({ latex: dom.dataset.latex ?? dom.textContent, display: true }) }],
  renderHTML: ({ node }) => ['div', { 'data-math-block': '', 'data-latex': node.attrs.latex }, node.attrs.latex],
});
