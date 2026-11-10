import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeLayout,
  compareFonts,
  compareImages,
  compareLayout,
  comparePageImages,
  normalizeText,
  parseBbox,
  parseFonts,
  parsePdfInfo,
  parsePgm,
} from './visual-lib.mjs';

function pgm(width, height, pixels, headerExtra = '') {
  const header = Buffer.from(`P5\n# fixture comment\n${width} ${height}\n255\n${headerExtra}`, 'ascii');
  return new Uint8Array([...header, ...pixels]);
}

test('parses P5 PGM with comments and CRLF header', () => {
  const bytes = pgm(2, 2, [0, 255, 128, 64]);
  const image = parsePgm(bytes);
  assert.equal(image.width, 2);
  assert.equal(image.height, 2);
  assert.equal(image.data.length, 4);
  assert.equal(image.data[1], 255);
});

test('rejects unsupported or truncated PGM images', () => {
  assert.throws(() => parsePgm(new Uint8Array([...Buffer.from('P6\n1 1\n255\n'), 0, 0, 0])), /Unsupported PGM magic/);
  assert.throws(() => parsePgm(new Uint8Array([...Buffer.from('P5\n2 2\n255\n'), 0])), /Truncated PGM/);
});

test('compares identical and changed pixels with a threshold', () => {
  const left = parsePgm(pgm(2, 2, [0, 10, 20, 30]));
  const right = parsePgm(pgm(2, 2, [0, 25, 20, 30]));
  const identical = compareImages(left, left);
  assert.equal(identical.changed, 0);
  assert.equal(identical.ratio, 0);
  const changed = compareImages(left, right);
  assert.equal(changed.changed, 1);
  assert.equal(changed.ratio, 0.25);
  assert.deepEqual(changed.boundingBox, { x: 1, y: 0, width: 1, height: 1 });
  const tolerant = compareImages(left, right, { threshold: 20 });
  assert.equal(tolerant.changed, 0);
});

test('dimension mismatches are reported instead of compared', () => {
  const left = parsePgm(pgm(2, 2, [0, 0, 0, 0]));
  const right = parsePgm(pgm(3, 2, [0, 0, 0, 0, 0, 0]));
  const result = compareImages(left, right);
  assert.equal(result.sameSize, false);
  assert.equal(result.ratio, null);
});

test('parses pdfinfo output', () => {
  const info = parsePdfInfo([
    'Title:          test',
    'Pages:          2',
    'Page size:      612 x 792 pts (letter)',
    'PDF version:    1.7',
    'Encrypted:      no',
  ].join('\n'));
  assert.equal(info.pages, 2);
  assert.equal(info.pageSize.width, 612);
  assert.equal(info.pageSize.height, 792);
  assert.equal(info.pdfVersion, '1.7');
  assert.equal(info.encrypted, false);
});

test('font comparison ignores subset prefixes and object IDs', () => {
  const first = parseFonts([
    'name                                 type              encoding         emb sub uni object ID',
    '------------------------------------ ----------------- ---------------- --- --- --- ---------',
    'ABCDEF+LMRoman10-Regular             CID Type 0C       Identity-H       yes yes yes      4  0',
  ].join('\n'));
  const second = parseFonts([
    'name                                 type              encoding         emb sub uni object ID',
    '------------------------------------ ----------------- ---------------- --- --- --- ---------',
    'GHIJKL+LMRoman10-Regular             CID Type 0C       Identity-H       yes yes yes      9  0',
  ].join('\n'));
  assert.equal(first.length, 1);
  assert.equal(first[0].name, 'LMRoman10-Regular');
  assert.equal(compareFonts(first, second).same, true);
  const different = parseFonts([
    'name                                 type              encoding         emb sub uni object ID',
    '------------------------------------ ----------------- ---------------- --- --- --- ---------',
    'ABCDEF+LMRoman10-Bold                CID Type 0C       Identity-H       yes yes yes      4  0',
  ].join('\n'));
  assert.equal(compareFonts(first, different).same, false);
});

const BBOX = `<?xml version="1.0" encoding="UTF-8"?>
<html><body><doc>
<page width="612.000000" height="792.000000">
<flow><block>
<line xMin="100.000" yMin="700.000" xMax="300.000" yMax="712.000"><word xMin="100.000" yMin="700.000" xMax="180.000" yMax="712.000">References</word></line>
<line xMin="100.000" yMin="680.000" xMax="300.000" yMax="692.000"><word xMin="100.000" yMin="680.000" xMax="120.000" yMax="692.000">[1]</word><word xMin="130.000" yMin="680.000" xMax="240.000" yMax="692.000">Alpha</word><word xMin="245.000" yMin="680.000" xMax="300.000" yMax="692.000">&amp;</word></line>
<line xMin="120.000" yMin="666.000" xMax="300.000" yMax="678.000"><word xMin="120.000" yMin="666.000" xMax="220.000" yMax="678.000">Beta</word></line>
<line xMin="100.000" yMin="650.000" xMax="300.000" yMax="662.000"><word xMin="100.000" yMin="650.000" xMax="120.000" yMax="662.000">[2]</word><word xMin="130.000" yMin="650.000" xMax="240.000" yMax="662.000">Gamma</word></line>
<line xMin="120.000" yMin="636.000" xMax="300.000" yMax="648.000"><word xMin="120.000" yMin="636.000" xMax="220.000" yMax="648.000">Delta</word></line>
</block></flow></page>
</doc></body></html>`;

test('parses bbox layout and decodes XML entities', () => {
  const bbox = parseBbox(BBOX);
  assert.equal(bbox.pages.length, 1);
  assert.equal(bbox.pages[0].lines.length, 5);
  assert.equal(bbox.pages[0].lines[1].text, '[1] Alpha &');
  assert.equal(bbox.pages[0].lines[1].xMin, 100);
});

test('analyzes line spacing, reference start and hanging indentation', () => {
  const layout = analyzeLayout(parseBbox(BBOX));
  assert.equal(layout.pages, 1);
  assert.equal(layout.totalLines, 5);
  assert.equal(layout.referenceStartPage, 0);
  assert.equal(layout.referenceLineCount, 4);
  assert.equal(layout.minLineGap, 14);
  assert.equal(layout.hangingIndentSamples, 2);
  assert.equal(layout.hangingIndentViolations, 0);
  assert.deepEqual(layout.referenceLabelXs, [100]);
});

test('layout comparison distinguishes same pagination from changed page counts', () => {
  const base = analyzeLayout(parseBbox(BBOX));
  const same = compareLayout(base, base, { mode: 'same' });
  assert.equal(same.sameStructure, true);
  assert.equal(same.gapDelta, 0);

  const twoPages = `${BBOX.replace('</doc>', '<page width="612" height="792"><flow><block><line xMin="100" yMin="700" xMax="200" yMax="712"><word xMin="100" yMin="700" xMax="200" yMax="712">More</word></line></block></flow></page></doc>')}`;
  const changedPages = analyzeLayout(parseBbox(twoPages));
  const different = compareLayout(base, changedPages, { mode: 'same' });
  assert.equal(different.pageCountSame, false);
  assert.equal(different.sameStructure, false);
});

test('page image comparison reports identical and changed documents', () => {
  const page = parsePgm(pgm(2, 2, [0, 0, 0, 0]));
  const same = comparePageImages([page], [page]);
  assert.equal(same.identical, true);
  assert.equal(same.overallRatio, 0);
  const other = parsePgm(pgm(2, 2, [0, 0, 255, 0]));
  const different = comparePageImages([page], [other]);
  assert.equal(different.identical, false);
  assert.equal(different.changedPixels, 1);
  const missing = comparePageImages([page], []);
  assert.equal(missing.identical, false);
  assert.equal(missing.pageCountSame, false);
});

test('normalizeText harmonises CRLF, trailing spaces and blank-line runs', () => {
  assert.equal(normalizeText('a  \r\n\r\n\r\nb\r\n'), 'a\n\nb');
});
