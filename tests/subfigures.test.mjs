import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeSubfigures, parseImageBlock } from '../apps/web/latex/images.mjs';

const group = { placement: 'htbp', caption: 'Main caption', label: 'fig:main' };
const kids = [
  { attrs: { path: 'a.png', width: '0.48\\textwidth', caption: 'Sub A' } },
  { attrs: { path: 'b.png', width: '0.48\\textwidth' } },
];

test('serializeSubfigures emits subfigure environments', () => {
  const out = serializeSubfigures(group, kids);
  assert.match(out, /\\begin\{figure\}\[htbp\]/);
  assert.match(out, /\\begin\{subfigure\}\{0\.48\\textwidth\}/);
  assert.match(out, /\\caption\{Sub A\}/);
  assert.match(out, /\\hfill/);
  assert.match(out, /\\caption\{Main caption\}/);
  assert.match(out, /\\label\{fig:main\}/);
  assert.match(out, /\\end\{figure\}/);
});

test('subfigure graphics carry no width option', () => {
  const out = serializeSubfigures(group, kids);
  assert.ok(!out.includes('width=0.48'));
});

test('parseImageBlock imports subfigure groups', () => {
  const tex = [
    '\\begin{figure}[htbp]',
    '\\centering',
    '\\begin{subfigure}{0.48\\textwidth}',
    '\\centering\\includegraphics[width=0.48\\textwidth]{a.png}',
    '\\caption{Sub A}',
    '\\end{subfigure}\\hfill',
    '\\begin{subfigure}{0.48\\textwidth}',
    '\\centering\\includegraphics[width=0.48\\textwidth]{b.png}',
    '\\end{subfigure}',
    '\\caption{Main caption}\\label{fig:main}',
    '\\end{figure}',
  ].join('\n');
  const node = parseImageBlock(tex);
  assert.equal(node.type, 'subfigures');
  assert.equal(node.attrs.caption, 'Main caption');
  assert.equal(node.attrs.label, 'fig:main');
  assert.equal(node.attrs.placement, 'htbp');
  assert.equal(node.content.length, 2);
  assert.equal(node.content[0].attrs.path, 'a.png');
  assert.equal(node.content[0].attrs.caption, 'Sub A');
  assert.equal(node.content[1].attrs.captionEnabled, false);
});
