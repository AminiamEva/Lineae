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
  const row = document.createElement('div');
  row.className = 'document-find-row';
  const replacement = document.createElement('input');
  replacement.type = 'search';
  const replace = document.createElement('button');
  replace.type = 'button';
  replace.dataset.action = 'replace';
  const replaceAll = document.createElement('button');
  replaceAll.type = 'button';
  replaceAll.dataset.action = 'replace-all';
  row.append(replacement, replace, replaceAll);
  panel.append(input, status, previous, next, close, row);
  document.body.append(panel);

  function collect(query) {
    const matches = [];
    if (!query) return matches;
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
    return matches;
  }

  function find(direction, restart = false) {
    const query = input.value;
    const matches = collect(query);
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

  function replaceOne() {
    const query = input.value;
    if (!query) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '', '\uFFFC');
    if (selected.toLocaleLowerCase() !== query.toLocaleLowerCase()) {
      find(1);
      return;
    }
    editor.chain().focus().insertContentAt({ from, to }, replacement.value).run();
    find(1);
  }

  function replaceEvery() {
    const query = input.value;
    const matches = collect(query);
    if (!matches.length) {
      status.textContent = query ? t('无匹配','No matches') : '';
      return;
    }
    let transaction = editor.state.tr;
    for (const match of matches.reverse()) {
      transaction = transaction.insertText(replacement.value, match.from, match.to);
    }
    editor.view.dispatch(transaction);
    status.textContent = t('已全部替换','All replaced');
  }

  function dismiss() { panel.hidden = true; editor.view.focus(); }
  panel.addEventListener('submit', event => {
    event.preventDefault();
    if (document.activeElement === replacement) replaceOne();
    else find(1);
  });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); find(-1); }
  });
  input.addEventListener('input', () => find(1, true));
  replacement.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); replaceOne(); }
  });
  previous.addEventListener('click', () => find(-1));
  replace.addEventListener('click', replaceOne);
  replaceAll.addEventListener('click', replaceEvery);
  close.addEventListener('click', dismiss);
  document.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f') return;
    if (!editor.view.hasFocus() && !panel.contains(event.target)) return;
    if (event.composedPath().some(node => node?.tagName === 'MATH-FIELD')) return;
    event.preventDefault();
    const findLabel = t('查找正文','Find in document');
    input.setAttribute('aria-label', findLabel);
    input.placeholder = findLabel;
    replacement.setAttribute('aria-label', t('替换为','Replace with'));
    replacement.placeholder = t('替换为','Replace with');
    replace.textContent = t('替换','Replace');
    replaceAll.textContent = t('全部替换','Replace all');
    previous.setAttribute('aria-label', t('上一处','Previous match'));
    next.setAttribute('aria-label', t('下一处','Next match'));
    close.setAttribute('aria-label', t('关闭查找','Close find'));
    panel.hidden = false;
    input.focus();
    input.select();
  }, true);
}
