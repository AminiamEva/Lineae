import { Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { t } from '../ui/i18n.mjs';
import { numberedMathRows } from '../../latex/math-environments.mjs';

let smartFences;
export function configureMathFences(value) { smartFences = value; }

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
  .delimiter-ghost { display:inline-flex; gap:.1em; pointer-events:none; vertical-align:baseline; }
  .delimiter-ghost-slot { display:inline-flex; justify-content:center; align-items:center; width:.65em;
    height:1em; border-radius:.15em; line-height:1; color:inherit; background:light-dark(#e8effa,#37445c); }
  .delimiter-ghost-slot + .delimiter-ghost-slot { background:light-dark(#efe9f7,#483b58); }
  .delimiter-ghost-slot.is-active { box-shadow:inset 0 0 0 1px #749bd0; }
  .ML__mathbf, .ML__mathbfit, .ML__bb, .ML__cal, .ML__frak, .ML__script, .ML__sans, .ML__tt {
    background: light-dark(rgba(77,124,179,.10), rgba(120,170,230,.18));
    border-radius: 2px;
  }
  .ML__mediumspace {
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
  const domPosition=editor.view.domAtPos(editor.state.selection.from, backward ? -1 : 1);
  window.getSelection()?.collapse(domPosition.node,domPosition.offset);
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
      field.textContent = node.attrs.latex;
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

      // Two consecutive ambiguous keys replace the structural action with a literal.
      // Preserve the selection as well as the source, including inside nested matrices.
      let pendingKey = null;
      const ambiguous = {
        '_': ['moveToSubscript', '\\_'],
        '^': ['moveToSuperscript', '\\textasciicircum{}'],
        '/': [['insert', '\\frac{#@}{#?}'], '/'],
      };
      field.addEventListener('pointerdown', event => {
        pendingKey = null;
        // A freshly moved/undone node can still have a queued outer-editor focus.
        // Finish the explicit formula click after that frame without moving its caret.
        if (event.button === 0) requestAnimationFrame(() => { if (field.isConnected) field.focus(); });
      });
      field.addEventListener('blur', () => { pendingKey = null; });
      field.addEventListener('lineae-commit-fences', () => commitUnclosedFences(field));

      field.addEventListener('input', () => {
        if(node.attrs.latex===field.value)return;
        const position = getPos();
        if (typeof position === 'number') {
          editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, latex: field.value }));
        }
      });
      let leavingStructure = false;
      field.addEventListener('lineae-leave-math-environment', () => {
        leavingStructure = true;
        try { leaveEnvironment(field); }
        finally { leavingStructure = false; }
      });
      field.addEventListener('keydown', event => {
        if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
            !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
            field.selection.ranges.every(([start,end])=>start===end)) {
          const backward=event.key==='ArrowLeft';
          if (field.position===(backward?0:field.lastOffset)) {
            event.preventDefault(); event.stopImmediatePropagation();
            commitUnclosedFences(field);
            leaveFormula(editor,getPos(),node,backward);
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
            field.value = previous.value;
            field.selection = previous.selection;
            field.executeCommand(['insert', literal]);
          } else {
            pendingKey = { key: event.key, value: field.value, selection: structuredClone(field.selection) };
            field.executeCommand(command);
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
        if (event.key === '$') {
          event.preventDefault();
          event.stopPropagation();
          if (!field.value && !node.isBlock) {
            const position = getPos();
            insertFormula(editor, true, '', { from: position, to: position + node.nodeSize });
          } else {
            commitUnclosedFences(field);
            leaveFormula(editor, getPos(), node, false);
          }
          return;
        }
        if (event.key === 'Backspace' && !field.value) {
          event.preventDefault();
          event.stopPropagation();
          const position = getPos();
          editor.chain().focus().deleteRange({ from: position, to: position + node.nodeSize }).run();
        }
      }, true);
      field.addEventListener('move-out', event => {
        if (leavingStructure) { event.preventDefault(); return; }
        commitUnclosedFences(field);
        leaveFormula(editor, getPos(), node, event.detail.direction === 'backward');
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
      });
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          dom.dataset.latex = node.attrs.latex;
          renderNumbers();
          if (field.value !== node.attrs.latex) field.value = node.attrs.latex;
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
