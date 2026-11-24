// General TikZ studio: code left, real TeX/TikZ SVG right.  The renderer is
// mp-tikz-wasm (LGPL-3.0-or-later), loaded lazily from a local vendor copy.
import { t } from './i18n.mjs';
import { confirmDialog } from '../editor/dialog.js';

let enginePromise = null;
const svgCache = new Map();
let activeTikzPreamble = '';
export function setTikzPreamble(value) { activeTikzPreamble = String(value || ''); }
export function getTikzPreamble() { return activeTikzPreamble; }
function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const load = new Function('url', 'return import(url)');
    const url = new URL('/vendor/mp-tikz-wasm/index.js', location.href).href;
    const mod = await load(url);
    const base = new URL('/vendor/mp-tikz-wasm/bundles/', location.href).href;
    return mod.MetaPost.create({
      bundleBaseUrl: base,
      bundles: [
        'core', 'cm-tfm', 'cm-type1', 'lm-fonts', 'ps-fonts', 'tex-plain',
        'latex-core', 'latex-extra', 'tikz-snapshot', 'luatex',
        'opentype', 'otf-fonts', 'ghostscript', 'classico', 'latex-doc',
      ],
      ghostscript: true,
      ghostscriptBaseUrl: new URL('/vendor/mp-tikz-wasm/ghostscript/', location.href).href,
      worker: false,
      cache: 'indexeddb',
      logLevel: 'error',
      timeoutMs: 120000,
    });
  })().catch(error => { enginePromise = null; throw error; });
  return enginePromise;
}

const SAMPLE_LIBRARIES = String.raw`\usetikzlibrary{arrows.meta}`;
const SAMPLE = String.raw`\begin{tikzpicture}[scale=1]
  \draw[->, thick] (0,0) -- (2,1) node[right] {$x^2$};
  \draw[blue, thick] (0,0) circle (1);
  \node[draw, rounded corners] at (3,1) {TikZ};
\end{tikzpicture}`;

function previewPreamble(preamble) {
  const allowed = /(?:tikz|circuitikz|pgf|pgfplots|amsmath|amsfonts|amssymb|mathtools|xcolor|graphicx)/;
  return preamble
    .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^{}]+\}[^\n]*(?:\r?\n|$)/gm, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .replace(/^\s*\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^{}]*)\}[^\n]*(?:\r?\n|$)/gm, (line, names) =>
      names.split(',').some(name => allowed.test(name.trim())) ? line : '')
    .trim();
}

function needsLuaTex(source) {
  return /\usegdlibrary|graphdrawing|\directlua|\latelua|luacode|fontspec|unicode-math/.test(source);
}

const PREAMBLE_COMMAND = /^\s*\\(?:usepackage|RequirePackage|usetikzlibrary|usegdlibrary|usepgfplotslibrary|usepgflibrary|newcommand|renewcommand|providecommand|DeclareRobustCommand|newenvironment|renewenvironment|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand|DeclareMathOperator|newtheorem|def|gdef|edef|xdef|let|newcounter|newlength|setlength|tikzset|tikzstyle|ctikzset|pgfplotsset|pgfkeys|pgfqkeys|pgfdeclarelayer|pgfsetlayers|colorlet|definecolor|providecolor|DeclareGraphicsExtensions|graphicspath|newfontfamily|setmainfont|setsansfont|setmonofont)\b/;

function braceBalance(text) {
  let depth = 0;
  let escaped = false;
  let comment = false;
  for (const character of text) {
    if (comment) { if (character === '\n') comment = false; continue; }
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === '%') { comment = true; continue; }
    if (character === '{') depth++;
    else if (character === '}') depth--;
  }
  return depth;
}

// Split a fragment into complete preamble declarations and the drawing body.
// A line-based split is not enough for \newcommand: its replacement text is a
// balanced brace group that may span any number of lines.
function splitTikzFragment(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  const body = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!PREAMBLE_COMMAND.test(line)) { body.push(line); continue; }
    const block = [line];
    let balance = braceBalance(line);
    while (balance > 0 && index + 1 < lines.length) {
      index++;
      block.push(lines[index]);
      balance += braceBalance(lines[index]);
    }
    blocks.push(block.join('\n'));
  }
  const preamble = blocks.join('\n').trim();
  return { preamble, blocks, body: body.join('\n').trim() };
}

function macroName(block) {
  let match = /^\s*\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\*?\s*\{?\s*\\([A-Za-z@]+)/m.exec(block);
  if (match) return match[1];
  match = /^\s*\\(?:New|Renew|Provide|Declare)DocumentCommand\s*\{?\s*\\([A-Za-z@]+)/m.exec(block);
  if (match) return match[1];
  match = /^\s*\\(?:def|gdef|edef|xdef)\s*\\([A-Za-z@]+)/m.exec(block);
  if (match) return match[1];
  match = /^\s*\\(?:newenvironment|renewenvironment)\s*\{([^{}]+)\}/m.exec(block);
  return match?.[1] || null;
}

function scanStaging(source) {
  const lines = source.split(/\r?\n/);
  const macros = [];
  const libraries = [];
  for (const match of source.matchAll(/\\usetikzlibrary(?:\[[^\]]*\])?\{([^{}]+)\}/g)) {
    libraries.push(...match[1].split(',').map(item => item.trim()).filter(Boolean));
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!PREAMBLE_COMMAND.test(line)) continue;
    const block = [line];
    let balance = braceBalance(line);
    while (balance > 0 && index + 1 < lines.length) {
      index++;
      block.push(lines[index]);
      balance += braceBalance(lines[index]);
    }
    const name = macroName(block.join('\n'));
    if (name) macros.push({ name, text: block.join('\n'), startLine: index - block.length + 2, endLine: index + 1 });
  }
  return { libraries: [...new Set(libraries)], macros };
}

function markDuplicateLines(textarea, ranges) {
  const shell = textarea.closest('.tikz-studio-code-shell');
  const highlight = shell?.querySelector('.tikz-studio-highlight');
  if (!highlight) return;
  const marked = new Set();
  for (const range of ranges) {
    for (let line = range.startLine; line <= range.endLine; line++) marked.add(line);
  }
  const lines = textarea.value.split(/\r?\n/);
  highlight.replaceChildren();
  lines.forEach((line, index) => {
    const element = document.createElement('span');
    element.className = 'tikz-studio-highlight-line' + (marked.has(index + 1) ? ' duplicate' : '');
    element.textContent = line || ' ';
    highlight.append(element);
  });
  highlight.scrollTop = textarea.scrollTop;
  highlight.scrollLeft = textarea.scrollLeft;
}

function syncHighlightScroll(textarea) {
  const highlight = textarea.closest('.tikz-studio-code-shell')?.querySelector('.tikz-studio-highlight');
  if (!highlight) return;
  highlight.scrollTop = textarea.scrollTop;
  highlight.scrollLeft = textarea.scrollLeft;
}

// Accept a complete standalone document in the code pane and expose its
// preamble declarations and drawing body separately.
function splitStandaloneDocument(source) {
  const text = String(source || '');
  const begin = text.search(/\\begin\{document\}/);
  const end = text.lastIndexOf('\\end{document}');
  if (begin < 0 || end < begin) return null;
  const preamble = text.slice(0, begin)
    .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^{}]+\}[^\n]*(?:\r?\n|$)/gm, '')
    .trim();
  return { preamble, body: text.slice(begin + '\\begin{document}'.length, end).trim() };
}

function tikzDocument(source, figures) {
  if (figures.isCompleteDocument(source)) return { document: source, engine: needsLuaTex(source) ? 'lualatex' : 'auto' };
  const { preamble, body } = splitTikzFragment(source);
  const document = figures.wrapTikz(body, { preamble });
  return { document, engine: needsLuaTex(document) ? 'lualatex' : 'auto' };
}

export async function renderTikz(source, preamble = '') {
  const cacheKey = source + '\0' + preamble;
  if (svgCache.has(cacheKey)) return svgCache.get(cacheKey);
  const engine = await loadEngine();
  const figures = await import(new URL('/vendor/mp-tikz-wasm/figures.js', location.href).href);
  const complete = /\\documentclass|\\bye\b/.test(source);
  const prefix = previewPreamble(preamble);
  const combined = complete || !prefix ? source : `${prefix}\n${source}`;
  const { document, engine: texEngine } = tikzDocument(combined, figures);
  const result = await engine.latex(document, { engine: texEngine });
  const rendered = {
    svg: result.status === 'ok' && result.pages?.length ? result.pages[0] : '',
    status: result.status,
    diagnostics: result.diagnostics || [],
  };
  if (rendered.svg) svgCache.set(cacheKey, rendered);
  return rendered;
}

export function generalTikzPreviewWidget(source, preamble = '', onOpen = null) {
  const root = document.createElement('div');
  root.className = 'tikz-code-preview tikz-general-preview';
  root.textContent = t('TikZ 渲染中…', 'TikZ rendering…');
  if (onOpen) {
    root.title = t('双击编辑 TikZ', 'Double-click to edit TikZ');
    root.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
      onOpen();
    });
  }
  renderTikz(source, preamble).then(result => {
    if (!result.svg) { root.textContent = result.diagnostics?.map(item => item.message).join('\n') || 'TikZ'; return; }
    const svg = document.createElement('div');
    svg.innerHTML = result.svg;
    root.replaceChildren(...svg.childNodes);
    root.classList.add('tikz-general-preview-ready');
  }).catch(error => { root.textContent = String(error?.message || error); });
  return root;
}

const TIKZ_STAGING_PACKAGE = /^(?:tikz|tikz-cd|circuitikz|pgf|pgfplots|amsmath|amsfonts|amssymb|mathtools|xcolor|graphicx|calc|chemfig)$/;
const TIKZ_STAGING_LAYOUT_COMMAND = /^\s*\\(?:geometry|pagestyle|thispagestyle|fancyhf|fancyfoot|fancyhead|fancypagestyle|renewcommand\s*\{\\headrule|renewcommand\s*\{\\footrule)/;

function filterStagingBlock(block) {
  const packageLine = /^(\s*\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{)([^}]*)(\})/;
  const match = packageLine.exec(block);
  if (match) {
    const names = match[2].split(',').map(name => name.trim()).filter(name => TIKZ_STAGING_PACKAGE.test(name));
    return names.length ? match[1] + names.join(',') + match[3] : null;
  }
  if (TIKZ_STAGING_LAYOUT_COMMAND.test(block)) return null;
  return block;
}

export function tikzStagingFromPreamble(preamble = '') {
  const cleaned = String(preamble || '')
    .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^{}]+\}[^\n]*(?:\r?\n|$)/gm, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '');
  return splitTikzFragment(cleaned).blocks.map(filterStagingBlock).filter(Boolean).join('\n');
}

export function openTikzStudio({ onInsert, initialLibraries, initialBody } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'tikz-studio-overlay';
  overlay.innerHTML = `
    <div class="tikz-studio-window" role="dialog" aria-modal="true" aria-label="TikZ">
      <div class="tikz-studio-header">
        <strong>TikZ</strong>
        <span class="tikz-studio-hint">${t('代码实时渲染 · 滚轮缩放', 'Live TeX rendering · wheel to zoom')}</span>
        <span class="tikz-studio-spacer"></span>
        <button type="button" class="tikz-studio-insert">${t('插入', 'Insert')}</button>
        <button type="button" class="tikz-studio-close">${t('退出', 'Exit')}</button>
      </div>
      <div class="tikz-studio-body">
        <div class="tikz-studio-editor">
          <div class="tikz-studio-pane-title">${t('前导声明', 'Preamble declarations')}</div>
          <div class="tikz-studio-code-shell">
            <div class="tikz-studio-highlight" aria-hidden="true"></div>
            <textarea class="tikz-studio-libraries" spellcheck="false" wrap="off" aria-label="TikZ preamble declarations"></textarea>
          </div>
          <div class="tikz-studio-divider" role="separator" aria-orientation="horizontal" tabindex="0"></div>
          <div class="tikz-studio-pane-title">${t('TikZ 图形', 'TikZ picture')}</div>
          <div class="tikz-studio-code-shell">
            <div class="tikz-studio-highlight" aria-hidden="true"></div>
            <textarea class="tikz-studio-code" spellcheck="false" wrap="off" aria-label="TikZ code"></textarea>
          </div>
        </div>
        <div class="tikz-studio-preview-wrap">
          <div class="tikz-studio-preview" aria-live="polite"></div>
          <div class="tikz-studio-status"></div>
        </div>
      </div>
    </div>`;
  document.body.append(overlay);
  const code = overlay.querySelector('.tikz-studio-code');
  const libraries = overlay.querySelector('.tikz-studio-libraries');
  const editor = overlay.querySelector('.tikz-studio-editor');
  const divider = overlay.querySelector('.tikz-studio-divider');
  const preview = overlay.querySelector('.tikz-studio-preview');
  const status = overlay.querySelector('.tikz-studio-status');
  libraries.value = initialLibraries ?? SAMPLE_LIBRARIES;
  code.value = initialBody ?? SAMPLE;
  code.focus();
  const baseCode = code.value;
  const baseLibraries = libraries.value;
  let inserted = false;
  const isDirty = () => code.value !== baseCode || libraries.value !== baseLibraries;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  const applyPreviewTransform = () => {
    preview.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  };
  let version = 0;
  let timer = 0;
  let engine = null;
  let lastSvg = '';

  const setStatus = text => { status.textContent = text || ''; };
  const render = async () => {
    const current = ++version;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const full = splitStandaloneDocument(code.value);
      const source = (full ? [full.preamble, full.body] : [libraries.value, code.value])
        .filter(value => value.trim()).join('\n').trim();
      if (!source) { preview.replaceChildren(); setStatus(''); return; }
      setStatus(t('正在渲染…', 'Rendering…'));
      try {
        const result = await renderTikz(source);
        if (current !== version) return;
        if (!result.svg) {
          lastSvg = '';
          preview.textContent = '';
          setStatus(result.diagnostics?.map(item => item.message).join('\n') || result.status);
          return;
        }
        lastSvg = result.svg;
        preview.innerHTML = lastSvg;
        applyPreviewTransform();
        setStatus(result.diagnostics?.length ? result.diagnostics.map(item => item.message).join('\n') : '');
      } catch (error) {
        if (current !== version) return;
        lastSvg = '';
        preview.textContent = '';
        setStatus(String(error?.message || error));
      }
    }, 350);
  };
  code.addEventListener('input', render);
  libraries.addEventListener('input', () => {
    const highlight = libraries.closest('.tikz-studio-code-shell')?.querySelector('.tikz-studio-highlight');
    highlight?.replaceChildren();
    render();
  });
  for (const textarea of [code, libraries]) {
    textarea.addEventListener('scroll', () => syncHighlightScroll(textarea));
  }

  let dragging = false;
  divider.addEventListener('pointerdown', event => {
    dragging = true;
    divider.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  divider.addEventListener('pointermove', event => {
    if (!dragging) return;
    const rect = editor.getBoundingClientRect();
    const top = Math.max(80, Math.min(event.clientY - rect.top - 28, rect.height - 28 - 7 - 28 - 120));
    editor.style.setProperty('--library-size', `${top}px`);
  });
  const endDrag = () => { dragging = false; };
  divider.addEventListener('pointerup', endDrag);
  divider.addEventListener('pointercancel', endDrag);
  divider.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const current = parseFloat(getComputedStyle(editor).getPropertyValue('--library-size')) || 220;
    const next = Math.max(80, Math.min(current + (event.key === 'ArrowDown' ? 24 : -24), editor.getBoundingClientRect().height - 183));
    editor.style.setProperty('--library-size', `${next}px`);
  });
  preview.addEventListener('wheel', event => {
    if (!lastSvg || event.deltaY === 0) return;
    event.preventDefault();
    zoom = Math.min(4, Math.max(0.2, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    applyPreviewTransform();
  }, { passive: false });
  const previewWrap = overlay.querySelector('.tikz-studio-preview-wrap');
  let panning = null;
  previewWrap.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    panning = { x: event.clientX, y: event.clientY, panX, panY };
    previewWrap.setPointerCapture(event.pointerId);
    previewWrap.classList.add('is-panning');
    event.preventDefault();
  });
  previewWrap.addEventListener('pointermove', event => {
    if (!panning) return;
    panX = panning.panX + (event.clientX - panning.x);
    panY = panning.panY + (event.clientY - panning.y);
    applyPreviewTransform();
  });
  const endPan = () => { if (!panning) return; panning = null; previewWrap.classList.remove('is-panning'); };
  previewWrap.addEventListener('pointerup', endPan);
  previewWrap.addEventListener('pointercancel', endPan);
  const close = async () => {
    if (!inserted && isDirty() &&
        !await confirmDialog({ title:t('您有尚未保存的改动，是否退出？', 'You have unsaved changes. Exit anyway?') })) return;
    clearTimeout(timer);
    overlay.remove();
  };
  overlay.querySelector('.tikz-studio-close').onclick = close;
  overlay.querySelector('.tikz-studio-insert').onclick = () => {
    const full = splitStandaloneDocument(code.value);
    const declarations = full ? full.preamble : libraries.value;
    const staging = scanStaging(declarations);
    const body = full ? full.body : code.value.trim();
    if (!staging.macros.length && !staging.libraries.length && !body) return;
    const result = onInsert?.({
      libraries: staging.libraries,
      macros: staging.macros,
      declarations,
      body,
    });
    if (result?.duplicates?.length) {
      const duplicateLines = staging.macros
        .filter(macro => result.duplicates.includes(macro.name))
        .map(({ startLine, endLine }) => ({ startLine, endLine }));
      markDuplicateLines(libraries, duplicateLines);
      setStatus(`${t('名称已被使用：', 'Already defined: ')}${result.duplicates.join(', ')}`);
      return;
    }
    inserted = true;
    close();
  };
  overlay.addEventListener('pointerdown', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  render();
  return { close };
}
