import { Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

let configuredKeys = [
  { key: 'ctrl+6', command: 'moveToSuperscript' },
  { key: 'ctrl+-', command: 'moveToSubscript' },
  { key: 'ctrl+0', command: 'moveAfterParent' },
];

export function configureMathKeys(values) {
  const allowed = new Set(['moveToSuperscript', 'moveToSubscript', 'moveAfterParent']);
  const entries = Object.entries(values ?? {}).filter(([key, command]) =>
    /^ctrl\+[^+]+$/.test(key) && allowed.has(command));
  if (entries.length) configuredKeys = entries.map(([key, command]) => ({ key, command }));
}

export function focusFormula(editor, id) {
  requestAnimationFrame(() => {
    editor.state.doc.descendants((node, position) => {
      if (node.attrs.id === id) {
        editor.view.nodeDOM(position)?.querySelector('math-field')?.focus();
        return false;
      }
    });
  });
}

export function insertFormula(editor, display = false, latex = '', range) {
  const id = crypto.randomUUID();
  const content = { type: display ? 'mathBlock' : 'math', attrs: { latex, display, id } };
  const chain = editor.chain().focus();
  if (range) chain.insertContentAt(range, content);
  else chain.insertContent(content);
  chain.run();
  focusFormula(editor, id);
}

function leaveFormula(editor, position, node, backward) {
  const target = position + (backward ? 0 : node.nodeSize);
  let transaction = editor.state.tr;
  if (node.isBlock) {
    const resolved = transaction.doc.resolve(target);
    const neighbor = backward ? resolved.nodeBefore : resolved.nodeAfter;
    if (!neighbor?.isTextblock) transaction.insert(target, editor.schema.nodes.paragraph.create());
  }
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(target), backward ? -1 : 1));
  editor.view.dispatch(transaction);
  editor.view.focus();
}

export const MathNode = Node.create({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({
    latex: { default: '' },
    display: { default: false },
    id: { default: null, rendered: false },
  }),
  parseHTML: () => [{ tag: 'span[data-math]', getAttrs: dom => ({ latex: dom.dataset.latex ?? dom.textContent }) }],
  renderHTML: ({ node }) => ['span', { 'data-math': '', 'data-latex': node.attrs.latex }, node.attrs.latex],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement(node.isBlock ? 'div' : 'span');
      dom.className = node.isBlock ? 'math-display' : 'math-inline';
      dom.dataset.mathView = '';
      dom.getMathPosition = getPos;
      dom.contentEditable = 'false';

      const handle = document.createElement('span');
      handle.className = 'math-drag-handle';
      handle.textContent = '⠿';
      handle.title = '拖动公式 / Drag formula';
      handle.setAttribute('aria-label', handle.title);
      handle.draggable = true;
      handle.dataset.dragHandle = '';
      handle.addEventListener('mousedown', () => editor.commands.setNodeSelection(getPos()));

      const field = document.createElement('math-field');
      field.textContent = node.attrs.latex;
      dom.append(handle, field);

      field.addEventListener('input', () => {
        const position = getPos();
        if (typeof position === 'number') {
          editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, latex: field.value }));
        }
      });
      field.addEventListener('keydown', event => {
        if (event.ctrlKey && ['z', 'y'].includes(event.key.toLowerCase())) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key.toLowerCase() === 'z') editor.commands.undo();
          else editor.commands.redo();
          return;
        }
        if (event.key === '$') {
          event.preventDefault();
          event.stopPropagation();
          if (!field.value && !node.isBlock) {
            const position = getPos();
            insertFormula(editor, true, '', { from: position, to: position + node.nodeSize });
          } else leaveFormula(editor, getPos(), node, false);
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
        leaveFormula(editor, getPos(), node, event.detail.direction === 'backward');
      });
      field.addEventListener('mount', () => {
        field.mathVirtualKeyboardPolicy = 'manual';
        field.keybindings = [...configuredKeys, ...field.keybindings];
      });
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          if (field.value !== node.attrs.latex) field.value = node.attrs.latex;
          return true;
        },
        stopEvent: event => event.target !== handle,
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
