export const PAGE_PAPERS = Object.freeze({
  a4: { width: '210mm', height: '297mm' },
  letter: { width: '8.5in', height: '11in' },
});

export const DEFAULT_PAGE_SETUP = Object.freeze({ paper: 'a4', orientation: 'portrait', margin: '2.2cm' });

function normalizeMargin(value) {
  const text = String(value ?? '').trim();
  return /^\d+(?:\.\d+)?(?:mm|cm|in|pt)$/.test(text) ? text : DEFAULT_PAGE_SETUP.margin;
}

export function readPageSetup(preamble = '') {
  const match = /\\usepackage(?:\[([^\]]*)\])?\{geometry\}/.exec(preamble);
  const options = (match?.[1] ?? '').split(',').map(option => option.trim()).filter(Boolean);
  const paper = options.includes('letterpaper') ? 'letter' : 'a4';
  const orientation = options.includes('landscape') ? 'landscape' : 'portrait';
  const margin = options.find(option => /^margin=/.test(option))?.slice(7);
  const top = options.find(option => /^top=/.test(option))?.slice(4);
  const bottom = options.find(option => /^bottom=/.test(option))?.slice(7);
  const left = options.find(option => /^left=/.test(option))?.slice(5);
  const right = options.find(option => /^right=/.test(option))?.slice(6);
  return {
    paper,
    orientation,
    margin: normalizeMargin(margin ?? (top && top === bottom && left && left === right ? left : DEFAULT_PAGE_SETUP.margin)),
  };
}

export function writePageSetup(preamble, setup = {}) {
  const next = {
    paper: setup.paper === 'letter' ? 'letter' : 'a4',
    orientation: setup.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin: normalizeMargin(setup.margin),
  };
  const match = /\\usepackage(?:\[([^\]]*)\])?\{geometry\}/.exec(preamble);
  const kept = (match?.[1] ?? '').split(',')
    .map(option => option.trim())
    .filter(Boolean)
    .filter(option => !/^(?:a4paper|letterpaper|landscape|portrait|margin=|top=|bottom=|left=|right=|inner=|outer=|hmargin=|vmargin=)/.test(option));
  const options = [...kept, next.paper + 'paper', next.orientation === 'landscape' ? 'landscape' : '', 'margin=' + next.margin]
    .filter(Boolean)
    .join(',');
  const line = '\\usepackage[' + options + ']{geometry}';
  if (match) return preamble.slice(0, match.index) + line + preamble.slice(match.index + match[0].length);
  return preamble.replace(/^(\s*\\begin\{document\})/m, line + '\n$1');
}

export function pageMetrics(setup = DEFAULT_PAGE_SETUP) {
  const normalized = {
    paper: setup.paper === 'letter' ? 'letter' : 'a4',
    orientation: setup.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin: normalizeMargin(setup.margin),
  };
  const size = PAGE_PAPERS[normalized.paper];
  return normalized.orientation === 'landscape'
    ? { width: size.height, height: size.width, margin: normalized.margin }
    : { width: size.width, height: size.height, margin: normalized.margin };
}
