import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTocModel, pageIndexAtSourcePosition } from '../apps/web/latex/toc-model.mjs';

function fakeDoc(preamble, nodes) {
  return {
    attrs: { layoutPreamble: preamble },
    descendants(callback) {
      nodes.forEach((node, index) => callback({
        type: { name: node.type },
        attrs: node.attrs || {},
        textContent: node.text || '',
        nodeSize: 1,
      }, index + 1));
    },
  };
}
const heading = (command, text, attrs = {}) => ({
  type: 'heading',
  attrs: { command, level: { part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3 }[command], ...attrs },
  text,
});
const raw = source => ({ type: 'raw', attrs: { source } });
const ARTICLE = '\\documentclass{article}';

test('TOC model filters automatic entries by tocdepth and keeps source order', () => {
  const doc = fakeDoc(`${ARTICLE}\\setcounter{tocdepth}{1}`, [
    heading('section', '第一节'),
    heading('subsection', '隐藏小节'),
    heading('section', '星号节', { numbered: false }),
    raw('\\addcontentsline{toc}{section}{显式目录项}'),
  ]);
  const { entries, diagnostics } = buildTocModel(doc);
  assert.deepEqual(entries.map(entry => entry.tocText), ['第一节', '显式目录项']);
  assert.deepEqual(entries.map(entry => entry.explicit), [false, true]);
  assert.deepEqual(diagnostics, []);
});

test('short titles and numberline entries are preserved; addtocontents is diagnostic', () => {
  const doc = fakeDoc(ARTICLE, [
    heading('section', '正文长标题', { shortTitle: '短标题' }),
    raw('\\addcontentsline{toc}{section}{\\numberline{9}编号项}'),
    raw('\\addtocontents{toc}{\\protect\\contentsline{section}{注入}}'),
  ]);
  const { entries, diagnostics } = buildTocModel(doc);
  assert.equal(entries[0].tocText, '短标题');
  assert.equal(entries[1].number, '9');
  assert.equal(entries[1].tocText, '编号项');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].reason, 'unsupported addtocontents');
});

test('appendix and matter are tracked for automatic and explicit entries', () => {
  const doc = fakeDoc('\\documentclass{book}', [
    { type: 'matterStart', attrs: { matter: 'front' } },
    heading('chapter', '前言'),
    { type: 'matterStart', attrs: { matter: 'main' } },
    heading('chapter', '正文'),
    { type: 'appendixStart' },
    heading('chapter', '附录'),
    raw('\\addcontentsline{toc}{section}{附录显式}'),
  ]);
  const { entries } = buildTocModel(doc);
  assert.deepEqual(entries.map(entry => entry.tocText), ['正文', '附录', '附录显式']);
  assert.equal(entries[0].matter, 'main');
  assert.equal(entries[1].appendix, true);
  assert.equal(entries[2].appendix, true);
});

test('a tocdepth directive inside the body filters later automatic entries', () => {
  const doc = fakeDoc('\\documentclass{book}', [
    heading('chapter', '章'),
    { type: 'counterDirective', attrs: { latex: '\\setcounter{tocdepth}{1}' } },
    heading('section', '节'),
    heading('subsection', '小节'),
  ]);
  const { entries } = buildTocModel(doc);
  assert.deepEqual(entries.map(entry => entry.tocText), ['章', '节']);
});

test('pageIndexAtSourcePosition never falls back to a row index', () => {
  const page = { getAttribute: name => name === 'data-page-index' ? '2' : null };
  const view = {
    nodeDOM: () => ({ closest: selector => selector === '[data-page-index]' ? page : null }),
    dom: {},
  };
  assert.equal(pageIndexAtSourcePosition(view, 10), 2);
  assert.equal(pageIndexAtSourcePosition({ nodeDOM: () => null, dom: { querySelector: () => null } }, 10), null);
});
