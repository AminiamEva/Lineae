import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapMath, toggleWrapMath, clearMathFont, setMathColor, setMathSize, detectMatrixEnv, switchMatrixEnv, matrixAddRow, matrixAddColumn, classifyContent, isCompleteMathSelection, LATEX_COLORS, MATH_FONTS_ALPHA, MATH_FONTS_SYMBOL, MATH_ACCENTS, MATH_SIZES } from '../apps/web/src/ui/math-float-toolbar.js';

test('latex transforms', () => {
  assert.equal(wrapMath('a+b', 'boxed'), '\\boxed{a+b}');
  assert.equal(wrapMath('\\boxed{a+b}', 'boxed'), '\\boxed{a+b}');
  assert.equal(wrapMath('\\mathbb{x}', 'mathbf'), '\\mathbf{x}', 'Font changes replace instead of nesting');
  assert.equal(wrapMath('\\mathcal{\\mathbb{\\mathbf{x}}}', 'mathbf'), '\\mathbf{x}');
  assert.equal(wrapMath('\\mathbf{a}+b', 'mathbb'), '\\mathbb{\\mathbf{a}+b}', 'Only a whole outer wrapper may be replaced');
  assert.equal(setMathColor('a', 'red'), '\\textcolor{red}{a}');
  assert.equal(setMathColor('\\textcolor{blue}{a}', 'red'), '\\textcolor{red}{a}');
  assert.equal(setMathColor('\\textcolor{blue}{a}+b', 'red'), '\\textcolor{red}{\\textcolor{blue}{a}+b}',
    'Recoloring a larger selection keeps its trailing content');
  assert.equal(setMathSize('a', 'scriptstyle'), '\\scriptstyle a');
  assert.equal(setMathSize('\\scriptstyle a', 'displaystyle'), 'a');
  assert.equal(setMathSize('\\scriptstyle a', 'scriptstyle'), '\\scriptstyle a');
});

test('underline toggles off and nested wrappers are preserved', () => {
  assert.equal(toggleWrapMath('a', 'underline'), '\\underline{a}');
  assert.equal(toggleWrapMath('\\underline{a}', 'underline'), 'a');
  assert.equal(toggleWrapMath('\\mathbf{\\underline{a}}', 'underline'), '\\mathbf{a}');
  assert.equal(toggleWrapMath('\\textcolor{red}{\\underline{a}}', 'underline'), '\\textcolor{red}{a}');
  assert.equal(toggleWrapMath('\\underline{a}+b', 'underline'), '\\underline{\\underline{a}+b}');
});

test('clear font strips math font commands only', () => {
  assert.equal(clearMathFont('\\mathbf{x}'), 'x');
  assert.equal(clearMathFont('\\mathit{\\mathbf{x}}'), 'x');
  assert.equal(clearMathFont('\\textcolor{red}{\\mathbf{x}}'), '\\textcolor{red}{x}');
  assert.equal(clearMathFont('\\underline{\\boldsymbol{\\alpha}}'), '\\underline{\\alpha}');
  assert.equal(clearMathFont('\\displaystyle \\mathsf{A}'), '\\displaystyle A');
  assert.equal(clearMathFont('\\alpha'), '\\alpha');
  assert.equal(clearMathFont('x+y'), 'x+y');
});


test('partial selections require complete LaTeX objects', () => {
  assert.equal(isCompleteMathSelection('abc', 0, 1), true);
  assert.equal(isCompleteMathSelection('abc', 0, 0), false);
  assert.equal(isCompleteMathSelection('\\frac{1}{2}', 0, 11), true);
  assert.equal(isCompleteMathSelection('\\frac{1}{2}', 0, 8), false);
  assert.equal(isCompleteMathSelection('\\left(a\\right)', 0, 8), false);
  assert.equal(isCompleteMathSelection('\\left(a\\right)', 0, 14), true);
  assert.equal(isCompleteMathSelection('\\begin{pmatrix}a\\end{pmatrix}', 0, 29), true);
  assert.equal(isCompleteMathSelection('\\begin{pmatrix}a\\end{pmatrix}', 0, 17), false);
  assert.equal(isCompleteMathSelection('\\alpha', 0, 4), false);
  assert.equal(isCompleteMathSelection('\\alpha', 0, 6), true);
  assert.equal(isCompleteMathSelection('\\left(a\\right)', 0, 6), false);
  assert.equal(isCompleteMathSelection('(a)', 0, 2), false);
  assert.equal(isCompleteMathSelection('(a)', 0, 3), true);
});

test('matrix ops', () => {
  const m = '\\begin{pmatrix}1 & 2 \\\\ 3 & 4\\end{pmatrix}';
  assert.equal(detectMatrixEnv(m), 'pmatrix');
  assert.equal(switchMatrixEnv(m, 'bmatrix'), '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}');
  const r = matrixAddRow(m);
  assert.match(r, /\\\\\s*0 & 0\s*\\end\{pmatrix\}/);
  const c = matrixAddColumn(m);
  assert.equal((c.match(/&/g) || []).length, 4);
  assert.equal(detectMatrixEnv('a+b'), null);
});

test('content classification drives font list', () => {
  assert.equal(classifyContent('\\frac{1}{2}'), 'symbol');
  assert.equal(classifyContent('x+y'), 'alpha');
  assert.equal(classifyContent('\\textcolor{red}{ABC}'), 'alpha');
  assert.equal(classifyContent('\\alpha'), 'symbol');
});

test('UI constants complete', () => {
  assert.equal(LATEX_COLORS.length, 20);
  assert.ok(MATH_FONTS_ALPHA.length >= 8);
  assert.ok(MATH_FONTS_SYMBOL.length >= 2);
  assert.equal(MATH_ACCENTS.length, 13);
  assert.equal(MATH_SIZES.length, 4);
});

test('all new UI elements construct and display (DOM stub smoke)', async () => {
  const made = [];
  const mkEl = tag => {
    const el = {
      tagName: tag, children: [], style: {}, dataset: {}, attributes: {},
      hidden: false, textContent: '', innerHTML: '', type: '', value: '',
      classList: { add() {}, toggle() {}, contains: () => false },
      setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { this.attributes[k]; },
      append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
      replaceChildren(...c) { this.children = c; }, contains: () => false, matches: () => false,
      addEventListener() {}, querySelector: () => null,
    };
    made.push(el);
    return el;
  };
  globalThis.document = {
    createElement: mkEl, createElementNS: mkEl,
    createTextNode: t => ({ text: t }),
    body: mkEl('body'),
    addEventListener() {}, getElementById: () => null,
  };
  const { installMathFloatToolbar } = await import('../apps/web/src/ui/math-float-toolbar.js');
  const editor = { state: { selection: null, tr: null }, view: { dom: { addEventListener() {} }, dispatch() {}, nodeDOM: () => null }, on() {}, commands: {} };
  installMathFloatToolbar({ editor });
  // the two root containers must exist and contain expected controls
  const roots = made.filter(e => e.tagName === 'div' && (e.className === 'math-float-toolbar' || e.className === 'math-matrix-menu'));
  assert.equal(roots.length, 2, 'toolbar + menu roots created');
  assert.equal(roots[0].hidden, true);
  console.log('new elements constructed:', made.length);
});
