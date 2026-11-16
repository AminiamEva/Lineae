import test from 'node:test';
import assert from 'node:assert/strict';

import { planPagination, planTableRows, typesetProfile } from '../apps/web/latex/typeset-layout.mjs';

test('derives XeLaTeX article and ctex typography profiles', () => {
  const fonts = { serif: null, mono: null, cjk: null };
  assert.deepEqual(typesetProfile('\\documentclass{article}'), {
    className: 'article',
    fontSize: '9.9626pt',
    lineHeight: '11.9552pt',
    paragraphIndent: '14.9440pt',
    pageStyle: 'plain',
    fonts,
  });
  assert.deepEqual(typesetProfile('\\documentclass[12pt]{article}\\pagestyle{empty}'), {
    className: 'article',
    fontSize: '11.9552pt',
    lineHeight: '14.4458pt',
    paragraphIndent: '17.9328pt',
    pageStyle: 'empty',
    fonts,
  });
  assert.deepEqual(typesetProfile('\\documentclass[fontset=fandol]{ctexart}'), {
    className: 'ctexart',
    fontSize: '10.5pt',
    lineHeight: '15.75pt',
    paragraphIndent: '21pt',
    pageStyle: 'headings',
    fonts: { serif: null, mono: null, cjk: 'FandolSong' },
  });
  assert.deepEqual(typesetProfile('\\documentclass[12pt]{ctexart}'), {
    className: 'ctexart',
    fontSize: '11.9552pt',
    lineHeight: '14.4458pt',
    paragraphIndent: '17.9328pt',
    pageStyle: 'headings',
    fonts,
  });
});

test('reads fontspec, ctex, linespread and fontsize declarations', () => {
  const profile = typesetProfile([
    '\\documentclass[11pt]{article}',
    '\\usepackage{fontspec}',
    '\\setmainfont[Ligatures=TeX]{Times New Roman}',
    '\\setmonofont{lmmono10-regular.otf}',
    '\\setCJKmainfont[Path=./fonts/]{Noto Serif CJK SC}',
    '\\linespread{1.2}',
  ].join('\n'));
  assert.equal(profile.fonts.serif, 'Times New Roman');
  assert.equal(profile.fonts.mono, 'Latin Modern Mono');
  assert.equal(profile.fonts.cjk, 'Noto Serif CJK SC');
  assert.equal(profile.lineHeight, '16.2590pt');
  assert.equal(typesetProfile('\\documentclass{ctexart}\n\\usepackage[fontset=windows]{ctex}').fonts.cjk, 'SimSun');
  const sized = typesetProfile('\\documentclass{article}\n\\fontsize{12}{15}\\selectfont');
  assert.equal(sized.fontSize, '11.9552pt');
  assert.equal(sized.lineHeight, '14.9440pt');
});

test('paginates at block boundaries without changing document nodes', () => {
  const plan = planPagination([
    { top: 100, height: 400 },
    { top: 500, height: 350 },
    { top: 850, height: 100 },
    { top: 950, height: 100 },
  ], { pageHeight: 1000, pageGap: 20, marginTop: 100, marginBottom: 100 });
  assert.deepEqual(plan.breaks, [{ index: 2, space: 270, page: 2 }]);
  assert.deepEqual(plan.translations, [0, 0, 270, 270]);
  assert.equal(plan.pageCount, 2);
});

test('keeps a heading with the following block when both fit on a fresh page', () => {
  const plan = planPagination([
    { top: 100, height: 700 },
    { top: 800, height: 50, keepWithNext: true },
    { top: 850, height: 100 },
  ], { pageHeight: 1000, pageGap: 20, marginTop: 100, marginBottom: 100 });
  assert.deepEqual(plan.breaks, [{ index: 1, space: 320, page: 2 }]);
  assert.deepEqual(plan.translations, [0, 320, 320]);
  assert.equal(plan.pageCount, 2);
});

test('keeps display math with the paragraph that introduces it', () => {
  const plan = planPagination([
    { top: 100, height: 300 },
    { top: 400, height: 450 },
    { top: 850, height: 80, keepWithPrevious: true },
    { top: 930, height: 100 },
  ], { pageHeight: 1000, pageGap: 20, marginTop: 100, marginBottom: 100 });
  assert.deepEqual(plan.breaks, [{ index: 1, space: 720, page: 2 }]);
  assert.deepEqual(plan.translations, [0, 720, 720, 720]);
  assert.equal(plan.pageCount, 2);
});

test('moves a heading and three-line paragraph together to avoid orphan lines', () => {
  const plan = planPagination([
    { top: 100, height: 690 },
    { top: 790, height: 40, keepWithNext: true },
    { top: 830, height: 30, keepWithNext: true },
    { top: 860, height: 30, keepWithNext: true, keepWithPrevious: true },
    { top: 890, height: 30 },
  ], { pageHeight: 1000, pageGap: 20, marginTop: 100, marginBottom: 100 });
  assert.deepEqual(plan.breaks, [{ index: 1, space: 330, page: 2 }]);
  assert.deepEqual(plan.translations, [0, 330, 330, 330, 330]);
  assert.equal(plan.pageCount, 2);
});

test('splits table rows at page boundaries with a repeated header', () => {
  const rows = Array.from({ length:10 }, (_, index) => ({ top:index * 30, height:30 }));
  const plan = planTableRows(rows, {
    top:50, pageHeight:300, pageGap:20, marginTop:50, marginBottom:50,
    headerHeight:20, repeatHeader:true,
  });
  assert.deepEqual(plan.breaks, [{ row:6, padding:160, headerTop:370 }]);
  assert.equal(plan.extra, 160);
  assert.equal(plan.pageCount, 2);
  assert.equal(planTableRows(rows, {
    top:50, pageHeight:300, pageGap:20, marginTop:50, marginBottom:50,
    headerHeight:20, repeatHeader:false,
  }).breaks[0].padding, 140);
});

test('does not split an oversized editable block', () => {
  const plan = planPagination([
    { top: 100, height: 900 },
  ], { pageHeight: 1000, pageGap: 20, marginTop: 100, marginBottom: 100 });
  assert.deepEqual(plan.breaks, []);
  assert.deepEqual(plan.translations, [0]);
  assert.equal(plan.pageCount, 2);
});
