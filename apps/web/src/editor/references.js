import {createOutlinePanel} from '../ui/outline-panel.js';
import { Node } from '@tiptap/core';
import { t } from '../ui/i18n.mjs';
import { numberedMathRows } from '../../latex/math-environments.mjs';

export function outline(doc) {
  const counters = [0, 0, 0];
  const items = [];
  doc.descendants((node,position) => {
    if (node.type.name !== 'heading') return;
    const level = node.attrs.level;
    if (level < 1 || level > counters.length) return;
    let number = '';
    if (node.attrs.numbered !== false) {
      counters[level - 1]++;
      counters.fill(0, level);
      number = counters.slice(0, level).join('.');
    }
    items.push({ level, number, text: node.textContent, label: node.attrs.label || null, position });
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
  doc.descendants((node,position) => {
    if(node.type.name==='heading') {
      const heading=headings[headingIndex++];
      current={number:heading?.number||null,title:heading?.text??node.textContent,kind:'heading',position};
      add(node.attrs.label,current);
    }
    if (node.type.name==='mathBlock') {
      for (const row of numberedMathRows(node.attrs)) {
        if (row.unnumbered) continue;
        const number = row.tag ?? String(++equationNumber);
        current={number,title:node.attrs.latex,kind:'equation',position};
        add(row.label ?? (row.index === (node.attrs.labelRow ?? 0) ? node.attrs.label : null),current);
      }
    }
    if (node.type.name==='label') add(node.attrs.key,{...current,kind:'label',position});
  });
  return labels;
}

function navigateTo(editor,target) {
  if(!Number.isInteger(target?.position))return false;
  const position=Math.max(0,Math.min(target.position,editor.state.doc.content.size));
  const chain=editor.chain().focus();
  if(target.kind==='equation')chain.setNodeSelection(position);
  else chain.setTextSelection(Math.min(position+1,editor.state.doc.content.size));
  return chain.scrollIntoView().run();
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
      let target=null;
      const render = () => {
        dom.dataset.refView = node.attrs.key;
        target=collectReferenceLabels(editor.state.doc).find(item=>item.key===node.attrs.key)??null;
        const number = target?.number ?? null;
        dom.textContent = node.attrs.equation ? `(${number??'?'})` : number ?? '?';
        dom.classList.toggle('missing', !number);
        dom.dataset.tooltip = (node.attrs.equation?'\\eqref{':'\\ref{') + node.attrs.key + '}';
      };
      render();
      dom.refreshRef = render;
      dom.addEventListener('mousedown', event => {
        const position = getPos();
        if (typeof position !== 'number') return;
        event.preventDefault();
        event.stopPropagation();
        if(event.ctrlKey || event.metaKey){navigateTo(editor,target);return;}
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
        dom.dataset.tooltipZh = '脚注: ' + node.attrs.text;
        dom.dataset.tooltipEn = 'Footnote: ' + node.attrs.text;
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
        dom.dataset.tooltip = '\\cite{' + node.attrs.key + '}';
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
        dom.dataset.tooltip = '\\label{' + node.attrs.key + '}';
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
        title.dataset.zh = '目录';
        title.dataset.en = 'Contents';
        title.textContent = t('目录','Contents');
        dom.append(title);
        for (const item of outline(editor.state.doc)) {
          const row = document.createElement('div');
          row.className = 'toc-entry';
          row.setAttribute('role','link');row.tabIndex=0;row.dataset.headingPosition=String(item.position);
          row.style.paddingLeft = (item.level - 1) + 'em';
          row.textContent = (item.number ? item.number + '  ' : '') + item.text;
          const jump=()=>navigateTo(editor,item);
          row.addEventListener('click',jump);
          row.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();jump();}});
          dom.append(row);
        }
      };
      render();
      dom.refreshToc = render;
      return { dom, ignoreMutation: () => true, stopEvent:event=>Boolean(event.target.closest?.('.toc-entry')) };
    };
  },
});

export function refreshReferences(root) {
  root.querySelectorAll('[data-ref-view]').forEach(element => element.refreshRef?.());
  root.querySelectorAll('[data-toc-view]').forEach(element => element.refreshToc?.());
}

export function installDocumentOutline(editor) {
  return createOutlinePanel(editor,{readOutline:outline,navigate:navigateTo});
}
