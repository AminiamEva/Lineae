import { Node } from '@tiptap/core';

export function outline(doc) {
  const counters = [0, 0, 0];
  const items = [];
  doc.descendants(node => {
    if (node.type.name !== 'heading') return;
    const level = node.attrs.level;
    if (level < 1 || level > counters.length) return;
    let number = '';
    if (node.attrs.numbered !== false) {
      counters[level - 1]++;
      counters.fill(0, level);
      number = counters.slice(0, level).join('.');
    }
    items.push({ level, number, text: node.textContent, label: node.attrs.label || null });
  });
  return items;
}

function referenceNumber(doc, key) {
  return outline(doc).find(item => item.label === key)?.number || null;
}

export const Ref = Node.create({
  name: 'ref',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ key: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-ref]', getAttrs: dom => ({ key: dom.dataset.ref }) }],
  renderHTML: ({ node }) => ['span', { 'data-ref': node.attrs.key }, '\\ref{' + node.attrs.key + '}'],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.className = 'ref-node';
      dom.contentEditable = 'false';
      const render = () => {
        dom.dataset.refView = node.attrs.key;
        const number = referenceNumber(editor.state.doc, node.attrs.key);
        dom.textContent = number ? '§' + number : '→' + node.attrs.key;
        dom.title = '\\ref{' + node.attrs.key + '}';
      };
      render();
      dom.refreshRef = render;
      dom.addEventListener('mousedown', event => {
        const position = getPos();
        if (typeof position !== 'number') return;
        event.preventDefault();
        event.stopPropagation();
        editor.commands.setNodeSelection(position);
      });
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          render();
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },
});

export const Label = Node.create({
  name: 'label',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ key: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-label-node]', getAttrs: dom => ({ key: dom.dataset.labelNode }) }],
  renderHTML: ({ node }) => ['span', { 'data-label-node': node.attrs.key }, '#' + node.attrs.key],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.className = 'label-node';
      dom.contentEditable = 'false';
      const render = () => {
        dom.dataset.labelView = node.attrs.key;
        dom.textContent = '#' + node.attrs.key;
        dom.title = '\\label{' + node.attrs.key + '}';
      };
      render();
      dom.addEventListener('mousedown', event => {
        const position = getPos();
        if (typeof position !== 'number') return;
        event.preventDefault();
        event.stopPropagation();
        editor.commands.setNodeSelection(position);
      });
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          render();
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },
});

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-toc]' }],
  renderHTML: () => ['div', { 'data-toc': '' }],
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('div');
      dom.className = 'toc-block';
      dom.dataset.tocView = '';
      dom.contentEditable = 'false';
      const render = () => {
        dom.replaceChildren();
        const title = document.createElement('div');
        title.className = 'toc-title';
        title.textContent = '目录 / Contents';
        dom.append(title);
        for (const item of outline(editor.state.doc)) {
          const row = document.createElement('div');
          row.className = 'toc-entry';
          row.style.paddingLeft = (item.level - 1) + 'em';
          row.textContent = (item.number ? item.number + '  ' : '') + item.text;
          dom.append(row);
        }
      };
      render();
      dom.refreshToc = render;
      return { dom, ignoreMutation: () => true };
    };
  },
});

export function refreshReferences(root) {
  root.querySelectorAll('[data-ref-view]').forEach(element => element.refreshRef?.());
  root.querySelectorAll('[data-toc-view]').forEach(element => element.refreshToc?.());
}
