import test from 'node:test';
import assert from 'node:assert/strict';

import { planPagination, typesetProfile } from '../apps/web/latex/typeset-layout.mjs';

test('derives XeLaTeX article and ctex typography profiles', () => {
  assert.deepEqual(typesetProfile('\\documentclass{article}'), {
    className: 'article',
    fontSize: '9.9626pt',
    lineHeight: '11.9552pt',
    paragraphIndent: '14.9440pt',
    pageStyle: 'plain',
  });
  assert.deepEqual(typesetProfile('\\documentclass[12pt]{article}\\pagestyle{empty}'), {
    className: 'article',
    fontSize: '11.9552pt',
    lineHeight: '14.4458pt',
    paragraphIndent: '17.9328pt',
    pageStyle: 'empty',
  });
  assert.deepEqual(typesetProfile('\\documentclass[fontset=fandol]{ctexart}'), {
    className: 'ctexart',
    fontSize: '10.5pt',
    lineHeight: '15.75pt',
    paragraphIndent: '21pt',
    pageStyle: 'headings',
  });
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

test('does not split an oversized editable block', () => {
  const plan = planPagination([
    { top: 100, height: 900 },
  ], { pageHeight: 1000, pageGap: 20, marginTop: 100, marginBottom: 100 });
  assert.deepEqual(plan.breaks, []);
  assert.deepEqual(plan.translations, [0]);
  assert.equal(plan.pageCount, 2);
});
