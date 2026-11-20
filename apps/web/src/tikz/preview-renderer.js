// Incremental CircuiTikZ code-block preview.
//
// This deliberately does not replace the existing LaTeX/code-block rendering
// kernel.  It is a read-only SVG preview widget inserted before a `tikz`
// code block; the original source remains the editable ProseMirror node.
import { parseLibrary } from './components/symbols-meta.js';
import { PX_PER_CM } from './controllers/snapDrag.js';
import { NodeSymbol, PathComponent, Wire } from './components/components.js';

const SVGNS = 'http://www.w3.org/2000/svg';
let libraryPromise = null;
let libraryDefs = null;
let artworkHost = null;
const cache = new Map();

function svgElement(name, attrs = {}) {
  const element = document.createElementNS(SVGNS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

function loadLibrary() {
  if (libraryPromise) return libraryPromise;
  libraryPromise = fetch('assets/tikz-symbols.svg')
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' for assets/tikz-symbols.svg');
      return response.text();
    })
    .then(text => {
      libraryDefs = parseLibrary(text).defs;
      const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
      artworkHost = document.createElementNS(SVGNS, 'svg');
      artworkHost.setAttribute('aria-hidden', 'true');
      artworkHost.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      for (const child of [...parsed.documentElement.children]) artworkHost.append(child.cloneNode(true));
      document.body.append(artworkHost);
      return { text, defs: libraryDefs };
    });
  return libraryPromise;
}

function cleanCode(code) {
  let text = String(code || '').replace(/^\s*%/, '');
  text = text.replace(/^\\resizebox\{[^{}]*\}\{!\}\{%?/, '');
  text = text.replace(/%\}\s*$/, '');
  const begin = text.search(/\\begin\{(?:tikzpicture|circuitikz)\}/);
  const end = text.lastIndexOf('\\end{tikzpicture}') >= 0 ? text.lastIndexOf('\\end{tikzpicture}') : text.lastIndexOf('\\end{circuitikz}');
  if (begin >= 0 && end > begin) text = text.slice(begin, end);
  return text.replace(/%.*$/gm, '').trim();
}

function parseCoordinate(raw) {
  const parts = raw.split(',').map(part => Number.parseFloat(part));
  if (parts.length < 2 || !parts.every(Number.isFinite)) return null;
  return { x: parts[0] * PX_PER_CM, y: -parts[1] * PX_PER_CM };
}

function optionParts(raw) {
  return String(raw || '').split(',').map(part => part.trim()).filter(Boolean);
}

function findDef(defs, style) {
  const wanted = String(style || '').trim();
  return defs.find(def => def.tikz === wanted) || defs.find(def => def.name === wanted) || null;
}

function renderInto(root, code, defs) {
  const clean = cleanCode(code);
  if (!clean) return null;
  const svg = svgElement('svg', { class: 'tikz-code-preview-svg', role: 'img' });
  // Symbols are kept once in artworkHost (or in the open editor's defs);
  // <use href="#id"> resolves them from the document, so each preview does
  // not need to clone the 2 MB symbol library.
  const content = svgElement('g');
  svg.append(content);
  const named = new Map();
  const bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  const extend = point => {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  };
  const resolve = raw => {
    const value = raw.trim();
    if (named.has(value)) return named.get(value);
    return parseCoordinate(value);
  };

  // Coordinates first, so named terminals can be used by paths.
  for (const match of clean.matchAll(/\\coordinate\s*\(([^)]+)\)\s*at\s*\(([^)]+)\)\s*;/g)) {
    const point = parseCoordinate(match[2]);
    if (point) { named.set(match[1].trim(), point); extend(point); }
  }

  for (const match of clean.matchAll(/\\node\s*\[([^\]]*)\]\s*at\s*\(([^)]+)\)\s*\{([\s\S]*?)\}\s*;/g)) {
    const point = resolve(match[2]);
    if (!point) continue;
    const options = optionParts(match[1]);
    const def = findDef(defs, options[0]);
    if (!def || def.kind !== 'node') continue;
    const item = new NodeSymbol(def, point.x, point.y);
    item.options = options.slice(1);
    const label = match[3].trim();
    if (label) item.label = label.replace(/^\$|\$$/g, '');
    content.append(item.toSvg());
    extend(point);
  }

  for (const match of clean.matchAll(/\\draw\s*([\s\S]*?);/g)) {
    const tokens = [...match[1].matchAll(/\(([^)]+)\)|to\[([^\]]*)\]/g)];
    let previous = null;
    let style = null;
    for (const token of tokens) {
      if (token[1] !== undefined) {
        const point = resolve(token[1]);
        if (!point) { previous = null; style = null; continue; }
        if (previous) {
          const options = optionParts(style);
          const def = findDef(defs, options[0]);
          if (def && def.kind === 'path') {
            const item = new PathComponent(def, previous.x, previous.y);
            item.start = { x: previous.x, y: previous.y };
            item.end = { x: point.x, y: point.y };
            item.x = previous.x; item.y = previous.y;
            item.options = options.slice(1);
            item.mirror = item.options.includes('mirror');
            content.append(item.toSvg());
          } else {
            content.append(svgElement('line', {
              x1: previous.x, y1: previous.y, x2: point.x, y2: point.y,
              stroke: '#222', 'stroke-width': 1.5,
            }));
          }
          extend(previous); extend(point);
        }
        previous = point;
        style = null;
      } else {
        style = token[2];
      }
    }
  }

  if (!content.childNodes.length) return null;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  svg.setAttribute('viewBox', `${bounds.minX - 8} ${bounds.minY - 8} ${width + 16} ${height + 16}`);
  const widthCm = (width + 16) / PX_PER_CM;
  const fraction = /\\resizebox\{\s*([\d.]+)\\textwidth\s*\}/.exec(code)?.[1];
  const displayFraction = fraction ? Number(fraction) : Math.min(1, widthCm / 15);
  svg.style.width = `${Math.min(1, Math.max(.05, displayFraction)) * 100}%`;
  svg.setAttribute('height', String(Math.max(60, Math.min(420, height + 16))));
  return svg;
}

export function tikzPreviewWidget(code, onOpen = null) {
  const root = document.createElement('div');
  root.className = 'tikz-code-preview';
  root.contentEditable = 'false';
  if (onOpen) {
    root.title = 'Double-click to edit';
    root.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
      onOpen();
    });
  }
  const source = cleanCode(code);
  if (!source) { root.hidden = true; return root; }
  if (cache.has(source)) {
    const cached = cache.get(source);
    if (cached) root.append(cached.cloneNode(true));
    return root;
  }
  root.textContent = 'Rendering CircuiTikZ…';
  loadLibrary().then(({ defs }) => {
    const preview = renderInto(root, code, defs);
    cache.set(source, preview ? preview.cloneNode(true) : null);
    root.replaceChildren();
    if (preview) root.append(preview);
    else root.hidden = true;
  }).catch(() => { root.textContent = 'CircuiTikZ preview unavailable'; });
  return root;
}
