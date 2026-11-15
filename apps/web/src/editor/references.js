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
  if(!target || typeof target.position!=='number')return;
  if(target.kind==='equation')editor.chain().focus().setNodeSelection(target.position).scrollIntoView().run();
  else editor.chain().focus().setTextSelection(Math.min(target.position+1,editor.state.doc.content.size)).scrollIntoView().run();
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
  const panel=document.createElement('aside');panel.id='document-outline';panel.className='document-outline';panel.hidden=true;
  panel.setAttribute('aria-label',t('文档大纲','Document outline'));
  const header=document.createElement('div');header.className='document-outline-header';
  const title=document.createElement('strong');
  const close=document.createElement('button');close.type='button';close.textContent='×';
  const list=document.createElement('div');list.className='document-outline-list';
  header.append(title,close);panel.append(header,list);document.body.append(panel);
  function render() {
    if(panel.hidden)return;
    const items=outline(editor.state.doc),selection=editor.state.selection.from;
    let current=null;
    for(const item of items){if(item.position<selection)current=item;else break;}
    const focused=document.activeElement?.dataset?.headingPosition;
    list.replaceChildren();
    editor.state.doc.forEach((node,position)=>{
      if(node.type.name!=='projectRegion')return;
      const file=document.createElement('button');file.type='button';file.className='outline-file';
      file.textContent=node.attrs.path;file.dataset.outlineFile=node.attrs.path;
      file.addEventListener('click',()=>{editor.commands.setTextSelection(position+2);editor.commands.scrollIntoView();});
      list.append(file);
    });
    if(!items.length && !list.childElementCount){const empty=document.createElement('p');empty.textContent=t('文档中没有标题','No headings in this document');list.append(empty);return;}
    for(const item of items){
      const control=document.createElement('button');control.type='button';control.dataset.headingPosition=String(item.position);
      control.style.paddingInlineStart=(8+(item.level-1)*14)+'px';
      control.textContent=(item.number?item.number+'  ':'')+item.text;
      control.setAttribute('aria-current',String(item===current));
      control.addEventListener('click',()=>navigateTo(editor,item));list.append(control);
    }
    panel.dispatchEvent(new Event('lineae-outline-render'));
    if(focused)list.querySelector(`[data-heading-position="${focused}"]`)?.focus({preventScroll:true});
  }
  function relocalize() {
    title.textContent=t('文档大纲','Document outline');
    close.setAttribute('aria-label',t('关闭大纲','Close outline'));
    panel.setAttribute('aria-label',t('文档大纲','Document outline'));render();
  }
  function hide(){panel.hidden=true;editor.view.focus();}
  function show(){panel.hidden=false;relocalize();}
  close.addEventListener('click',hide);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();hide();}},true);
  editor.on('transaction',render);relocalize();
  return {panel,show,hide,relocalize};
}
