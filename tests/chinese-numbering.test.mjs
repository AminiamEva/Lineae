import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chineseNumber } from '../apps/web/latex/chinese-numbering.mjs';
import { counterProfile, formatCounter } from '../apps/web/latex/counter-profile.mjs';
import { headingOutline } from '../apps/web/latex/heading-numbering.mjs';

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
const heading = (command, text, attrs = {}) => ({ type: 'heading', attrs: { command, level: { part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3 }[command], ...attrs }, text });
const CTEXBOOK = '\\documentclass[UTF8,scheme=chinese]{ctexbook}';

test('chineseNumber covers the documented counters algorithmically', () => {
  const cases = {
    0: '零', 1: '一', 10: '十', 11: '十一', 20: '二十', 21: '二十一', 99: '九十九',
    100: '一百', 101: '一百零一', 110: '一百一十', 999: '九百九十九', 1000: '一千',
    1001: '一千零一', 1010: '一千零一十', 1100: '一千一百', 10000: '一万', 10001: '一万零一',
    10010: '一万零一十', 11000: '一万一千', 100000: '十万', 100000000: '一亿', 100000001: '一亿零一',
  };
  for (const [value, expected] of Object.entries(cases)) assert.equal(chineseNumber(Number(value)), expected, `chineseNumber(${value})`);
});

test('counterProfile exposes tocdepth and part numbering', () => {
  assert.equal(counterProfile('\\documentclass{article}').tocdepth, 3);
  assert.equal(counterProfile('\\documentclass{book}').tocdepth, 2);
  assert.equal(counterProfile('\\documentclass{article}\\setcounter{tocdepth}{1}').tocdepth, 1);
  const profile = counterProfile('\\documentclass{book}');
  assert.equal(formatCounter('part', { part: 1 }, profile), 'I');
});

test('formatCounter understands chinese/zhnum formats', () => {
  const profile = counterProfile('\\documentclass{book}\\ctexset{chapter/number=\\chinese{chapter}}\\renewcommand{\\thesection}{\\thechapter.\\arabic{section}}');
  assert.equal(formatCounter('chapter', { chapter: 12 }, profile), '十二');
  assert.equal(formatCounter('section', { chapter: 3, section: 2 }, profile), '三.2');
  assert.equal(formatCounter('part', { part: 0 }, profile), '');
});

test('ctexbook outline numbers parts/chapters/sections and keeps chapter across parts', () => {
  const doc = fakeDoc(CTEXBOOK, [
    heading('part', '第一部分标题'),
    heading('chapter', '第一章标题', { shortTitle: '短章' }),
    heading('section', '一节'),
    heading('chapter', '第二章标题'),
    heading('section', '二节'),
  ]);
  const items = headingOutline(doc);
  assert.deepEqual(items.map(item => item.command), ['part', 'chapter', 'section', 'chapter', 'section']);
  assert.deepEqual(items.map(item => item.depth), [-1, 0, 1, 0, 1]);
  assert.deepEqual(items.map(item => item.level), [1, 2, 3, 2, 3]);
  assert.equal(items[0].number, 'I');
  assert.equal(items[0].displayLabel, '第一部分');
  assert.equal(items[1].number, '1');
  assert.equal(items[1].displayLabel, '第一章');
  assert.equal(items[2].number, '1.1');
  assert.equal(items[3].number, '2', 'a part must not reset the chapter counter');
  assert.equal(items[3].displayLabel, '第二章');
  assert.equal(items[4].number, '2.1');
  assert.equal(items[1].shortTitle, '短章');
  assert.equal(items[1].afterName, '\\quad');
  assert.deepEqual(items[1].counters, { part: 1, chapter: 1, section: 0, subsection: 0, subsubsection: 0, paragraph: 0, subparagraph: 0 });
});

test('standard book plus ctex keeps standard number labels', () => {
  const doc = fakeDoc('\\documentclass{book}\\usepackage[UTF8]{ctex}', [
    heading('part', 'Part'),
    heading('chapter', 'Chapter'),
    heading('section', 'Section'),
  ]);
  const items = headingOutline(doc);
  assert.equal(items[0].number, 'I');
  assert.equal(items[0].displayLabel, 'Part I');
  assert.equal(items[1].number, '1');
  assert.equal(items[1].displayLabel, 'Chapter 1');
});

test('appendix, starred headings, matter and short titles', () => {
  const doc = fakeDoc(CTEXBOOK, [
    { type: 'matterStart', attrs: { matter: 'front' } },
    heading('chapter', '前言'),
    { type: 'matterStart', attrs: { matter: 'main' } },
    heading('chapter', '正文'),
    heading('section', '星号', { numbered: false }),
    heading('section', '显式标题', { shortTitle: '短标题' }),
    { type: 'appendixStart' },
    heading('chapter', '附录'),
  ]);
  const items = headingOutline(doc);
  assert.equal(items[0].number, '', 'front matter chapter is unnumbered');
  assert.equal(items[0].toc, false);
  assert.equal(items[1].number, '1');
  assert.equal(items[2].number, '', 'starred heading does not number');
  assert.equal(items[2].toc, false);
  assert.equal(items[3].shortTitle, '短标题');
  assert.equal(items[4].number, 'A');
  assert.equal(items[4].displayLabel, '附录A');
  assert.equal(items[4].toc, true);
});

test('secnumdepth and tocdepth are independent', () => {
  const doc = fakeDoc('\\documentclass{article}\\setcounter{secnumdepth}{-2}\\setcounter{tocdepth}{3}', [
    heading('section', '无编号但有目录'),
    heading('subsection', '二级'),
    heading('subsubsection', '三级'),
  ]);
  const items = headingOutline(doc);
  assert.deepEqual(items.map(item => item.number), ['', '', '']);
  assert.deepEqual(items.map(item => item.toc), [true, true, true]);

  const limited = fakeDoc(CTEXBOOK, [
    heading('chapter', '章'),
    { type: 'counterDirective', attrs: { latex: '\\setcounter{tocdepth}{1}' } },
    heading('section', '节'),
    heading('subsection', '小节'),
  ]);
  const limitedItems = headingOutline(limited);
  assert.equal(limitedItems[1].toc, true);
  assert.equal(limitedItems[2].toc, false, 'tocdepth directive filters later entries');
});
