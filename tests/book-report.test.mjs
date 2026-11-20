import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRoman, displayPageNumber } from '../apps/web/latex/document-numbering.mjs';
import { serialize, setSerializationClass } from '../apps/web/src/editor/latex-codec.js';

test('roman + mainmatter restart numbering', () => {
  assert.equal(toRoman(1), 'i'); assert.equal(toRoman(4), 'iv'); assert.equal(toRoman(9), 'ix');
  const fm = displayPageNumber(2, { frontmatter: true, mainStart: 3 });
  assert.equal(fm.text, 'iii'); assert.equal(fm.value, 3); assert.equal(fm.odd, true);
  const mm = displayPageNumber(3, { frontmatter: true, mainStart: 3 });
  assert.equal(mm.text, '1'); assert.equal(mm.value, 1); assert.equal(mm.odd, true);
  const art = displayPageNumber(4, {});
  assert.equal(art.text, '5'); assert.equal(art.value, 5);
});

test('report/book: heading levels export as chapter/section/subsection', () => {
  setSerializationClass('report');
  const h = (level, text) => serialize({ type: 'heading', content: [{ type: 'text', text }], attrs: { level, text, numbered: true, shortTitle: null, label: null } });
  assert.equal(h(1, '引言'), '\\chapter{引言}\n\n');
  assert.equal(h(2, '排版'), '\\section{排版}\n\n');
  assert.equal(h(3, '字体'), '\\subsection{字体}\n\n');
  setSerializationClass('article');
  assert.equal(h(1, '保持'), '\\section{保持}\n\n');
});

test('book matter markers, chapter headings and layout commands survive import', async () => {
  const { importBlocks, setHeadingBase } = await import('../apps/web/latex/blocks.mjs');
  setHeadingBase('chapter');
  const nodes = importBlocks([
    '\\frontmatter',
    '\\chapter{Preface}',
    '\\mainmatter',
    '\\chapter{Main}',
    '\\section{Details}',
    '\\maketitle',
  ].join('\n\n'));
  assert.deepEqual(nodes.map(node => node.type), [
    'matterStart', 'heading', 'matterStart', 'heading', 'heading', 'layoutCommand',
  ]);
  const matter = nodes.filter(node => node.type === 'matterStart').map(node => node.attrs.matter);
  assert.deepEqual(matter, ['front', 'main']);
  assert.equal(nodes[1].attrs.level, 1);
  assert.equal(nodes[1].attrs.command, 'chapter');
  assert.equal(nodes[4].attrs.level, 2);
  assert.equal(nodes[5].attrs.command, '\\maketitle');
  setHeadingBase(null);
  setSerializationClass('article');
});
