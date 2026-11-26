// Word-like floating toolbar + context menu for complete LaTeX objects (pure additive).
// Triggers only on NodeSelection over a whole math node ('math' / 'mathBlock');
// half-selected objects never show it.
import { t } from './i18n.mjs';
import { mathFontStyles } from '../editor/math-formatting.js';
import { LATEX_COLOR_NAMES, LATEX_COLOR_SWATCHES } from './color-palette.js';

// ---------------- pure latex transforms (unit-tested) ----------------
const FONT_WRAPPERS = new Set(Object.keys(mathFontStyles));
export function wrapMath(latex, wrapper, arg) {
  if (!latex) return latex;
  if (arg === undefined && FONT_WRAPPERS.has(wrapper)) {
    // Changing a font replaces the previous outer font instead of nesting
    // \mathbb{\mathbf{\mathcal{...}}} until the formula becomes unusable.
    let body = latex;
    for (let changed = true; changed;) {
      changed = false;
      for (const command of FONT_WRAPPERS) {
        const inner = stripOuter(body, command);
        if (inner !== body) { body = inner; changed = true; break; }
      }
    }
    return `\\${wrapper}{${body}}`;
  }
  const open = arg === undefined ? `\\${wrapper}{` : `\\${wrapper}{${arg}}{`;
  if (latex.startsWith(open)) return latex; // already wrapped
  return open + latex + '}';
}
function stripTextcolor(latex) {
  const match = /^\\textcolor\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}\s*/.exec(latex);
  if (!match) return latex;
  const start = match[0].length;
  if (latex[start] !== '{') return latex;
  let depth = 0;
  for (let i = start; i < latex.length; i++) {
    if (latex[i] === '{') depth++;
    else if (latex[i] === '}' && --depth === 0) {
      return latex.slice(i + 1).trim() ? latex : latex.slice(start + 1, i);
    }
  }
  return latex;
}
export function setMathColor(latex, color) {
  const stripped = stripTextcolor(latex);
  if (!color) return stripped;
  if (/^#[0-9a-f]{6}$/i.test(color)) return `\\textcolor[HTML]{${color.slice(1).toUpperCase()}}{${stripped}}`;
  return `\\textcolor{${color}}{${stripped}}`;
}
export function setMathSize(latex, size) {
  // sizes valid in math mode (latex2e): displaystyle/textstyle/scriptstyle/scriptscriptstyle
  const re = /^\\(displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/;
  const body = latex.replace(re, '');
  return size === 'displaystyle' ? body : `\\${size} ${body}`;
}
function stripOuter(latex, cmd, skipArgs = 0) {
  const prefix = `\\${cmd}`;
  if (!latex.startsWith(prefix) || /[A-Za-z]/.test(latex[prefix.length] ?? '')) return latex;
  let i = prefix.length;
  const skipGroup = () => {
    if (latex[i] !== '{') { while (i < latex.length && latex[i] !== '{' && latex[i] !== '\\') i++; return; }
    let depth = 0;
    for (; i < latex.length; i++) {
      if (latex[i] === '{') depth++;
      else if (latex[i] === '}') { depth--; if (depth === 0) { i++; return; } }
    }
  };
  for (let k = 0; k < skipArgs; k++) skipGroup();
  if (latex[i] !== '{') return latex;
  const start = i; let depth = 0;
  for (; i < latex.length; i++) {
    if (latex[i] === '{') depth++;
    else if (latex[i] === '}') {
      depth--;
      if (depth === 0) {
        // Only an outer wrapper around the whole selection can be replaced.
        // \textcolor{red}{x}+y must not lose "+y" when recolored.
        return latex.slice(i + 1).trim() ? latex : latex.slice(start + 1, i);
      }
    }
  }
  return latex;
}
const MATRIX_ENVS = ['pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'matrix', 'smallmatrix'];
export function detectMatrixEnv(latex) {
  const m = /\\begin\{([pbBvV]?matrix|smallmatrix)\}/.exec(latex);
  return m ? m[1] : null;
}
export function switchMatrixEnv(latex, env) {
  const cur = detectMatrixEnv(latex);
  if (!cur || cur === env) return latex;
  return latex.replace(`\\begin{${cur}}`, `\\begin{${env}}`).replace(`\\end{${cur}}`, `\\end{${env}}`);
}
function matrixBody(latex) {
  const env = detectMatrixEnv(latex);
  if (!env) return null;
  const b = latex.indexOf(`\\begin{${env}}`) + `\\begin{${env}}`.length;
  const e = latex.lastIndexOf(`\\end{${env}}`);
  return e > b ? latex.slice(b, e) : null;
}
function columnCount(body) {
  const rows = body.trim().split(/\\\\/).filter(r => r.trim());
  return rows.length ? Math.max(...rows.map(r => r.split('&').length)) : 1;
}
export function matrixAddRow(latex) {
  const env = detectMatrixEnv(latex);
  const body = matrixBody(latex);
  if (!env || body === null) return latex;
  const cols = columnCount(body);
  const row = Array(cols).fill('0').join(' & ');
  const sep = body.trimEnd().endsWith('\\\\') || !body.trim() ? '' : ' \\\\ ';
  return latex.replace(`\\end{${env}}`, `${sep}\\\\\n${row}\n\\end{${env}}`);
}
export function matrixAddColumn(latex) {
  const env = detectMatrixEnv(latex);
  const body = matrixBody(latex);
  if (!env || body === null) return latex;
  const rows = body.split(/\\\\/);
  const next = rows.map(r => (r.trim() ? r.trimEnd() + ' & 0' : r)).join(' \\\\ ');
  return latex.replace(body, next);
}

// A floating toolbar is only useful when the selected source is a complete
// LaTeX object.  This rejects half a matrix delimiter, \left without \right,
// an opening \begin, a partial command name, or unbalanced braces.
export function isCompleteMathSelection(latex, from, to) {
  if (typeof latex !== 'string' || from < 0 || to > latex.length || to <= from) return false;
  const selected = latex.slice(from, to);
  const trimmed = selected.trim();
  if (!trimmed) return false;
  const prefix = latex.slice(0, from);
  if (prefix.endsWith('\\')) return false;
  if (/\\[A-Za-z]+$/.test(prefix) && !trimmed.startsWith('\\')) return false;
  const command = /^\\([A-Za-z]+)/.exec(trimmed);
  if (command) {
    const next = latex[from + trimmed.indexOf(command[0]) + command[0].length];
    if (next && /[A-Za-z]/.test(next)) return false;
    const arity = {
      frac: 2, dfrac: 2, tfrac: 2, binom: 2, textcolor: 2, colorbox: 2,
      sqrt: 1, boxed: 1, underline: 1, mathbf: 1, mathit: 1, mathrm: 1,
      mathsf: 1, mathtt: 1, mathcal: 1, mathscr: 1, mathbb: 1, mathfrak: 1,
      boldsymbol: 1, pmb: 1, hat: 1, widehat: 1, tilde: 1, widetilde: 1,
      bar: 1, overline: 1, vec: 1, acute: 1, grave: 1, breve: 1, check: 1,
      ddot: 1, dot: 1,
    }[command[1]];
    if (arity) {
      let index = command[0].length;
      while (index < trimmed.length && /\s/.test(trimmed[index])) index++;
      if (command[1] === 'sqrt' && trimmed[index] === '[') {
        const close = trimmed.indexOf(']', index);
        if (close < 0) return false;
        index = close + 1;
      }
      let groups = 0;
      while (groups < arity) {
        while (index < trimmed.length && /\s/.test(trimmed[index])) index++;
        if (trimmed[index] !== '{') break;
        let depth = 0;
        for (; index < trimmed.length; index++) {
          if (trimmed[index] === '{') depth++;
          else if (trimmed[index] === '}' && --depth === 0) { index++; break; }
        }
        groups++;
      }
      if (groups < arity) return false;
    }
  }
  let braces = 0;
  let parens = 0;
  let brackets = 0;
  let escaped = false;
  for (const char of selected) {
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '{') braces++;
    else if (char === '}') { braces--; if (braces < 0) return false; }
    else if (char === '(') parens++;
    else if (char === ')') { parens--; if (parens < 0) return false; }
    else if (char === '[') brackets++;
    else if (char === ']') { brackets--; if (brackets < 0) return false; }
  }
  if (braces !== 0 || parens !== 0 || brackets !== 0) return false;
  const left = (selected.match(/\\left(?![A-Za-z])/g) || []).length;
  const right = (selected.match(/\\right(?![A-Za-z])/g) || []).length;
  if (left !== right) return false;
  const begins = [...selected.matchAll(/\\begin\{([^}]+)\}/g)].map(match => match[1]);
  const ends = [...selected.matchAll(/\\end\{([^}]+)\}/g)].map(match => match[1]);
  if (begins.length !== ends.length) return false;
  for (let i = 0; i < begins.length; i++) if (begins[i] !== ends[i]) return false;
  return true;
}

export function classifyContent(latex) {
  // core = outermost wrapper content
  let core = latex;
  core = stripOuter(core, 'textcolor', 1);
  for (const cmd of ['mathbf', 'mathit', 'mathrm', 'mathsf', 'mathtt', 'mathcal', 'mathscr', 'mathbb', 'mathfrak', 'boldsymbol', 'boxed', 'underline', 'hat', 'widehat', 'tilde', 'widetilde', 'bar', 'overline', 'vec', 'acute', 'grave', 'breve', 'check', 'ddot', 'dot'])
    core = stripOuter(core, cmd);
  if (/^\\(displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/.test(core)) core = core.replace(/^\\(displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/, '');
  if (/^[A-Za-z0-9\s+\-*/=<>()^_]+$/.test(core)) return 'alpha';
  return 'symbol';
}

// ---------------- UI ----------------
export const LATEX_COLORS = LATEX_COLOR_NAMES;
export const MATH_FONTS_ALPHA = [
  ['mathbf', '𝐀'], ['mathrm', 'A'], ['mathit', '𝐴'], ['mathsf', '𝖠'],
  ['mathtt', '𝙰'], ['mathcal', '𝒜'], ['mathscr', '𝒜'], ['mathbb', '𝔸'], ['mathfrak', '𝔄'],
];
export const MATH_FONTS_SYMBOL = [['boldsymbol', '𝛂'], ['pmb', '𝛂']];
export const MATH_SIZES = ['displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle'];
export const MATH_ACCENTS = [
  ['acute', 'á'], ['bar', 'ā'], ['breve', 'ă'], ['check', 'ǎ'],
  ['ddot', 'ä'], ['dot', 'ȧ'], ['grave', 'à'], ['hat', 'â'],
  ['tilde', 'ã'], ['vec', 'a⃗'], ['widehat', 'â', 'over'], ['widetilde', 'ã', 'over'], ['overline', 'a', 'over'],
];

const UNARY_WRAPPERS = new Set([
  'boxed', 'underline', 'mathbf', 'mathit', 'mathrm', 'mathsf', 'mathtt',
  'mathcal', 'mathscr', 'mathbb', 'mathfrak', 'boldsymbol', 'pmb',
  'hat', 'widehat', 'tilde', 'widetilde', 'bar', 'overline', 'vec',
  'acute', 'grave', 'breve', 'check', 'ddot', 'dot',
]);
const FONT_COMMANDS = new Set([...MATH_FONTS_ALPHA, ...MATH_FONTS_SYMBOL].map(([cmd]) => cmd));
const SIZE_PREFIX = /^\s*\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/;

// Match a formatting wrapper that spans the entire expression, e.g.
// \underline{a}, \mathbf{a}, \textcolor{red}{a}.  Returns null for anything
// that is not a single wrapper command enclosing the whole string.
function matchOuterWrapper(latex) {
  const lead = /^\s*/.exec(latex)[0].length;
  const rest = latex.slice(lead);
  const match = /^\\([A-Za-z]+)/.exec(rest);
  if (!match) return null;
  const cmd = match[1];
  if (cmd !== 'textcolor' && !UNARY_WRAPPERS.has(cmd)) return null;
  let index = match[0].length;
  const groups = [];
  while (true) {
    while (index < rest.length && /\s/.test(rest[index])) index++;
    if (rest[index] !== '{') break;
    const start = index;
    let depth = 0;
    for (; index < rest.length; index++) {
      if (rest[index] === '{') depth++;
      else if (rest[index] === '}' && --depth === 0) { index++; break; }
    }
    if (depth !== 0) return null;
    groups.push(rest.slice(start + 1, index - 1));
  }
  if (!groups.length) return null;
  if (cmd === 'textcolor' ? groups.length < 2 : groups.length !== 1) return null;
  const after = rest.slice(index);
  if (after.trim()) return null;
  return { lead, cmd, groups, body: groups[groups.length - 1], after };
}

function removeCommandFromWrapperChain(latex, commands) {
  const size = SIZE_PREFIX.exec(latex);
  if (size) {
    const inner = removeCommandFromWrapperChain(latex.slice(size[0].length), commands);
    if (inner === null) return null;
    return latex.slice(0, size[0].length) + inner;
  }
  const wrapper = matchOuterWrapper(latex);
  if (!wrapper) return null;
  if (commands.has(wrapper.cmd)) {
    return latex.slice(0, wrapper.lead) + wrapper.body + wrapper.after;
  }
  const inner = removeCommandFromWrapperChain(wrapper.body, commands);
  if (inner === null) return null;
  const args = wrapper.groups.slice(0, -1).map(group => `{${group}}`).join('');
  return latex.slice(0, wrapper.lead) + `\\${wrapper.cmd}${args}{${inner}}` + wrapper.after;
}

// Wrap unless the command already frames the whole expression, in which case
// remove it (Word-like underline/bold toggles).
export function toggleWrapMath(latex, wrapper, arg) {
  if (!latex) return latex;
  const removed = removeCommandFromWrapperChain(latex, new Set([wrapper]));
  if (removed !== null) return removed;
  const open = arg === undefined ? `\\${wrapper}{` : `\\${wrapper}{${arg}}{`;
  return open + latex + '}';
}

// Strip every math font command while preserving colors, sizes and accents.
export function clearMathFont(latex) {
  let result = latex;
  let changed = false;
  while (true) {
    const next = removeCommandFromWrapperChain(result, FONT_COMMANDS);
    if (next === null) break;
    result = next;
    changed = true;
  }
  return changed ? result : latex;
}

export function installMathFloatToolbar({ editor }) {
  const bar = document.createElement('div');
  bar.className = 'math-float-toolbar';
  bar.hidden = true;
  document.body.append(bar);
  const menu = document.createElement('div');
  menu.className = 'math-matrix-menu';
  menu.hidden = true;
  document.body.append(menu);

  let current = null; // {pos, node}
  let holdToolbarUntil = 0;

  const isMathSel = sel => Boolean(sel.node) && (sel.node.type.name === 'math' || sel.node.type.name === 'mathBlock');
  const selState = () => {
    const sel = editor.state.selection;
    return isMathSel(sel) ? { pos: sel.from, node: sel.node } : null;
  };
  const selectedLatex = (field, range) => {
    try { return field.getValue(range) ?? ''; }
    catch { return ''; }
  };

  const applyLatex = fn => {
    if (!current) return;
    if (current.partial) {
      const { field } = current;
      const selected = selectedLatex(field, current.range);
      if (!selected) return;
      const replacement = fn(selected);
      if (replacement === selected) return;
      holdToolbarUntil = performance.now() + 1000;
      field.insert(replacement, { selection: 'item' });
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
      setTimeout(() => {
        if (!current?.partial || current.field !== field || !field.isConnected) return;
        const [from, to] = field.selection?.ranges?.[0] ?? [0, 0];
        if (from === to) hide(true);
      }, 1050);
      return;
    }
    const latex = fn(current.node.attrs.latex ?? '');
    if (latex === current.node.attrs.latex) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(current.pos, undefined, { ...current.node.attrs, latex }));
    editor.commands.setNodeSelection(current.pos);
  };

  // Atomic styles are applied by MathLive to the selected atoms. String
  // wrapping cannot represent a matrix range because getValue() drops the
  // & and \\ separators; MathLive colors each selected cell correctly.
  const applySelectionStyle = style => {
    if (!current?.partial || !current.field?.isConnected || !style) return false;
    const { field } = current;
    field.focus();
    const before = field.value;
    field.applyStyle(style);
    if (field.value === before) return false;
    const hex = /^#([0-9a-f]{6})$/i.exec(style.color ?? '');
    if (hex) {
      const next = field.value.split(`\\textcolor{${style.color}}`).join(`\\textcolor[HTML]{${hex[1].toUpperCase()}}`);
      if (next !== field.value) field.value = next;
    }
    holdToolbarUntil = performance.now() + 1000;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    return true;
  };

  // ---- toolbar content (built once per language) ----
  function buildBar() {
    bar.replaceChildren();
    const mk = (cls, label, onclick, title) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = label;
      b.title = title || label; b.setAttribute('aria-label', b.title);
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', onclick);
      return b;
    };
    // color grid (Word-like swatches, LaTeX official base colors)
    const grid = document.createElement('div');
    grid.className = 'mft-colors';
    for (const { name: c, hex } of LATEX_COLOR_SWATCHES) {
      const s = document.createElement('button');
      s.type = 'button'; s.className = 'mft-swatch'; s.dataset.color = c;
      s.style.background = hex;
      s.title = c; s.setAttribute('aria-label', '\\textcolor{' + c + '}');
      s.addEventListener('mousedown', e => e.preventDefault());
      s.addEventListener('click', () => current?.partial
        ? applySelectionStyle({ color: c })
        : applyLatex(l => setMathColor(l, c)));
      grid.append(s);
    }
    const custom = document.createElement('button');
    custom.type = 'button'; custom.className = 'mft-color-custom';
    custom.title = t('调色盘…', 'Custom…'); custom.setAttribute('aria-label', custom.title);
    const customInput = document.createElement('input');
    customInput.type = 'color'; customInput.hidden = true;
    custom.addEventListener('mousedown', e => e.preventDefault());
    custom.addEventListener('click', () => customInput.click());
    customInput.addEventListener('change', () => {
      const color = customInput.value;
      if (current?.partial) applySelectionStyle({ color });
      else applyLatex(l => setMathColor(l, color));
    });
    grid.append(custom, customInput);
    bar.append(grid);
    bar.append(mk('mft-btn', t('框', 'Box'), () => applyLatex(l => wrapMath(l, 'boxed')), t('加包围框 \\boxed', 'Add \\boxed frame')));
    bar.append(mk('mft-btn mft-underline', t('下划线', 'U'), () => applyLatex(l => toggleWrapMath(l, 'underline')), t('下划线 \\underline（再次点击取消）', 'Underline \\underline (click again to remove)')));
    const size = document.createElement('select');
    size.className = 'mft-size';
    for (const s of MATH_SIZES) { const o = document.createElement('option'); o.value = s; o.textContent = s.replace('style', ''); size.append(o); }
    size.title = t('数学字号样式', 'Math size style');
    size.addEventListener('change', () => applyLatex(l => setMathSize(l, size.value)));
    bar.append(size);
    // fonts (conditional) — icon shows the letter A rendered in that alphabet
    const fonts = document.createElement('div');
    fonts.className = 'mft-fonts';
    bar.append(fonts);
    // accents dropdown grid
    const accBtn = mk('mft-btn', t('重音 ▾', 'Accents ▾'), () => {}, t('数学重音', 'Math-mode accents'));
    const accGrid = document.createElement('div');
    accGrid.className = 'mft-accents';
    for (const [cmd, glyph, mode] of MATH_ACCENTS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mft-accent';
      b.innerHTML = `<span class="mft-glyph${mode === 'over' && cmd === 'overline' ? ' mft-over' : ''}">${glyph}</span>`;
      b.title = '\\' + cmd; b.setAttribute('aria-label', '\\' + cmd);
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => { accGrid.hidden = true; applyLatex(l => wrapMath(l, cmd)); });
      accGrid.append(b);
    }
    accGrid.hidden = true;
    accBtn.addEventListener('click', () => { accGrid.hidden = !accGrid.hidden; });
    bar.append(accBtn, accGrid);
  }

  function fillFonts(latex) {
    const fonts = bar.querySelector('.mft-fonts');
    fonts.replaceChildren();
    const list = classifyContent(latex) === 'alpha' ? MATH_FONTS_ALPHA : MATH_FONTS_SYMBOL;
    for (const [cmd, glyph] of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mft-font'; b.textContent = glyph;
      b.title = '\\' + cmd; b.setAttribute('aria-label', '\\' + cmd);
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => current?.partial
        ? applySelectionStyle(mathFontStyles[cmd])
        : applyLatex(l => wrapMath(l, cmd)));
      fonts.append(b);
    }
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'mft-font mft-clear'; clear.textContent = '×';
    clear.title = t('清除字体样式', 'Clear font style');
    clear.setAttribute('aria-label', clear.title);
    clear.addEventListener('mousedown', e => e.preventDefault());
    clear.addEventListener('click', () => applyLatex(l => clearMathFont(l)));
    fonts.append(clear);
  }

  function position(el, rect) {
    el.hidden = false;
    const ew = el.offsetWidth, eh = el.offsetHeight;
    let top = rect.top - eh - 8;
    if (top < 8) top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - ew / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - ew - 8));
    el.style.top = top + 'px'; el.style.left = left + 'px';
  }

  function hide(force = false) {
    if (!force && current?.partial && performance.now() < holdToolbarUntil) {
      const field = current.field;
      const delay = Math.max(0, holdToolbarUntil - performance.now()) + 20;
      setTimeout(() => {
        if (current?.partial && current.field === field) {
          const [from, to] = field?.selection?.ranges?.[0] ?? [0, 0];
          if (from === to) hide(true);
        }
      }, delay);
      return;
    }
    bar.hidden = true;
    menu.hidden = true;
    current = null;
  }

  let visibilityTimer = 0;
  const selectedDom = () => {
    if (!current) return null;
    if (current.partial) return current.field;
    return current.dom ?? editor.view.nodeDOM(current.pos);
  };
  // The toolbar only appears while the pointer is over the selected content (or
  // the toolbar itself); a short grace period lets the pointer reach it.
  function syncVisibility() {
    clearTimeout(visibilityTimer);
    const target = selectedDom();
    if (!current || !target?.isConnected) { bar.hidden = true; return; }
    if (target.matches(':hover') || bar.matches(':hover')) {
      const rect = target.getBoundingClientRect();
      if (rect) position(bar, rect);
      return;
    }
    visibilityTimer = setTimeout(() => {
      const still = selectedDom();
      if (!bar.matches(':hover') && !still?.matches(':hover')) bar.hidden = true;
    }, 150);
  }

  function showPartial(detail) {
    const node = editor.state.doc.nodeAt(detail.position);
    if (!node || !['math', 'mathBlock'].includes(node.type.name)) return hide();
    const [from, to] = [detail.from, detail.to];
    const selected = selectedLatex(detail.field, [from, to]);
    if (!selected || !isCompleteMathSelection(selected, 0, selected.length)) return hide();
    current = {
      pos: detail.position,
      node,
      partial: true,
      field: detail.field,
      range: [from, to],
    };
    buildBarOnce();
    fillFonts(selected);
    bar.querySelector('.mft-accents').hidden = true;
    syncVisibility();
  }

  function update() {
    if (current?.partial && performance.now() < holdToolbarUntil) return;
    // MathLive selections do not change ProseMirror's NodeSelection. Keep the
    // partial-selection toolbar alive while the field still has a range.
    if (current?.partial && current.field?.isConnected && current.field.hasFocus?.()) {
      const [from, to] = current.field.selection?.ranges?.[0] ?? [0, 0];
      if (from !== to) return;
    }
    const sel = selState();
    if (!sel) return hide();
    const dom = editor.view.nodeDOM(sel.pos);
    if (!dom) return hide();
    current = { ...sel, partial: false, dom };
    buildBarOnce();
    fillFonts(sel.node.attrs.latex ?? '');
    bar.querySelector('.mft-accents').hidden = true;
    syncVisibility();
  }
  let built = false;
  function buildBarOnce() { if (!built) { buildBar(); built = true; } }

  // ---- matrix context menu (doc level) ----
  function buildMenu(latex, clientX, clientY) {
    menu.replaceChildren();
    const mkItem = (zh, en, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mfm-item'; b.textContent = t(zh, en);
      b.addEventListener('click', () => { menu.hidden = true; fn(); });
      return b;
    };
    menu.append(mkItem('在下方增加一行', 'Add row below', () => applyLatex(matrixAddRow)));
    menu.append(mkItem('在右侧增加一列', 'Add column right', () => applyLatex(matrixAddColumn)));
    const envs = document.createElement('div');
    envs.className = 'mfm-envs';
    for (const env of MATRIX_ENVS) {
      envs.append(mkItem('更换为 ' + env, 'Switch to ' + env, () => applyLatex(l => switchMatrixEnv(l, env))));
    }
    menu.append(envs);
    menu.append(mkItem('复制 LaTeX 代码', 'Copy LaTeX', () => navigator.clipboard?.writeText(latex)));
    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.top = Math.min(clientY, window.innerHeight - mh - 8) + 'px';
    menu.style.left = Math.min(clientX, window.innerWidth - mw - 8) + 'px';
  }

  editor.view.dom.addEventListener('contextmenu', e => {
    const sel = selState();
    if (!sel) return; // let default menu happen
    const env = detectMatrixEnv(sel.node.attrs.latex ?? '');
    if (!env) return;
    e.preventDefault();
    current = sel;
    buildMenu(sel.node.attrs.latex ?? '', e.clientX, e.clientY);
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('lineae-math-selection', event => {
      const detail = event.detail;
      if (!detail?.field?.isConnected) return;
      if (detail.collapsed) {
        if (current?.partial && current.field === detail.field) hide();
        return;
      }
      showPartial(detail);
    });
  }
  document.addEventListener('pointerdown', e => {
    if (!bar.contains(e.target) && !menu.contains(e.target)) hide(true);
  });
  const onPointerMove = () => { if (current) syncVisibility(); };
  document.addEventListener('pointerover', onPointerMove, true);
  document.addEventListener('pointerout', onPointerMove, true);
  bar.addEventListener('pointerenter', () => clearTimeout(visibilityTimer));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(true); });
  editor.on('selectionUpdate', update);
  editor.on('blur', () => { setTimeout(() => { if (!bar.matches(':hover') && performance.now() >= holdToolbarUntil) bar.hidden = true; }, 150); });
  editor.view.dom.addEventListener('scroll', () => { bar.hidden = true; menu.hidden = true; }, true);
}
