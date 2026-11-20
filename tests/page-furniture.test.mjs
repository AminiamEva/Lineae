import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readPageFurniture, writePageFurniture, pageFurnitureText, furnitureSlots,
} from '../apps/web/latex/page-furniture.mjs';

test('reads plain and empty page styles', () => {
  const plain = readPageFurniture('\\documentclass{article}');
  assert.equal(plain.style, 'plain');
  assert.equal(plain.enabled, false);
  assert.equal(pageFurnitureText(plain.footer.center.odd, 1), '1');
  const empty = readPageFurniture('\\documentclass{article}\n\\pagestyle{empty}');
  assert.equal(empty.style, 'empty');
  assert.equal(empty.enabled, false);
});

test('reads and writes all twelve fancyhdr slots', () => {
  const source = [
    '\\documentclass[a4paper]{article}',
    '\\usepackage{fancyhdr}',
    '\\pagestyle{fancy}',
    '\\fancyhf{}',
    '\\fancyhead[LE]{Even left}',
    '\\fancyhead[RO]{Odd right}',
    '\\fancyfoot[CO]{Page \\thepage}',
    '\\renewcommand{\\headrulewidth}{0.8pt}',
  ].join('\n');
  const state = readPageFurniture(source);
  assert.equal(state.oddEven, true);
  assert.equal(state.header.left.even, 'Even left');
  assert.equal(state.header.right.odd, 'Odd right');
  assert.equal(pageFurnitureText(state.footer.center.odd, 4), 'Page 4');
  assert.equal(furnitureSlots(state, 'header', 2).left, 'Even left');
  assert.equal(state.rules.headWidth, '0.8pt');

  const written = writePageFurniture(source, state);
  assert.match(written, /\\documentclass\[a4paper, twoside\]\{article\}/);
  assert.match(written, /\\fancyhead\[LE\]\{Even left\}/);
  assert.match(written, /\\fancyhead\[RO\]\{Odd right\}/);
  assert.match(written, /\\fancyfoot\[CO\]\{Page \\thepage\}/);
  assert.doesNotMatch(written, /@@lineae-page@@/);
  const readBack = readPageFurniture(written);
  assert.equal(readBack.header.left.even, 'Even left');
  assert.equal(readBack.header.right.odd, 'Odd right');
});

test('keeps the default footer page number and toggles to empty', () => {
  const state = readPageFurniture('\\usepackage{fancyhdr}\n\\pagestyle{fancy}');
  assert.equal(pageFurnitureText(state.footer.center.odd, 2), '2');
  const written = writePageFurniture('\\documentclass{article}\n\\begin{document}\nX\n\\end{document}\n', {
    ...state, enabled: false,
  });
  assert.match(written, /\\pagestyle\{empty\}/);
  assert.equal(readPageFurniture(written).enabled, false);
  assert.match(written, /\\fancyfoot\[C\]\{\\thepage\}/);
});
