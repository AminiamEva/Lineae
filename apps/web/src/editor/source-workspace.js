import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { search, searchKeymap, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { icon } from './icons.js';
import { t } from '../ui/i18n.mjs';

const latex = StreamLanguage.define({
  ...stex,
  token(stream, state) {
    const style = stex.token(stream, state);
    return /^\\(?:begin|end)$/.test(stream.current()) ? 'environmentCommand' : style;
  },
  tokenTable: {...stex.tokenTable, environmentCommand: tags.special(tags.keyword)},
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.tagName, tags.macroName], color: 'var(--tex-command)' },
  { tag: [tags.atom, tags.special(tags.keyword)], color: 'var(--tex-environment)' },
  { tag: [tags.string, tags.attributeName], color: 'var(--tex-argument)' },
  { tag: [tags.number, tags.operator, tags.special(tags.string)], color: 'var(--tex-math)' },
  { tag: tags.comment, color: 'var(--tex-comment)', fontStyle: 'italic' },
]);

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export function createSourceWorkspace({ page, render, metadata }) {
  const lifecycle = new AbortController();
  const panel = element('section', 'tex-workspace');
  panel.hidden = true;
  const head = element('div', 'tex-head');
  const filename = element('strong', 'tex-filename');
  const dirty = element('span', 'tex-dirty');
  const actions = element('div', 'tex-actions');
  const body = element('div', 'tex-body');
  const code = element('div', 'tex-code');
  const divider = element('div', 'tex-divider');
  const preview = element('div', 'tex-preview');
  preview.tabIndex = 0;
  preview.setAttribute('role', 'region');
  const foot = element('div', 'tex-foot');
  const position = element('span', 'tex-position');
  const message = element('span', 'tex-message');
  message.setAttribute('role', 'status');
  const format = element('span', 'tex-format');
  format.textContent = 'LaTeX  ·  UTF-8';
  head.append(icon('sourceFile'), filename, dirty, actions);
  body.append(code, divider, preview);
  foot.append(position, message, format);
  panel.append(head, body, foot);
  const anchor = document.createComment('document page');
  page.before(anchor);
  page.after(panel);

  const language = new Compartment();
  let interfaceLanguage;
  function phrases() {
    return EditorState.phrases.of(t({
      'Find': '查找', 'Replace': '替换', 'next': '下一处', 'previous': '上一处',
      'all': '全选匹配', 'match case': '区分大小写', 'regexp': '正则表达式',
      'by word': '整词', 'replace': '替换', 'replace all': '全部替换',
      'close': '关闭', 'current match': '当前匹配',
    }, {}));
  }
  let view, original, timer, scrollTop = 0, scrollLeft = 0;
  let lineEnding = "\n";
  let savedText, savedDoc;
  let lastRendered, expanded = false, previewOnly = false;
  const wide = matchMedia('(min-width: 900px)');
  const buttons = [];
  function action(glyph, label, run, className = '') {
    const button = element('button', className);
    button.type = 'button';
    button.append(icon(glyph));
    button.addEventListener('click', run, {signal:lifecycle.signal});
    actions.append(button);
    buttons.push([button, label]);
    return button;
  }
  const previewButton = action('documentPreview', () => previewOnly ? t('返回源码','Show source') : t('文档预览','Document preview'), () => {
    previewOnly = !previewOnly;
    layout();
    if (previewOnly) preview.focus();
    else focus();
  }, 'tex-preview-toggle');
  action('sourceFind', () => t('查找与替换','Find and replace'), () => {
    previewOnly = false;
    layout();
    openSearchPanel(view);
  });
  action('copy', () => t('复制源码','Copy source'), async () => {
    try {
      await navigator.clipboard.writeText(value());
      message.textContent = t('已复制','Copied');
    } catch { message.textContent = t('复制失败，请使用键盘复制','Copy failed. Use the keyboard to copy.'); }
  });
  const expandButton = action('sourceExpand', () => expanded ? t('收起工作区','Collapse workspace') : t('展开工作区','Expand workspace'), () => setExpanded(!expanded));

  let initialDoc, initialText;
  function value() {
    if (!view) return '';
    if (original !== undefined) return original;
    if (initialDoc && view.state.doc.eq(initialDoc)) return initialText;
    return view.state.doc.sliceString(0, view.state.doc.length, lineEnding);
  }
  function refresh() {
    if (panel.hidden || !view) return;
    const { name, saved } = metadata();
    filename.textContent = name;
    preview.setAttribute('aria-label', t('文档预览','Document preview'));
    if (savedText !== saved) {
      savedText = saved;
      savedDoc = view.state.toText(saved.replace(/\r\n?/g, '\n'));
    }
    dirty.hidden = original !== undefined ? original === saved : view.state.doc.eq(savedDoc);
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    position.textContent = t('行','Ln') + ' ' + line.number + '   ' + t('列','Col') + ' ' + (cursor - line.from + 1);
    for (const [button, label] of buttons) {
      button.title = label();
      button.setAttribute('aria-label', button.title);
    }
    dirty.title = t('有未保存的修改','Unsaved changes');
    dirty.setAttribute('aria-label', dirty.title);
  }
  function updatePreview() {
    clearTimeout(timer);
    if (!expanded || panel.hidden || (!wide.matches && !previewOnly)) return;
    const text = value();
    if (text === lastRendered) { message.textContent = ''; return; }
    try {
      render(text);
      lastRendered = text;
      message.textContent = '';
    } catch (err) { message.textContent = err.message; }
  }
  function layout() {
    panel.classList.toggle('is-expanded', expanded);
    panel.classList.toggle('preview-only', expanded && !wide.matches && previewOnly);
    previewButton.hidden = !expanded || wide.matches;
    previewButton.setAttribute('aria-pressed', String(!wide.matches && previewOnly));
    expandButton.setAttribute('aria-expanded', String(expanded));
    expandButton.replaceChildren(icon(expanded ? 'sourceCollapse' : 'sourceExpand'));
    updatePreview();
    refresh();
    view?.requestMeasure();
  }
  function setExpanded(next) {
    expanded = next;
    previewOnly = false;
    if (next) {
      preview.append(page);
      page.hidden = false;
      page.inert = true;

    } else {
      page.hidden = true;
      page.inert = false;
      anchor.after(page);
    }
    layout();
    focus();
  }
  wide.addEventListener('change', layout, {signal:lifecycle.signal});
  document.addEventListener('keydown', e => {
    if (panel.hidden || e.key !== 'Escape' || e.defaultPrevented || (!expanded && !panel.contains(e.target))) return;
    if (closeSearchPanel(view)) { e.preventDefault(); focus(); }
    else if (expanded) { e.preventDefault(); setExpanded(false); }
  }, {signal:lifecycle.signal});
  let ratio = 45;
  function setRatio(n) {
    ratio = Math.max(25, Math.min(75, n));
    panel.style.setProperty('--tex-split', ratio + '%');
    divider.setAttribute('aria-valuenow', String(Math.round(ratio)));
  }
  divider.tabIndex = 0;
  divider.setAttribute('role','separator');
  divider.setAttribute('aria-label','LaTeX / Preview');
  divider.setAttribute('aria-orientation','vertical');
  divider.setAttribute('aria-valuemin','25');
  divider.setAttribute('aria-valuemax','75');
  setRatio(45);
  divider.onpointerdown = e => { divider.setPointerCapture(e.pointerId); e.preventDefault(); };
  divider.onpointermove = e => {
    if (!divider.hasPointerCapture(e.pointerId)) return;
    const box = body.getBoundingClientRect();
    setRatio((e.clientX - box.left) * 100 / box.width);
  };
  divider.onkeydown = e => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault();
    setRatio(e.key === 'Home' ? 25 : e.key === 'End' ? 75 : ratio + (e.key === 'ArrowRight' ? 2 : -2));
  };

  function replace(text, reset = false) {
    if (view && !reset && value() === text) return;
    original = text;
    lineEnding = text.match(/\r\n|\r|\n/)?.[0] ?? '\n';
    const state = EditorState.create({
      doc: text.replace(/\r\n?/g, '\n'),
      extensions: [

        language.of(phrases()), lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
        EditorState.allowMultipleSelections.of(true), history(), search({top:true}),
        indentOnInput(), bracketMatching(), latex, syntaxHighlighting(highlight),
        EditorView.lineWrapping, keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
        EditorView.contentAttributes.of({'aria-label':'LaTeX', spellcheck:'false'}),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            original = undefined;
            message.textContent = '';
            clearTimeout(timer);
            timer = setTimeout(updatePreview, 240);
          }
          if (update.docChanged || update.selectionSet) refresh();
        }),
      ],
    });
    initialDoc = state.doc;
    initialText = text;
    if (view) view.setState(state);
    else view = new EditorView({state, parent:code});
    scrollTop = scrollLeft = 0;
    refresh();
  }
  function focus() { view?.focus(); }
  let pageState;
  function restorePage() {
    if (!pageState) return;
    if (page.parentNode === preview) anchor.after(page);
    if (pageState.hidden === null) page.removeAttribute('hidden');
    else page.setAttribute('hidden', pageState.hidden);
    page.inert = pageState.inert;
    pageState = undefined;
  }
  function destroy() {
    if (lifecycle.signal.aborted) return;
    clearTimeout(timer);
    lifecycle.abort();
    restorePage();
    view?.destroy();
    view = undefined;
    panel.remove();
    anchor.remove();
  }
  window.addEventListener('pagehide', event => {
    if (!event.persisted) destroy();
  }, {signal:lifecycle.signal});
  return {
    destroy,
    get hidden() { return panel.hidden; },
    get value() { return value(); },
    open(text) {
      if (lifecycle.signal.aborted) return;
      pageState ??= {hidden:page.getAttribute('hidden'), inert:page.inert};
      panel.hidden = false;
      replace(text);
      page.hidden = true;
      lastRendered = text;
      message.textContent = '';
      layout();
      focus();
      view.scrollDOM.scrollTo(scrollLeft, scrollTop);
    },
    close() {
      if (panel.hidden || lifecycle.signal.aborted) return;
      clearTimeout(timer);
      scrollTop = view.scrollDOM.scrollTop;
      scrollLeft = view.scrollDOM.scrollLeft;
      if (expanded) setExpanded(false);
      panel.hidden = true;
      restorePage();
    },
    reset(text) { if (!lifecycle.signal.aborted) { lastRendered = text; replace(text, true); } },
    select(from, to) {
      const offset = pos => value().slice(0,pos).replace(/\r\n?/g,'\n').length;
      view.dispatch({selection:{anchor:offset(from), head:offset(to)},scrollIntoView:true});
      focus();
    },
    refresh() {
      const next = document.documentElement.lang;
      if (view && next !== interfaceLanguage) {
        interfaceLanguage = next;
        view.dispatch({effects:language.reconfigure(phrases())});
      }
      refresh();
    },
    error(text) { message.textContent = text; },
  };
}
