export const PAGE_PAPERS = Object.freeze({
  a4: { width: '210mm', height: '297mm' },
  a5: { width: '148mm', height: '210mm' },
  letter: { width: '8.5in', height: '11in' },
  legal: { width: '8.5in', height: '14in' },
});

export const MARGIN_PRESETS = Object.freeze({
  normal: '2.2cm',
  narrow: '1.27cm',
  wide: '2.54cm',
});

const SIDES = ['top', 'right', 'bottom', 'left'];
const FALLBACK_MARGIN = MARGIN_PRESETS.normal;
const NATIVE_MARGINS = Object.freeze({
  // Standard 10 pt article.cls dimensions, converted from TeX points
  // (72.27 pt/in) to physical millimetres. These are intentionally not the
  // geometry package defaults: XeLaTeX uses the class layout when geometry is
  // absent.
  letter: Object.freeze({ top: '44.027mm', right: '47.456mm', bottom: '42.070mm', left: '47.191mm' }),
  a4: Object.freeze({ top: '44.379mm', right: '44.719mm', bottom: '42.448mm', left: '44.027mm' }),
  a5: Object.freeze({ top: '45.082mm', right: '25.597mm', bottom: '43.313mm', left: '25.400mm' }),
  legal: Object.freeze({ top: '44.379mm', right: '47.456mm', bottom: '42.003mm', left: '47.191mm' }),
});
export const DEFAULT_PAGE_SETUP = Object.freeze({
  paper: 'letter',
  orientation: 'portrait',
  margin: 'custom',
  margins: NATIVE_MARGINS.letter,
});

function normalizeMargin(value) {
  const text = String(value ?? '').trim();
  return /^\d+(?:\.\d+)?(?:mm|cm|in|pt)$/.test(text) ? text : FALLBACK_MARGIN;
}

function normalizedMargins(setup) {
  const uniform = setup.margin === undefined ? undefined : normalizeMargin(setup.margin);
  const source = setup.margins ?? {};
  return Object.fromEntries(SIDES.map(side => [side, normalizeMargin(source[side] ?? uniform)]));
}

function commonMargin(margins) {
  return SIDES.every(side => margins[side] === margins.top) ? margins.top : 'custom';
}

export function readPageSetup(preamble = '') {
  const match = /\\usepackage(?:\[([^\]]*)\])?\{geometry\}/.exec(preamble);
  const parseOptions = value => String(value ?? '').split(',').map(option => option.trim()).filter(Boolean);
  const classOptions = parseOptions(/\\documentclass(?:\[([^\]]*)\])?\{[^{}]+\}/.exec(preamble)?.[1]);
  const geometryOptions = parseOptions(match?.[1]);
  const options = match ? geometryOptions : classOptions;
  const layoutOptions = [...classOptions, ...geometryOptions];
  const paperOption = layoutOptions.filter(option => /^(?:a4|a5|letter|legal)paper$/.test(option)).at(-1);
  const paper = paperOption?.replace('paper', '') ?? 'letter';
  const orientation = layoutOptions.filter(option => /^(?:landscape|portrait)$/.test(option)).at(-1) ?? 'portrait';
  if (!match && orientation === 'portrait' && NATIVE_MARGINS[paper]) {
    const margins = { ...NATIVE_MARGINS[paper] };
    return { paper, orientation, margin: 'custom', margins };
  }
  const uniform = options.find(option => /^margin=/.test(option))?.slice(7);
  const margins = Object.fromEntries(SIDES.map(side => [
    side,
    options.find(option => new RegExp('^' + side + '=').test(option))?.slice(side.length + 1) ?? uniform ?? FALLBACK_MARGIN,
  ]));
  const normalized = Object.fromEntries(SIDES.map(side => [side, normalizeMargin(margins[side])]));
  return { paper, orientation, margin: commonMargin(normalized), margins: normalized };
}

export function writePageSetup(preamble, setup = {}) {
  const paper = PAGE_PAPERS[setup.paper] ? setup.paper : 'a4';
  const orientation = setup.orientation === 'landscape' ? 'landscape' : 'portrait';
  const margins = normalizedMargins(setup);
  const match = /\\usepackage(?:\[([^\]]*)\])?\{geometry\}/.exec(preamble);
  const kept = (match?.[1] ?? '').split(',')
    .map(option => option.trim())
    .filter(Boolean)
    .filter(option => !/^(?:a4paper|a5paper|letterpaper|legalpaper|landscape|portrait|margin=|top=|bottom=|left=|right=|inner=|outer=|hmargin=|vmargin=)/.test(option));
  const marginOptions = commonMargin(margins) === 'custom'
    ? SIDES.map(side => side + '=' + margins[side])
    : ['margin=' + margins.top];
  const options = [...kept, paper + 'paper', orientation === 'landscape' ? 'landscape' : '', ...marginOptions]
    .filter(Boolean)
    .join(',');
  const line = '\\usepackage[' + options + ']{geometry}';
  if (match) return preamble.slice(0, match.index) + line + preamble.slice(match.index + match[0].length);
  return preamble.replace(/^(\s*\\begin\{document\})/m, line + '\n$1');
}

export function pageMetrics(setup = DEFAULT_PAGE_SETUP) {
  const paper = PAGE_PAPERS[setup.paper] ? setup.paper : 'a4';
  const orientation = setup.orientation === 'landscape' ? 'landscape' : 'portrait';
  const margins = normalizedMargins(setup);
  const size = PAGE_PAPERS[paper];
  return orientation === 'landscape'
    ? { width: size.height, height: size.width, margin: commonMargin(margins), margins }
    : { width: size.width, height: size.height, margin: commonMargin(margins), margins };
}
