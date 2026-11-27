import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCtexSource,
  setCtexEnabled,
  hasHanDocumentText,
} from '../apps/web/latex/ctex-source.mjs';
import { usesCtex, resolvePackages } from '../apps/web/latex/packages.mjs';

const ARTICLE = '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\begin{document}\n正文\n\\end{document}\n';
const CTEX_PACKAGE = '\\documentclass{article}\n\\usepackage[UTF8]{ctex}\n\\begin{document}\n中文\n\\end{document}\n';
const CTEX_ART = '\\documentclass[a4paper,UTF8,scheme=chinese]{ctexart}\n\\begin{document}\n中文\n\\end{document}\n';

test('analyzeCtexSource recognizes classes, packages, options and providers', () => {
  const packageState = analyzeCtexSource(CTEX_PACKAGE);
  assert.equal(packageState.enabled, true);
  assert.equal(packageState.className, 'article');
  assert.equal(packageState.baseClassName, 'article');
  assert.equal(packageState.packageName, 'ctex');
  assert.equal(packageState.packageListIndex, 0);
  assert.equal(CTEX_PACKAGE.slice(packageState.optionStart, packageState.optionEnd), 'UTF8');
  assert.equal(packageState.eol, '\n');
  assert.equal(packageState.indent, '');
  assert.deepEqual(packageState.ownerRange, { start: 0, end: CTEX_PACKAGE.indexOf('\\begin{document}') });
  assert.equal(packageState.hasOtherCjkProvider, false);

  const classState = analyzeCtexSource(CTEX_ART);
  assert.equal(classState.enabled, true);
  assert.equal(classState.className, 'ctexart');
  assert.equal(classState.baseClassName, 'article');
  assert.equal(classState.packageDeclaration, null);

  const list = analyzeCtexSource('\\documentclass{article}\n\\usepackage{amsmath, ctex, graphicx}\n\\begin{document}\n');
  assert.equal(list.packageListIndex, 1);
  assert.equal(list.optionStart, null);
  assert.equal(list.packageDeclaration.command, 'usepackage');

  assert.equal(analyzeCtexSource('\\documentclass{article}\n\\RequirePackage{ctex}\n').enabled, true);
  assert.equal(analyzeCtexSource('% \\usepackage{ctex}\n\\documentclass{article}\n').enabled, false);
  const xeCJK = analyzeCtexSource('\\documentclass{article}\n\\usepackage{xeCJK}\n');
  assert.equal(xeCJK.enabled, false);
  assert.equal(xeCJK.hasOtherCjkProvider, true);
  assert.equal(analyzeCtexSource('\\documentclass{ctexbook}\n').className, 'ctexbook');
});

test('setCtexEnabled(true) inserts one declaration and is idempotent', () => {
  const once = setCtexEnabled(ARTICLE, true);
  assert.equal(once, '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\usepackage[UTF8]{ctex}\n\\begin{document}\n正文\n\\end{document}\n');
  assert.equal(setCtexEnabled(once, true), once, 'enabling twice is idempotent');
  assert.equal(setCtexEnabled(CTEX_PACKAGE, true), CTEX_PACKAGE, 'existing package is not duplicated');
  assert.equal(setCtexEnabled(CTEX_ART, true), CTEX_ART, 'existing class is not duplicated');

  const noPackages = setCtexEnabled('\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n', true);
  assert.equal(noPackages, '\\documentclass{article}\n\\usepackage[UTF8]{ctex}\n\\begin{document}\nx\n\\end{document}\n');

  const crlf = setCtexEnabled('\\documentclass{article}\r\n\\usepackage{amsmath}\r\n\\begin{document}\r\n', true);
  assert.ok(crlf.includes('\\usepackage{amsmath}\r\n\\usepackage[UTF8]{ctex}\r\n\\begin{document}'), 'CRLF is preserved');

  assert.equal(setCtexEnabled('\\usepackage{ctex}\n', true), '\\usepackage{ctex}\n', 'fragments are left to the owner file');
});

test('setCtexEnabled(false) removes only ctex and converts ctex classes', () => {
  assert.equal(setCtexEnabled(CTEX_PACKAGE, false), '\\documentclass{article}\n\\begin{document}\n中文\n\\end{document}\n');
  assert.equal(setCtexEnabled(CTEX_ART, false), '\\documentclass[a4paper,UTF8,scheme=chinese]{article}\n\\begin{document}\n中文\n\\end{document}\n');
  assert.equal(setCtexEnabled('\\documentclass{ctexrep}\n', false), '\\documentclass{report}\n');
  assert.equal(setCtexEnabled('\\documentclass{ctexbook}\n', false), '\\documentclass{book}\n');

  assert.equal(
    setCtexEnabled('\\documentclass{article}\n\\usepackage{amsmath, ctex, graphicx}\n\\begin{document}\n', false),
    '\\documentclass{article}\n\\usepackage{amsmath, graphicx}\n\\begin{document}\n',
  );
  assert.equal(
    setCtexEnabled('\\documentclass{article}\n\\usepackage{ctex, amsmath}\n\\begin{document}\n', false),
    '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n',
  );
  assert.equal(
    setCtexEnabled('\\documentclass{article}\n\\usepackage{amsmath, ctex}\n\\begin{document}\n', false),
    '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n',
  );
  assert.equal(
    setCtexEnabled('\\documentclass{article}\n\\usepackage{ctex} % keep\n\\begin{document}\n', false),
    '\\documentclass{article}\n % keep\n\\begin{document}\n',
  );
  assert.equal(
    setCtexEnabled('\\documentclass{article}\n\\usepackage{xeCJK}\n\\begin{document}\n', false),
    '\\documentclass{article}\n\\usepackage{xeCJK}\n\\begin{document}\n',
  );
  assert.equal(setCtexEnabled(ARTICLE, false), ARTICLE, 'already disabled is unchanged');
});

test('setCtexEnabled(false) removes multiple declarations without touching other text', () => {
  const source = '\\documentclass{article}\n% keep me\n\\usepackage{ctex}\n\\usepackage{amsmath}\n\\usepackage{ctex}\n\\begin{document}\n中文\n\\end{document}\n';
  assert.equal(
    setCtexEnabled(source, false),
    '\\documentclass{article}\n% keep me\n\\usepackage{amsmath}\n\\begin{document}\n中文\n\\end{document}\n',
  );
});

test('disable then enable keeps unrelated source', () => {
  const source = '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage[UTF8]{ctex}\n\\usepackage{graphicx} % keep\n\\begin{document}\n中文\n\\end{document}\n';
  const disabled = setCtexEnabled(source, false);
  const enabled = setCtexEnabled(disabled, true);
  assert.ok(enabled.includes('\\usepackage{amsmath}'));
  assert.ok(enabled.includes('\\usepackage{graphicx} % keep'));
  assert.equal((enabled.match(/\\usepackage(?:\[[^\]]*\])?\{ctex\}/g) || []).length, 1);
});

test('hasHanDocumentText ignores comments but includes preamble arguments and body', () => {
  assert.equal(hasHanDocumentText('\\documentclass{article}\n\\begin{document}\n中文\n\\end{document}\n'), true);
  assert.equal(hasHanDocumentText('\\documentclass{article}\n% 中文\n\\begin{document}\nEnglish\n\\end{document}\n'), false);
  assert.equal(hasHanDocumentText('\\documentclass{article}\n\\title{中文标题}\n\\begin{document}\n\\maketitle\n\\end{document}\n'), true);
  assert.equal(hasHanDocumentText('\\documentclass{article}\n\\begin{document}\n50\\% 中文\n\\end{document}\n'), true);
  assert.equal(hasHanDocumentText('\\documentclass{article}\n\\begin{document}\nEnglish only\n\\end{document}\n'), false);
});

test('usesCtex and resolvePackages use the shared analyzer', () => {
  assert.equal(usesCtex('\\documentclass{ctexart}'), true);
  assert.equal(usesCtex('\\usepackage{ctex}'), true);
  assert.equal(usesCtex('\\usepackage{amsmath,ctex}'), true);
  assert.equal(usesCtex('% \\usepackage{ctex}'), false);
  assert.equal(usesCtex('\\usepackage{xeCJK}'), false);

  const needs = resolvePackages('\\documentclass{article}\n\\usepackage{amsmath}\n', '中文正文', { chineseTypesetting: true });
  assert.ok(needs.some(rule => rule.name === 'ctex'), 'Chinese body gets ctex');
  const hasProvider = resolvePackages('\\documentclass{article}\n\\usepackage{xeCJK}\n', '中文正文', { chineseTypesetting: true });
  assert.ok(!hasProvider.some(rule => rule.name === 'ctex'), 'xeCJK is treated as an existing provider');
  const noChinese = resolvePackages('\\documentclass{article}\n', 'English body', { chineseTypesetting: true });
  assert.ok(!noChinese.some(rule => rule.name === 'ctex'));
});
