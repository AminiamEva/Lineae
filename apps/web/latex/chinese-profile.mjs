// Read-only Chinese typesetting profile.
//
// Parse order (later wins): standard-class defaults -> ctex defaults ->
// documentclass/package options -> \ctexset in source order -> explicit
// \renewcommand name overrides.
import { texDeclarations } from './counter-profile.mjs';

const CTEX_BASE = { ctexart: 'article', ctexrep: 'report', ctexbook: 'book', ctexbeamer: 'beamer' };
const NAME_KEYS = ['contentsname','listfigurename','listtablename','figurename','tablename','abstractname','indexname','bibname','refname','appendixname','proofname'];
const ENGLISH_NAMES = {
  contentsname: 'Contents', listfigurename: 'List of Figures', listtablename: 'List of Tables',
  figurename: 'Figure', tablename: 'Table', abstractname: 'Abstract', indexname: 'Index',
  bibname: 'Bibliography', refname: 'References', appendixname: 'Appendix', proofname: 'Proof',
};
const CHINESE_NAMES = {
  contentsname: '目录', listfigurename: '插图', listtablename: '表格',
  figurename: '图', tablename: '表', abstractname: '摘要', indexname: '索引',
  bibname: '参考文献', refname: '参考文献', appendixname: '附录', proofname: '证明',
};

function readGroup(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue; }
    if (text[index] === '{') depth++;
    else if (text[index] === '}' && --depth === 0) return { value: text.slice(start + 1, index), end: index + 1 };
  }
  return null;
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0, start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\\') { index++; continue; }
    if (char === '{') depth++;
    else if (char === '}') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function stripBraces(value) {
  const text = String(value ?? '').trim();
  return text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1).trim() : text;
}

function parseOptions(text) {
  const options = {};
  for (const part of splitTopLevel(String(text || ''))) {
    const equal = part.indexOf('=');
    if (equal < 0) options[part.trim()] = true;
    else options[part.slice(0, equal).trim()] = stripBraces(part.slice(equal + 1));
  }
  return options;
}

function tuple(value) {
  const parts = splitTopLevel(stripBraces(value));
  return { first: stripBraces(parts[0] ?? ''), last: stripBraces(parts[1] ?? '') };
}

function boolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !/^(?:false|no|0|off)$/i.test(String(value).trim());
}

function number(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const HEADING_LEVELS = ['part', 'chapter', 'section', 'subsection', 'subsubsection'];
const HEADING_SIZE = {
  '\\Huge': '2.49em', '\\huge': '2.07em', '\\LARGE': '1.728em', '\\Large': '1.44em',
  '\\large': '1.2em', '\\normalsize': '1em', '\\small': '0.9em', '\\footnotesize': '0.8em',
  '\\scriptsize': '0.7em', '\\tiny': '0.6em',
};
// ctex maps CJK \bfseries to the hei family (zhhei), so Chinese headings use
// FandolHei/SimHei rather than a bold Song face. cjkFace keeps that dimension
// separate from the Latin weight/style commands.
const DEFAULT_HEADING_STYLE = {
  part: { align: 'center', size: '1.44em', weight: 700, style: 'normal', cjkFace: 'hei', before: '3.5ex', after: '2.3ex', afterName: '1em', indent: '0', afterIndent: true, runin: false },
  chapter: { align: 'center', size: '2.07em', weight: 700, style: 'normal', cjkFace: 'hei', before: '3.5ex', after: '2.3ex', afterName: '1em', indent: '0', afterIndent: true, runin: false },
  section: { align: 'center', size: '1.44em', weight: 700, style: 'normal', cjkFace: 'hei', before: '3.5ex', after: '2.3ex', afterName: '1em', indent: '0', afterIndent: true, runin: false },
  subsection: { align: 'left', size: '1.2em', weight: 700, style: 'normal', cjkFace: 'hei', before: '3.25ex', after: '1.5ex', afterName: '1em', indent: '0', afterIndent: true, runin: false },
  subsubsection: { align: 'left', size: '1em', weight: 700, style: 'normal', cjkFace: 'hei', before: '3.25ex', after: '1.5ex', afterName: '1em', indent: '0', afterIndent: true, runin: false },
};

function headingLength(value) {
  const text = stripBraces(String(value ?? '').trim());
  if (!text) return null;
  if (/^\\qquad\b/.test(text)) return '2em';
  if (/^\\quad\b/.test(text)) return '1em';
  const hspace = /\\hspace\*?\s*\{([^}]*)\}/.exec(text);
  if (hspace) return hspace[1].trim();
  const length = /(-?\d+(?:\.\d+)?(?:pt|em|ex|bp|mm|cm|in))/.exec(text);
  return length ? length[1] : null;
}

const FACE_COMMANDS = { heiti: 'hei', songti: 'song', kaishu: 'kai', fangsong: 'fang', yahei: 'sans', pingfang: 'sans' };
const CJK_FAMILY_FACES = { zhhei: 'hei', zhsong: 'song', zhkai: 'kai', zhfs: 'fang', zhsfs: 'fang', zhyahei: 'sans' };

function applyHeadingCommands(style, value) {
  const text = String(value ?? '');
  if (/\\centering\b/.test(text)) style.align = 'center';
  if (/\\raggedright\b/.test(text)) style.align = 'left';
  if (/\\raggedleft\b/.test(text)) style.align = 'right';
  if (/\\bfseries\b/.test(text)) style.weight = 700;
  if (/\\mdseries\b/.test(text)) style.weight = 400;
  if (/\\itshape\b|\\slshape\b/.test(text)) style.style = 'italic';
  if (/\\upshape\b/.test(text)) style.style = 'normal';
  for (const [command, size] of Object.entries(HEADING_SIZE)) {
    if (text.includes(command)) { style.size = size; break; }
  }
  // Chinese font-family commands; the last declaration wins.
  const faces = [];
  for (const match of text.matchAll(/\\(heiti|songti|kaishu|fangsong|yahei|pingfang)\b/g)) {
    faces.push({ index: match.index, face: FACE_COMMANDS[match[1]] });
  }
  for (const match of text.matchAll(/\\CJKfamily\s*\{\s*([A-Za-z]+)\s*\}/g)) {
    const face = CJK_FAMILY_FACES[match[1]];
    if (face) faces.push({ index: match.index, face });
  }
  if (faces.length) {
    faces.sort((a, b) => a.index - b.index);
    style.cjkFace = faces.at(-1).face;
  }
}

function resolveHeadingStyles(scheme, enabled, sections, { ctexClass = false, chapters = false, heading = true } = {}) {
  // heading=false disables ctex heading styling entirely; the consumer then
  // uses the standard article heading path.
  if (!enabled || scheme !== 'chinese' || !heading) return null;
  const styles = {};
  for (const level of HEADING_LEVELS) {
    if (level === 'chapter' && (!ctexClass || !chapters)) continue;
    const style = { ...DEFAULT_HEADING_STYLE[level] };
    if (level === 'part' && chapters) style.size = '2.07em';
    if (level === 'section' && chapters) style.align = 'left';
    const declaration = sections[level] || {};
    for (const key of ['format', 'nameformat', 'numberformat', 'titleformat']) {
      if (declaration[key]) applyHeadingCommands(style, declaration[key]);
    }
    if (declaration.aftername) {
      const length = headingLength(declaration.aftername);
      if (length) style.afterName = length;
    }
    if (declaration.beforeskip) {
      const length = headingLength(declaration.beforeskip);
      if (length) style.before = length;
    }
    if (declaration.afterskip) {
      const length = headingLength(declaration.afterskip);
      style.runin = /^\s*-/.test(String(declaration.afterskip).trim());
      if (length) style.after = style.runin ? '0' : length;
    }
    if (declaration.indent) {
      const length = headingLength(declaration.indent);
      if (length) style.indent = length;
    }
    if (declaration.afterindent !== undefined) style.afterIndent = boolean(declaration.afterindent, style.afterIndent);
    styles[level] = style;
  }
  return styles;
}

export function resolveChineseProfile({ className, preamble = '' } = {}) {
  const source = texDeclarations(String(preamble || ''));
  const classMatch = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/.exec(source);
  const rawClassName = (className ?? classMatch?.[2] ?? 'article').trim();
  const baseClassName = CTEX_BASE[rawClassName] ?? rawClassName;
  const classOptions = parseOptions(classMatch?.[1] ?? '');

  const packageMatch = /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^{}]+)\}/g;
  let ctexOptions = {};
  let hasCtexPackage = false;
  let hasXeCJK = false;
  for (const match of source.matchAll(packageMatch)) {
    const names = match[2].split(',').map(name => name.trim());
    if (names.includes('ctex')) { hasCtexPackage = true; ctexOptions = parseOptions(match[1] ?? ''); }
    if (names.includes('xeCJK')) hasXeCJK = true;
  }
  const enabled = Boolean(CTEX_BASE[rawClassName]) || hasCtexPackage;
  const optionValue = key => classOptions[key] ?? ctexOptions[key];

  // Collect every declaration first so \ctexset can change the scheme before
  // the Chinese/English name defaults are chosen.
  const ctexsetEntries = [];
  for (const match of source.matchAll(/\\ctexset\s*/g)) {
    const group = readGroup(source, match.index + match[0].length);
    if (!group) continue;
    for (const entry of splitTopLevel(group.value)) {
      const equal = entry.indexOf('=');
      if (equal < 0) continue;
      ctexsetEntries.push({ key: entry.slice(0, equal).trim(), value: entry.slice(equal + 1).trim() });
    }
  }

  let scheme = optionValue('scheme');
  if (scheme === undefined) scheme = enabled ? 'chinese' : 'plain';
  const ctexScheme = ctexsetEntries.filter(entry => entry.key === 'scheme').at(-1);
  if (ctexScheme) scheme = stripBraces(ctexScheme.value);
  scheme = String(scheme).toLowerCase() === 'plain' ? 'plain' : 'chinese';

  const names = { ...(scheme === 'chinese' ? CHINESE_NAMES : ENGLISH_NAMES) };
  let part = scheme === 'chinese' ? { first: '第', last: '部分' } : { first: 'Part', last: '' };
  let chapter = scheme === 'chinese' ? { first: '第', last: '章' } : { first: 'Chapter', last: '' };
  const sections = {};
  const ctexset = {};
  let zihaoExplicit = optionValue('zihao') !== undefined;
  const settings = {
    heading: boolean(optionValue('heading'), scheme === 'chinese'),
    zihao: optionValue('zihao') ?? (scheme === 'chinese' ? '5' : null),
    linespread: number(optionValue('linespread'), scheme === 'chinese' ? 1.3 : null),
    autoindent: boolean(optionValue('autoindent'), scheme === 'chinese'),
    punct: optionValue('punct') ?? 'quanjiao',
    space: optionValue('space') ?? 'auto',
    fontset: optionValue('fontset') ?? (enabled ? 'fandol' : null),
    linestretch: 1,
  };

  const applyCtexKey = (key, value) => {
    const clean = stripBraces(value);
    if (NAME_KEYS.includes(key)) { names[key] = clean; return; }
    if (key === 'part/name') { part = tuple(value); return; }
    if (key === 'chapter/name') { chapter = tuple(value); return; }
    if (key === 'scheme') { scheme = clean.toLowerCase() === 'plain' ? 'plain' : 'chinese'; return; }
    if (key === 'heading') { settings.heading = boolean(clean, settings.heading); return; }
    if (key === 'zihao') { settings.zihao = clean; zihaoExplicit = true; return; }
    if (key === 'linespread') { settings.linespread = number(clean, settings.linespread); return; }
    if (key === 'autoindent') { settings.autoindent = boolean(clean, settings.autoindent); return; }
    if (key === 'punct') { settings.punct = clean; return; }
    if (key === 'space') { settings.space = clean; return; }
    if (key === 'fontset') { settings.fontset = clean; return; }
    if (key === 'linestretch') { settings.linestretch = number(clean, settings.linestretch); return; }
    if (/^(?:section|subsection|subsubsection|paragraph|subparagraph)\//.test(key)) {
      const [level, property] = key.split('/');
      sections[level] = { ...(sections[level] || {}), [property]: value };
      return;
    }
    ctexset[key] = value;
  };

  for (const entry of ctexsetEntries) applyCtexKey(entry.key, entry.value);

  for (const match of source.matchAll(/\\(?:re)?newcommand\*?\s*(?:\{\\([A-Za-z]+)\}|\\([A-Za-z]+))\s*/g)) {
    const name = match[1] ?? match[2];
    const group = readGroup(source, match.index + match[0].length);
    if (!group) continue;
    const value = group.value.trim();
    if (NAME_KEYS.includes(name)) { names[name] = value; continue; }
    if (name === 'appendixname') { names.appendixname = value; continue; }
    if (name === 'partname') { part = { first: value, last: '' }; continue; }
    if (name === 'chaptername') { chapter = { first: value, last: chapter.last }; continue; }
  }

  return {
    enabled,
    scheme,
    heading: settings.heading,
    className: rawClassName,
    rawClassName,
    baseClassName,
    names,
    part,
    chapter,
    sections,
    zihao: settings.zihao,
    zihaoExplicit,
    linespread: settings.linespread,
    autoindent: settings.autoindent,
    linestretch: settings.linestretch,
    punct: settings.punct,
    space: settings.space,
    fontset: settings.fontset,
    hasOtherCjkProvider: hasXeCJK,
    headingStyles: resolveHeadingStyles(scheme, enabled, sections, {
      ctexClass: /^ctex(?:art|rep|book|beamer)$/i.test(rawClassName),
      chapters: baseClassName === 'book' || baseClassName === 'report',
      heading: settings.heading,
    }),
    ctexset,
  };
}
