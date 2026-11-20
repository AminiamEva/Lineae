import { t } from '../ui/i18n.mjs';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

function makePattern(query, {matchCase = false, regex = false, global = true} = {}) {
  if (!query) return null;
  const source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(source, (global ? 'g' : '') + 'u' + (matchCase ? '' : 'i'));
  } catch {
    return null;
  }
}

function collectMatches(doc, query, options = {}) {
  const pattern = makePattern(query, options);
  if (!pattern) return [];
  const matches = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, '', '\uFFFC');
    for (const match of text.matchAll(pattern)) {
      if (!match[0]) continue;
      const from = position + 1 + match.index;
      matches.push({from,to:from + match[0].length,text:match[0],match});
    }
    return false;
  });
  return matches;
}

export function installDocumentFind(editor) {
  let query = '';
  let activeFrom = -1;
  let resultStatus = '';
  let matchCase = false;
  let useRegex = false;
  const options = () => ({matchCase,regex:useRegex});
  const plugin = new Plugin({
    key: new PluginKey('lineaeFind'),
    props: {
      decorations(state) {
        if (!query) return null;
        return DecorationSet.create(state.doc, collectMatches(state.doc, query, options()).map(match =>
          Decoration.inline(match.from, match.to, {
            class: match.from === activeFrom ? 'find-match find-current' : 'find-match',
          })));
      },
    },
  });
  editor.registerPlugin(plugin);
  const refresh = () => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta('lineaeFind', Date.now()));
  };
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
  const toggleRow = document.createElement('div');
  toggleRow.className = 'document-find-options';
  const caseButton = document.createElement('button');
  caseButton.type = 'button';
  caseButton.className = 'document-find-option';
  caseButton.dataset.findOption = 'case';
  caseButton.textContent = 'Aa';
  caseButton.setAttribute('aria-pressed', 'false');
  const regexButton = document.createElement('button');
  regexButton.type = 'button';
  regexButton.className = 'document-find-option';
  regexButton.dataset.findOption = 'regex';
  regexButton.textContent = '.*';
  regexButton.setAttribute('aria-pressed', 'false');
  toggleRow.append(caseButton,regexButton);
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
  panel.append(input, toggleRow, status, previous, next, close, row);
  document.body.append(panel);

  function invalidPattern() {
    return Boolean(query) && !makePattern(query, options());
  }

  function showInvalid() {
    activeFrom = -1;
    resultStatus = 'invalid';
    status.textContent = t('正则表达式无效','Invalid regular expression');
    refresh();
  }

  function find(direction, restart = false) {
    query = input.value;
    if (!query) {
      activeFrom = -1;
      resultStatus = '';
      status.textContent = '';
      refresh();
      return;
    }
    if (invalidPattern()) { showInvalid(); return; }
    const matches = collectMatches(editor.state.doc, query, options());
    if (!matches.length) {
      activeFrom = -1;
      resultStatus = 'none';
      status.textContent = t('无匹配','No matches');
      refresh();
      return;
    }
    const { from, to } = editor.state.selection;
    const index = restart ? 0 : direction > 0
      ? matches.findIndex(match => match.from >= to)
      : matches.findLastIndex(match => match.to <= from);
    const current = index < 0 ? (direction > 0 ? 0 : matches.length - 1) : index;
    activeFrom = matches[current].from;
    resultStatus = '';
    editor.chain().setTextSelection(matches[current]).scrollIntoView().run();
    refresh();
    status.textContent = `${current + 1} / ${matches.length}`;
  }

  function replacementText(matchText) {
    if (!useRegex) return replacement.value;
    const pattern = makePattern(input.value, {...options(),global:false});
    return pattern ? matchText.replace(pattern,replacement.value) : replacement.value;
  }

  function replaceOne() {
    const source = input.value;
    if (!source) return;
    if (invalidPattern()) { showInvalid(); return; }
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '', '\uFFFC');
    const pattern = makePattern(source, {...options(),global:false});
    const match = pattern?.exec(selected);
    if (!match || match[0] !== selected) {
      find(1);
      return;
    }
    editor.chain().focus().insertContentAt({ from, to }, replacementText(selected)).run();
    find(1);
  }

  function replaceEvery() {
    query = input.value;
    if (!query) return;
    if (invalidPattern()) { showInvalid(); return; }
    const matches = collectMatches(editor.state.doc, query, options());
    if (!matches.length) {
      activeFrom = -1;
      resultStatus = 'none';
      status.textContent = t('无匹配','No matches');
      refresh();
      return;
    }
    let transaction = editor.state.tr;
    for (const match of matches.reverse()) {
      transaction = transaction.insertText(replacementText(match.text), match.from, match.to);
    }
    editor.view.dispatch(transaction);
    activeFrom = -1;
    resultStatus = 'all';
    status.textContent = t('已全部替换','All replaced');
    refresh();
  }

  function dismiss() {
    panel.hidden = true;
    query = '';
    activeFrom = -1;
    refresh();
    editor.view.focus();
  }
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
  caseButton.addEventListener('click', () => {
    matchCase = !matchCase;
    caseButton.setAttribute('aria-pressed', String(matchCase));
    find(1, true);
  });
  regexButton.addEventListener('click', () => {
    useRegex = !useRegex;
    regexButton.setAttribute('aria-pressed', String(useRegex));
    find(1, true);
  });
  previous.addEventListener('click', () => find(-1));
  replace.addEventListener('click', replaceOne);
  replaceAll.addEventListener('click', replaceEvery);
  close.addEventListener('click', dismiss);
  function relocalize() {
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
    const caseLabelText = t('区分大小写','Match case');
    const regexLabelText = t('使用正则表达式','Use regular expression');
    caseButton.title = caseLabelText;
    caseButton.setAttribute('aria-label', caseLabelText);
    regexButton.title = regexLabelText;
    regexButton.setAttribute('aria-label', regexLabelText);
    if (resultStatus === 'none') status.textContent = t('无匹配','No matches');
    else if (resultStatus === 'all') status.textContent = t('已全部替换','All replaced');
    else if (resultStatus === 'invalid') status.textContent = t('正则表达式无效','Invalid regular expression');
  }
  function show() {
    relocalize();
    panel.hidden = false;
    input.focus();
    input.select();
  }
  return { panel, show, relocalize };
}
