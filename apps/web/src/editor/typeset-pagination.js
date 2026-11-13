import { planPagination, typesetProfile } from '../../latex/typeset-layout.mjs';

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
    renderSheets(1);

    const pageRect = page.getBoundingClientRect();
    const zoom = pageRect.width / page.offsetWidth || 1;
    const computed = getComputedStyle(page);
    const pageHeight = sheets.firstElementChild.offsetHeight;
    const pageGap = parseFloat(computed.getPropertyValue('--page-gap')) || 0;
    const marginTop = parseFloat(computed.paddingTop);
    const marginBottom = parseFloat(computed.paddingBottom);
    const children = [...editable.children];
    const blocks = children.map((element, index) => {
      const rect = unscaledRect(element, pageRect, zoom);
      return {
        top: rect.top - (translations[index] ?? 0),
        height: element.tagName === 'P' && !element.textContent ? 0 : rect.height,
        keepWithNext: /^H[1-3]$/.test(element.tagName),
      };
    });
    const plan = planPagination(blocks, { pageHeight, pageGap, marginTop, marginBottom });
    translations = plan.translations;

    paginationStyle.textContent = translations.map((distance, index) => distance > .01
      ? `.document-page .ProseMirror > :nth-child(${index + 1}){translate:0 ${distance.toFixed(3)}px}`
      : '').filter(Boolean).join('\n');

    const pitch = pageHeight + pageGap;
    const stackHeight = plan.pageCount * pageHeight + (plan.pageCount - 1) * pageGap;
    const editorTop = unscaledRect(editable, pageRect, zoom).top;
    const lastBodyBottom = (plan.pageCount - 1) * pitch + pageHeight - marginBottom;
    page.style.setProperty('--page-stack-height', `${stackHeight}px`);
    page.style.setProperty('--editor-min-height', `${Math.max(0, lastBodyBottom - editorTop)}px`);
    page.dataset.pageCount = String(plan.pageCount);
    renderSheets(plan.pageCount);
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
