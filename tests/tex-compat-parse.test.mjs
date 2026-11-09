import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from '../apps/web/latex/document.mjs';
import { importBlocks } from '../apps/web/latex/blocks.mjs';
import { mathSymbols } from '../apps/web/latex/math-symbols.mjs';

const root = 'tests/fixtures/tex-compat';
const files = [
  'text/text-paragraphs.tex',
  'text/text-escaped.tex',
  'text/text-emphasis.tex',
  'text/text-comments.tex',
  'text/text-unicode.tex',
  'headings/headings-levels.tex',
  'headings/headings-starred.tex',
  'headings/headings-short-title.tex',
  'headings/headings-label-ref.tex',
  'headings/headings-toc.tex',
];

function parse(file) {
  const source = readFileSync(join(root, file), 'utf8');
  const document = parseDocument(source);
  assert.ok(document, file + ' should parse');
  return document.blocks.flatMap(importBlocks);
}

function textOf(node) {
  return (node.content ?? []).map(child => {
    if (child.type === 'text') return child.text;
    if (child.type === 'hardBreak') return '\n';
    if (child.type === 'ref') return '\\ref{' + child.attrs.key + '}';
    return textOf(child);
  }).join('');
}

test('the first ten fixtures produce structured nodes without raw fallback', () => {
  for (const file of files) {
    const nodes = parse(file);
    assert.ok(nodes.length, file + ' should produce nodes');
    assert.ok(nodes.every(node => node.type !== 'raw'), file + ' should not fall back to raw');
  }
});

test('paragraphs, escapes, emphasis, comments and unicode remain editable', () => {
  const paragraphs = parse('text/text-paragraphs.tex');
  assert.deepEqual(paragraphs.map(node => node.type), ['paragraph', 'paragraph']);
  assert.ok(paragraphs[1].content.some(node => node.type === 'hardBreak'));
  assert.equal(textOf(paragraphs[1]), 'Second paragraph.\nSame paragraph, new line.');

  const escaped = parse('text/text-escaped.tex');
  assert.equal(textOf(escaped[0]), 'Symbols: % & _ # $ { }.');
  assert.equal(textOf(escaped[1]), 'Backslash: \\.');

  const emphasis = parse('text/text-emphasis.tex');
  const bold = emphasis[0].content.find(node => node.marks?.some(mark => mark.type === 'bold'));
  const boldItalic = emphasis[0].content.find(node => node.marks?.some(mark => mark.type === 'bold') && node.marks?.some(mark => mark.type === 'italic'));
  assert.ok(bold, 'bold text is editable');
  assert.ok(boldItalic, 'nested emph text carries both marks');
  const italicBold = emphasis[1].content.find(node => node.marks?.some(mark => mark.type === 'italic') && node.marks?.some(mark => mark.type === 'bold'));
  assert.ok(italicBold, 'nested textbf inside textit carries both marks');

  const comments = parse('text/text-comments.tex');
  assert.equal(textOf(comments[0]), 'Visiblejoined.');
  assert.equal(textOf(comments[1]), 'Rate: 25%. Next sentence.');

  const unicode = parse('text/text-unicode.tex');
  assert.equal(textOf(unicode[0]), '中文段落：数学论文。');
  assert.equal(textOf(unicode[1]), 'English paragraph: mathematics.');
});

test('all catalog math symbols stay inside editable math nodes', () => {
  for (const name of mathSymbols.filter(name => /^[A-Za-z]+$/.test(name))) {
    const nodes = importBlocks('$\\' + name + '$');
    assert.equal(nodes[0]?.type, 'paragraph', name);
    assert.equal(nodes[0].content[0]?.type, 'math', name);
    assert.equal(nodes[0].content[0].attrs.latex, '\\' + name);
  }
});

test('common text commands are parsed without raw fallback', () => {
  const parts = importBlocks(String.raw`First\par Second`);
  assert.deepEqual(parts.map(node => node.type), ['paragraph', 'paragraph']);
  assert.deepEqual(parts.map(textOf), ['First', 'Second']);

  const [line] = importBlocks(String.raw`A\linebreak B`);
  assert.ok(line.content.some(node => node.type === 'hardBreak'));

  const [spaced] = importBlocks(String.raw`A\hspace{1em}B`);
  assert.equal(textOf(spaced), 'AB');

  const [symbols] = importBlocks(String.raw`\noindent \textasciicircum{} \textasciitilde{} \textbackslash{} \textsection{} \LaTeX{}`);
  assert.equal(textOf(symbols), '^ ~ \\ § LaTeX');

  const [formatted] = importBlocks(String.raw`\textbf{bold} \textsc{small} \sout{gone} \texttt{code}`);
  assert.equal(formatted.content.find(node => node.marks?.some(mark => mark.type === 'bold'))?.text, 'bold');
  assert.equal(formatted.content.find(node => node.marks?.some(mark => mark.type === 'strike'))?.text, 'gone');
  assert.equal(formatted.content.find(node => node.marks?.some(mark => mark.type === 'code'))?.text, 'code');
  assert.ok(textOf(formatted).includes('small'));
});

test('inline math commands and block math environments stay editable', () => {
  const inline = importBlocks(String.raw`Inline $\mathbf{x}$ end.`);
  assert.equal(inline[0].type, 'paragraph');
  const math = inline[0].content.find(node => node.type === 'math');
  assert.equal(math?.attrs.latex, String.raw`\mathbf{x}`);

  const align = importBlocks(String.raw`\begin{align}
\mathbf{x} &= 1 \\
\end{align}`);
  assert.equal(align[0].type, 'mathBlock');
  assert.match(align[0].attrs.latex, /^\\begin\{align\}/);
  assert.match(align[0].attrs.latex, /\\mathbf\{x\}/);
});

test('lists and tables in fixtures 11-20 are structured without raw fallback', () => {
  const files = [
    'lists/lists-itemize.tex', 'lists/lists-enumerate.tex', 'lists/lists-nested.tex',
    'lists/lists-description.tex', 'lists/lists-paragraphs.tex',
    'tables/tables-basic.tex', 'tables/tables-alignment.tex', 'tables/tables-multicolumn.tex',
    'tables/tables-booktabs.tex', 'tables/tables-paragraph-cell.tex',
  ];
  for (const file of files) {
    const nodes = parse(file);
    assert.ok(nodes.length, file);
    assert.ok(nodes.every(node => node.type !== 'raw'), file + ' should not fall back to raw');
  }

  const itemize = parse('lists/lists-itemize.tex');
  assert.equal(itemize[0].type, 'bulletList');
  assert.equal(itemize[0].content.length, 3);
  assert.equal(textOf(itemize[0].content[0]), 'Apple');

  const nested = parse('lists/lists-nested.tex')[0];
  assert.equal(nested.type, 'orderedList');
  assert.equal(nested.content.length, 2);
  const inner = nested.content[0].content.find(node => node.type === 'bulletList');
  assert.equal(inner?.content.length, 2);
  assert.equal(textOf(inner.content[0]), 'Inner A');

  const description = parse('lists/lists-description.tex')[0];
  assert.equal(description.type, 'descriptionList');
  assert.deepEqual(description.content.map(item => item.attrs.term), ['Domain', 'Range']);
  assert.equal(textOf(description.content[0]), 'Inputs.');

  const paragraphs = parse('lists/lists-paragraphs.tex')[0];
  assert.equal(paragraphs.content[0].content.filter(node => node.type === 'paragraph').length, 2);

  const basic = parse('tables/tables-basic.tex')[0];
  assert.equal(basic.type, 'table');
  assert.equal(basic.attrs.columns, 'll');
  assert.equal(basic.content.length, 2);
  assert.equal(basic.content[0].content.length, 2);

  const alignment = parse('tables/tables-alignment.tex')[0];
  assert.deepEqual(alignment.content[0].content.map(cell => cell.attrs.align), ['left', 'center', 'right']);

  const multicolumn = parse('tables/tables-multicolumn.tex')[0];
  assert.equal(multicolumn.content[0].content[0].attrs.colspan, 2);
  assert.equal(textOf(multicolumn.content[0].content[0]), 'Combined');

  const booktabs = parse('tables/tables-booktabs.tex')[0];
  assert.equal(booktabs.attrs.booktabs, true);
  assert.equal(booktabs.content.length, 2);

  const paragraphCell = parse('tables/tables-paragraph-cell.tex')[0];
  assert.equal(paragraphCell.attrs.columns, 'p{3cm}l');
  assert.match(textOf(paragraphCell.content[0].content[0]), /deliberately long sentence/);
});

test('list label styles are parsed for editing', () => {
  const alpha = importBlocks(String.raw`\begin{enumerate}[label=\alph*]
\item Alpha
\item Beta
\end{enumerate}`)[0];
  assert.equal(alpha.type, 'orderedList');
  assert.equal(alpha.attrs.labelStyle, 'lower-alpha');

  const chinese = importBlocks(String.raw`\begin{enumerate}[label=\chinese*]
\item 甲
\end{enumerate}`)[0];
  assert.equal(chinese.attrs.labelStyle, 'cjk-heavenly-stem');

  const bullet = importBlocks(String.raw`\begin{itemize}[label=★]
\item A
\end{itemize}`)[0];
  assert.equal(bullet.attrs.marker, '★');
});

test('heading levels, starred headings, short titles, labels, references and contents are structured', () => {
  const levels = parse('headings/headings-levels.tex');
  assert.deepEqual(levels.map(node => node.attrs?.level), [1, 2, 3]);
  assert.ok(levels.every(node => node.type === 'heading' && node.attrs.numbered));

  const starred = parse('headings/headings-starred.tex');
  assert.deepEqual(starred.map(node => node.attrs.numbered), [true, false, true]);

  const shortTitle = parse('headings/headings-short-title.tex');
  assert.deepEqual(shortTitle.map(node => node.type), ['tableOfContents', 'heading']);
  assert.equal(shortTitle[1].attrs.shortTitle, 'Short');
  assert.equal(textOf(shortTitle[1]), 'A longer section title');

  const label = parse('headings/headings-label-ref.tex');
  assert.deepEqual(label.map(node => node.type), ['heading', 'paragraph']);
  assert.equal(label[0].attrs.label, 'sec:target');
  const reference = label[1].content.find(node => node.type === 'ref');
  assert.equal(reference?.attrs.key, 'sec:target');
  assert.ok(label[1].content.some(node => node.type === 'text' && node.text.includes('\u00A0')), 'tilde becomes a non-breaking space');

  const toc = parse('headings/headings-toc.tex');
  assert.deepEqual(toc.map(node => node.type), ['tableOfContents', 'heading', 'paragraph', 'heading', 'paragraph']);
  assert.deepEqual(toc.filter(node => node.type === 'heading').map(node => node.attrs.level), [1, 2]);
  assert.equal(textOf(toc[4]), 'More text.');
});
