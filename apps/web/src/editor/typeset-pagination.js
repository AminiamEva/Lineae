import { planPagination, planTableRows, typesetProfile } from '../../latex/typeset-layout.mjs';

function unscaledRect(element, pageRect, zoom) {
  const rect = element.getBoundingClientRect();
  return {
    top: (rect.top - pageRect.top) / zoom,
    height: rect.height / zoom,
  };
}

export function installTypesetPagination(page, paper, meta) {
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
  }

  function layoutFlow() {
    paginationStyle.textContent = '';
    translations = [];
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
      return {
        top: rect.top,
        height: element.tagName === 'P' && !element.textContent ? 0 : rect.height,
        keepWithNext: /^H[1-3]$/.test(element.tagName),
        table: element.matches('.tableWrapper') ? tableMeta(element, pageRect, zoom) : null,
      };
    });

    let plan = planPagination(blocks, geometry);
    let tablePlans = new Map();
    for (let pass = 0; pass < 3; pass++) {
      const sized = blocks.map((block, index) => {
        const extra = tablePlans.get(index)?.extra ?? 0;
        return extra ? { ...block, height:block.height + extra } : block;
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
            top: block.top + plan.translations[index] + block.table.tableTop,
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

    translations = plan.translations;
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
