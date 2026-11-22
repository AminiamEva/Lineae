import {createPreviewControls,labelSourceZoom} from './source-presentation.js';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess, selectAll } from '@codemirror/commands';
import { acceptCompletion, startCompletion, nextSnippetField, prevSnippetField } from '@codemirror/autocomplete';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { search, searchKeymap, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { icon } from './icons.js';
import { t } from '../ui/i18n.mjs';
import { latexAssist, insertLatexSnippet } from './latex-assist.js';
import { undo, redo, undoDepth, redoDepth, isolateHistory } from '@codemirror/commands';
import { preserveSourceEndings, sourceEolExtensions, sourceWithEndings } from './source-eol-state.js';
import { clampFont, FONT_DEFAULT, FONT_MIN, FONT_MAX, installFontWheel } from './editor-font.mjs';

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

export function createSourceWorkspace({ page, render, metadata, previewRange, sourceRange, onChange = () => {}, onLayout = () => {}, onPreviewZoom = () => {}, getPreferences = () => null, onSourceFontChange = () => {}, configurableKeys = false }) {
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
  const indentOnSave=()=>getPreferences()?.editing.indentOnSave??true;
  head.append(icon('sourceFile'), filename, dirty, actions);
  body.append(code, divider, preview);
  foot.append(position, message);
  foot.hidden=true;
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
  function syncInterfaceLanguage() {
    if (!view) return;
    const next = document.documentElement.lang;
    if (next === interfaceLanguage) return;
    view.dispatch({effects:language.reconfigure(phrases())});
    interfaceLanguage = next;
  }
  let savedText, savedDoc;
  let lastRendered, expanded = false, previewOnly = false, receiving = false;
  let sourceScroll, previewScroll, alignFrame;
  const syncVisible = () => expanded && preview.clientHeight && view?.scrollDOM.clientHeight;
  function alignPreview(offset, followCursor = false) {
    if (!syncVisible() || lastRendered === undefined) return;
    const range = previewRange?.(offset, lastRendered);
    if (!range) return;
    const [top, bottom] = range;
    const viewport = preview.getBoundingClientRect();
    if (followCursor && top < viewport.bottom - 24 && bottom > viewport.top + 24) return;
    preview.scrollTop += top - viewport.top - 24;
    previewScroll = preview.scrollTop;
  }
  function followSourceCursor() {
    cancelAnimationFrame(alignFrame);
    alignFrame = requestAnimationFrame(() => {
      if (view) alignPreview(view.state.selection.main.head, true);
    });
  }
  code.addEventListener('scroll', event => {
    if (!syncVisible() || event.target !== view.scrollDOM || sourceScroll === view.scrollDOM.scrollTop) return;
    sourceScroll = undefined;
    const y = view.scrollDOM.getBoundingClientRect().top + 24;
    alignPreview(view.lineBlockAtHeight(y - view.documentTop).from);
  }, true);
  preview.addEventListener('scroll', () => {
    if (!syncVisible() || previewScroll === preview.scrollTop || lastRendered === undefined) return;
    previewScroll = undefined;
    const offset = sourceRange?.(preview.getBoundingClientRect().top + 24, lastRendered);
    if (offset == null) return;
    const line = view.lineBlockAt(offset);
    view.scrollDOM.scrollTop += view.documentTop + line.top - view.scrollDOM.getBoundingClientRect().top - 24;
    sourceScroll = view.scrollDOM.scrollTop;
  });
  let fontSize = FONT_DEFAULT;
  fontSize=clampFont(getPreferences()?.interface.sourceFontSize??FONT_DEFAULT);
  function updateZoomLabel() { labelSourceZoom(zoomLabel,fontSize); }
  function zoom(size) {
    fontSize = clampFont(size);
    panel.style.setProperty("--tex-font-size", fontSize + "px");
    updateZoomLabel();
    zoomOut.disabled = fontSize === FONT_MIN;
    zoomIn.disabled = fontSize === FONT_MAX;
    onSourceFontChange(fontSize);
    view?.requestMeasure();
    return true;
  }
  const wide = matchMedia('(min-width: 900px)');
  const buttons = [];
  function action(glyph, label, run, className = '') {
    const button = element('button', className);
    button.type = 'button';
    button.append(icon(glyph));
    button.addEventListener('mousedown',event=>event.preventDefault(),{signal:lifecycle.signal});
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
  const zoomOut = action('sourceCollapse', () => t('缩小源码字号 (Ctrl+-)','Decrease code font (Ctrl+-)'), () => zoom(fontSize-1));
  zoomOut.textContent = '−';
  const zoomLabel = element('button', 'tex-zoom-label');
  zoomLabel.type = 'button';
  zoomLabel.addEventListener('click', () => zoom(FONT_DEFAULT), {signal:lifecycle.signal});
  actions.append(zoomLabel);
  const zoomIn = action('sourceExpand', () => t('放大源码字号 (Ctrl++)','Increase code font (Ctrl++)'), () => zoom(fontSize+1));
  zoomIn.textContent = '+';
  zoom(fontSize);
  installFontWheel(code, amount => zoom(fontSize + amount), lifecycle.signal);
  const previewControls=createPreviewControls({panel,head,preview,onChange:onPreviewZoom,
    installWheel:callback=>installFontWheel(preview,callback,lifecycle.signal),signal:lifecycle.signal});
  const richActions=previewControls.element;
  const setPreviewZoom=previewControls.setZoom;
  const expandButton = action('sourceExpand', () => expanded ? t('仅源码','Source only') : t('分栏编辑','Split editing'), () => setExpanded(!expanded));

  function value() {
    if (!view) return '';
    if (original !== undefined) return original;
    return sourceWithEndings(view.state);
  }
  function refresh() {
    const { name, saved } = metadata();
    filename.textContent = name;
    if (panel.hidden || !view) return;
    preview.setAttribute('aria-label', t('文档预览','Document preview'));
    if (savedText !== saved) {
      savedText = saved;
      savedDoc = view.state.toText(saved.replace(/\r\n?/g, '\n'));
    }
    dirty.hidden = original !== undefined ? original === saved : view.state.doc.eq(savedDoc) && value() === saved;
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
    if (panel.hidden || view?.composing) { if (!panel.hidden) timer = setTimeout(updatePreview, 120); return; }
    const text = value();
    if (text === lastRendered) { message.textContent = ''; return; }
    try {
      if (render(text) === false) { timer = setTimeout(updatePreview,120); return; }
      lastRendered = text;
      message.textContent = '';
      if (expanded) followSourceCursor();
    } catch (err) { message.textContent = err.message; }
  }
  function layout() {
    foot.hidden=panel.hidden;
    richActions.hidden=!expanded;
    document.body.classList.toggle('source-workspace-visible',!panel.hidden);
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
    if (expanded === next) return;
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
    onLayout(expanded);
    focus();
    if (expanded) followSourceCursor();
  }
  wide.addEventListener('change', layout, {signal:lifecycle.signal});
  document.addEventListener('keydown', e => {
    if (panel.hidden || e.key !== 'Escape' || e.defaultPrevented || (!expanded && !panel.contains(e.target))) return;
    if (closeSearchPanel(view)) { e.preventDefault(); focus(); }
    else if (expanded) { e.preventDefault(); setExpanded(false); }
  }, {signal:lifecycle.signal});
  let ratio = 50;
  function setRatio(n) {
    ratio = Math.max(25, Math.min(75, n));
    panel.style.setProperty('--tex-split', ratio + '%');
    divider.setAttribute('aria-valuenow', String(Math.round(ratio)));
  }
  divider.tabIndex = 0;
  divider.setAttribute('role','separator');
  divider.setAttribute('aria-label',t('LaTeX / 预览','LaTeX / Preview'));
  divider.setAttribute('aria-orientation','vertical');
  divider.setAttribute('aria-valuemin','25');
  divider.setAttribute('aria-valuemax','75');
  setRatio(50);
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
    if(text.includes('destination/'))console.log('REPLACE',reset,view&&undoDepth(view.state),view&&redoDepth(view.state));
    if (view && !reset && value() === text) return;
    original = text;
    const state = EditorState.create({
      doc: text.replace(/\r\n?/g, '\n'),
      extensions: [
        sourceEolExtensions(text),

        language.of(phrases()), lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
        EditorState.allowMultipleSelections.of(true), history(), search({top:true}),
        indentOnInput(), bracketMatching(), latex, syntaxHighlighting(highlight), latexAssist({configurableKeys}),
        ...(!configurableKeys?[keymap.of([
          {key:'Mod-=',run:()=>zoom(fontSize+1)},{key:'Mod-+',run:()=>zoom(fontSize+1)},
          {key:'Mod--',run:()=>zoom(fontSize-1)},{key:'Mod-0',run:()=>zoom(FONT_DEFAULT)},
          {key:'Mod-h',run:openSearchPanel},
        ])]:[]),
        EditorView.lineWrapping, keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]
          .filter(binding=>!configurableKeys||![openSearchPanel,undo,redo,selectAll].includes(binding.run))),
        EditorView.contentAttributes.of({'aria-label':'LaTeX', spellcheck:'false'}),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            original = undefined;
            message.textContent = '';
            clearTimeout(timer);
            if (!receiving) { onChange(value()); timer = setTimeout(updatePreview, 240); }
          }
          if (update.docChanged || update.selectionSet) {
            refresh();
            if (expanded && !receiving) followSourceCursor();
          }
        }),
      ],
    });
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
    if (!page.hidden) window.scrollTo(pageState.x,pageState.y);
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
    focus,
    captureSession() {
      // Taking a snapshot must not cancel a pending source-to-preview render:
      // save, close confirmation and clicking a resource can keep this file
      // active. Actual file restoration and teardown cancel their old timer.
      return view ? {state:view.state, original, top:view.scrollDOM.scrollTop, left:view.scrollDOM.scrollLeft} : null;
    },
    restoreSession(session, text) {
      clearTimeout(timer);
      if (session && view) { view.setState(session.state); original = session.original; }
      else replace(text, true);
      lastRendered = undefined;
      if (session) { view.scrollDOM.scrollTop = session.top; view.scrollDOM.scrollLeft = session.left; }
      refresh();
      updatePreview();
    },
    mountStatus(footer){footer.prepend(foot);},
    setPreviewZoom,
    get hidden() { return panel.hidden; },
    get split() { return expanded; },
    get composing() { return view?.composing ?? false; },
    get editorView() { return view; },
    get indentOnSave() { return indentOnSave(); },
    configure(){zoom(getPreferences()?.interface.sourceFontSize??FONT_DEFAULT);},
    find() { if(view) openSearchPanel(view); },
    runShortcut(command) {
      if(!view)return false;
      switch(command) {
        case 'find': case 'replace': return openSearchPanel(view);
        case 'undo': {console.log('UNDO BEFORE',undoDepth(view.state),redoDepth(view.state));const done=undo(view);console.log('UNDO AFTER',undoDepth(view.state),redoDepth(view.state));return done;}
        case 'redo': console.log('REDO',undoDepth(view.state),redoDepth(view.state)); return redo(view);
        case 'zoomIn': return zoom(fontSize+1);
        case 'zoomOut': return zoom(fontSize-1);
        case 'zoomReset': return zoom(FONT_DEFAULT);
        case 'indent': return acceptCompletion(view)||nextSnippetField(view)||indentMore(view);
        case 'outdent': return prevSnippetField(view)||indentLess(view);
        case 'complete': return startCompletion(view);
        case 'selectAll': return selectAll(view);
        default: return false;
      }
    },
    setSplit(next) { if (!panel.hidden) setExpanded(next); },
    flush: updatePreview,
    insertLatexSnippet(spec) { if(view) insertLatexSnippet(view, spec); },
    undo() { if(view) undo(view); }, redo() { if(view) redo(view); },
    applyChanges(changes) {
      const current = value();
      const offset = n => current.slice(0,n).replace(/\r\n?/g,"\n").length;
      receiving = true;
      try { view.dispatch({changes:changes.map(c=>({from:offset(c.from),to:offset(c.to),insert:c.insert.replace(/\r\n?/g,"\n")})),annotations:isolateHistory.of("full"),userEvent:"input.rich"}); lastRendered = value(); }
      finally { receiving = false; }
    },
    applySaveFormatting(preamble, changes, input) {
      if (!view || view.composing) return false;
      // Indent offsets refer to the source after any project preamble insertion.
      // Only that insertion can introduce a line ending. Keep its exact bytes.
      view.dispatch({changes:preamble}, {
        sequential:true, changes, effects:preamble.length ? preserveSourceEndings(input) : [],
        annotations:isolateHistory.of('full'), userEvent:'input.indent'
      });
      updatePreview();
      return true;
    },
    get value() { return value(); },
    open(text, mounted = false) {
      if (lifecycle.signal.aborted) return;
      pageState ??= {hidden:page.getAttribute('hidden'), inert:page.inert, x:window.scrollX, y:window.scrollY};
      panel.hidden = false;
      replace(text);
      page.hidden = true;
      lastRendered = mounted ? text : undefined;
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
      foot.hidden=true;
      document.body.classList.remove('source-workspace-visible');
      restorePage();
    },
    reset(text) { if (!lifecycle.signal.aborted) { lastRendered = text; replace(text, true); } },
    select(from, to) {
      const offset = pos => value().slice(0,pos).replace(/\r\n?/g,'\n').length;
      view.dispatch({selection:{anchor:offset(from), head:offset(to)},scrollIntoView:true});
      focus();
    },
    refresh() {
      syncInterfaceLanguage();
      refresh();
    },
    relocalize() {
      syncInterfaceLanguage();
      updateZoomLabel();
      divider.setAttribute('aria-label',t('LaTeX / 预览','LaTeX / Preview'));
      previewControls.relocalize();
      if (!panel.hidden) refresh();
    },
    error(text) { message.textContent = text; },
  };
}
