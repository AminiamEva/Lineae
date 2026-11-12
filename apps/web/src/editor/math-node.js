import { Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { t } from '../ui/i18n.mjs';
import { mathDocumentSource, mathEditorSource, numberedMathRows } from '../../latex/math-environments.mjs';

let smartFences;
export function configureMathFences(value) { smartFences = value; }

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
      const start = model.offsetOf(atom.leftSibling);
      if (start >= 0 && start < end) slots.push([start, end]);
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

function deleteIntegralAtEmptyLimit(field) {
  if (field.selection.ranges.some(([start,end])=>start!==end)) return false;
  const model=field._mathfield?.model;
  const cursor=model?.at(field.position);
  const branch=cursor?.parentBranch;
  if (cursor?.type!=='first' || !['subscript','superscript'].includes(branch)) return false;
  const owner=cursor.parent;
  const operator=owner.type==='subsup' ? owner.leftSibling : owner;
  if (!isIntegral(operator) || !owner.hasEmptyBranch('subscript') || !owner.hasEmptyBranch('superscript')) return false;
  const start=model.offsetOf(operator.leftSibling);
  const end=model.offsetOf(owner);
  if (start<0 || end<=start) return false;
  if (!model.contentWillChange({inputType:'deleteContentBackward'})) return true;
  model.deferNotifications({content:true,selection:true,type:'deleteContentBackward'},()=>{
    if (owner!==operator) owner.parent.removeChild(owner);
    operator.parent.removeChild(operator);
    model.position=start;
  });
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
  :host(:focus-within) [data-lineae-integrand] { background:light-dark(#e9f4ed,#304a3b); border-radius:.15em; }
  :host([data-empty-matrix-cell]) .ML__caret::after {
    content:""; position:absolute; inset:-.05em auto -.05em -.05em;
    width:.66em; border:1px solid currentColor; border-radius:.16em;
    opacity:.45; pointer-events:none;
  }
  .delimiter-ghost { display:inline-flex; gap:.1em; pointer-events:none; vertical-align:baseline; }
  .delimiter-ghost-slot { display:inline-flex; justify-content:center; align-items:center; width:.65em;
    height:1em; border-radius:.15em; line-height:1; color:inherit; background:light-dark(#e8effa,#37445c); }
  .delimiter-ghost-slot + .delimiter-ghost-slot { background:light-dark(#efe9f7,#483b58); }
  .delimiter-ghost-slot.is-active { box-shadow:inset 0 0 0 1px #749bd0; }
  :host(:focus-within) :is(.ML__mathbf, .ML__mathbfit, .ML__bb, .ML__cal, .ML__frak, .ML__script, .ML__sans, .ML__tt) {
    background: light-dark(rgba(77,124,179,.10), rgba(120,170,230,.18));
    border-radius: 2px;
  }
  :host(:focus-within) .ML__mediumspace {
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

export function toggleDisplayStyle(field) {
  const latex = field.value.trim();
  const grouped = /^\\displaystyle\{([\s\S]*)\}$/.exec(latex);
  const prefixed = /^\\displaystyle\s+([\s\S]*)$/.exec(latex);
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
  const position = Math.max(0, field.lastOffset - 1);
  field.position = position;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => { if (field.isConnected) { field.focus(); field.position = Math.min(position, field.lastOffset); } });
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

const operatorPairs = { '!=':'\\ne', '>=':'\\ge', '<=':'\\le', '->':'\\to' };
const caretCollapsed = field => field.selection.ranges.every(([start,end]) => start === end);

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
  field.value='\\begin{gathered}'+(before || '\\placeholder{}')+'\\\\'+(after || '\\placeholder{}')+'\\end{gathered}';
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
  parseHTML: () => [{ tag: 'span[data-math]', getAttrs: dom => ({ latex: dom.dataset.latex ?? dom.textContent }) }],
  renderHTML: ({ node }) => ['span', { 'data-math': '', 'data-latex': node.attrs.latex }, node.attrs.latex],
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
      field.textContent = mathEditorSource(node.attrs.latex);
      dom.append(handle, field);
      const numbers = document.createElement('span');
      numbers.className = 'math-equation-numbers';
      function renderNumbers() {
        if (!node.isBlock) return;
        const rows = numberedMathRows(node.attrs);
        dom.dataset.numbered = String(rows.some(row => !row.unnumbered));
        numbers.replaceChildren(...rows.map(row => {
          const number = document.createElement('span');
          if (!row.unnumbered) number.className = 'math-equation-number';
          return number;
        }));
      }
      if (node.isBlock) dom.append(numbers);
      renderNumbers();

      // A repeated structural key inserts the literal character.
      let pendingKey = null;
      let pendingDollar = false;
      let oneScript = null;
      let exitedStyleAt = null;
      let replacedOperator = null;
      let pointerFocus = 0;
      let scriptCleanupQueued = false;
      const finish = backward => {
        pointerFocus++;
        commitUnclosedFences(field);
        clearEmptyScripts(field);
        leaveFormula(editor,getPos(),node,backward);
      };
      const ambiguous = {
        '_': ['moveToSubscript', '\\_'],
        '^': ['moveToSuperscript', '\\text{ˆ}'],
        '/': [['insert', '\\frac{#@}{#?}'], '/'],
      };
      field.addEventListener('pointerdown', event => {
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
          if (field.isConnected && focusRequest===pointerFocus) field.focus();
        });
      },true);
      field.addEventListener('blur', () => {
        pendingKey=null; pendingDollar=false; oneScript=null; replacedOperator=null;
        queueMicrotask(()=>{if(field.isConnected&&!field.hasFocus())clearEmptyScripts(field);});
      });
      field.addEventListener('selection-change',()=>{
        if (scriptCleanupQueued) return;
        scriptCleanupQueued=true;
        queueMicrotask(()=>{
          scriptCleanupQueued=false;
          if(field.isConnected && caretCollapsed(field))clearEmptyScripts(field,field.hasFocus());
        });
      });
      field.addEventListener('lineae-commit-fences', () => commitUnclosedFences(field));

      field.addEventListener('input', () => {
        const latex=mathDocumentSource(field.value,node.attrs.latex);
        if(node.attrs.latex===latex)return;
        const position = getPos();
        if (typeof position === 'number') {
          editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, latex }));
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
      field.addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode===229 || event.getModifierState?.('AltGraph')) return;
        const plain=!event.ctrlKey&&!event.metaKey&&!event.altKey;
        const consume=()=>{event.preventDefault();event.stopImmediatePropagation();};
        if (plain && event.key === 'Tab') {
          consume();
          pendingKey=null; pendingDollar=false; oneScript=null; replacedOperator=null;
          navigateEmptyMathSlot(field, event.shiftKey);
          return;
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
        if (plain && ['=','>'].includes(event.key) && caretCollapsed(field) && field.position>0) {
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
            replacedOperator={before,selection,after:field.value,position:field.position};
            field.dispatchEvent(new Event('input',{bubbles:true}));
            return;
          }
        }
        if (plain && node.isBlock && event.key==='Enter') {
          consume(); addDisplayLine(field); return;
        }
        if (event.key==='Backspace' && !event.ctrlKey && !event.metaKey && !event.altKey && deleteIntegralAtEmptyLimit(field)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
            !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
            field.selection.ranges.every(([start,end])=>start===end)) {
          const backward=event.key==='ArrowLeft';
          if (!backward && exitedStyleAt!==field.position && field.position>0 && /^\\(?:math(?:bf|rm|it|cal|bb|sf|tt|frak|scr)|boldsymbol|operatorname)\*?\{/.test(field.getValue(field.position-1,field.position))) {
            consume(); leaveEnvironment(field); exitedStyleAt=field.position; return;
          }
          if (field.position===(backward?0:field.lastOffset)) {
            event.preventDefault(); event.stopImmediatePropagation();
            finish(backward);
            return;
          }
        }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && field.mode === 'text') {
          const before = JSON.stringify(field.selection.ranges);
          queueMicrotask(() => {
            if (!field.isConnected || field.mode !== 'text') return;
            if (JSON.stringify(field.selection.ranges) !== before) return;
            const command = event.key === 'ArrowRight' ? 'moveToNextGroup' : 'moveToPreviousGroup';
            field.executeCommand(command);
            if (field.mode === 'text') field.executeCommand(command);
          });
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
        if (event.key === '\\' && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          dom.dispatchEvent(new CustomEvent('lineae-math-command', { bubbles: true, detail: { field } }));
          return;
        }
        if (plain && event.key === '$') {
          event.preventDefault();
          event.stopPropagation();
          if (!field.value && !node.isBlock) {
            const position = getPos();
            insertFormula(editor, true, '', { from: position, to: position + node.nodeSize });
          } else if (!node.isBlock || pendingDollar) finish(false);
          else pendingDollar=true;
          return;
        }
        if (event.key === 'Backspace' && !field.value) {
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
          if (mathDocumentSource(field.value,node.attrs.latex) !== node.attrs.latex) {
            const latex=mathEditorSource(node.attrs.latex);
            if (field.value !== latex) field.value=latex;
          }
          return true;
        },
        stopEvent: event => !['dragstart','dragend','dragover','dragenter','dragleave','drop'].includes(event.type) && event.target !== handle,
        ignoreMutation: () => true,
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
