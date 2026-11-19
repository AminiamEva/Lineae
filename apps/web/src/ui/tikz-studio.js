// General TikZ studio: code left, real TeX/TikZ SVG right.  The renderer is
// mp-tikz-wasm (LGPL-3.0-or-later), loaded lazily from a local vendor copy.
import { t } from './i18n.mjs';

let enginePromise = null;
const svgCache = new Map();
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

const SAMPLE = String.raw`\begin{tikzpicture}[scale=1]
  \draw[->, thick] (0,0) -- (2,1) node[right] {$x^2$};
  \draw[blue, thick] (0,0) circle (1);
  \node[draw, rounded corners] at (3,1) {TikZ};
\end{tikzpicture}`;

function needsLuaTex(source) {
  return /\usegdlibrary|graphdrawing|\directlua|\latelua|luacode|fontspec|unicode-math/.test(source);
}

const PREAMBLE_COMMAND = /^\s*\\(?:usepackage|RequirePackage|usetikzlibrary|usegdlibrary|newcommand|renewcommand|providecommand|DeclareRobustCommand|newenvironment|renewenvironment|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand|DeclareMathOperator|newtheorem|def|gdef|edef|xdef|let|newcounter|newlength|setlength|tikzset|pgfplotsset|colorlet|definecolor)\b/;

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

function stripDocumentWrapper(source) {
  return source
    .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^{}]+\}[^\n]*(?:\r?\n|$)/m, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .trim();
}

function fragmentForInsertion(source) {
  const complete = /\\documentclass|\\bye\b/.test(source);
  const unwrapped = complete ? stripDocumentWrapper(source) : source.trim();
  const { blocks, body } = splitTikzFragment(unwrapped);
  // \usepackage is only legal in the preamble of the host document.  Keep
  // library loads and macro definitions, which are valid in the body, but do
  // not inject a second package-loading block into the document.
  const safePreamble = blocks
    .filter(block => !/^\s*\\(?:usepackage|RequirePackage)\b/.test(block))
    .join('\n');
  return [safePreamble, body].filter(Boolean).join('\n').trim();
}

function tikzDocument(source, figures) {
  if (figures.isCompleteDocument(source)) return { document: source, engine: needsLuaTex(source) ? 'lualatex' : 'auto' };
  const { preamble, body } = splitTikzFragment(source);
  const document = figures.wrapTikz(body, { preamble });
  return { document, engine: needsLuaTex(document) ? 'lualatex' : 'auto' };
}

export async function renderTikz(source) {
  if (svgCache.has(source)) return svgCache.get(source);
  const engine = await loadEngine();
  const figures = await import(new URL('/vendor/mp-tikz-wasm/figures.js', location.href).href);
  const { document, engine: texEngine } = tikzDocument(source, figures);
  const result = await engine.latex(document, { engine: texEngine });
  const rendered = {
    svg: result.status === 'ok' && result.pages?.length ? result.pages[0] : '',
    status: result.status,
    diagnostics: result.diagnostics || [],
  };
  if (rendered.svg) svgCache.set(source, rendered);
  return rendered;
}

export function generalTikzPreviewWidget(source) {
  const root = document.createElement('div');
  root.className = 'tikz-code-preview tikz-general-preview';
  root.textContent = 'TikZ';
  renderTikz(source).then(result => {
    if (!result.svg) { root.textContent = result.diagnostics?.map(item => item.message).join('\n') || 'TikZ'; return; }
    const svg = document.createElement('div');
    svg.innerHTML = result.svg;
    root.replaceChildren(...svg.childNodes);
    root.classList.add('tikz-general-preview-ready');
  }).catch(error => { root.textContent = String(error?.message || error); });
  return root;
}

export function openTikzStudio({ onInsert } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'tikz-studio-overlay';
  overlay.innerHTML = `
    <div class="tikz-studio-window" role="dialog" aria-modal="true" aria-label="TikZ">
      <div class="tikz-studio-header">
        <strong>TikZ</strong>
        <span class="tikz-studio-hint">${t('代码实时渲染 · 滚轮缩放', 'Live TeX rendering · wheel to zoom')}</span>
        <span class="tikz-studio-spacer"></span>
        <button type="button" class="tikz-studio-insert">${t('插入', 'Insert')}</button>
        <button type="button" class="tikz-studio-close">${t('关闭', 'Close')}</button>
      </div>
      <div class="tikz-studio-body">
        <textarea class="tikz-studio-code" spellcheck="false" aria-label="TikZ code"></textarea>
        <div class="tikz-studio-preview-wrap">
          <div class="tikz-studio-preview" aria-live="polite"></div>
          <div class="tikz-studio-status"></div>
        </div>
      </div>
    </div>`;
  document.body.append(overlay);
  const code = overlay.querySelector('.tikz-studio-code');
  const preview = overlay.querySelector('.tikz-studio-preview');
  const status = overlay.querySelector('.tikz-studio-status');
  code.value = SAMPLE;
  code.focus();
  let zoom = 1;
  let version = 0;
  let timer = 0;
  let engine = null;
  let lastSvg = '';

  const setStatus = text => { status.textContent = text || ''; };
  const render = async () => {
    const current = ++version;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const source = code.value.trim();
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
        preview.style.transform = `scale(${zoom})`;
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
  preview.addEventListener('wheel', event => {
    if (!lastSvg || event.deltaY === 0) return;
    event.preventDefault();
    zoom = Math.min(4, Math.max(0.2, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    preview.style.transform = `scale(${zoom})`;
  }, { passive: false });
  const close = () => {
    clearTimeout(timer);
    overlay.remove();
  };
  overlay.querySelector('.tikz-studio-close').onclick = close;
  overlay.querySelector('.tikz-studio-insert').onclick = () => {
    const source = fragmentForInsertion(code.value.trim());
    if (!source) return;
    close();
    onInsert?.(source);
  };
  overlay.addEventListener('pointerdown', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  render();
  return { close };
}
