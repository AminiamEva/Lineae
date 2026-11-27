import test from 'node:test';
import assert from 'node:assert/strict';
import {ctexCjkGlue,evaluateCjkGlue,evaluateLength,zijuFraction} from '../apps/web/src/typesetting/cjk-glue.mjs';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);

test('ctex CJK glue follows the linestretch division, not a fixed 0.08 baseline', () => {
  const glue = ctexCjkGlue({ linewidth: 345, ccwd: 10, linestretch: '1\\ccwd', baselineskip: 16 });
  assert.equal(glue.width, 0);
  close(glue.stretch, 15 / 32, 'stretch');
  assert.equal(glue.shrink, 0);
  assert.notEqual(glue.stretch, 0.08 * 16);
  const exact = ctexCjkGlue({ linewidth: 340, ccwd: 10, linestretch: '1\\ccwd' });
  close(exact.stretch, 10 / 32, 'exact line stretch');
});

test('\\ziju changes natural width, stretch and shrink', () => {
  const glue = ctexCjkGlue({ linewidth: 345, ccwd: 10, linestretch: '1\\ccwd', ziju: 0.05 });
  close(glue.width, 0.5, 'ziju natural width');
  close(glue.stretch, 9.5 / 31, 'ziju stretch');
  close(glue.shrink, 0.03125, 'ziju shrink');
});

test('parindent emulation reduces the count by two for counted lines', () => {
  const glue = ctexCjkGlue({ linewidth: 345, ccwd: 10, linestretch: '1\\ccwd', ziju: 0.05, parindent: 20 });
  close(glue.stretch, 9.5 / 29, 'parindent stretch');
  close(glue.shrink, 1 / 30, 'parindent shrink');
});

test('linestretch=maxdimen falls back to 0.08 baselineskip only when untouched', () => {
  const glue = ctexCjkGlue({ linewidth: 345, ccwd: 10, linestretch: '\\maxdimen', baselineskip: 16, linespread: 1.3 });
  close(glue.stretch, 0.08 * 16 * 1.3, 'maxdimen fallback');
  assert.equal(glue.width, 0);
  assert.equal(ctexCjkGlue({ linewidth: 345, ccwd: 10, linestretch: '\\maxdimen', glueTouched: true }), null);
});

test('custom linestretch and narrow widths are evaluated explicitly', () => {
  const wide = ctexCjkGlue({ linewidth: 345, ccwd: 10, linestretch: '2\\ccwd' });
  close(wide.stretch, 25 / 31, '2ccwd stretch');
  assert.deepEqual(ctexCjkGlue({ linewidth: 8, ccwd: 10, linestretch: '1\\ccwd' }), { width: 0, stretch: 0, shrink: 0 });
  assert.deepEqual(ctexCjkGlue({ linewidth: 0, ccwd: 10 }), { width: 0, stretch: 0, shrink: 0 });
});

test('evaluateLength resolves the ctex macros and rejects invalid values', () => {
  assert.equal(evaluateLength('1\\ccwd', { ccwd: 10 }), 10);
  assert.equal(evaluateLength('2\\ccwd', { ccwd: 10 }), 20);
  close(evaluateLength('0.08\\baselineskip', { baselineskip: 16 }), 1.28, 'baselineskip');
  assert.equal(evaluateLength('2em', { em: 12 }), 24);
  close(evaluateLength('10pt'), 10 * 96 / 72.27, '4pt conversion');
  assert.equal(evaluateLength('\\maxdimen'), Infinity);
  assert.ok(Number.isNaN(evaluateLength('nonsense')));
  assert.equal(zijuFraction('0.05em', { em: 10 }), 0.05);
});

test('evaluateCjkGlue treats ~ as the non-breaking interword space', () => {
  const glue = evaluateCjkGlue({ width: '~', stretch: '0pt', shrink: '0pt', tie: true }, { space: 5 });
  assert.equal(glue.width, 5);
  close(glue.stretch, 2.5, 'space stretch');
  close(glue.shrink, 5 / 3, 'space shrink');
  assert.equal(glue.nobreak, true);
});

test('custom CJKecglue is evaluated with its own stretch and shrink', () => {
  const glue = evaluateCjkGlue({ width: '0.2em', stretch: '0.05em', shrink: '0pt', tie: false }, { em: 10 });
  close(glue.width, 2, 'custom width');
  close(glue.stretch, 0.5, 'custom stretch');
  assert.equal(glue.shrink, 0);
  assert.equal(glue.nobreak, true);
});
