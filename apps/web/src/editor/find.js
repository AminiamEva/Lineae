import { t } from '../ui/i18n.mjs';

export function installDocumentFind(editor) {
  const panel = document.createElement('form');
  panel.className = 'document-find';
  panel.setAttribute('role', 'search');
  panel.hidden = true;
  const input = document.createElement('input');
  input.type = 'search';
  const status = document.createElement('output');
  status.setAttribute('aria-live', 'polite');
  const next = document.createElement('button');
  next.type = 'submit';
  next.textContent = '↓';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.textContent = '↑';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  panel.append(input, status, previous, next, close);
  document.body.append(panel);

  function find(direction, restart = false) {
    const query = input.value;
    const matches = [];
    if (query) {
      const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
      editor.state.doc.descendants((node, position) => {
        if (!node.isTextblock) return;
        const text = node.textBetween(0, node.content.size, '', '\uFFFC');
        for (const match of text.matchAll(pattern)) {
          const from = position + 1 + match.index;
          matches.push({ from, to: from + match[0].length });
        }
        return false;
      });
    }
    if (!matches.length) {
      status.textContent = query ? t('无匹配','No matches') : '';
      return;
    }
    const { from, to } = editor.state.selection;
    const index = restart ? 0 : direction > 0
      ? matches.findIndex(match => match.from >= to)
      : matches.findLastIndex(match => match.to <= from);
    const current = index < 0 ? (direction > 0 ? 0 : matches.length - 1) : index;
    editor.chain().setTextSelection(matches[current]).scrollIntoView().run();
    status.textContent = `${current + 1} / ${matches.length}`;
  }
  function dismiss() { panel.hidden = true; editor.view.focus(); }
  panel.addEventListener('submit', event => { event.preventDefault(); find(1); });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); find(-1); }
  });
  input.addEventListener('input', () => find(1, true));
  previous.addEventListener('click', () => find(-1));
  close.addEventListener('click', dismiss);
  document.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f') return;
    if (!editor.view.hasFocus() && !panel.contains(event.target)) return;
    if (event.composedPath().some(node => node?.tagName === 'MATH-FIELD')) return;
    event.preventDefault();
    input.setAttribute('aria-label', t('查找正文','Find in document'));
    input.placeholder = t('查找正文','Find in document');
    previous.setAttribute('aria-label', t('上一处','Previous match'));
    next.setAttribute('aria-label', t('下一处','Next match'));
    close.setAttribute('aria-label', t('关闭查找','Close find'));
    panel.hidden = false;
    input.focus();
    input.select();
  }, true);
}
