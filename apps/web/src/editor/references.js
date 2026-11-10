import { Node } from '@tiptap/core';
import { t } from '../ui/i18n.mjs';

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

export function collectReferenceLabels(doc) {
  const labels = [];
  const seen = new Set();
  const headings=outline(doc);
  let headingIndex=0;
  let equationNumber=0;
  let current={number:null,title:'',kind:'label'};
  function add(key,details) {
    if(!key || seen.has(key))return;
    seen.add(key);labels.push({key,...details});
  }
  doc.descendants(node => {
    if(node.type.name==='heading') {
      const heading=headings[headingIndex++];
      if(heading?.number)current={number:heading.number,title:heading.text,kind:'heading'};
      add(node.attrs.label,current);
    }
    if (node.type.name==='mathBlock' && node.attrs.delimiter==='equation') {
      equationNumber++;
      current={number:String(equationNumber),title:node.attrs.latex,kind:'equation'};
      add(node.attrs.label,current);
    }
    if (node.type.name==='label') add(node.attrs.key,current);
  });
  return labels;
}

export const Ref = Node.create({
  name: 'ref',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ key: { default: '' }, equation: { default:false } }),
  parseHTML: () => [{ tag: 'span[data-ref]', getAttrs: dom => ({ key: dom.dataset.ref, equation:dom.dataset.eqref==='true' }) }],
  renderHTML: ({ node }) => ['span', { 'data-ref': node.attrs.key, 'data-eqref':String(node.attrs.equation) }, (node.attrs.equation?'\\eqref{':'\\ref{') + node.attrs.key + '}'],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.className = 'ref-node';
      dom.contentEditable = 'false';
      const render = () => {
        dom.dataset.refView = node.attrs.key;
        const number = collectReferenceLabels(editor.state.doc).find(item=>item.key===node.attrs.key)?.number ?? null;
        dom.textContent = node.attrs.equation ? `(${number??'?'})` : number ?? '?';
        dom.classList.toggle('missing', !number);
        dom.title = (node.attrs.equation?'\\eqref{':'\\ref{') + node.attrs.key + '}';
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

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ text: { default: '' } }),
  parseHTML: () => [{ tag: 'sup[data-footnote]', getAttrs: dom => ({ text: dom.dataset.footnote }) }],
  renderHTML: ({ node }) => ['sup', { 'data-footnote': node.attrs.text }, ''],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('sup');
      dom.className = 'footnote-node';
      dom.contentEditable = 'false';
      const render = () => {
        const position = getPos();
        let number = 0;
        if (typeof position === 'number') {
          editor.state.doc.descendants((child, childPosition) => {
            if (child.type.name === 'footnote' && childPosition <= position) number++;
          });
        }
        dom.textContent = String(number || 1);
        dom.title = t('脚注','Footnote') + ': ' + node.attrs.text;
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

export const Cite = Node.create({
  name: 'cite',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ key: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-cite]', getAttrs: dom => ({ key: dom.dataset.cite }) }],
  renderHTML: ({ node }) => ['span', { 'data-cite': node.attrs.key }, '[' + node.attrs.key + ']'],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.className = 'cite-node';
      dom.contentEditable = 'false';
      const render = () => {
        dom.dataset.citeView = node.attrs.key;
        dom.textContent = '[' + node.attrs.key + ']';
        dom.title = '\\cite{' + node.attrs.key + '}';
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
        title.textContent = t('目录','Contents');
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
