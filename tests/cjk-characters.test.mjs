import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCjk, isCjk, isPunctuation, isHalfWidthPunctuation, isFullWidthPunctuation,
  isOpening, isClosing, isLongPunct, isNoBreakLongPunct, isMiddlePunct, isKaiMingPunct,
  isCjkPunctuation, containsCjk, CJK_RANGES, CJK_DECLARATION_COMMANDS, parseCjkClassDeclarations, boundaryClasses,
} from '../apps/web/src/typesetting/cjk-characters.mjs';

const hex = value => 'U+' + value.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

test('punctuation classes match xeCJK 2025 for the acceptance sample', () => {
  const sample = '、。，．？！：；）］｝〉》」』】”’…—·「『【（《';
  const snapshot = [...sample].map(character => [character, hex(character), classifyCjk(character)]);
  assert.deepEqual(snapshot, [
    ['、', 'U+3001', 'FullRight'],
    ['。', 'U+3002', 'FullRight'],
    ['，', 'U+FF0C', 'FullRight'],
    ['．', 'U+FF0E', 'FullRight'],
    ['？', 'U+FF1F', 'FullRight'],
    ['！', 'U+FF01', 'FullRight'],
    ['：', 'U+FF1A', 'FullRight'],
    ['；', 'U+FF1B', 'FullRight'],
    ['）', 'U+FF09', 'FullRight'],
    ['］', 'U+FF3D', 'FullRight'],
    ['｝', 'U+FF5D', 'FullRight'],
    ['〉', 'U+3009', 'FullRight'],
    ['》', 'U+300B', 'FullRight'],
    ['」', 'U+300D', 'FullRight'],
    ['』', 'U+300F', 'FullRight'],
    ['】', 'U+3011', 'FullRight'],
    ['”', 'U+201D', 'FullRight'],
    ['’', 'U+2019', 'FullRight'],
    ['…', 'U+2026', 'FullRight'],
    ['—', 'U+2014', 'FullRight'],
    ['·', 'U+00B7', 'FullRight'],
    ['「', 'U+300C', 'FullLeft'],
    ['『', 'U+300E', 'FullLeft'],
    ['【', 'U+3010', 'FullLeft'],
    ['（', 'U+FF08', 'FullLeft'],
    ['《', 'U+300A', 'FullLeft'],
  ]);
  for (const [character] of snapshot) assert.ok(isPunctuation(character), `${character} is punctuation`);
  for (const character of '「『【（《') assert.ok(isOpening(character), `${character} opens`);
  for (const character of '、。，．？！：；）］｝〉》」』】”’…—·') assert.ok(isClosing(character), `${character} closes`);
});

test('halfwidth punctuation, brackets and terminators', () => {
  for (const character of '([{`') assert.equal(classifyCjk(character), 'HalfLeft');
  assert.equal(classifyCjk(String.fromCodePoint(0x2329)), 'HalfLeft');
  for (const character of ['!', '"', '%', "'", ')', ',', '.', ':', ';', '?', ']', '}']) assert.equal(classifyCjk(character), 'HalfRight');
  assert.equal(classifyCjk(String.fromCodePoint(0x232a)), 'HalfRight');
  assert.ok(isHalfWidthPunctuation('('));
  assert.ok(!isFullWidthPunctuation('('));
  assert.ok(isOpening('('));
  assert.ok(isClosing(')'));
  assert.ok(isClosing(','));
  assert.ok(isClosing('?'));
  assert.ok(!isClosing('"'));
  assert.ok(!isClosing('%'));
});

test('CJK ranges cover extension B surrogate pairs by code point', () => {
  const extensionB = '\u{20000}';
  assert.equal([...extensionB].length, 1);
  assert.equal(classifyCjk(extensionB), 'CJK');
  assert.ok(isCjk(extensionB));
  assert.ok(isCjk(String.fromCodePoint(0x9fff)) && isCjk(String.fromCodePoint(0x4e00)));
  assert.ok(isCjk(String.fromCodePoint(0x3400)) && isCjk(String.fromCodePoint(0x3134f)));
  assert.ok(!isCjk(String.fromCodePoint(0x31350)));
  assert.ok(isCjk('漢') && isCjk('あ') && isCjk('ア') && isCjk('한'));
  assert.equal(CJK_RANGES.length % 2, 0);
});

test('punct classes override the broad CJK/fullwidth range', () => {
  assert.equal(classifyCjk('\u{FF0C}'), 'FullRight');
  assert.equal(classifyCjk('\u{FF08}'), 'FullLeft');
  assert.equal(classifyCjk('\u{3000}'), 'CJK');
  assert.equal(classifyCjk('\u{FF21}'), 'CJK');
  assert.ok(isCjk('\u{FF21}'));
  assert.ok(!isCjk('\u{FF0C}'));
});

test('CM, Hangul Jamo and NormalSpace do not leak into plain CJK', () => {
  assert.equal(classifyCjk('\u{3099}'), 'CM');
  assert.equal(classifyCjk('\u{302A}'), 'CM');
  assert.equal(classifyCjk('\u{FE00}'), 'CM');
  assert.equal(classifyCjk('\u{1100}'), 'HangulJamo');
  assert.ok(isCjk('\u{1100}'));
  assert.equal(classifyCjk('-'), 'NormalSpace');
  assert.equal(classifyCjk('/'), 'NormalSpace');
  assert.equal(classifyCjk('\\'), 'NormalSpace');
  assert.equal(classifyCjk('A'), null);
  assert.equal(classifyCjk('中'), 'CJK');
});

test('special punctuation sets match xeCJK options', () => {
  assert.deepEqual([...'。．？！'].map(isKaiMingPunct), [true, true, true, true]);
  assert.deepEqual([...'—⸺‥…'].map(isLongPunct), [true, true, true, true]);
  assert.deepEqual([...'—⸺‥…'].map(isNoBreakLongPunct), [true, true, true, true]);
  for (const character of '–—⸺‧·・･〜～') assert.ok(isMiddlePunct(character), `${character} is middle punctuation`);
  assert.ok(!isLongPunct('、'));
});

test('user char class declarations update classification in source order', () => {
  assert.deepEqual(CJK_DECLARATION_COMMANDS, ['\\xeCJKDeclareCharClass', '\\xeCJKResetPunctClass', '\\xeCJKsetup']);
  const result = parseCjkClassDeclarations('\\xeCJKDeclareCharClass{CJK}{"1F000 -> "1F0FF "2E80 -> "2EFF}');
  assert.equal(result.declarations.length, 1);
  assert.equal(result.classify('\u{1F000}'), 'CJK');
  assert.equal(result.classify('\u{2E80}'), 'CJK');
  assert.equal(result.classify('A'), null);
  assert.deepEqual(parseCjkClassDeclarations('plain text').declarations, []);
});

test('later declarations win and ResetPunctClass drops punctuation overrides', () => {
  const override = parseCjkClassDeclarations('\\xeCJKDeclareCharClass{FullRight}{"0041}\\xeCJKDeclareCharClass{CJK}{"0041}');
  assert.equal(override.classify('A'), 'CJK', 'later declaration wins');
  const reset = parseCjkClassDeclarations('\\xeCJKDeclareCharClass{FullRight}{"0041}\\xeCJKResetPunctClass');
  assert.equal(reset.punctReset, true);
  assert.equal(reset.classify('A'), null, 'punctuation override removed');
  assert.equal(reset.declarations.length, 0);
  const noStar = parseCjkClassDeclarations('\\xeCJKDeclareCharClass*{CJK}{"0041}');
  assert.equal(noStar.classify('A'), 'CJK');
});

test('boundary classes expose first/last class and empty boundaries', () => {
  assert.deepEqual(boundaryClasses(''), { leftClass: 'Boundary', rightClass: 'Boundary', isBoundary: true });
  assert.deepEqual(boundaryClasses('中文ABC'), { leftClass: 'CJK', rightClass: null, isBoundary: false });
  assert.deepEqual(boundaryClasses('中文，'), { leftClass: 'CJK', rightClass: 'FullRight', isBoundary: false });
});

test('compatibility CJK punctuation set still matches the old inline list', () => {
  for (const character of '、。，．？！：；（）［］｛｝〈〉《》「」『』【】“”‘’') assert.ok(isCjkPunctuation(character));
  for (const character of 'a,.-()') assert.ok(!isCjkPunctuation(character));
  assert.ok(containsCjk('中文abc'));
  assert.ok(!containsCjk('hello, world'));
});
