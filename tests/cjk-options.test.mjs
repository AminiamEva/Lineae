import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCjkOptions,parseCjkGlue,normalizePunctStyle,paragraphParameters} from '../apps/web/src/typesetting/paragraph-parameters.mjs';

test('xeCJK defaults are evaluable expressions', () => {
  const options = resolveCjkOptions('\\documentclass{article}');
  assert.equal(options.enabled, false);
  assert.equal(options.ctex, false);
  assert.equal(options.punctStyle, 'quanjiao');
  assert.deepEqual(options.cjkGlue, { width: '0pt', stretch: '0.08\\baselineskip', shrink: '0pt', tie: false });
  assert.equal(options.cjkGlueTouched, false);
  assert.deepEqual(options.cjkEcGlue, { width: '~', stretch: '0pt', shrink: '0pt', tie: true });
  assert.equal(options.xCJKecGlue, false);
  assert.equal(options.cjkSpace, false);
  assert.equal(options.cjkMath, false);
  assert.equal(options.rubberPunctSkip, true);
  assert.equal(options.checkSingle, false);
  assert.equal(options.checkFullRight, false);
  assert.equal(options.allowBreakBetweenPuncts, false);
  assert.equal(options.linestretch, '1\\ccwd');
  assert.equal(options.ccwd, '1em');
  assert.equal(options.ziju, '0pt');
  assert.deepEqual(options.diagnostics, []);
});

test('ctex profile feeds enabled/scheme/punct/space/linestretch', () => {
  const options = resolveCjkOptions('\\documentclass{ctexart}', { enabled: true, scheme: 'chinese', punct: 'kaiming', space: 'true', linestretch: 1.5 });
  assert.equal(options.enabled, true);
  assert.equal(options.ctex, true);
  assert.equal(options.scheme, 'chinese');
  assert.equal(options.punctStyle, 'kaiming');
  assert.equal(options.cjkSpace, true);
  assert.equal(options.linestretch, '1.5\\ccwd');
});

test('\\xeCJKsetup keys override defaults and later declarations win', () => {
  const options = resolveCjkOptions('\\xeCJKsetup{PunctStyle=kaiming, CJKecglue={}, CJKspace=true, RubberPunctSkip=false, xCJKecglue=true, CJKmath=true, CheckSingle=true, CheckFullRight=true, AllowBreakBetweenPuncts=true}');
  assert.equal(options.punctStyle, 'kaiming');
  assert.deepEqual(options.cjkEcGlue, { width: '0pt', stretch: '0pt', shrink: '0pt', tie: false });
  assert.equal(options.cjkSpace, true);
  assert.equal(options.rubberPunctSkip, false);
  assert.equal(options.xCJKecGlue, true);
  assert.equal(options.cjkMath, true);
  assert.equal(options.checkSingle, true);
  assert.equal(options.checkFullRight, true);
  assert.equal(options.allowBreakBetweenPuncts, true);
  const lastWins = resolveCjkOptions('\\xeCJKsetup{PunctStyle=kaiming}\\xeCJKsetup{PunctStyle=plain}');
  assert.equal(lastWins.punctStyle, 'plain');
});

test('comments are ignored and invalid values are reported', () => {
  const commented = resolveCjkOptions('\\xeCJKsetup{PunctStyle=kaiming} % \\xeCJKsetup{PunctStyle=plain}');
  assert.equal(commented.punctStyle, 'kaiming');
  const invalid = resolveCjkOptions('\\xeCJKsetup{PunctStyle=weird}');
  assert.equal(invalid.punctStyle, 'quanjiao');
  assert.equal(invalid.diagnostics.length, 1);
  assert.equal(invalid.diagnostics[0].reason, 'unknown punctuation style');
});

test('standalone commands set glue, ziju and linestretch in source order', () => {
  const options = resolveCjkOptions([
    '\\CJKsetecglue{0.25em}',
    '\\renewcommand{\\CJKglue}{0pt plus 0.1\\baselineskip}',
    '\\ziju{0.05em}',
    '\\setlength{\\linestretch}{2\\ccwd}',
  ].join('\n'));
  assert.equal(options.cjkEcGlue.width, '0.25em');
  assert.equal(options.cjkGlue.stretch, '0.1\\baselineskip');
  assert.equal(options.ziju, '0.05em');
  assert.equal(options.linestretch, '2\\ccwd');
});

test('custom CJKglue is tracked so maxdimen linestretch keeps it', () => {
  const custom = resolveCjkOptions('\\xeCJKsetup{CJKglue={0pt plus 0.2\\baselineskip}}');
  assert.equal(custom.cjkGlueTouched, true);
  assert.equal(custom.cjkGlue.stretch, '0.2\\baselineskip');
});

test('punctuation overrides add to or replace the default sets', () => {
  const added = resolveCjkOptions('\\xeCJKsetup{KaiMingPunct+={?}}');
  assert.ok(added.punctOverrides.kaiMingPunct.has(0x3f));
  const replaced = resolveCjkOptions('\\xeCJKsetup{LongPunct={—}}');
  assert.deepEqual([...replaced.punctOverrides.longPunct], [0x2014]);
});

test('punct style aliases and glue parser', () => {
  assert.equal(normalizePunctStyle('halfwidth'), 'banjiao');
  assert.equal(normalizePunctStyle('fullwidth'), 'quanjiao');
  assert.equal(normalizePunctStyle('mixedwidth'), 'kaiming');
  assert.equal(normalizePunctStyle('marginkerning'), 'hangmobanjiao');
  assert.equal(normalizePunctStyle('CCT'), 'CCT');
  assert.equal(normalizePunctStyle('nope'), null);
  assert.deepEqual(parseCjkGlue('0pt plus 0.08\\baselineskip'), { width: '0pt', stretch: '0.08\\baselineskip', shrink: '0pt', tie: false });
  assert.deepEqual(parseCjkGlue('~'), { width: '~', stretch: '0pt', shrink: '0pt', tie: true });
  assert.equal(parseCjkGlue('not-a-length'), null);
});

test('plain English documents pay nothing and flags are gone from paragraphParameters', () => {
  const options = resolveCjkOptions('\\documentclass{article}\\usepackage{amsmath}');
  assert.equal(options.enabled, false);
  assert.deepEqual(options.diagnostics, []);
  const base = paragraphParameters('');
  assert.ok(!('cjkCustomGlue' in base));
  assert.ok(!('cjkPunctStyle' in base));
});
