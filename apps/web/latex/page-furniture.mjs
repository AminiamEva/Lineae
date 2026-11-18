const PAGE_TOKEN = '@@lineae-page@@';
const LEFTMARK_TOKEN = '@@lineae-leftmark@@';
const RIGHTMARK_TOKEN = '@@lineae-rightmark@@';
const START = '% lineae:furniture:start';
const END = '% lineae:furniture:end';
const SLOTS = ['left', 'center', 'right'];
const REGIONS = ['header', 'footer'];

const formattingCommands = /\\(?:slshape|upshape|itshape|scshape|bfseries|mdseries|rmfamily|sffamily|ttfamily|tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/g;

function pageText(value) {
  return String(value ?? '')
    .replace(/\\thepage\b/g, PAGE_TOKEN)
    .replace(/\\leftmark\b/g, LEFTMARK_TOKEN)
    .replace(/\\rightmark\b/g, RIGHTMARK_TOKEN)
    .replace(/\\(?:textbf|textit|emph|textsl|textsc|textrm|textsf|texttt)\{([^{}]*)\}/g, '$1')
    .replace(formattingCommands, '')
    .replace(/\\textbackslash\{\}/g, '\\')
    .replace(/\\ldots\{\}/g, '…')
    .replace(/\\,/g, ' ')
    .replace(/\\([%&_#$])/g, '$1')
    .replace(/\\[A-Za-z]+\*?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function emptySlots() {
  return Object.fromEntries(SLOTS.map(slot => [slot, {odd: '', even: ''}]));
}

function emptyState() {
  return {
    style: 'plain',
    enabled: false,
    oddEven: false,
    maketitle: false,
    scope: 'document',
    header: emptySlots(),
    footer: emptySlots(),
    rules: {headWidth: '0.4pt', headColor: '#000000', footWidth: '0pt', footColor: '#000000'},
  };
}

function commandSlots(codes) {
  const values = String(codes ?? '').split(',').map(code => code.trim().toUpperCase()).filter(Boolean);
  if (!values.length) return [{slot: 'center', parity: 'both'}];
  const result = [];
  for (const code of values) {
    const slot = code.includes('L') ? 'left' : code.includes('R') ? 'right' : code.includes('C') ? 'center' : null;
    if (!slot) continue;
    result.push({slot, parity: code.includes('E') ? 'even' : code.includes('O') ? 'odd' : 'both'});
  }
  return result;
}

function assignSlot(region, slot, parity, value) {
  if (parity === 'odd' || parity === 'both') region[slot].odd = value;
  if (parity === 'even' || parity === 'both') region[slot].even = value;
}

export function readPageFurniture(preamble = '') {
  const state = emptyState();
  const style = /\\pagestyle\s*\{([^}]+)\}/.exec(preamble)?.[1]?.trim() || 'plain';
  state.style = style === 'lineaeSection' ? 'fancy' : style;
  state.enabled = style === 'fancy' || style === 'lineaeSection';
  state.maketitle = /\\maketitle\b/.test(preamble);
  state.scope = style === 'lineaeSection' || /\\fancypagestyle\s*\{lineaeSection\}/.test(preamble) ? 'section' : 'document';
  state.rules.headWidth = /\\renewcommand\s*\{?\\headrulewidth\}?\s*\{([^}]*)\}/.exec(preamble)?.[1]?.trim()
    || /\\headrulewidth\s*=\s*([^;\n]+)/.exec(preamble)?.[1]?.trim()
    || '0.4pt';
  state.rules.footWidth = /\\renewcommand\s*\{?\\footrulewidth\}?\s*\{([^}]*)\}/.exec(preamble)?.[1]?.trim()
    || /\\footrulewidth\s*=\s*([^;\n]+)/.exec(preamble)?.[1]?.trim()
    || '0pt';
  const headHex = /\\headrule[^%\n]*\\color(?:\[HTML\])?\{#?([\da-f]{6})\}/i.exec(preamble)?.[1];
  const footHex = /\\footrule[^%\n]*\\color(?:\[HTML\])?\{#?([\da-f]{6})\}/i.exec(preamble)?.[1];
  if (headHex) state.rules.headColor = '#' + headHex.toLowerCase();
  if (footHex) state.rules.footColor = '#' + footHex.toLowerCase();

  let footerTouched = false;
  let footerCleared = false;
  const commandPattern = /\\(fancyhead|fancyfoot|fancyhf|lhead|chead|rhead|lfoot|cfoot|rfoot)\s*(?:\[([^\]]*)\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  for (const match of preamble.matchAll(commandPattern)) {
    const [, command, codes, raw] = match;
    if (command === 'fancyhf') {
      state.header = emptySlots();
      state.footer = emptySlots();
      footerCleared = true;
      footerTouched = true;
      continue;
    }
    const region = command.startsWith('fancyhead') || command.endsWith('head') ? state.header : state.footer;
    if (region === state.footer) footerTouched = true;
    for (const {slot, parity} of commandSlots(codes ?? command[0].toUpperCase())) {
      if (parity !== 'both') state.oddEven = true;
      assignSlot(region, slot, parity, pageText(raw));
    }
  }
  if (!footerTouched || (!footerCleared && !Object.values(state.footer).some(slot => slot.odd || slot.even))) {
    state.footer.center.odd = PAGE_TOKEN;
    state.footer.center.even = PAGE_TOKEN;
  }
  return state;
}

function ruleCommand(region, width, color) {
  const widthName = region + 'rulewidth';
  const lines = ['\\renewcommand{\\' + widthName + '}{' + width + '}'];
  if (width === '0pt') return lines;
  const custom = region + 'rule';
  const colour = /^#[\da-f]{6}$/i.test(color) && color.toLowerCase() !== '#000000'
    ? '\\color[HTML]{' + color.slice(1).toUpperCase() + '}'
    : '';
  lines.push('\\renewcommand{\\' + custom + '}{\\hbox to\\headwidth{' + colour + '\\leaders\\hrule height \\' + widthName + '\\hfill}}');
  return lines;
}

function latexField(value) {
  return String(value ?? '')
    .replaceAll(PAGE_TOKEN, '\\thepage')
    .replaceAll(LEFTMARK_TOKEN, '\\leftmark')
    .replaceAll(RIGHTMARK_TOKEN, '\\rightmark');
}

function slotCommands(state, pagestyle = false) {
  const lines = [];
  for (const region of REGIONS) {
    const name = region === 'header' ? 'head' : 'foot';
    for (const slot of SLOTS) {
      const pair = state[region][slot];
      const code = slot[0].toUpperCase();
      if (!state.oddEven) {
        if (pair.odd || pair.even) lines.push('\\fancy' + name + '[' + code + ']{' + latexField(pair.odd || pair.even) + '}');
        continue;
      }
      if (pair.odd) lines.push('\\fancy' + name + '[' + code + 'O]{' + latexField(pair.odd) + '}');
      if (pair.even) lines.push('\\fancy' + name + '[' + code + 'E]{' + latexField(pair.even) + '}');
    }
  }
  if (!state.oddEven && !state.footer.left.odd && !state.footer.center.odd && !state.footer.right.odd) {
    lines.push('\\fancyfoot[C]{' + latexField(PAGE_TOKEN) + '}');
  }
  return pagestyle ? lines : lines;
}

function ensureTwoside(preamble, enabled) {
  if (!enabled) return preamble;
  return preamble.replace(/\\documentclass(?:\[([^\]]*)\])?\{([^{}]+)\}/, (match, rawOptions, className) => {
    const options = String(rawOptions ?? '').split(',').map(option => option.trim()).filter(Boolean);
    if (!options.includes('twoside')) options.push('twoside');
    return '\\documentclass' + (options.length ? '[' + options.join(', ') + ']' : '') + '{' + className + '}';
  });
}

function managedCommands(state) {
  const lines = [];
  if (state.scope === 'section') {
    lines.push('\\fancypagestyle{lineaeSection}{%');
    lines.push('  \\fancyhf{}');
    for (const line of slotCommands(state)) lines.push('  ' + line);
    for (const line of ruleCommand('head', state.rules.headWidth, state.rules.headColor)) lines.push('  ' + line);
    for (const line of ruleCommand('foot', state.rules.footWidth, state.rules.footColor)) lines.push('  ' + line);
    lines.push('}');
    lines.push('\\pagestyle{' + (state.enabled ? 'lineaeSection' : 'empty') + '}');
  } else {
    lines.push('\\pagestyle{' + (state.enabled ? 'fancy' : 'empty') + '}');
    lines.push('\\fancyhf{}');
    lines.push(...slotCommands(state));
    lines.push(...ruleCommand('head', state.rules.headWidth, state.rules.headColor));
    lines.push(...ruleCommand('foot', state.rules.footWidth, state.rules.footColor));
  }
  return lines;
}

function ensurePackage(preamble, packageName) {
  if (new RegExp('\\\\usepackage(?:\\[[^\\]]*\\])?\\{[^}]*\\b' + packageName + '\\b[^}]*\\}').test(preamble)) return preamble;
  return preamble.replace(/(\\begin\{document\})/, '\\usepackage{' + packageName + '}\n$1');
}

export function writePageFurniture(preamble = '', state = {}) {
  const current = state;
  const normalized = {
    ...emptyState(),
    ...current,
    header: current.header ?? emptySlots(),
    footer: current.footer ?? emptySlots(),
    rules: {...emptyState().rules, ...current.rules},
  };
  for (const region of REGIONS) {
    for (const slot of SLOTS) normalized[region][slot] = {...emptySlots()[slot], ...(normalized[region][slot] ?? {})};
  }
  let text = String(preamble ?? '');
  text = ensureTwoside(text, normalized.oddEven && normalized.enabled);
  text = text.replace(new RegExp('\\n?' + START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'), '\n');
  text = ensurePackage(text, 'fancyhdr');
  if ([normalized.rules.headColor, normalized.rules.footColor].some(color => color.toLowerCase() !== '#000000')) {
    text = ensurePackage(text, 'xcolor');
  }
  const block = START + '\n' + managedCommands(normalized).join('\n') + '\n' + END + '\n';
  const begin = text.search(/\\begin\{document\}/);
  if (begin < 0) return text.trimEnd() + '\n' + block;
  return text.slice(0, begin) + block + text.slice(begin);
}

export function pageFurnitureText(value, pageNumber, marks = {}) {
  return String(value ?? '')
    .replaceAll(PAGE_TOKEN, String(pageNumber))
    .replaceAll(LEFTMARK_TOKEN, marks.left ?? '')
    .replaceAll(RIGHTMARK_TOKEN, marks.right ?? '');
}

export function furnitureSlots(furniture, region, pageNumber) {
  const parity = pageNumber % 2 === 1 ? 'odd' : 'even';
  const slots = furniture?.[region] ?? emptySlots();
  return Object.fromEntries(SLOTS.map(slot => [slot, slots[slot]?.[parity] ?? '']));
}

export { START as FURNITURE_START, END as FURNITURE_END, PAGE_TOKEN as PAGE_FIELD, LEFTMARK_TOKEN as LEFTMARK_FIELD, RIGHTMARK_TOKEN as RIGHTMARK_FIELD };
