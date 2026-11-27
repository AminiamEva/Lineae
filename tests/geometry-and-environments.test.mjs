import test from 'node:test';
import assert from 'node:assert/strict';
import {importBlocks} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {readPageSetup, writePageSetup} from '../apps/web/latex/geometry.mjs';

const textOf = node => node?.text ?? node?.content?.map(textOf).join('') ?? '';

test('\\geometry{...} sets the paper and all four margins', () => {
  const source = String.raw`\documentclass{article}
\usepackage{geometry}
\geometry{a4paper, left=1.2cm, right=1.2cm, top=1.2cm, bottom=1.8cm}
\begin{document}
Body.
\end{document}
`;
  assert.deepEqual(readPageSetup(source), {
    paper: 'a4',
    orientation: 'portrait',
    margin: 'custom',
    margins: { top: '1.2cm', right: '1.2cm', bottom: '1.8cm', left: '1.2cm' },
  });
});

test('runtime \\geometry overrides package options and writePageSetup keeps it', () => {
  const source = String.raw`\documentclass{article}
\usepackage[a4paper,left=2cm,top=2cm]{geometry}
\geometry{a4paper, left=1.2cm, right=1.2cm, top=1.2cm, bottom=1.8cm}
\begin{document}
Body.
\end{document}
`;
  const setup = readPageSetup(source);
  assert.equal(setup.paper, 'a4');
  assert.deepEqual(setup.margins, { top: '1.2cm', right: '1.2cm', bottom: '1.8cm', left: '1.2cm' });

  const updated = writePageSetup(source, {
    paper: 'letter',
    orientation: 'portrait',
    margins: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
  });
  assert.ok(updated.includes('\\geometry{letterpaper,margin=2cm}'), updated);
  assert.ok(updated.includes('\\usepackage[a4paper,left=2cm,top=2cm]{geometry}'), 'package line is untouched');
  assert.deepEqual(readPageSetup(updated).margins, { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' });
});

test('text directly before an environment is split without a blank line', () => {
  const source = String.raw`\documentclass{article}
\begin{document}
Text before
\begin{itemize}
\item One
\item Two
\end{itemize}
After
\end{document}
`;
  const nodes = parseDocument(source).blocks.flatMap(importBlocks);
  assert.deepEqual(nodes.map(node => node.type), ['paragraph', 'bulletList', 'paragraph']);
  assert.equal(textOf(nodes[0]), 'Text before');
  assert.equal(textOf(nodes[2]), 'After');
  assert.deepEqual(nodes[1].content.map(item => textOf(item)), ['One', 'Two']);
});

test('enumerate and quote also split from preceding text', () => {
  const source = String.raw`\documentclass{article}
\begin{document}
Intro
\begin{enumerate}
\item First
\item Second
\end{enumerate}
Quote intro
\begin{quote}
Quoted text.
\end{quote}
Tail
\end{document}
`;
  const nodes = parseDocument(source).blocks.flatMap(importBlocks);
  assert.deepEqual(nodes.map(node => node.type), ['paragraph', 'orderedList', 'paragraph', 'blockquote', 'paragraph']);
  assert.deepEqual(nodes[1].content.map(item => textOf(item)), ['First', 'Second']);
  assert.equal(textOf(nodes[3]), 'Quoted text.');
});
