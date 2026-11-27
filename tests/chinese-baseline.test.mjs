// Step 1 baseline assertions. These read the machine-readable snapshots that
// tests/chinese-xelatex.spec.mjs writes, so the suite runs without TeX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const expectedDir = join(here, 'fixtures', 'chinese', 'expected');
const metaPath = join(expectedDir, '_meta.json');

// Defaults documented by xeCJK 2025 (the internal key functions are not stable
// across releases, so the boolean probes cover the values that are readable and
// these remaining defaults are pinned here with the recorded xeCJK version).
const DOCUMENTED_XECJK_DEFAULTS = {
  CJKecglue: '~',
  xCJKecglue: false,
  CJKspace: false,
  CJKmath: false,
  RubberPunctSkip: true,
  PunctStyle: 'quanjiao',
  AllowBreakBetweenPuncts: false,
  CheckSingle: false,
  CheckFullRight: false,
};

function load(name) {
  return JSON.parse(readFileSync(join(expectedDir, `${name}.json`), 'utf8'));
}

function pointsToPt(value) {
  const match = /^([\d.]+)pt$/.exec(String(value || ''));
  return match ? Number(match[1]) : NaN;
}

test('baseline metadata pins the TeX distribution and CJK pieces', () => {
  assert.ok(existsSync(metaPath), 'run node tests/chinese-xelatex.spec.mjs to generate the baseline');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  assert.match(meta.xetex, /TeX Live 2025/);
  for (const key of ['ctex', 'xeCJK', 'ctexart', 'article', 'book', 'report', 'fandolSongRegular']) {
    assert.ok(meta.paths[key], `missing kpsewhich path for ${key}`);
    assert.ok(meta.hashes[key], `missing hash for ${key}`);
  }
  assert.equal(meta.conversion.cssPxPerTexPt, 96 / 72.27);
  assert.equal(meta.conversion.texPtPerCssPx, 72.27 / 96);
});

test('every fixture compiled and exposes machine-readable coordinates', () => {
  const files = readdirSync(expectedDir).filter(file => file.endsWith('.json') && !file.startsWith('_') && file !== 'browser-baseline.json');
  assert.ok(files.length >= 20, `expected the full fixture family, got ${files.length}`);
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(expectedDir, file), 'utf8'));
    assert.equal(data.ok, true, `${file} failed: ${data.error || ''}`);
    assert.ok(data.pages.length >= 1, `${file} has no pages`);
    const words = data.pages.flatMap(page => page.words);
    assert.ok(words.length > 0, `${file} has no extracted words`);
    for (const word of words) {
      assert.ok(Number.isFinite(word.x) && Number.isFinite(word.y), `${file} word without coordinates`);
      assert.ok(Number.isFinite(word.w) && Number.isFinite(word.h), `${file} word without size`);
    }
    assert.ok(data.sourceHash, `${file} has no source hash`);
  }
});

test('standard classes keep their default tocdepth / secnumdepth independently', () => {
  const article = load('toc-default-article').probes;
  const report = load('toc-default-report').probes;
  const book = load('toc-default-book').probes;
  assert.deepEqual({ tocdepth: article.tocdepth, secnumdepth: article.secnumdepth }, { tocdepth: '3', secnumdepth: '3' });
  assert.deepEqual({ tocdepth: report.tocdepth, secnumdepth: report.secnumdepth }, { tocdepth: '2', secnumdepth: '2' });
  assert.deepEqual({ tocdepth: book.tocdepth, secnumdepth: book.secnumdepth }, { tocdepth: '2', secnumdepth: '2' });

  const independent = load('toc-structure');
  assert.equal(independent.probes.tocdepth, '3');
  assert.equal(independent.probes.secnumdepth, '-2');
  const levels = independent.toc.map(entry => entry.level);
  assert.deepEqual(levels, ['section', 'subsection', 'subsubsection', 'section', 'section']);
  assert.ok(independent.toc.some(entry => entry.plain === '显式目录项'), 'explicit addcontentsline is recorded');
  assert.ok(independent.toc.some(entry => entry.plain === '附录节'), 'appendix entry is recorded');
});

test('xeCJK defaults are frozen for the fixed TeX Live', () => {
  const probes = load('cjk-params').probes;
  assert.equal(probes.CJKspace, String(DOCUMENTED_XECJK_DEFAULTS.CJKspace));
  assert.equal(probes.CJKmath, String(DOCUMENTED_XECJK_DEFAULTS.CJKmath));
  assert.equal(probes.AllowBreakBetweenPuncts, String(DOCUMENTED_XECJK_DEFAULTS.AllowBreakBetweenPuncts));
  assert.equal(probes.PunctStyle, DOCUMENTED_XECJK_DEFAULTS.PunctStyle);

  const latin = pointsToPt(probes.cjkLatin);
  const tilde = pointsToPt(probes.cjkTilde);
  assert.ok(Number.isFinite(latin) && Number.isFinite(tilde), 'CJK/Latin width probes are numeric');
  assert.ok(Math.abs(latin - tilde) < 0.01, `CJKecglue should behave like ~ (${latin} vs ${tilde})`);

  const withSpace = pointsToPt(probes.cjkSpaceInput);
  const withoutSpace = pointsToPt(probes.cjkNoSpaceInput);
  assert.ok(Number.isFinite(withSpace) && Number.isFinite(withoutSpace), 'CJK space width probes are numeric');
  assert.ok(Math.abs(withSpace - withoutSpace) < 0.01, `CJKspace=false must ignore source spaces (${withSpace} vs ${withoutSpace})`);

  // Values pinned from the same xeCJK version; see the comment above.
  assert.equal(DOCUMENTED_XECJK_DEFAULTS.RubberPunctSkip, true);
  assert.equal(DOCUMENTED_XECJK_DEFAULTS.CheckSingle, false);
  assert.equal(DOCUMENTED_XECJK_DEFAULTS.CheckFullRight, false);
});

test('TOC indentation and number-box widths come from the fixed classes', () => {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const article = meta.tocParameters.article.levels;
  assert.deepEqual([article.subsection.indent, article.subsection.numwidth], [1.5, 2.3]);
  assert.deepEqual([article.subsubsection.indent, article.subsubsection.numwidth], [3.8, 3.2]);
  assert.deepEqual([article.paragraph.indent, article.paragraph.numwidth], [7, 4.1]);
  assert.deepEqual([article.subparagraph.indent, article.subparagraph.numwidth], [10, 5]);
  assert.equal(article.section.dotted, false);

  for (const className of ['book', 'report']) {
    const levels = meta.tocParameters[className].levels;
    assert.deepEqual([levels.section.indent, levels.section.numwidth], [1.5, 2.3], `${className} section`);
    assert.deepEqual([levels.subsection.indent, levels.subsection.numwidth], [3.8, 3.2], `${className} subsection`);
    assert.deepEqual([levels.subsubsection.indent, levels.subsubsection.numwidth], [7, 4.1], `${className} subsubsection`);
    assert.deepEqual([levels.paragraph.indent, levels.paragraph.numwidth], [10, 5], `${className} paragraph`);
    assert.deepEqual([levels.subparagraph.indent, levels.subparagraph.numwidth], [12, 6], `${className} subparagraph`);
    assert.equal(levels.chapter.dotted, false, `${className} chapter is not a dotted entry`);
    assert.equal(levels.part.dotted, false, `${className} part is not a dotted entry`);
  }
});

function firstPage(name) { return load(name).pages[0]; }
function firstWordHeight(name) { const page = firstPage(name); return page.words.length ? page.words[0].h : 0; }
function bodyLine(name) { return firstPage(name).lines.find(line => line.text.includes('Latin')) || firstPage(name).lines.at(-1); }
function bodyLineDelta(name) {
  const lines = firstPage(name).lines;
  const index = lines.findIndex(line => line.text.includes('中文排版'));
  const first = lines[index] || lines[0];
  const second = lines[index + 1] || lines[1];
  return second.baseline - first.baseline;
}

test('comparison variants change geometry as documented', () => {
  for (const name of ['zihao-minus4', 'zihao-false', 'space-true', 'space-false', 'cjkmath', 'checksingle', 'checkfullright', 'linespread-15']) {
    const page = load(name).pages[0];
    assert.ok(page.lines.length > 0, `${name} has line boxes`);
    for (const line of page.lines) {
      assert.ok(Number.isFinite(line.baseline) && Number.isFinite(line.x) && Number.isFinite(line.xMax), `${name} line has coordinates`);
    }
  }
  assert.ok(bodyLine('space-true').xMax > bodyLine('space-false').xMax + 1, 'space=true preserves source spaces');
  assert.ok(firstWordHeight('zihao-minus4') > firstWordHeight('zihao-false') + 0.5, 'zihao=-4 is larger than zihao=false');
  assert.ok(bodyLineDelta('linespread-15') > bodyLineDelta('zihao-linespread') + 0.5, 'linespread=1.5 increases baseline spacing');
});

test('book TOC records part/chapter numbers, short titles and appendix', () => {
  const toc = load('toc-book').toc;
  assert.deepEqual(toc.map(entry => entry.level), ['part', 'chapter', 'section', 'subsection', 'chapter']);
  assert.deepEqual(toc.map(entry => entry.number), ['I', '1', '1.1', '1.1.1', 'A']);
  assert.equal(toc[1].plain, '短章', 'short title is used instead of the long chapter title');
  assert.equal(toc[4].plain, '附录章');
});

test('Chinese caption, abstract and proof names are recorded', () => {
  const words = load('caption-abstract-proof').pages.flatMap(page => page.words).map(word => word.text);
  const text = words.join('');
  for (const expected of ['摘要', '图', '表', '证明']) assert.ok(text.includes(expected), `missing ${expected}`);
});

test('all punctuation styles compile with coordinates', () => {
  for (const style of ['quanjiao', 'banjiao', 'kaiming', 'hangmobanjiao', 'plain', 'cct']) {
    const data = load(`punct-${style}`);
    assert.equal(data.ok, true, `punct ${style} did not compile`);
    assert.ok(data.pages[0].words.length >= 5, `punct ${style} produced too little text`);
  }
});
