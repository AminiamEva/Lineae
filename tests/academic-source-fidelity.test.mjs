// Regression specifications for draft PR source-fidelity issues.
import test from 'node:test';
import assert from 'node:assert/strict';

import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';

const samples = [
  ['tblr preserves the line break command', String.raw`A\nolinebreak B`, 'BQ', 0],
  ['tblr preserves the box around an edited token', String.raw`A\mbox{B}`, 'BQ', 0],
  ['tabularx inserts text without duplicating cell whitespace', String.raw`A&  \\Z&Y`, '  Q\\\\', 1],
];

for (const [name, body, replacement, column] of samples) {
  test(name, () => {
    const open = column ? String.raw`\begin{tabularx}{\textwidth}{XX}` : String.raw`\begin{tblr}{X}`;
    const close = column ? String.raw`\end{tabularx}` : String.raw`\end{tblr}`;
    const source = '\\begin{document}\r\n' + open + body + close + '\n\\end{document}';
    const doc = {type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
    const projection = sourceProjection(source,doc);
    const paragraph = doc.content[0].content[0].content[column].content[0];
    if (paragraph.content.length) paragraph.content.at(-1).text += 'Q';
    else paragraph.content.push({type:'text',text:'Q'});
    const changes = richSourceChanges(projection,doc);
    const actual = changes?.toReversed().reduce((text, change) =>
      text.slice(0,change.from) + change.insert + text.slice(change.to), source);
    const expected = column ? body.replace('  \\\\', replacement) : body.replace('B',replacement);
    assert.equal(actual,source.replace(body,expected));
  });
}

test('unknown command with a recognized prefix remains completely Raw', () => {
  const source = '\\begin{tblr}{X}A\\indentcustom B\\end{tblr}';
  const nodes = importBlocks(source);
  assert.deepEqual(nodes,[{type:'raw',attrs:{source}}]);
  assert.equal(serialize(nodes[0]),source);
});

test('consecutive equation environments do not capture the paragraph between them', () => {
  const source = '\\begin{document}\r\n\\begin{equation}a=b\\end{equation}\r\nMiddle prose.\n\\begin{equation}c=d\\end{equation}\n\\end{document}';
  const nodes = parseDocument(source).blocks.flatMap(importBlocks);
  assert.deepEqual(nodes.map(node=>node.type),['mathBlock','paragraph','mathBlock']);
  assert.equal(nodes[0].attrs.latex.trim(),'a=b');
  assert.equal(nodes[1].content[0].text.trim(),'Middle prose.');
  assert.equal(nodes[2].attrs.latex.trim(),'c=d');
});
