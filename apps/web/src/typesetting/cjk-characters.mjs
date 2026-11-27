// xeCJK character classes, transcribed from the fixed toolchain so that glue,
// punctuation and line-breaking all share one classification source.
//
// Source: TeX Live 2025, xeCJK 2025/02/03 (xeCJK.sty).
//   - \c__xeCJK_CJK_chars_clist            (xeCJK.sty:487)
//   - \c__xeCJK_CM_chars_clist             (xeCJK.sty:531)
//   - \c__xeCJK_HangulJamo_chars_clist     (xeCJK.sty:538)
//   - \c__xeCJK_{Half,Full}{Left,Right}_chars_clist (xeCJK.sty:420-487)
//   - xeCJK/options KaiMingPunct / LongPunct / MiddlePunct (xeCJK.sty:4540-4542)
// Unicode version: 15.1 (bundled with TeX Live 2025). No network access is
// performed at runtime; the tables below are static.
//
// Class precedence follows \xeCJKResetCharClass (xeCJK.sty:630): CJK is set
// first, then NormalSpace/CM/HangulJamo, and punctuation classes are applied
// last, so punctuation overrides the broad CJK ranges.

const CJK_RANGES = [
  0x02ea, 0x02eb,
  0x2e80, 0x2eff, 0x2f00, 0x2fdf, 0x2ff0, 0x2fff,
  0x3000, 0x303f, 0x3040, 0x309f, 0x30a0, 0x30ff,
  0x3100, 0x312f, 0x3130, 0x318f, 0x3190, 0x319f,
  0x31a0, 0x31bf, 0x31c0, 0x31ef, 0x31f0, 0x31ff,
  0x3200, 0x32ff, 0x3300, 0x33ff, 0x3400, 0x4dbf,
  0x4dc0, 0x4dff, 0x4e00, 0x9fff, 0xa000, 0xa48f,
  0xa490, 0xa4cf, 0xac00, 0xd7af, 0xf900, 0xfaff,
  0xfe10, 0xfe1f, 0xfe30, 0xfe4f, 0xff00, 0xffef,
  0x16fe0, 0x16fff, 0x17000, 0x187ff, 0x18800, 0x18aff,
  0x18b00, 0x18cff, 0x18d00, 0x18d7f, 0x1aff0, 0x1afff,
  0x1b000, 0x1b0ff, 0x1b100, 0x1b12f, 0x1b130, 0x1b16f,
  0x1b170, 0x1b2ff, 0x1f200, 0x1f2ff, 0x20000, 0x2a6df,
  0x2a700, 0x2b73f, 0x2b740, 0x2b81f, 0x2b820, 0x2ceaf,
  0x2ceb0, 0x2ebef, 0x2f800, 0x2fa1f, 0x30000, 0x3134f,
];

const CM_RANGES = [
  0x302a, 0x302f,
  0x3099, 0x309a,
  0xfe00, 0xfe0f,
  0xe0100, 0xe01ef,
];

const HANGUL_JAMO_RANGES = [
  0x1100, 0x11ff,
  0xa960, 0xa97f,
  0xd7b0, 0xd7ff,
];

const HALF_LEFT = [0x28, 0x5b, 0x60, 0x7b, 0x2329];
const HALF_RIGHT = [0x21, 0x22, 0x25, 0x27, 0x29, 0x2c, 0x2e, 0x3a, 0x3b, 0x3f, 0x5d, 0x7d, 0x232a];
const NORMAL_SPACE = [0x2d, 0x2f, 0x5c];

// Opening punctuation (xeCJK OP + PR = FullLeft; HalfLeft is separate).
const OP = [
  0x2018, 0x201c, 0x3008, 0x300a, 0x300c, 0x300e, 0x3010, 0x3014, 0x3016,
  0x3018, 0x301a, 0x301d, 0xfe17, 0xfe35, 0xfe37, 0xfe39, 0xfe3b, 0xfe3d,
  0xfe3f, 0xfe41, 0xfe43, 0xfe47, 0xfe59, 0xfe5b, 0xfe5d, 0xff08, 0xff3b,
  0xff5b, 0xff5f, 0xff62,
];
const PR = [0xfe69, 0xff04, 0xffe1, 0xffe5, 0xffe6];

// FullRight is the union of these xeCJK clists.
const CL = [
  0x00b7, 0x2019, 0x201d, 0x2013, 0x2014, 0x2025, 0x2026, 0x2027, 0x2e3a,
  0x3001, 0x3002, 0x3009, 0x300b, 0x300d, 0x300f, 0x3011, 0x3015, 0x3017,
  0x3019, 0x301b, 0x301e, 0x301f, 0xfe11, 0xfe12, 0xfe18, 0xfe36, 0xfe38,
  0xfe3a, 0xfe3c, 0xfe3e, 0xfe40, 0xfe42, 0xfe44, 0xfe48, 0xfe50, 0xfe52,
  0xfe5a, 0xfe5c, 0xfe5e, 0xff09, 0xff0c, 0xff0e, 0xff3d, 0xff5d, 0xff60,
  0xff61, 0xff63, 0xff64,
];
const NS = [0x30fb, 0xfe54, 0xfe55, 0xff1a, 0xff1b, 0xff65, 0x16fe0];
const EX = [0xfe15, 0xfe16, 0xfe56, 0xfe57, 0xff01, 0xff1f];
const IS = [0xfe10, 0xfe13, 0xfe14];
const PO = [0xfe6a, 0xff05, 0xffe0];
const HYPHENS = [0x301c, 0x30a0, 0xff5e];

const KAI_MING_PUNCT = new Set([0x3002, 0xff0e, 0xff1f, 0xff01]);
const LONG_PUNCT = new Set([0x2014, 0x2e3a, 0x2025, 0x2026]);
// xeCJK 2025 has no distinct NoBreakLongPunct class: long punctuation is kept
// on one line as a unit, so the category mirrors LongPunct for consumers.
const NO_BREAK_LONG_PUNCT = new Set(LONG_PUNCT);
const MIDDLE_PUNCT = new Set([0x2013, 0x2014, 0x2e3a, 0x2027, 0x00b7, 0x30fb, 0xff65, ...HYPHENS]);

const TO_CP = value => (typeof value === 'string' ? value.codePointAt(0) : value);

function inRanges(codePoint, ranges) {
  let low = 0, high = ranges.length / 2 - 1;
  while (low <= high) {
    const mid = (low + high) >> 1, start = ranges[mid * 2], end = ranges[mid * 2 + 1];
    if (codePoint < start) high = mid - 1;
    else if (codePoint > end) low = mid + 1;
    else return true;
  }
  return false;
}

const HALF_LEFT_SET = new Set(HALF_LEFT);
const HALF_RIGHT_SET = new Set(HALF_RIGHT);
const FULL_LEFT_SET = new Set([...OP, ...PR]);
const FULL_RIGHT_SET = new Set([...CL, ...NS, ...EX, ...IS, ...PO, ...HYPHENS]);
const NORMAL_SPACE_SET = new Set(NORMAL_SPACE);

export function classifyCjk(value) {
  const codePoint = TO_CP(value);
  if (!Number.isInteger(codePoint)) return null;
  if (HALF_LEFT_SET.has(codePoint)) return 'HalfLeft';
  if (HALF_RIGHT_SET.has(codePoint)) return 'HalfRight';
  if (FULL_LEFT_SET.has(codePoint)) return 'FullLeft';
  if (FULL_RIGHT_SET.has(codePoint)) return 'FullRight';
  if (inRanges(codePoint, HANGUL_JAMO_RANGES)) return 'HangulJamo';
  if (inRanges(codePoint, CM_RANGES)) return 'CM';
  if (NORMAL_SPACE_SET.has(codePoint)) return 'NormalSpace';
  if (inRanges(codePoint, CJK_RANGES)) return 'CJK';
  return null;
}

export const isCjk = value => { const type = classifyCjk(value); return type === 'CJK' || type === 'HangulJamo'; };
export const isPunctuation = value => { const type = classifyCjk(value); return type === 'HalfLeft' || type === 'HalfRight' || type === 'FullLeft' || type === 'FullRight'; };
export const isHalfWidthPunctuation = value => { const type = classifyCjk(value); return type === 'HalfLeft' || type === 'HalfRight'; };
export const isFullWidthPunctuation = value => { const type = classifyCjk(value); return type === 'FullLeft' || type === 'FullRight'; };
export const isLongPunct = value => LONG_PUNCT.has(TO_CP(value));
export const isNoBreakLongPunct = value => NO_BREAK_LONG_PUNCT.has(TO_CP(value));
export const isMiddlePunct = value => MIDDLE_PUNCT.has(TO_CP(value));
export const isKaiMingPunct = value => KAI_MING_PUNCT.has(TO_CP(value));

// Kerning-side categories. These mirror the exact opening/closing sets the
// paragraph layout already used (xeCJK OP + ASCII brackets, xeCJK closing
// punctuation + ASCII terminators) so behaviour is preserved while the data
// now lives in one place. Currency symbols (FullLeft PR) are not openers, and
// PO/currency (FullRight) are not closers.
const OPENING = new Set([...OP, 0x28, 0x5b]);
const CLOSING = new Set([...CL, ...NS, ...EX, ...IS, ...HYPHENS, 0x21, 0x2c, 0x2e, 0x3a, 0x3b, 0x3f, 0x29, 0x5d, 0x7d]);

export const isOpening = value => OPENING.has(TO_CP(value));
export const isClosing = value => CLOSING.has(TO_CP(value));

// Compatibility set for the punctuation-compression/kerning path. It is the
// same list previously inlined in paragraph-layout.js; the full xeCJK classes
// remain available through isPunctuation() for later steps.
export const CJK_PUNCTUATION = new Set([...'、。，．？！：；（）［］｛｝〈〉《》「」『』【】“”‘’'].map(character => character.codePointAt(0)));
export const isCjkPunctuation = value => CJK_PUNCTUATION.has(TO_CP(value));

export function containsCjk(text) {
  for (const character of String(text ?? '')) if (isCjk(character)) return true;
  return false;
}

// Reserved interface for Steps 17-18: user \xeCJKDeclareCharClass /
// \xeCJKResetPunctClass / \xeCJKsetup overrides. This step ships only the
// static xeCJK 2025 defaults, so declarations are collected but not applied.
export const CJK_DECLARATION_COMMANDS = ['\\xeCJKDeclareCharClass', '\\xeCJKResetPunctClass', '\\xeCJKsetup'];

export function boundaryClasses(text) {
  const characters = Array.from(String(text ?? ''));
  if (!characters.length) return { leftClass: 'Boundary', rightClass: 'Boundary', isBoundary: true };
  return {
    leftClass: classifyCjk(characters[0]),
    rightClass: classifyCjk(characters[characters.length - 1]),
    isBoundary: false,
  };
}

function readBraceGroup(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue; }
    if (text[index] === '{') depth++;
    else if (text[index] === '}' && --depth === 0) return { value: text.slice(start + 1, index), end: index + 1 };
  }
  return null;
}

function parseCodeRanges(value) {
  const ranges = [];
  for (const match of String(value ?? '').matchAll(/"?([0-9A-Fa-f]+)(?:\s*->\s*"?([0-9A-Fa-f]+))?/g)) {
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    if (Number.isInteger(start) && Number.isInteger(end)) ranges.push([Math.min(start, end), Math.max(start, end)]);
  }
  return ranges;
}

const PUNCT_CLASSES = new Set(['HalfLeft', 'HalfRight', 'FullLeft', 'FullRight']);

// Parses \xeCJKDeclareCharClass and \xeCJKResetPunctClass in source order.
// Declarations are a union of ranges; a later declaration of the same range
// wins, and ResetPunctClass drops earlier punctuation-class overrides.
export function parseCjkClassDeclarations(source) {
  const text = String(source ?? '');
  const active = [];
  const diagnostics = [];
  let punctReset = false;
  const scan = /\\xeCJKDeclareCharClass\*?\s*|\\xeCJKResetPunctClass\b/g;
  for (const match of text.matchAll(scan)) {
    if (match[0].startsWith('\\xeCJKResetPunctClass')) {
      punctReset = true;
      for (let index = active.length - 1; index >= 0; index--) if (PUNCT_CLASSES.has(active[index].className)) active.splice(index, 1);
      continue;
    }
    let cursor = match.index + match[0].length;
    const classGroup = readBraceGroup(text, cursor);
    if (!classGroup) { diagnostics.push({ command: match[0].trim(), reason: 'missing class name' }); continue; }
    cursor = classGroup.end;
    const rangeGroup = readBraceGroup(text, cursor);
    if (!rangeGroup) { diagnostics.push({ command: match[0].trim(), reason: 'missing range list' }); continue; }
    const ranges = parseCodeRanges(rangeGroup.value);
    if (!ranges.length) { diagnostics.push({ command: match[0].trim(), reason: 'empty range list' }); continue; }
    active.push({ className: classGroup.value.trim(), ranges, command: 'declare' });
  }
  const classify = value => {
    const codePoint = typeof value === 'string' ? value.codePointAt(0) : value;
    let result = classifyCjk(codePoint);
    for (const declaration of active) {
      if (declaration.ranges.some(([start, end]) => codePoint >= start && codePoint <= end)) result = declaration.className;
    }
    return result;
  };
  return { declarations: active, punctReset, diagnostics, classify };
}

export { CJK_RANGES, CM_RANGES, HANGUL_JAMO_RANGES, KAI_MING_PUNCT, LONG_PUNCT, NO_BREAK_LONG_PUNCT, MIDDLE_PUNCT };
