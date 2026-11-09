import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDocument } from '../apps/web/latex/document.mjs';
import { parseInline } from '../apps/web/latex/inline.mjs';
import { exportDocument, resolvePackages } from '../apps/web/latex/packages.mjs';

test('preserves the bytes of an untouched document, including CRLF and opaque environments', () => {
  const source = [
    '\\documentclass{article}', '% keep this', '\\begin{document}', '',
    '数学 $x^2$', '', '\\begin{opaque}', 'first', '', 'second', '\\end{opaque}', '', '\\end{document}', '',
  ].join('\r\n');
  const doc = parseDocument(source);
  assert.equal(doc.eol, '\r\n');
  assert.ok(doc.blocks.some(block => block.includes('first\r\n\r\nsecond')));
  assert.equal(exportDocument(doc, doc.blocks.join('')), source);
});

test('recognizes inline formatting and preserves the original math delimiter', () => {
  const [span] = parseInline(String.raw`\textcolor[HTML]{445566}{\textit{中文 \(x^2\)}}`);
  assert.equal(span.value, '#445566');
  const [text, math] = span.children[0].children;
  assert.equal(text, '中文 ');
  assert.deepEqual(math, { math: 'x^2', delimiters: ['\\(', '\\)'] });
  assert.equal(parseInline(String.raw`\unknown{内容}`), null);
});

test('adds only missing dependencies and respects declared package lists and comments', () => {
  const preamble = '\\usepackage[options]{amsmath, xcolor}\n%\\usepackage{booktabs}\n';
  const body = '\\dfrac{1}{2} \\toprule \\textcolor{red}{x}\n%\\includegraphics{x}\n\\href{u}{name}';
  assert.deepEqual(resolvePackages(preamble, body).map(rule => rule.name), ['booktabs', 'hyperref']);
});

test('places font support before the class and color support before the document', () => {
  const source = '\\documentclass{article}\n\\begin{document}\n\\end{document}\n';
  const doc = parseDocument(source);
  const body = String.raw`{\fontsize{24}{29}\selectfont \textcolor{red}{X}}`;
  const result = exportDocument(doc, body);
  assert.match(result, /^\\RequirePackage\{fix-cm\}\n\\documentclass/);
  assert.match(result, /\\usepackage\{xcolor\}\n\\begin\{document\}/);
  assert.equal(exportDocument(parseDocument(result), body), result);
});

test('keeps booktabs rules and alignment around editable cells', async () => {
  const { parseTable, serializeTable } = await import('../apps/web/latex/tables.mjs');
  const source = ['\\begin{tabular}{lc}', '\\toprule', 'A & B \\\\', '\\midrule', '1 & 2 \\\\', '\\bottomrule', '\\end{tabular}'].join('\n');
  const table = parseTable(source);
  assert.equal(table.columns, 'lc');
  assert.deepEqual(table.rows[1].rules, ['\\midrule']);
  table.rows[1].cells[0] = '3 ';
  assert.match(serializeTable(table, '\n'), /\\midrule\n3 & 2/);
  assert.deepEqual(resolvePackages('', source).map(rule => rule.name), ['booktabs']);
});
