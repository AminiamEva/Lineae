import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePunctStyle,resolvePunctuationStyle,punctuationMetrics,pairKerning,punctuationBreakRules,PUNCT_TEMPLATES,PUNCT_STYLE_ALIASES} from '../apps/web/src/typesetting/cjk-punctuation.mjs';

test('punctuation break rules cover closing, opening and adjacent punctuation', () => {
  assert.deepEqual(punctuationBreakRules('，', { previous: '中' }), { noBreakBefore: true, noBreakAfter: false, allowBetween: false });
  assert.deepEqual(punctuationBreakRules('「', { previous: '中' }), { noBreakBefore: false, noBreakAfter: true, allowBetween: false });
  assert.deepEqual(punctuationBreakRules('中'), { noBreakBefore: false, noBreakAfter: false, allowBetween: false });
  assert.equal(punctuationBreakRules('。', { previous: '，' }).noBreakBefore, true, 'closing after punctuation stays');
  assert.equal(punctuationBreakRules('·', { previous: '·' }).noBreakBefore, true, 'middle punctuation is unbreakable by default');
  assert.deepEqual(punctuationBreakRules('·', { previous: '·', allowBreakBetweenPuncts: true }), { noBreakBefore: false, noBreakAfter: false, allowBetween: true });
  assert.equal(punctuationBreakRules('—', { previous: '—', allowBreakBetweenPuncts: true }).allowBetween, true);
  assert.equal(punctuationBreakRules('「', { previous: '」', allowBreakBetweenPuncts: true }).noBreakBefore, true, 'allowBetween never relaxes opening/closing');
});

test('xeCJK punctuation aliases and templates', () => {
  assert.deepEqual(PUNCT_STYLE_ALIASES, { halfwidth: 'banjiao', fullwidth: 'quanjiao', mixedwidth: 'kaiming', marginkerning: 'hangmobanjiao' });
  for (const style of ['quanjiao', 'banjiao', 'kaiming', 'hangmobanjiao', 'plain', 'CCT']) assert.ok(normalizePunctStyle(style) === style, style);
  assert.equal(normalizePunctStyle('halfwidth'), 'banjiao');
  assert.equal(normalizePunctStyle('fullwidth'), 'quanjiao');
  assert.equal(normalizePunctStyle('mixedwidth'), 'kaiming');
  assert.equal(normalizePunctStyle('marginkerning'), 'hangmobanjiao');
  assert.equal(normalizePunctStyle('nope'), null);
});

test('template ratios match the documented xeCJK values', () => {
  assert.equal(PUNCT_TEMPLATES.quanjiao.optimizeKerning, true);
  assert.equal(PUNCT_TEMPLATES.quanjiao.enabledLeftRightKerning, false);
  assert.equal(PUNCT_TEMPLATES.banjiao.fixedPunctRatio, 0.5);
  assert.equal(PUNCT_TEMPLATES.banjiao.kerningTotalRatio, 0.5);
  assert.equal(PUNCT_TEMPLATES.kaiming.fixedPunctRatio, 0.5);
  assert.equal(PUNCT_TEMPLATES.kaiming.mixedPunctRatio, 1);
  assert.equal(PUNCT_TEMPLATES.kaiming.kerningTotalRatio, 0.5);
  assert.equal(PUNCT_TEMPLATES.CCT.fixedPunctRatio, 0.7);
  assert.equal(PUNCT_TEMPLATES.CCT.kerningTotalRatio, 0.6);
  assert.equal(PUNCT_TEMPLATES.hangmobanjiao.enabledKerning, false);
  assert.equal(PUNCT_TEMPLATES.plain.fixedPunctRatio, 0);
  assert.equal(PUNCT_TEMPLATES.plain.mixedPunctRatio, 0);
  assert.equal(PUNCT_TEMPLATES.plain.kerningTotalRatio, 0);
  assert.equal(PUNCT_TEMPLATES.plain.enabledKerning, false);
});

test('resolve honours RubberPunctSkip and width overrides', () => {
  const plain = resolvePunctuationStyle('plain', {}, true);
  assert.equal(plain.key, 'plain');
  assert.equal(plain.rubberPunctSkip, true);
  const overridden = resolvePunctuationStyle('quanjiao', { punctwidth: '1.2em', punctboundwidth: '0.4em' });
  assert.equal(overridden.punctWidth, '1.2em');
  assert.equal(overridden.punctBoundWidth, '0.4em');
  assert.ok(Math.abs(overridden.widthOverride - 1.2) < 1e-12);
  assert.equal(resolvePunctuationStyle('bogus').key, 'quanjiao');
});

test('plain has no residual Fandol compression', () => {
  const metrics = { width: 10, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 6 };
  const calibrated = { left: 0.2, right: 0.6 };
  const plain = resolvePunctuationStyle('plain');
  assert.deepEqual(punctuationMetrics({ character: '「', style: plain, calibrated, metrics, em: 10, opening: true, closing: false }), { before: 0, after: 0, boxWidth: 10 });
  assert.deepEqual(punctuationMetrics({ character: '」', style: plain, calibrated, metrics, em: 10, opening: false, closing: true }), { before: 0, after: 0, boxWidth: 10 });
});

test('style ratios scale calibrated sidebearings', () => {
  const metrics = { width: 10, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 6 };
  const calibrated = { left: 0.2, right: 0.6 };
  const quanjiao = resolvePunctuationStyle('quanjiao');
  assert.deepEqual(punctuationMetrics({ character: '「', style: quanjiao, calibrated, metrics, em: 10, opening: true, closing: false }), { before: 2, after: 0, boxWidth: 8 });
  const banjiao = resolvePunctuationStyle('banjiao');
  assert.deepEqual(punctuationMetrics({ character: '「', style: banjiao, calibrated, metrics, em: 10, opening: true, closing: false }), { before: 1, after: 0, boxWidth: 9 });
  const kaiming = resolvePunctuationStyle('kaiming');
  assert.deepEqual(punctuationMetrics({ character: '」', style: kaiming, calibrated, metrics, em: 10, opening: false, closing: true }), { before: 0, after: 3, boxWidth: 7 });
  assert.deepEqual(punctuationMetrics({ character: '·', style: kaiming, calibrated, metrics, em: 10, opening: false, closing: true }), { before: 0, after: 6, boxWidth: 4 });
});

test('pair kerning follows the template ratio and RubberPunctSkip only scales glue', () => {
  const pair = { width: -0.5, stretch: 0.05, shrink: 0.02 };
  const quanjiao = pairKerning(pair, resolvePunctuationStyle('quanjiao'));
  assert.deepEqual(quanjiao, { width: -0.5, stretch: 0.05, shrink: 0.02 });
  assert.deepEqual(pairKerning(pair, resolvePunctuationStyle('banjiao')), { width: -0.25, stretch: 0.025, shrink: 0.01 });
  assert.deepEqual(pairKerning(pair, resolvePunctuationStyle('CCT')), { width: -0.3, stretch: 0.03, shrink: 0.012 });
  assert.equal(pairKerning(pair, resolvePunctuationStyle('plain')), null);
  assert.equal(pairKerning(pair, resolvePunctuationStyle('hangmobanjiao')), null);
  const noRubber = resolvePunctuationStyle('banjiao', {}, false);
  assert.deepEqual(pairKerning(pair, noRubber), { width: -0.25, stretch: 0, shrink: 0 });
  assert.equal(pairKerning(null, resolvePunctuationStyle('quanjiao')), null);
});

test('PunctWidth override expands the punctuation box', () => {
  const style = resolvePunctuationStyle('quanjiao', { punctwidth: '1.2em' });
  const metrics = { width: 10, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 6 };
  const result = punctuationMetrics({ character: '「', style, calibrated: { left: 0.2, right: 0.6 }, metrics, em: 10, opening: true, closing: false });
  assert.ok(Math.abs(result.before - 1) < 1e-9, 'margin to reach 1.2em');
  assert.ok(Math.abs(result.boxWidth - 9) < 1e-9);
});
