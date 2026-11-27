import {layoutScale,lineBoxAscent} from '../typesetting/layout-geometry.js';
import {counterProfile} from '../../latex/counter-profile.mjs';
import {installParagraphLayout} from '../typesetting/paragraph-layout.js';
import {documentLayoutBlocks} from '../project/fold-layout.mjs';
import {t} from '../ui/i18n.mjs';
import { planPagination, planTableRows } from '../../latex/typeset-layout.mjs';
import { setSerializationClass } from './latex-codec.js';
import { setHeadingBase } from '../../latex/blocks.mjs';
import { readPageFurniture, pageFurnitureText, furnitureSlots } from '../../latex/page-furniture.mjs';
import { displayPageNumber } from '../../latex/document-numbering.mjs';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const lineBreakKey = new PluginKey('lineaePaginationLineBreaks');
let chapterPages = new Set();
const graphemeSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity:'grapheme' }) : null;

function lineBreakDecorations(doc, entries) {
  return DecorationSet.create(doc, entries.map(({ position, height }) => Decoration.widget(position, () => {
    const gap = document.createElement('span');
    gap.className = 'pagination-line-break';
    gap.contentEditable = 'false';
    gap.setAttribute('aria-hidden', 'true');
    gap.style.height = `${height.toFixed(3)}px`;
    return gap;
  }, { side:-1, key:`lineae-page-${position}`, ignoreSelection:true })));
}

function installLineBreaks(editor) {
  editor.registerPlugin(new Plugin({
    key: lineBreakKey,
    state: {
      init: () => DecorationSet.empty,
      apply(transaction, decorations) {
        const entries = transaction.getMeta(lineBreakKey);
        return entries ? lineBreakDecorations(transaction.doc, entries) : decorations.map(transaction.mapping, transaction.doc);
      },
    },
    props: { decorations: state => lineBreakKey.getState(state) },
  }));
}

function nextGraphemePosition(editor, position) {
  let point;
  try { point = editor.view.domAtPos(position); }
  catch { return position; }
  if (point.node.nodeType !== Node.TEXT_NODE) return position;
  const text = point.node.data;
  if (graphemeSegmenter) {
    for (const segment of graphemeSegmenter.segment(text)) {
      const end = segment.index + segment.segment.length;
      if (point.offset > segment.index && point.offset < end) {
        return editor.view.posAtDOM(point.node, end);
      }
    }
    return position;
  }
  const before = text.charCodeAt(point.offset - 1);
  const after = text.charCodeAt(point.offset);
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF
    ? editor.view.posAtDOM(point.node, point.offset + 1) : position;
}

function unscaledRect(element, pageRect, zoom) {
  const rect = element.getBoundingClientRect();
  return {
    top: (rect.top - pageRect.top) / zoom,
    height: rect.height / zoom,
  };
}

function paragraphLines(editor, element, block, pageRect, zoom) {
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 0;
  if (!element.textContent || block.height < lineHeight * 1.5) return null;
  let from, to;
  try {
    from = editor.view.posAtDOM(element, 0);
    to = editor.view.posAtDOM(element, element.childNodes.length);
  } catch {
    return null;
  }
  if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from) return null;
  const topAt = position => {
    // ProseMirror's coordsAtPos clamps positions that are scrolled out of the
    // viewport to the visible edge, which made line detection depend on the
    // scroll position and produced different plans for the same document.
    // Measure a one-character range instead: layout rectangles are available
    // for every position regardless of scrolling.
    try {
      const { node, offset } = editor.view.domAtPos(position);
      const range = document.createRange();
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.data.length;
        if (!length) {
          const parent = node.parentElement;
          return parent ? (parent.getBoundingClientRect().top - pageRect.top) / zoom : Number.NaN;
        }
        const start = Math.max(0, Math.min(offset, length - 1));
        range.setStart(node, start);
        range.setEnd(node, Math.min(length, start + 1));
      } else if (offset < node.childNodes.length) {
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
      } else if (node.childNodes.length) {
        range.selectNodeContents(node);
      } else {
        return (node.getBoundingClientRect().top - pageRect.top) / zoom;
      }
      const rects = range.getClientRects();
      const rect = rects.length ? rects[0] : range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) {
        const fallback = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        return fallback ? (fallback.getBoundingClientRect().top - pageRect.top) / zoom : Number.NaN;
      }
      return (rect.top - pageRect.top) / zoom;
    } catch { return Number.NaN; }
  };
  // Character rectangles report glyph ink boxes, so glyphs on the same line can
  // differ by a couple of pixels.  Require a real advance before treating a
  // position as a new visual line.
  const advance = Math.max(1, lineHeight * .4);
  const bottom = block.top + block.height;
  const firstTop = topAt(from);
  if (!Number.isFinite(firstTop) || firstTop > bottom + 1) return null;
  const starts = [{ position:from, top:firstTop }];
  let cursor = from;
  while (cursor < to) {
    const currentTop = starts.at(-1).top;
    let high = Math.min(to, cursor + 16);
    while (high < to && topAt(high) <= currentTop + advance) {
      high = Math.min(to, cursor + (high - cursor) * 2);
    }
    if (topAt(high) <= currentTop + advance) break;
    let low = cursor + 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (topAt(middle) > currentTop + advance) high = middle;
      else low = middle + 1;
    }
    const position = nextGraphemePosition(editor, low);
    const top = topAt(position);
    if (!Number.isFinite(top) || top <= currentTop + advance || top > bottom + 1) break;
    starts.push({ position, top });
    cursor = position;
  }
  if (starts.length < 2) return null;
  return starts.map((line, index) => ({
    ...line,
    height: Math.max(1, (starts[index + 1]?.top ?? bottom) - line.top),
  }));
}

export function installTypesetPagination(page, paper, meta, editor, engineProfile, reportCjkPrecision) {
  const editable = paper.querySelector('.ProseMirror');
  const paragraphLayout=installParagraphLayout(editor,engineProfile);
  let paragraphPreamble='';
  const sheets = document.createElement('div');
  sheets.className = 'document-sheets';
  sheets.setAttribute('aria-hidden', 'true');
  page.prepend(sheets);

  const paginationStyle = document.createElement('style');
  paginationStyle.dataset.lineaePagination = '';
  document.head.append(paginationStyle);

  let frame = 0;
  let profile = engineProfile.documentStyle();
  let furniture = readPageFurniture();
  let maketitle = false;
  let lineBreaks = [];
  let lineBreaksDoc = null;
  let lastLayoutDoc = null;
  let layoutPass = 0;
  let settled = false;
  installLineBreaks(editor);

  function setLineBreaks(entries) {
    const same = lineBreaksDoc === editor.state.doc && entries.length === lineBreaks.length && entries.every((entry, index) =>
      entry.position === lineBreaks[index].position && Math.abs(entry.height - lineBreaks[index].height) < .01);
    if (same) return;
    lineBreaks = entries;
    lineBreaksDoc = editor.state.doc;
    editor.view.dispatch(editor.state.tr.setMeta(lineBreakKey, entries));
  }
  let translations = [];
  let sheetCount = 0;
  let mode = 'pages';
  let continuedTables = true;
  let headerClones = [];

  function clearHeaderClones() {
    for (const clone of headerClones) clone.remove();
    headerClones = [];
  }

  function tableMeta(wrapper, pageRect, zoom, sections) {
    const table = wrapper.querySelector('table');
    if (!table?.rows.length) return null;
    const wrapperRect = wrapper.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const rowRect = row => row.getBoundingClientRect();
    return {
      longtable:table.hasAttribute("data-longtable"),
      sections,
      dataStart:sections ? Math.max(...Object.values(sections).map(s=>s.end)) : 0,
      rows: [...table.rows].filter(row=>getComputedStyle(row).display!=='none').map(row => {
        const rect = rowRect(row);
        return {
          top: (rect.top - tableRect.top) / zoom,
          height: rect.height / zoom,
        };
      }),
      headerHeight: table.hasAttribute('data-longtable') ? 0 : rowRect(table.rows[0]).height / zoom,
      header: [...table.rows[0].cells].map(cell => ({
        text: cell.textContent,
        width: cell.getBoundingClientRect().width / zoom,
        align: getComputedStyle(cell).textAlign,
        weight: getComputedStyle(cell).fontWeight,
      })),
      left: (tableRect.left - pageRect.left) / zoom,
      width: tableRect.width / zoom,
      tableTop: (tableRect.top - wrapperRect.top) / zoom,
    };
  }

  function renderTableHeaders(plans, blocks) {
    clearHeaderClones();
    for (const [index, plan] of plans) {
      const block = blocks[index];
      for(const copy of plan.copies??[]){
        const section=block.table.sections[copy.section];
        const layer=document.createElement('div');
        layer.className='table-continuation-header longtable-section';
        layer.dataset.section=copy.section;
        layer.setAttribute('aria-hidden','true');
        layer.style.cssText='left:'+block.table.left+'px;top:'+copy.top+'px;width:'+block.table.width+'px';
        const table=document.createElement('table'),body=document.createElement('tbody');
        layer.style.setProperty('--section-baseline-adjust',section.baselineAdjust+'px');
        for(const [index,row] of section.rows.entries()){
          const clone=row.cloneNode(true);
          Array.from(clone.cells).forEach((cell,i)=>cell.style.width=section.widths[index][i]+'px');
          body.append(clone);
        }
        table.append(body);layer.append(table);page.append(layer);headerClones.push(layer);
      }
      for (const entry of plan.breaks) {
        if (!entry.headerTop || !block.table.headerHeight) continue;
        const clone = document.createElement('div');
        clone.className = 'table-continuation-header';
        clone.setAttribute('aria-hidden', 'true');
        clone.style.left = block.table.left + 'px';
        clone.style.top = entry.headerTop + 'px';
        clone.style.width = block.table.width + 'px';
        const table = document.createElement('table');
        table.style.width = '100%';
        const body = document.createElement('tbody');
        const row = document.createElement('tr');
        for (const cell of block.table.header) {
          const item = document.createElement('td');
          item.textContent = cell.text;
          item.style.width = cell.width + 'px';
          item.style.textAlign = cell.align;
          item.style.fontWeight = cell.weight;
          row.append(item);
        }
        body.append(row);
        table.append(body);
        clone.append(table);
        page.append(clone);
        headerClones.push(clone);
      }
    }
  }

  function furnitureElement(kind, slots, pageNumber, force = false, marks = {}) {
    if (!force && (!slots || !Object.values(slots).some(Boolean))) return null;
    const container = document.createElement('div');
    container.className = `document-page-${kind}`;
    for (const slot of ['left', 'center', 'right']) {
      const item = document.createElement('span');
      item.className = `document-page-${kind}-${slot}`;
      item.textContent = pageFurnitureText(slots[slot], pageNumber, marks);
      container.append(item);
    }
    return container;
  }

  function pageMarks(pageIndex) {
    const headings = [...editable.querySelectorAll('h1,h2,h3')].map(element => {
      const rect = element.getBoundingClientRect();
      return {text: element.textContent, top: rect.top};
    });
    if (!headings.length) return {left:'', right:''};
    const sheet = sheets.firstElementChild;
    if (!sheet) return {left:'', right:''};
    const pageRect = page.getBoundingClientRect();
    const zoom = layoutScale(page);
    const pitch = sheet.getBoundingClientRect().height/zoom + (Number.parseFloat(getComputedStyle(page).getPropertyValue('--page-gap')) || 0);
    const indexed = headings.map(heading => ({
      ...heading,
      page: Math.max(0, Math.floor((heading.top - pageRect.top) / zoom / pitch)),
    }));
    const current = indexed.filter(heading => heading.page <= pageIndex).at(-1) ?? indexed[0];
    const next = indexed.find(heading => heading.page > pageIndex);
    return {left: current.text, right: (next ?? current).text};
  }

  function renderSheets(count) {
    if (count === sheetCount) return;
    sheets.replaceChildren(...Array.from({ length: count }, (_, index) => {
      const sheet = document.createElement('div');
      sheet.className = 'document-sheet';
      const frontmatter = page.dataset.frontmatter === 'true';
      const mainStart = page.dataset.mainStart ? Number(page.dataset.mainStart) : null;
      const display = displayPageNumber(index, { frontmatter, mainStart });
      sheet.dataset.parity = display.value % 2 ? 'odd' : 'even';
      const pageNumber = display.value;
      const plainChapter = chapterPages.has(index);
      const marks = pageMarks(index);
      const plainTitlePage = maketitle && index === 0;
      const headerSlots = (plainTitlePage || plainChapter) ? {} : furnitureSlots(furniture, 'header', pageNumber);
      const footerSlots = (plainTitlePage || plainChapter) ? {} : furnitureSlots(furniture, 'footer', pageNumber);
      const header = furnitureElement('header', headerSlots, pageNumber,
        Object.values(headerSlots).some(Boolean) || (!plainTitlePage && furniture.rules.headWidth !== '0pt'), marks);
      const footer = furnitureElement('footer', footerSlots, pageNumber,
        Object.values(footerSlots).some(Boolean) || (!plainTitlePage && furniture.rules.footWidth !== '0pt'), marks);
      if (furniture.style === 'fancy' && !plainTitlePage && !plainChapter) {
        if (header) sheet.append(header);
        if (footer) sheet.append(footer);
      } else {
        const number = document.createElement('span');
        number.className = 'document-page-number';
        number.textContent = display.text;
        sheet.append(number);
      }
      return sheet;
    }));
    sheetCount = count;
  }

  function applyProfile(preamble) {
    paragraphPreamble=preamble;
    profile = engineProfile.documentStyle(preamble);
    furniture = readPageFurniture(preamble);
    page.dataset.documentClass = profile.baseClassName;
    page.dataset.rawDocumentClass = profile.rawClassName;
    page.dataset.indentFirst = String(profile.indentFirst);
    page.dataset.frontmatter = String(/\\frontmatter/.test(preamble));
    setSerializationClass(profile.baseClassName);
    setHeadingBase(profile.baseClassName === 'book' || profile.baseClassName === 'report' ? 'chapter' : null);
    page.dataset.pageStyle = furniture.style === 'fancy' ? 'fancy' : profile.pageStyle;
    page.style.setProperty('--page-head-rule-width', furniture.rules.headWidth);
    page.style.setProperty('--page-head-rule-color', furniture.rules.headColor);
    page.style.setProperty('--page-foot-rule-width', furniture.rules.footWidth);
    page.style.setProperty('--page-foot-rule-color', furniture.rules.footColor);
    sheetCount = 0;
    page.style.setProperty('--tex-font-size', profile.fontSize);
    page.style.setProperty('--tex-line-height', profile.lineHeight);
    page.style.setProperty('--tex-paragraph-indent', profile.paragraphIndent);
    const quote = name => '"' + String(name).replaceAll('"', '') + '"';
    const stack = (...names) => names.filter(Boolean).map(quote).join(',');
    const classOptions=/\\documentclass\s*(?:\[([^\]]*)\])?/.exec(preamble)?.[1]??'';
    const classSize=/(?:^|,)\s*12pt\s*(?:,|$)/.test(classOptions)?12:/(?:^|,)\s*11pt\s*(?:,|$)/.test(classOptions)?11:10;
    const texPx=96/72.27;
    // Standard classes place chapter text on fixed 25/30pt baseline grids,
    // after topskip + 50pt. Compensate the browser's centered line strut.
    page.style.setProperty('--tex-chapter-top-padding',(55+classSize)*texPx+'px');
    page.style.setProperty('--tex-chapter-label-size',(classSize===12?24.88:20.74)*texPx+'px');
    page.style.setProperty('--tex-chapter-label-line-height',(classSize===12?30:25)*texPx+'px');
    if (profile.latinFeatures) {
      const {kerning, ligatures} = profile.latinFeatures;
      // ProseMirror's editing stylesheet disables liga via the lower-level
      // feature-settings property, which wins over font-variant-ligatures.
      editor.view.dom.style.fontFeatureSettings = '"liga" ' + (ligatures === 'no-common-ligatures' ? 0 : 1)
        + ', "kern" ' + (kerning === 'none' ? 0 : 1);
      editor.view.dom.style.fontKerning = kerning;
      editor.view.dom.style.fontVariantLigatures = profile.latinFeatures.ligatures;
    }
    else {
      editor.view.dom.style.removeProperty('font-feature-settings');
      editor.view.dom.style.removeProperty('font-kerning');
      editor.view.dom.style.removeProperty('font-variant-ligatures');
    }
    const fonts = profile.fonts ?? {};
    page.style.setProperty('--tex-font-family', fonts.serif
      ? stack(fonts.serif, 'Latin Modern Roman') : '"Latin Modern Roman"');
    page.style.setProperty('--tex-heading-font-family', fonts.serif
      ? stack(fonts.serif, 'Latin Modern Roman 12', 'Latin Modern Roman')
      : '"Latin Modern Roman 12","Latin Modern Roman"');
    page.style.setProperty('--tex-cjk-font-family', fonts.cjk
      ? stack(fonts.cjk, 'Songti SC', 'SimSun') : '"Songti SC",SimSun');
    if (reportCjkPrecision && engineProfile.cjk?.assess) {
      const family = page.style.getPropertyValue('--tex-cjk-font-family');
      const assessment = engineProfile.cjk.assess(preamble, family);
      const show = !assessment.supported && (fonts.cjk || /[\p{Script=Han}]/u.test(editor.state.doc.textContent));
      reportCjkPrecision(show ? (fonts.cjk || family) : null);
    }
    else reportCjkPrecision?.(null);
    page.style.setProperty('--tex-mono-font-family', fonts.mono
      ? stack(fonts.mono, 'Latin Modern Mono') : '"Latin Modern Mono"');
  }

  function layoutFlow() {
    paragraphLayout.layout(paragraphPreamble);
    paginationStyle.textContent = '';
    translations = [];
    setLineBreaks([]);
    delete page.dataset.paginationMeasuring;
    clearHeaderClones();
    page.dataset.pagination = 'flow';
    page.dataset.pageCount = '1';
    page.style.setProperty('--editor-min-height', '0');
    page.style.setProperty('--page-stack-height', 'var(--page-height)');
    renderSheets(1);
    if (layoutPass >= 2) settleLayout();
    lastLayoutDoc = editor.state.doc;
    window.dispatchEvent(new CustomEvent('lineae-layout'));
  }

  let deferredLayout = false;
  function layout() {
    frame = 0;
    if (!editable.isConnected || !page.getClientRects().length) {
      deferredLayout = true;
      return;
    }
    deferredLayout = false;
    // Measuring removes the page's reserved height, which briefly shrinks the
    // scrollable document. While scrolled down the browser clamps scrollY to
    // that smaller height and never restores it, so the page jumped whenever a
    // layout pass ran (for example after inserting a table row). Remember the
    // visible position and put it back before the next paint.
    const preserveScrollX = window.scrollX;
    const preserveScrollY = window.scrollY;
    const restoreScroll = () => {
      if (window.scrollX !== preserveScrollX || window.scrollY !== preserveScrollY) {
        window.scrollTo(preserveScrollX, preserveScrollY);
      }
    };
    if (editor.state.doc !== lastLayoutDoc) {
      layoutPass = 0;
      settled = false;
    }
    layoutPass += 1;
    window.dispatchEvent(new Event('lineae-before-layout'));
    const emptyMeta = !meta.textContent.trim();
    meta.dataset.empty = String(emptyMeta);
    page.dataset.pagination = mode;
    if (mode === 'flow') {
      layoutFlow();
      restoreScroll();
      return;
    }
    paginationStyle.textContent = '';
    translations = [];
    page.dataset.paginationMeasuring = '';
    // Measure from the unpaginated geometry so repeated layouts converge.
    page.style.removeProperty('--editor-min-height');
    // Keep the outer page stack until the new plan is ready. Collapsing it here
    // clamps the viewport scroll while measuring an overflowing tabular.
    clearHeaderClones();
    renderSheets(1);

    const {elements:children,selectors:blockSelectors}=documentLayoutBlocks(editable);
    const baseRules=[];
    // TeX places the first ordinary line at topskip. Measure Chromium's
    // line-box ascent with the loaded font before positioning that line.
    const first=children[0];
    if(first?.matches('p') && first.textContent && !first.querySelector('math-field,img,br') &&
       profile.className==='ctexart'){
      const ascent=lineBoxAscent(first);
      const options=/\\documentclass\s*\[([^\]]*)\]/.exec(paragraphPreamble)?.[1]??'';
      const size=Number(/(?:^|,)\s*(10|11|12)pt\s*(?:,|$)/.exec(options)?.[1]??10);
      const delta=size*96/72.27-ascent;
      baseRules.push('.document-page .ProseMirror > '+blockSelectors[0]+'{margin-block-start:'+delta+'px}');
    }
    children.forEach((element,index)=>{
      if(!element.closest('[data-project-region]'))return;
      const selector='.document-page .ProseMirror>'+blockSelectors[index].replace('>','[data-project-region]>');
      const previous=children[index-1]?.tagName??'';
      if(/^H[1-3]$/.test(element.tagName)&&element.dataset.headingCommand!=='chapter'){
        const following=(previous==='H1'&&element.tagName==='H2')||(previous==='H2'&&element.tagName==='H3');
        baseRules.push(selector+'{margin-top:'+(index===0||following?'0':element.tagName==='H1'?'3.5ex':'3.25ex')+';'+(element.tagName==='H1'?'position:relative;top:'+(index===0?'-3.75pt':'0')+';':'')+'}');
        if(element.tagName==='H1'&&children[index+1]?.tagName==='H2')baseRules.push(selector+'{margin-bottom:4.15pt}');
      }
      if(element.tagName==='P'&&element.dataset.indent==='true'&&element.dataset.explicitIndent!=='true'&&/^H[1-3]$/.test(previous))baseRules.push(selector+'[data-indent=true]{text-indent:'+(page.dataset.indentFirst==='true'?'var(--tex-paragraph-indent)':'0')+'}');
      if(index===0&&element.matches('.math-display'))baseRules.push(selector+'{margin-top:0}');
    });
    paginationStyle.textContent=baseRules.join('\n');
    paragraphLayout.layout(paragraphPreamble);
    const pageRect = page.getBoundingClientRect();
    const zoom = layoutScale(page);
    const computed = getComputedStyle(page);
    const pageHeight = sheets.firstElementChild.getBoundingClientRect().height/zoom;
    const pageGap = parseFloat(computed.getPropertyValue('--page-gap')) || 0;
    const marginTop = parseFloat(computed.paddingTop);
    const marginBottom = parseFloat(computed.paddingBottom);
    const geometry = { pageHeight, pageGap, marginTop, marginBottom };
    const sectionMetrics=new Map();
    const classSize=Number(/\\documentclass\s*\[[^\]]*?\b(10|11|12)pt\b/.exec(paragraphPreamble)?.[1]??10);
    const topSkip=classSize*96/72.27;
    for(const wrapper of children.filter(el=>el.matches('.tableWrapper'))){
      const table=wrapper.querySelector('table[data-atomic-tabular]');
      const sourceTable=table ?? wrapper.querySelector('table[data-longtable]');
      const cell=sourceTable?.querySelector('td p');
      if(sourceTable?.lineaeSections && Math.max(...Object.values(sourceTable.lineaeSections).map(r=>r[1]))<sourceTable.rows.length){
        const sections={};
        const prefix='.document-page .ProseMirror > '+blockSelectors[children.indexOf(wrapper)];
        const baselineAdjust=cell ? .7*parseFloat(getComputedStyle(cell).lineHeight)-lineBoxAscent(cell) : 0;
        for(const [kind,[start,end]] of Object.entries(sourceTable.lineaeSections)){
          const rows=Array.from(sourceTable.rows).slice(start,end);
          const widths=rows.map(row=>Array.from(row.cells,c=>c.getBoundingClientRect().width/zoom));
          sections[kind]={kind,end,rows,widths,baselineAdjust,height:rows.reduce((h,r)=>h+r.getBoundingClientRect().height/zoom,0)};
        }
        const count=Math.max(...Object.values(sections).map(s=>s.end));
        baseRules.push(prefix+' > table > tbody > tr:nth-child(-n+'+count+'){display:none}');
        sectionMetrics.set(wrapper,sections);
      }
      const previous=wrapper.previousElementSibling;
      if(sourceTable?.hasAttribute('data-longtable') && previous?.matches('p[data-tex-paragraph]') &&
         !previous.querySelector('math-field,img,strong,em,sup,sub')){
        // LTpre follows the depth of the last TeX text box. A CSS line
        // also includes the unused leading below its last baseline.
        const text=document.createRange();
        text.selectNodeContents(previous);
        const lastBreak=Array.from(previous.querySelectorAll('.tex-paragraph-break')).at(-1);
        if(lastBreak)text.setStartAfter(lastBreak);
        const style=getComputedStyle(previous);
        const context=document.createElement('canvas').getContext('2d');
        context.font='1000px '+style.fontFamily;
        const inkDepth=context.measureText(text.toString()).actualBoundingBoxDescent*parseFloat(style.fontSize)/1000;
        const cssDepth=parseFloat(style.lineHeight)-lineBoxAscent(previous);
        const depthAdjustment=inkDepth-cssDepth;
        const selector='.document-page .ProseMirror > '+blockSelectors[children.indexOf(wrapper)];
        baseRules.push(selector+'{--lt-depth-adjust:'+depthAdjustment+'px}');
      }
      if(cell){
        const selector='.document-page .ProseMirror > '+blockSelectors[children.indexOf(wrapper)];
        // LaTeX array struts put 70% of the baseline skip above the baseline.
        const offset=.7*parseFloat(getComputedStyle(cell).lineHeight)-lineBoxAscent(cell);
        baseRules.push(selector+' > table > tbody > tr > td > p{position:relative;top:'+offset+'px}');
      }
      const overflow=table && table.getBoundingClientRect().height/zoom>pageHeight-marginTop-marginBottom;
      wrapper.toggleAttribute('data-paper-overflow',Boolean(overflow));
      if(overflow){
        const selector='.document-page .ProseMirror > '+blockSelectors[children.indexOf(wrapper)];
        baseRules.push(selector+'{max-height:'+(pageHeight-marginTop)+'px;overflow-y:auto;margin-inline:0 auto}');
      }
      wrapper.style.maxHeight=overflow?(pageHeight-marginTop)+'px':'';
      wrapper.style.overflowY=overflow?'auto':'';
      if(overflow)wrapper.title=t('表格超出纸面，可滚动编辑全部行','Table exceeds the page. Scroll to edit all rows.');
      else wrapper.removeAttribute('title');
    }
    paginationStyle.textContent=baseRules.join('\n');
    const textAscents=new Map();
    const blocks = children.map((element, index) => {
      const rect = unscaledRect(element, pageRect, zoom);
      const block = {
        top: rect.top,
        height: element.tagName === 'P' && !element.textContent ? 0 : rect.height,
        keepWithNext: /^H[1-3]$/.test(element.tagName),
        keepWithPrevious: element.matches('.math-display'),
        atomicTable: Boolean(element.matches('.tableWrapper:has(table[data-atomic-tabular])')),
        table: element.matches('.tableWrapper:not(:has(table[data-atomic-tabular]))') ? tableMeta(element, pageRect, zoom, sectionMetrics.get(element)) : null,
      };
      block.lines = element.tagName === 'P' ? paragraphLines(editor, element, block, pageRect, zoom) : null;
      if(profile.className==='ctexart' && block.lines){
        const style=getComputedStyle(element);
        const key=style.fontFamily+' '+style.fontSize+' '+style.lineHeight;
        if(!textAscents.has(key))textAscents.set(key,lineBoxAscent(element));
        block.pageStartAdjustment=topSkip-textAscents.get(key)+block.lines[0].top-block.top;
      }
      return block;
    });
    children.forEach((element, index) => {
      if (element.matches('.page-break, [data-page-break]') && blocks[index + 1]) blocks[index + 1].forceBreak = true;
    });
    const chapterProfile=counterProfile(paragraphPreamble);
    if(chapterProfile.chapters){
      children.forEach((element,index)=>{
        if(element.dataset.headingCommand!=='chapter')return;
        const preceding=children.slice(0,index).some(node=>!node.matches('[data-appendix-start],.page-break,[data-page-break]')&&(node.textContent.trim()||node.querySelector('math-field,img,table')));
        if(preceding)blocks[index].forceBreak=chapterProfile.openRight?'odd':true;
      });
    }
    // The normal ctexart club penalty is finite. An otherwise full page
    // can end with the first line of a long paragraph (headings still keep
    // their following paragraph). Honour an explicit prohibitive penalty.
    const allowClub=profile.className==='ctexart' && !/\\clubpenalty\s*=?\s*10000\b/.test(paragraphPreamble);
    const virtual = [];
    const blockItems = blocks.map((block, blockIndex) => {
      const items = [];
      if (block.lines) {
        const keepFirstPair=!allowClub || block.lines.length<=3 || blocks[blockIndex-1]?.keepWithNext;
        block.lines.forEach((line, lineIndex) => {
          items.push(virtual.length);
          virtual.push({
            top: line.top,
            height: line.height,
            blockIndex,
            lineIndex,
            position: line.position,
            pageStartAdjustment:block.pageStartAdjustment,
            forceBreak: lineIndex === 0 && block.forceBreak,
            keepWithNext: (lineIndex === 0 && keepFirstPair) || lineIndex === block.lines.length - 2,
            keepWithPrevious: lineIndex === 1 && keepFirstPair,
          });
        });
      } else {
        items.push(virtual.length);
        virtual.push({ ...block, blockIndex });
      }
      return items;
    });
    // Give a terminal page break a layout target without adding editable content.
    if (children.at(-1)?.matches('.page-break, [data-page-break]')) {
      virtual.push({ top: blocks.at(-1).top, height: 0, forceBreak: true });
    }

    let plan = planPagination(virtual, geometry);
    let tablePlans = new Map();
    for (let pass = 0; pass < 3; pass++) {
      let added=0;
      const sized = virtual.map(item => {
        const extra = tablePlans.get(item.blockIndex)?.extra ?? 0;
        const top=item.top+added;
        added+=extra;
        return {...item,top,height:item.height+extra};
      });
      plan = planPagination(sized, geometry);
      const next = new Map();
      let changed = false;
      if (continuedTables || sectionMetrics.size) {
        for (let index = 0; index < blocks.length; index++) {
          const block = blocks[index];
          if (!block.table || (!continuedTables && !block.table.sections)) continue;
          const rows = planTableRows(block.table.rows, {
            ...geometry,
            top: sized[blockItems[index][0]].top + plan.translations[blockItems[index][0]] + block.table.tableTop,
            headerHeight: block.table.headerHeight,
            sections:block.table.sections,
            pageInset:block.table.longtable?Math.max(0,topSkip-.7*block.table.rows[0].height):0,
            repeatHeader: !block.table.longtable,
            lastRowDepth: block.table.longtable ? block.table.rows[0].height*.3 : 0,
          });
          next.set(index, rows);
          if (Math.abs((tablePlans.get(index)?.extra ?? 0) - rows.extra) > .5) changed = true;
        }
      }
      tablePlans = next;
      if (!changed) break;
    }

    const pageBreaks = [];
    translations = Array(blocks.length).fill(0);
    let naturalGap = 0;
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const items = blockItems[blockIndex];
      translations[blockIndex] = plan.translations[items[0]] - naturalGap;
      if (!blocks[blockIndex].lines) continue;
      let previous = plan.translations[items[0]];
      for (const itemIndex of items.slice(1)) {
        const desired = plan.translations[itemIndex];
        const gap = desired - previous;
        if (gap > .01) {
          pageBreaks.push({ position:virtual[itemIndex].position, height:gap });
          naturalGap += gap;
        }
        previous = desired;
      }
    }
    setLineBreaks(pageBreaks);
    const rules = baseRules.concat(translations.map((distance, index) => distance > .01
      ? `.document-page .ProseMirror > ${blockSelectors[index]}{translate:0 ${distance.toFixed(3)}px}`
      : '').filter(Boolean));
    for (const [index, tablePlan] of tablePlans) {
      const table=blocks[index].table;
      const finalFoot=table.sections?.lastfoot ?? table.sections?.foot;
      if(finalFoot?.height)rules.push('.document-page .ProseMirror > '+blockSelectors[index]+'{padding-bottom:'+finalFoot.height+'px}');
      for (const entry of tablePlan.breaks) {
        rules.push(`.document-page .ProseMirror > ${blockSelectors[index]} > table > tbody > tr:nth-child(${entry.row + table.dataStart + 1}) > :is(td,th){padding-top:${entry.padding.toFixed(3)}px}`);
      }
    }
    paginationStyle.textContent = rules.join('\n');

    const pitch = pageHeight + pageGap;
    let mainStartPage = null;
    let backStartPage = null;
    let hasFrontmatterMarker = false;
    children.forEach((element, index) => {
      const matter = element.matches?.('[data-matter-start]') ? element.getAttribute('data-matter-start') : null;
      if (!matter || !blocks[index]) return;
      const pageIndex = Math.min(plan.pageCount - 1, Math.max(0, Math.round((blocks[index].top + (translations[index] || 0) - marginTop) / pitch)));
      if (matter === 'front') hasFrontmatterMarker = true;
      if (matter === 'main') mainStartPage = pageIndex;
      if (matter === 'back') backStartPage = pageIndex;
    });
    chapterPages = new Set();
    // unscaledRect is relative to the paper origin. A heading just above the
    // body margin still belongs to that sheet, including subpixel rounding.
    const chapterPage = element => Math.min(plan.pageCount - 1, Math.max(0,
      Math.floor(unscaledRect(element, pageRect, zoom).top / pitch)));
    editable.querySelectorAll('h1').forEach((element) => {
      chapterPages.add(chapterPage(element));
    });
    // The mainmatter marker often sits on the last front-matter page.  Arabic
    // numbering starts at the first chapter after that marker, not at the
    // marker's own page.
    let currentMatter = null;
    let firstMainChapter = null;
    children.forEach((element) => {
      if (element.matches?.('[data-matter-start]')) {
        currentMatter = element.getAttribute('data-matter-start');
        return;
      }
      if (element.tagName !== 'H1' || currentMatter !== 'main' || firstMainChapter !== null) return;
      firstMainChapter = chapterPage(element);
    });
    if (firstMainChapter !== null) mainStartPage = firstMainChapter;
    // Find the first chapter after the explicit mainmatter marker in DOM
    // order.  This is more reliable than guessing from chapter page sets when
    // a front-matter chapter and the marker share a page boundary.
    const mainMarker = editable.querySelector('[data-matter-start="main"]');
    if (mainMarker) {
      const nextChapter = [...editable.querySelectorAll('h1')].find(element =>
        Boolean(mainMarker.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (nextChapter) {
        mainStartPage = chapterPage(nextChapter);
      }
    }
    if (hasFrontmatterMarker) page.dataset.frontmatter = 'true';
    if (mainStartPage === null) delete page.dataset.mainStart;
    else page.dataset.mainStart = String(mainStartPage);
    if (backStartPage === null) delete page.dataset.backStart;
    else page.dataset.backStart = String(backStartPage);
    page.dataset.hasBackmatter = String(backStartPage !== null);
    const frontmatter = page.dataset.frontmatter === 'true';
    // Keep layout metadata off the contenteditable headings: writing data
    // attributes there makes ProseMirror re-observe the control during every
    // pagination pass and can detach a paragraph mid-click.
    const stackHeight = plan.pageCount * pageHeight + (plan.pageCount - 1) * pageGap;
    const editorTop = unscaledRect(editable, pageRect, zoom).top;
    const lastBodyBottom = (plan.pageCount - 1) * pitch + pageHeight - marginBottom;
    page.style.setProperty('--page-stack-height', `${stackHeight}px`);
    page.style.setProperty('--editor-min-height', `${Math.max(0, lastBodyBottom - editorTop)}px`);
    page.dataset.pageCount = String(plan.pageCount);
    renderSheets(plan.pageCount);
    renderTableHeaders(tablePlans, blocks);
    delete page.dataset.paginationMeasuring;
    if (layoutPass >= 2) settleLayout();
    // A document change (or a fresh width) resets layoutPass to 1. Always run
    // one verification pass instead of waiting for a ResizeObserver callback:
    // when the applied plan does not change any measured size there is no
    // callback, and the layout would otherwise stay unsettled until an
    // unrelated decoration re-render forced the second pass.
    if (layoutPass === 1) schedule();
    restoreScroll();
    lastLayoutDoc = editor.state.doc;
    window.dispatchEvent(new CustomEvent('lineae-layout'));
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(layout);
  }
  function repaginate() {
    settled = false;
    layoutPass = 0;
    schedule();
  }

  const measured = new WeakMap();
  function onResize(entries) {
    // CSS zoom changes reported sizes without changing the logical layout.
    // Compare rendered sizes normalized by the page zoom so zooming the page
    // does not schedule redundant pagination.
    const zoom=page.offsetWidth?page.getBoundingClientRect().width/page.offsetWidth:1;
    const scale=zoom||1;
    for (const {target} of entries) {
      // A hidden preview reports zero dimensions. Retain its last visible
      // dimensions so showing the same page does not invalidate pagination.
      if (!target.getClientRects().length) continue;
      const rect=target.getBoundingClientRect();
      const next={width:rect.width/scale,height:rect.height/scale};
      const previous=measured.get(target);
      measured.set(target,next);
      const widthChanged=previous?Math.abs(previous.width-next.width)>.5:false;
      const changed=widthChanged||(previous?Math.abs(previous.height-next.height)>.5:true);
      if (settled) {
        // Our own gaps/translations change heights, and ProseMirror recreates
        // decoration widgets (table captions, page-break markers) while the
        // selection or hover moves. A newly observed node has no previous box,
        // so it must not be mistaken for a width change. Only a real width
        // change of an already measured box (resize/zoom) warrants a fresh
        // pagination; document changes arrive through the mutation observer.
        if (!widthChanged) continue;
        settled = false;
        layoutPass = 0;
      }
      if (deferredLayout || changed) schedule();
    }
  }
  function seedMeasuredSizes() {
    const zoom=page.offsetWidth?page.getBoundingClientRect().width/page.offsetWidth:1;
    const scale=zoom||1;
    for(const target of [editable,meta,...editable.children]){
      if(!target.getClientRects().length)continue;
      const rect=target.getBoundingClientRect();
      measured.set(target,{width:rect.width/scale,height:rect.height/scale});
    }
  }
  function settleLayout() {
    if (settled) return;
    settled = true;
    seedMeasuredSizes();
  }
  const resize = new ResizeObserver(onResize);
  resize.observe(editable);
  resize.observe(meta);
  // MathLive mounts and measures inside a shadow root, so the editor's own
  // border box can stay at its minimum height while a paragraph grows.
  const childResize = new ResizeObserver(onResize);
  const observeChildren = () => {
    for (const child of editable.children) childResize.observe(child);
  };
  observeChildren();
  const mutations = new MutationObserver(() => {
    observeChildren();
    // Decoration-only updates (selection marks, table/cell classes) mutate the
    // DOM without changing the document; re-paginating for them makes layout
    // depend on selection and jumps the page. Real layout changes still arrive
    // through the document version or the resize observers.
    if (editor.state.doc !== lastLayoutDoc) {
      settled = false;
      layoutPass = 0;
      schedule();
    }
  });
  mutations.observe(editable, { subtree: true, childList: true, characterData: true });
  mutations.observe(meta, { subtree: true, childList: true, characterData: true });
  document.fonts?.addEventListener('loadingdone', repaginate);

  return {
    setEngine(next) {
      paragraphLayout.setProfile(next);
      if (next) {
        engineProfile=next;
        applyProfile(paragraphPreamble);
      } else reportCjkPrecision?.(null);
      schedule();
    },
    update(preamble) {
      applyProfile(preamble);
      repaginate();
    },
    refresh: repaginate,
    setMaketitle(value) {
      const next = Boolean(value);
      if (next !== maketitle) {
        maketitle = next;
        sheetCount = 0;
      }
      repaginate();
    },
    getMode: () => mode,
    getTableContinuation: () => continuedTables,
    setTableContinuation(enabled) {
      continuedTables = Boolean(enabled);
      repaginate();
      return continuedTables;
    },
    setMode(next) {
      mode = next === 'flow' ? 'flow' : 'pages';
      repaginate();
      return mode;
    },
    toggle() {
      return this.setMode(mode === 'pages' ? 'flow' : 'pages');
    },
  };
}
