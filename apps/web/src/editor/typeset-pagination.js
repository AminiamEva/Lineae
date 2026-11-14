import { planPagination, planTableRows, typesetProfile } from '../../latex/typeset-layout.mjs';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const lineBreakKey = new PluginKey('lineaePaginationLineBreaks');
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
  if (!element.textContent || block.height < (parseFloat(getComputedStyle(element).lineHeight) || 0) * 1.5) return null;
  let from, to;
  try {
    from = editor.view.posAtDOM(element, 0);
    to = editor.view.posAtDOM(element, element.childNodes.length);
  } catch {
    return null;
  }
  if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from) return null;
  const topAt = position => {
    try { return (editor.view.coordsAtPos(position, 1).top - pageRect.top) / zoom; }
    catch { return Number.NaN; }
  };
  const firstTop = topAt(from);
  if (!Number.isFinite(firstTop)) return null;
  const starts = [{ position:from, top:firstTop }];
  let cursor = from;
  while (cursor < to) {
    const currentTop = starts.at(-1).top;
    let high = Math.min(to, cursor + 16);
    while (high < to && topAt(high) <= currentTop + 1) {
      high = Math.min(to, cursor + (high - cursor) * 2);
    }
    if (topAt(high) <= currentTop + 1) break;
    let low = cursor + 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (topAt(middle) > currentTop + 1) high = middle;
      else low = middle + 1;
    }
    const position = nextGraphemePosition(editor, low);
    const top = topAt(position);
    if (!Number.isFinite(top) || top <= currentTop + 1) break;
    starts.push({ position, top });
    cursor = position;
  }
  if (starts.length < 2) return null;
  const bottom = block.top + block.height;
  return starts.map((line, index) => ({
    ...line,
    height: Math.max(1, (starts[index + 1]?.top ?? bottom) - line.top),
  }));
}

export function installTypesetPagination(page, paper, meta, editor) {
  const editable = paper.querySelector('.ProseMirror');
  const sheets = document.createElement('div');
  sheets.className = 'document-sheets';
  sheets.setAttribute('aria-hidden', 'true');
  page.prepend(sheets);

  const paginationStyle = document.createElement('style');
  paginationStyle.dataset.lineaePagination = '';
  document.head.append(paginationStyle);

  let frame = 0;
  let profile = typesetProfile();
  let lineBreaks = [];
  installLineBreaks(editor);

  function setLineBreaks(entries) {
    const same = entries.length === lineBreaks.length && entries.every((entry, index) =>
      entry.position === lineBreaks[index].position && Math.abs(entry.height - lineBreaks[index].height) < .01);
    if (same) return;
    lineBreaks = entries;
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

  function tableMeta(wrapper, pageRect, zoom) {
    const table = wrapper.querySelector('table');
    if (!table?.rows.length) return null;
    const wrapperRect = wrapper.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const rowRect = row => row.getBoundingClientRect();
    return {
      rows: [...table.rows].map(row => {
        const rect = rowRect(row);
        return {
          top: (rect.top - tableRect.top) / zoom,
          height: rect.height / zoom,
        };
      }),
      headerHeight: rowRect(table.rows[0]).height / zoom,
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

  function renderSheets(count) {
    if (count === sheetCount) return;
    sheets.replaceChildren(...Array.from({ length: count }, (_, index) => {
      const sheet = document.createElement('div');
      sheet.className = 'document-sheet';
      const number = document.createElement('span');
      number.className = 'document-page-number';
      number.textContent = String(index + 1);
      sheet.append(number);
      return sheet;
    }));
    sheetCount = count;
  }

  function applyProfile(preamble) {
    profile = typesetProfile(preamble);
    page.dataset.documentClass = profile.className;
    page.dataset.pageStyle = profile.pageStyle;
    page.style.setProperty('--tex-font-size', profile.fontSize);
    page.style.setProperty('--tex-line-height', profile.lineHeight);
    page.style.setProperty('--tex-paragraph-indent', profile.paragraphIndent);
    const quote = name => '"' + String(name).replaceAll('"', '') + '"';
    const stack = (...names) => names.filter(Boolean).map(quote).join(',');
    const fonts = profile.fonts ?? {};
    page.style.setProperty('--tex-font-family', fonts.serif
      ? stack(fonts.serif, 'Latin Modern Roman') : '"Latin Modern Roman"');
    page.style.setProperty('--tex-heading-font-family', fonts.serif
      ? stack(fonts.serif, 'Latin Modern Roman 12', 'Latin Modern Roman')
      : '"Latin Modern Roman 12","Latin Modern Roman"');
    page.style.setProperty('--tex-cjk-font-family', fonts.cjk
      ? stack(fonts.cjk, 'Songti SC', 'SimSun') : '"Songti SC",SimSun');
    page.style.setProperty('--tex-mono-font-family', fonts.mono
      ? stack(fonts.mono, 'Latin Modern Mono') : '"Latin Modern Mono"');
  }

  function layoutFlow() {
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
    window.dispatchEvent(new CustomEvent('lineae-layout'));
  }

  function layout() {
    frame = 0;
    if (page.hidden || !editable.isConnected) return;
    const emptyMeta = !meta.textContent.trim();
    meta.dataset.empty = String(emptyMeta);
    page.dataset.pagination = mode;
    if (mode === 'flow') {
      layoutFlow();
      return;
    }
    paginationStyle.textContent = '';
    translations = [];
    page.dataset.paginationMeasuring = '';
    clearHeaderClones();
    renderSheets(1);

    const pageRect = page.getBoundingClientRect();
    const zoom = pageRect.width / page.offsetWidth || 1;
    const computed = getComputedStyle(page);
    const pageHeight = sheets.firstElementChild.offsetHeight;
    const pageGap = parseFloat(computed.getPropertyValue('--page-gap')) || 0;
    const marginTop = parseFloat(computed.paddingTop);
    const marginBottom = parseFloat(computed.paddingBottom);
    const geometry = { pageHeight, pageGap, marginTop, marginBottom };
    const children = [...editable.children];
    const blocks = children.map((element, index) => {
      const rect = unscaledRect(element, pageRect, zoom);
      const block = {
        top: rect.top,
        height: element.tagName === 'P' && !element.textContent ? 0 : rect.height,
        keepWithNext: /^H[1-3]$/.test(element.tagName),
        keepWithPrevious: element.matches('.math-display'),
        table: element.matches('.tableWrapper') ? tableMeta(element, pageRect, zoom) : null,
      };
      block.lines = element.tagName === 'P' ? paragraphLines(editor, element, block, pageRect, zoom) : null;
      return block;
    });

    const virtual = [];
    const blockItems = blocks.map((block, blockIndex) => {
      const items = [];
      if (block.lines) {
        block.lines.forEach((line, lineIndex) => {
          items.push(virtual.length);
          virtual.push({
            top: line.top,
            height: line.height,
            blockIndex,
            lineIndex,
            position: line.position,
            keepWithNext: lineIndex === 0 || lineIndex === block.lines.length - 2,
            keepWithPrevious: lineIndex === 1,
          });
        });
      } else {
        items.push(virtual.length);
        virtual.push({ ...block, blockIndex });
      }
      return items;
    });

    let plan = planPagination(virtual, geometry);
    let tablePlans = new Map();
    for (let pass = 0; pass < 3; pass++) {
      const sized = virtual.map(item => {
        const extra = tablePlans.get(item.blockIndex)?.extra ?? 0;
        return extra && blocks[item.blockIndex].table ? { ...item, height:item.height + extra } : item;
      });
      plan = planPagination(sized, geometry);
      const next = new Map();
      let changed = false;
      if (continuedTables) {
        for (let index = 0; index < blocks.length; index++) {
          const block = blocks[index];
          if (!block.table) continue;
          const rows = planTableRows(block.table.rows, {
            ...geometry,
            top: block.top + plan.translations[blockItems[index][0]] + block.table.tableTop,
            headerHeight: block.table.headerHeight,
            repeatHeader: true,
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
    const rules = translations.map((distance, index) => distance > .01
      ? `.document-page .ProseMirror > :nth-child(${index + 1}){translate:0 ${distance.toFixed(3)}px}`
      : '').filter(Boolean);
    for (const [index, tablePlan] of tablePlans) {
      for (const entry of tablePlan.breaks) {
        rules.push(`.document-page .ProseMirror > :nth-child(${index + 1}) > table > tbody > tr:nth-child(${entry.row + 1}) > :is(td,th){padding-top:${entry.padding.toFixed(3)}px}`);
      }
    }
    paginationStyle.textContent = rules.join('\n');

    const pitch = pageHeight + pageGap;
    const stackHeight = plan.pageCount * pageHeight + (plan.pageCount - 1) * pageGap;
    const editorTop = unscaledRect(editable, pageRect, zoom).top;
    const lastBodyBottom = (plan.pageCount - 1) * pitch + pageHeight - marginBottom;
    page.style.setProperty('--page-stack-height', `${stackHeight}px`);
    page.style.setProperty('--editor-min-height', `${Math.max(0, lastBodyBottom - editorTop)}px`);
    page.dataset.pageCount = String(plan.pageCount);
    renderSheets(plan.pageCount);
    renderTableHeaders(tablePlans, blocks);
    delete page.dataset.paginationMeasuring;
    window.dispatchEvent(new CustomEvent('lineae-layout'));
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(layout);
  }

  const resize = new ResizeObserver(schedule);
  resize.observe(editable);
  resize.observe(meta);
  // MathLive mounts and measures inside a shadow root, so the editor's own
  // border box can stay at its minimum height while a paragraph grows.
  const childResize = new ResizeObserver(schedule);
  const observeChildren = () => {
    for (const child of editable.children) childResize.observe(child);
  };
  observeChildren();
  const mutations = new MutationObserver(() => {
    observeChildren();
    schedule();
  });
  mutations.observe(editable, { subtree: true, childList: true, characterData: true });
  mutations.observe(meta, { subtree: true, childList: true, characterData: true });
  mutations.observe(page, { attributes: true, attributeFilter: ['hidden'] });
  document.fonts?.addEventListener('loadingdone', schedule);

  return {
    update(preamble) {
      applyProfile(preamble);
      schedule();
    },
    refresh: schedule,
    getMode: () => mode,
    getTableContinuation: () => continuedTables,
    setTableContinuation(enabled) {
      continuedTables = Boolean(enabled);
      schedule();
      return continuedTables;
    },
    setMode(next) {
      mode = next === 'flow' ? 'flow' : 'pages';
      schedule();
      return mode;
    },
    toggle() {
      return this.setMode(mode === 'pages' ? 'flow' : 'pages');
    },
  };
}
