// xeCJK punctuation templates. The calibrated Fandol sidebearings and pair
// data remain font metrics; these templates decide how much of that metric is
// used for punctuation margins and pair kerning. Ratios follow xeCJK 2025
// (xeCJK.sty PunctStyle instances); plain must not retain Fandol compression.
import {evaluateLength} from './cjk-glue.mjs';
import {isMiddlePunct,isLongPunct,isNoBreakLongPunct,isOpening,isClosing,isPunctuation} from './cjk-characters.mjs';

export const PUNCT_STYLE_ALIASES = {
  halfwidth: 'banjiao',
  fullwidth: 'quanjiao',
  mixedwidth: 'kaiming',
  marginkerning: 'hangmobanjiao',
};

const BASE = {
  punctWidth: '1em',
  punctBoundWidth: '0.5em',
  fixedPunctRatio: 1,
  mixedPunctRatio: 1,
  kerningTotalRatio: 1,
  enabledKerning: true,
  enabledLeftRightKerning: false,
  optimizeKerning: true,
  rubberPunctSkip: true,
};

export const PUNCT_TEMPLATES = {
  quanjiao: { ...BASE },
  banjiao: { ...BASE, fixedPunctRatio: 0.5, mixedPunctRatio: 0.5, kerningTotalRatio: 0.5 },
  kaiming: { ...BASE, fixedPunctRatio: 0.5, mixedPunctRatio: 1, kerningTotalRatio: 0.5 },
  hangmobanjiao: { ...BASE, enabledKerning: false, enabledLeftRightKerning: true, kerningTotalRatio: 0 },
  CCT: { ...BASE, fixedPunctRatio: 0.7, mixedPunctRatio: 0.7, kerningTotalRatio: 0.6 },
  plain: {
    punctWidth: '0em', punctBoundWidth: '0em',
    fixedPunctRatio: 0, mixedPunctRatio: 0, kerningTotalRatio: 0,
    enabledKerning: false, enabledLeftRightKerning: false, optimizeKerning: false,
    rubberPunctSkip: false,
  },
};

export function normalizePunctStyle(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const key = PUNCT_STYLE_ALIASES[lower] ?? (PUNCT_TEMPLATES[raw] ? raw : Object.keys(PUNCT_TEMPLATES).find(style => style.toLowerCase() === lower));
  return key ?? null;
}

export function resolvePunctuationStyle(name, overrides = {}, rubberPunctSkip) {
  const key = normalizePunctStyle(name) ?? 'quanjiao';
  const template = { ...PUNCT_TEMPLATES[key], key };
  if (rubberPunctSkip !== undefined && rubberPunctSkip !== null) template.rubberPunctSkip = Boolean(rubberPunctSkip);
  if (overrides.punctwidth) template.punctWidth = overrides.punctwidth;
  if (overrides.punctboundwidth) template.punctBoundWidth = overrides.punctboundwidth;
  template.widthOverride = overrides.punctwidth ? evaluateLength(overrides.punctwidth, { em: 1 }) : null;
  return template;
}

// Splits a punctuation glyph into the leading/trailing margins removed from
// its advance and the remaining box width. `calibrated` is the Fandol
// sidebearing for the exact font weight; otherwise the canvas glyph bounds are
// used. Both are in px, `em` only scales the calibrated values.
export function punctuationMetrics({ character, style, calibrated, metrics, em, opening, closing }) {
  const glyphWidth = Number(metrics?.width) || 0;
  const left = calibrated ? calibrated.left * em : Math.max(0, -(Number(metrics?.actualBoundingBoxLeft) || 0));
  const right = calibrated ? calibrated.right * em : Math.max(0, glyphWidth - (Number(metrics?.actualBoundingBoxRight) || 0));
  const ratio = isMiddlePunct(character) ? style.mixedPunctRatio : style.fixedPunctRatio;
  let before = opening ? left * ratio : 0;
  let after = closing ? right * ratio : 0;
  if (style.widthOverride != null && Number.isFinite(style.widthOverride) && !isMiddlePunct(character)) {
    const margin = Math.max(0, (style.widthOverride * em - glyphWidth) / 2);
    if (opening) before = margin;
    if (closing) after = margin;
  }
  return { before, after, boxWidth: Math.max(0, glyphWidth - before - after) };
}

// Line-break rules for one punctuation token. Closing punctuation may not begin
// a line, opening punctuation may not end one. Adjacent punctuation is
// unbreakable except for the middle/long case opened by AllowBreakBetweenPuncts.
export function punctuationBreakRules(value, { previous = '', allowBreakBetweenPuncts = false } = {}) {
  const between = isPunctuation(previous) && isPunctuation(value);
  const middle = isMiddlePunct(value), long = isLongPunct(value);
  const middleOrLong = middle || long || isMiddlePunct(previous) || isLongPunct(previous);
  const allowBetween = Boolean(between && allowBreakBetweenPuncts && middleOrLong);
  return {
    // Long punctuation (NoBreakLongPunct) and closing punctuation may not start
    // a line. Middle punctuation is governed by the between-punctuation rule.
    noBreakBefore: isNoBreakLongPunct(value) || (!middle && !long && isClosing(value)) || (between && !allowBetween),
    noBreakAfter: isOpening(value),
    allowBetween,
  };
}

// Pair kerning is calibrated in em; the template decides whether and how much
// of it applies. RubberPunctSkip only scales the pair glue, never the rules.
export function pairKerning(pair, style) {
  if (!pair || !style.enabledKerning || !style.kerningTotalRatio) return null;
  const ratio = style.kerningTotalRatio;
  return {
    width: pair.width * ratio,
    stretch: style.rubberPunctSkip ? pair.stretch * ratio : 0,
    shrink: style.rubberPunctSkip ? pair.shrink * ratio : 0,
  };
}
