import {documentNumbers} from '../../latex/document-numbering.mjs';
import {headingOutline} from '../../latex/heading-numbering.mjs';
import {createOutlinePanel} from '../ui/outline-panel.js';
import { Node } from '@tiptap/core';
import { t } from '../ui/i18n.mjs';
import { numberedMathRows } from '../../latex/math-environments.mjs';
import { usesCtex } from '../../latex/packages.mjs';
import { displayPageNumber } from '../../latex/document-numbering.mjs';
import {referenceCommand,serializeReference} from '../../latex/reference-commands.mjs';
import {sourceStructure} from '../../latex/source-structure.mjs';
import {environmentEnd} from '../../latex/tblr.mjs';

function hasNumberedCaption(attrs) {
  if(attrs.caption===null || attrs.caption===undefined)return false;
  const source=attrs.figureSource??attrs.tblr?.source??attrs.tabularx?.source;
  const opening=typeof source==='string'?/^\s*\\begin\{((?:figure|table)\*?)\}/.exec(source):null;
  const closing=opening?environmentEnd(source,source.indexOf('\\begin'),opening[1]):null;
  if(closing) {
    const body=source.slice(opening[0].length,closing.start);
    for(const token of sourceStructure(body))if(token.topLevel && token.value==='\\caption')return body[token.end]!=='*';
  }
  return true;
}

const commandAttributes=()=>({key:{default:''},command:{default:null},sourceCommand:{default:null},starred:{default:false}});
function htmlAttrs(dom,fallback) {
  try{return {...fallback,...JSON.parse(dom.dataset.referenceAttrs??'{}')};}catch{return false;}
}

export function citationTargets(keys,library) {
  const entries=new Map((library?.entries??[]).map(entry=>[entry.key,entry]));
  const conflicts=library?.conflicts;
  return keys.split(',').map(key=>{
    key=key.trim();const entry=entries.get(key)??null;
    return {key,entry,status:entry?'resolved':conflicts?.has(key)?'ambiguous':'missing'};
  });
}

export const outline=headingOutline;

export function collectReferenceLabels(doc) {return documentNumbers(doc).labels;}

function navigateTo(editor,target) {
  if(!Number.isInteger(target?.position))return false;
  const position=Math.max(0,Math.min(target.position,editor.state.doc.content.size));
  const chain=editor.chain().focus();
  if(['equation','figure','table'].includes(target.kind))chain.setNodeSelection(position);
  else chain.setTextSelection(Math.min(position+1,editor.state.doc.content.size));
  return chain.scrollIntoView().run();
}

export const Ref = Node.create({
  name: 'ref',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({...commandAttributes(),equation:{default:false}}),
  parseHTML: () => [{ tag: 'span[data-ref]', getAttrs: dom => htmlAttrs(dom,{key:dom.dataset.ref,equation:dom.dataset.eqref==='true'}) }],
  renderHTML: ({ node }) => ['span', { 'data-ref': node.attrs.key, 'data-eqref':String(node.attrs.equation),'data-reference-attrs':JSON.stringify(node.attrs) }, serializeReference(node.attrs)],
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
        const command=referenceCommand(node.attrs),page=command==='pageref';
        const names={heading:t('节','Section'),figure:t('图','Figure'),table:t('表','Table'),equation:t('公式','Equation')};
        dom.dataset.referenceState=target?.ambiguous?'ambiguous':!target?'missing':page?'page-unavailable':number?'resolved':'unnumbered';
        dom.textContent=page?'?':command==='eqref'?`(${number??'?'})`:command==='autoref'&&number?(names[target.kind]??'')+' '+number:number??'?';
        dom.classList.toggle('missing', !number || page);
        dom.dataset.tooltip=serializeReference(node.attrs)+(page?' — '+t('页码需由 LaTeX 编译确定','Page number requires LaTeX compilation'):'');
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
  addOptions:()=>({library:null}),
  addAttributes: commandAttributes,
  parseHTML: () => [{ tag: 'span[data-cite]', getAttrs: dom => htmlAttrs(dom,{key:dom.dataset.cite}) }],
  renderHTML: ({ node }) => ['span', { 'data-cite': node.attrs.key,'data-reference-attrs':JSON.stringify(node.attrs) }, '[' + node.attrs.key + ']'],
  addNodeView() {
    const library=this.options.library;
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.className = 'cite-node';
      dom.contentEditable = 'false';
      const render = () => {
        dom.dataset.citeView = node.attrs.key;
        dom.textContent = '[' + node.attrs.key + ']';
        const targets=citationTargets(node.attrs.key,library),unresolved=targets.filter(target=>target.status!=='resolved');
        dom.dataset.referenceState=unresolved.some(t=>t.status==='ambiguous')?'ambiguous':unresolved.length?'missing':'resolved';
        dom.dataset.missingKeys=JSON.stringify(unresolved.map(t=>t.key));
        dom.classList.toggle('missing',unresolved.length>0);
        dom.dataset.tooltip=serializeReference(node.attrs,'cite')+targets.filter(t=>t.entry).map(t=>'\n'+[t.entry.author,t.entry.title,t.entry.year].filter(Boolean).join(' — ')).join('');
      };
      render();
      dom.refreshCite=render;
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
  addAttributes: commandAttributes,
  parseHTML: () => [{ tag: 'span[data-label-node]', getAttrs: dom => htmlAttrs(dom,{key:dom.dataset.labelNode}) }],
  renderHTML: ({ node }) => ['span', { 'data-label-node': node.attrs.key,'data-reference-attrs':JSON.stringify(node.attrs) }, '#' + node.attrs.key],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.className = 'label-node';
      dom.contentEditable = 'false';
      const render = () => {
        dom.dataset.labelView = node.attrs.key;
        dom.textContent = '#' + node.attrs.key;
        dom.dataset.tooltip = serializeReference(node.attrs,'label');
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
      let rows = [];
      const updatePages = () => {
        const page = editor.view.dom.closest('.document-page');
        const sheet = page?.querySelector('.document-sheet');
        if (!page || !sheet) return;
        const pageRect = page.getBoundingClientRect();
        const pitch = sheet.offsetHeight + (Number.parseFloat(getComputedStyle(page).getPropertyValue('--page-gap')) || 0);
        const zoom = pageRect.width / page.offsetWidth || 1;
        const headingElements = [...editor.view.dom.querySelectorAll('h1,h2,h3')];
        rows.forEach((row, rowIndex) => {
          const node = headingElements[rowIndex];
          const rect = node?.getBoundingClientRect?.();
          const index = node?.getAttribute?.('data-page-index') != null
            ? Number(node.getAttribute('data-page-index'))
            : rect?.height ? Math.floor((rect.top - pageRect.top) / zoom / pitch) : -1;
          const mainStart = page.dataset.mainStart ? Number(page.dataset.mainStart) : null;
          const frontmatter = page.dataset.frontmatter === 'true' || mainStart !== null;
          const pageIndex = row.matter === 'main' && mainStart !== null && index >= 0 && index < mainStart
            ? mainStart : index;
          row.page.textContent = pageIndex >= 0
            ? displayPageNumber(pageIndex, { frontmatter, mainStart }).text
            : '';
        });
      };
      const render = () => {
        dom.replaceChildren();
        const title = document.createElement('div');
        title.className = 'toc-title';
        title.dataset.zh = '目录';
        title.dataset.en = 'Contents';
        const preamble = editor.state.doc.attrs.layoutPreamble || '';
        title.textContent = usesCtex(preamble) ? '目录' : 'Contents';
        dom.append(title);
        rows = outline(editor.state.doc).map(item => {
          const row = document.createElement('div');
          row.className = 'toc-entry';
          row.setAttribute('role','link');
          row.tabIndex = 0;
          row.dataset.headingPosition = String(item.position);
          row.style.paddingLeft = (item.level - 1) + 'em';
          const content = document.createElement('span');
          content.className = 'toc-entry-text';
          content.textContent = (item.number ? item.number + '  ' : '') + item.text;
          const leader = document.createElement('span');
          leader.className = 'toc-leader';
          leader.setAttribute('aria-hidden','true');
          const pageNumber = document.createElement('span');
          pageNumber.className = 'toc-page';
          const jump=()=>navigateTo(editor,item);
          row.addEventListener('click',jump);
          row.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();jump();}});
          row.append(content,leader,pageNumber);
          dom.append(row);
          return {position:item.position,page:pageNumber,matter:item.matter};
        });
        updatePages();
      };
      render();
      const layout = () => updatePages();
      window.addEventListener('lineae-layout',layout);
      dom.refreshToc = render;
      return {
        dom,
        ignoreMutation: () => true,
        stopEvent:event=>Boolean(event.target.closest?.('.toc-entry')),
        destroy:()=>window.removeEventListener('lineae-layout',layout),
      };
    };
  },
});

export function refreshReferences(root, editor) {
  if(editor){
    const numbering=documentNumbers(editor.state.doc);
    for(const [position,item] of numbering.objects){
      const dom=editor.view.nodeDOM(position);
      if(item.kind==='equation'){dom?.refreshNumbers?.();continue;}
      const label=dom?.matches('.document-subfigures')
        ? dom.querySelector('.document-subfigures-caption .document-caption-label')
        : dom?.querySelector('.document-caption-label,.caption-label');
      if(label)label.dataset.captionValue=item.number;
    }
  }
  root.querySelectorAll('[data-ref-view]').forEach(element => element.refreshRef?.());
  root.querySelectorAll('[data-cite-view]').forEach(element => element.refreshCite?.());
  root.querySelectorAll('[data-toc-view]').forEach(element => element.refreshToc?.());
}

export function installDocumentOutline(editor) {
  return createOutlinePanel(editor,{readOutline:outline,navigate:navigateTo});
}
