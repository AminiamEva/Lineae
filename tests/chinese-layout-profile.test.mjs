import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typesetProfile } from '../apps/web/latex/typeset-layout.mjs';

const value = text => Number.parseFloat(String(text));
const near = (actual, expected, tolerance = 0.03) => Math.abs(value(actual) - expected) <= tolerance;
const CSS_PER_TEX = 72 / 72.27;
const BP_TO_TEX = 72.27 / 72;

test('ctex default 5号 uses 10.5pt, 1.3 linespread and 2ccwd', () => {
  const profile = typesetProfile('\\documentclass[fontset=fandol]{ctexart}');
  assert.equal(profile.className, 'article');
  assert.equal(profile.rawClassName, 'ctexart');
  assert.equal(profile.baseClassName, 'article');
  assert.ok(near(profile.fontSize, 10.5));
  assert.ok(near(profile.lineHeight, 10.5 * 1.2 * 1.3));
  assert.ok(near(profile.paragraphIndent, 21));
  assert.equal(profile.pageStyle, 'headings');
  assert.equal(profile.indentFirst, true);
});

test('a class size option overrides the ctex default but is overridden by zihao', () => {
  const twelve = typesetProfile('\\documentclass[12pt]{ctexart}');
  assert.ok(near(twelve.fontSize, 12 * CSS_PER_TEX));
  assert.ok(near(twelve.lineHeight, 14.5 * 1.3 * CSS_PER_TEX));
  assert.ok(near(twelve.paragraphIndent, 24 * CSS_PER_TEX));

  const zihao = typesetProfile('\\documentclass[12pt,UTF8,scheme=chinese,zihao=-4]{ctexart}');
  assert.ok(near(zihao.fontSize, 12, 0.02));
  assert.ok(near(zihao.lineHeight, 12 * 1.2 * 1.3, 0.05));
  assert.ok(near(zihao.paragraphIndent, 24, 0.02));
});

test('scheme=plain keeps standard-class sizes, indent and page style', () => {
  const profile = typesetProfile('\\documentclass[UTF8,scheme=plain]{ctexart}');
  assert.ok(near(profile.fontSize, 10 * CSS_PER_TEX));
  assert.ok(near(profile.lineHeight, 12 * CSS_PER_TEX));
  assert.ok(near(profile.paragraphIndent, 15 * CSS_PER_TEX));
  assert.equal(profile.pageStyle, 'plain');
  assert.equal(profile.indentFirst, false);
});

test('autoindent and zihao=false match XeLaTeX', () => {
  const noIndent = typesetProfile('\\documentclass[UTF8,scheme=chinese,autoindent=false]{ctexart}');
  assert.ok(near(noIndent.fontSize, 10.5));
  assert.ok(near(noIndent.lineHeight, 10.5 * 1.2 * 1.3));
  assert.ok(near(noIndent.paragraphIndent, 15 * CSS_PER_TEX));
  assert.equal(noIndent.indentFirst, false);

  const zhFalse = typesetProfile('\\documentclass[UTF8,scheme=chinese,zihao=false]{ctexart}');
  assert.ok(near(zhFalse.fontSize, 10 * CSS_PER_TEX));
  assert.ok(near(zhFalse.lineHeight, 12 * 1.3 * CSS_PER_TEX));
  assert.ok(near(zhFalse.paragraphIndent, 20 * CSS_PER_TEX));
  assert.equal(zhFalse.indentFirst, true);
});

test('explicit linespread, fontsize and pagestyle win', () => {
  const spread = typesetProfile('\\documentclass[UTF8,scheme=chinese,zihao=5]{ctexart}\\linespread{1.5}');
  assert.ok(near(spread.lineHeight, 10.5 * 1.2 * 1.5, 0.05));

  const sized = typesetProfile('\\documentclass{article}\\fontsize{12}{15}\\selectfont');
  assert.ok(near(sized.fontSize, 12 * CSS_PER_TEX));
  assert.ok(near(sized.lineHeight, 15 * CSS_PER_TEX));

  assert.equal(typesetProfile('\\documentclass{ctexart}\\pagestyle{empty}').pageStyle, 'empty');
  assert.equal(typesetProfile('\\documentclass{ctexart}\\pagestyle{plain}').pageStyle, 'plain');
});

test('standard ctex package, chaptered classes and non-ctex documents', () => {
  const packaged = typesetProfile('\\documentclass{article}\\usepackage[UTF8]{ctex}');
  const ctexart = typesetProfile('\\documentclass[fontset=fandol]{ctexart}');
  assert.ok(near(packaged.fontSize, value(ctexart.fontSize)));
  assert.ok(near(packaged.lineHeight, value(ctexart.lineHeight)));
  assert.equal(packaged.pageStyle, 'headings');

  const book = typesetProfile('\\documentclass{ctexbook}');
  assert.equal(book.className, 'book');
  assert.equal(book.rawClassName, 'ctexbook');
  assert.equal(book.baseClassName, 'book');
  assert.equal(book.pageStyle, 'headings');

  const report = typesetProfile('\\documentclass{ctexrep}');
  assert.equal(report.className, 'report');
  assert.equal(report.rawClassName, 'ctexrep');

  const plain = typesetProfile('\\documentclass{article}');
  assert.equal(plain.className, 'article');
  assert.ok(near(plain.fontSize, 10 * CSS_PER_TEX));
  assert.ok(near(plain.lineHeight, 12 * CSS_PER_TEX));
  assert.ok(near(plain.paragraphIndent, 15 * CSS_PER_TEX));
  assert.equal(plain.pageStyle, 'plain');
});
