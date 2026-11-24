import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRoman, displayPageNumber } from '../apps/web/latex/document-numbering.mjs';
import { importBlock, setHeadingBase } from '../apps/web/latex/blocks.mjs';
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

test('report: \\chapter imports as heading level 1, \\section as level 2', () => {
  setHeadingBase('chapter');
  const ch = importBlock('\\chapter{引言}');
  assert.equal(ch.attrs.level, 1);
  assert.equal(ch.content[0].text, '引言');
  const se = importBlock('\\section{排版基础}');
  assert.equal(se.attrs.level, 2);
  setHeadingBase(null);
  const art = importBlock('\\section{保持一级}');
  assert.equal(art.attrs.level, 1);
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

test('book/report: \\part imports and round-trips as a level-1 heading', () => {
  setHeadingBase('chapter');
  const part = importBlock('\\part{第一部}');
  assert.equal(part.type, 'heading');
  assert.equal(part.attrs.level, 1);
  assert.equal(part.attrs.command, 'part');
  assert.equal(part.content[0].text, '第一部');
  setSerializationClass('book');
  assert.equal(serialize(part), '\\part{第一部}\n\n');
  setSerializationClass('article');
  setHeadingBase(null);
  const articlePart = importBlock('\\part{Part One}');
  assert.equal(articlePart.type, 'heading');
  assert.equal(articlePart.attrs.command, 'part');
  assert.equal(articlePart.attrs.level, 1);
});

test('matter commands retain their complete source spelling',()=>{
 for(const matter of ['front','main','back'])assert.equal(serialize(importBlock('\\'+matter+'matter')).trim(),'\\'+matter+'matter');
});
