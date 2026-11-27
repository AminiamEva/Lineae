// Pure ctex recognition and source rewriting.
//
// Every caller (the Enable ctex button, paste, export and typesetting) should
// derive the ctex state from this module instead of using narrow per-caller
// regexes. The functions preserve unrelated source byte-for-byte.

const CTEX_CLASS = /^ctex(art|rep|book|beamer)$/;
const CTEX_BASE = { ctexart: 'article', ctexrep: 'report', ctexbook: 'book', ctexbeamer: 'beamer' };
const PACKAGE = /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^{}]+)\}/g;

// Replace comments with spaces of the same length so offsets stay valid.
function maskComments(source) {
  return String(source || '').replace(/\\[\\%]|%[^\r\n]*/g, match => match.startsWith('%') ? ' '.repeat(match.length) : match);
}

function eolOf(source) {
  return String(source || '').includes('\r\n') ? '\r\n' : '\n';
}

function lineStartOf(source, index) {
  return source.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
}

function indentAt(source, index) {
  const start = lineStartOf(source, index);
  return /^[ \t]*/.exec(source.slice(start))[0];
}

function parseDocumentClass(source, masked) {
  const match = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^{}]+)\}/.exec(masked);
  if (!match) return null;
  const nameStart = match.index + match[0].lastIndexOf('{') + 1;
  const nameEnd = nameStart + match[2].length;
  const optionStart = match[1] !== undefined ? match.index + match[0].indexOf('[') + 1 : null;
  return {
    start: match.index,
    end: match.index + match[0].length,
    nameStart,
    nameEnd,
    name: match[2].trim(),
    optionStart,
    optionEnd: optionStart !== null ? optionStart + match[1].length : null,
  };
}

function parsePackageDeclarations(source, masked) {
  const declarations = [];
  PACKAGE.lastIndex = 0;
  let match;
  while ((match = PACKAGE.exec(masked))) {
    const listStart = match.index + match[0].indexOf('{') + 1;
    const listEnd = listStart + match[2].length;
    const optionStart = match[1] !== undefined ? match.index + match[0].indexOf('[') + 1 : null;
    const items = [];
    let offset = 0;
    for (const part of match[2].split(',')) {
      const lead = part.length - part.trimStart().length;
      const name = part.trim();
      if (name) items.push({ name, start: listStart + offset + lead, end: listStart + offset + lead + name.length });
      offset += part.length + 1;
    }
    declarations.push({
      start: match.index,
      end: match.index + match[0].length,
      listStart,
      listEnd,
      optionStart,
      optionEnd: optionStart !== null ? optionStart + match[1].length : null,
      command: match[0].startsWith('\\RequirePackage') ? 'RequirePackage' : 'usepackage',
      items,
    });
  }
  return declarations;
}

export function analyzeCtexSource(source = '') {
  const text = String(source || '');
  const masked = maskComments(text);
  const documentClass = parseDocumentClass(text, masked);
  const className = documentClass?.name ?? null;
  const ctexClass = className ? CTEX_CLASS.test(className) : false;
  const packages = parsePackageDeclarations(text, masked);
  const ctexDeclarations = packages.filter(declaration => declaration.items.some(item => item.name === 'ctex'));
  const ctexDeclaration = ctexDeclarations[0] ?? null;
  const ctexItem = ctexDeclaration?.items.find(item => item.name === 'ctex') ?? null;
  const otherCjkPackages = packages.some(declaration => declaration.items.some(item => /^(?:xeCJK|luatexja|luatexja-fontspec|CJK|CJKutf8)$/.test(item.name)));
  // A document may already supply CJK with fontspec/xeCJK-style families
  // instead of ctex (for example \newfontfamily\han{Microsoft YaHei}).
  const cjkFontCommand = /\\(?:setCJKmainfont|setCJKsansfont|setCJKmonofont|setCJKfamilyfont|newCJKfontfamily|CJKfamily)\b/.test(masked);
  const cjkFamilyName = /\\newfontfamily\s*\\?[A-Za-z@]*(?:han|cjk|chinese|song|hei|kai|fang|ming)[A-Za-z@]*\s*\{/.test(masked);
  const cjkNamedFont = [...masked.matchAll(/\\newfontfamily\s*\\?[A-Za-z@]+\s*\{([^}]*)\}/g)].some(match =>
    /(?:YaHei|SimSun|SimHei|KaiTi|FangSong|Songti|Heiti|Kaiti|PingFang|Noto\s+(?:Serif|Sans)\s+CJK|Source\s+Han|Fandol|MingLiU|Hiragino|STSong|STHeiti|Microsoft\s+JhengHei)/i.test(match[1]));
  const otherCjk = otherCjkPackages || cjkFontCommand || cjkFamilyName || cjkNamedFont;
  const beginDocument = masked.search(/\\begin\s*\{document\}/);
  return {
    enabled: ctexClass || Boolean(ctexDeclaration),
    className,
    baseClassName: className ? (CTEX_BASE[className] ?? className) : null,
    documentClass,
    packageDeclaration: ctexDeclaration,
    packageDeclarations: ctexDeclarations,
    allPackageDeclarations: packages,
    packageListIndex: ctexItem && ctexDeclaration ? ctexDeclaration.items.indexOf(ctexItem) : null,
    packageName: ctexItem?.name ?? null,
    optionStart: ctexDeclaration?.optionStart ?? null,
    optionEnd: ctexDeclaration?.optionEnd ?? null,
    ownerRange: documentClass ? { start: documentClass.start, end: beginDocument >= 0 ? beginDocument : masked.length } : null,
    eol: eolOf(text),
    indent: ctexDeclaration ? indentAt(text, ctexDeclaration.start) : documentClass ? indentAt(text, documentClass.start) : '',
    hasOtherCjkProvider: otherCjk,
  };
}

function removeCtexDeclaration(source, declaration) {
  const kept = declaration.items.filter(item => item.name !== 'ctex');
  if (kept.length) {
    const list = source.slice(declaration.listStart, declaration.listEnd);
    const parts = list.split(',');
    const filtered = parts.filter(part => part.trim() !== 'ctex');
    if (filtered.length === parts.length) return source;
    const nextList = filtered
      .map((part, index) => index === 0 ? part.replace(/^[ \t]+/, '') : index === filtered.length - 1 ? part.replace(/[ \t]+$/, '') : part)
      .join(',');
    return source.slice(0, declaration.listStart) + nextList + source.slice(declaration.listEnd);
  }
  // Sole package: remove the declaration, and the line when nothing else is on it.
  let start = declaration.start;
  let end = declaration.end;
  const lineStart = lineStartOf(source, start);
  const newline = source.indexOf('\n', end);
  const lineEnd = newline < 0 ? source.length : newline;
  const remainder = (source.slice(lineStart, start) + source.slice(end, lineEnd)).replace(/[ \t]+/g, '');
  if (!remainder) {
    start = lineStart;
    end = newline < 0 ? source.length : newline + 1;
  }
  return source.slice(0, start) + source.slice(end);
}

function insertDeclaration(source, analysis) {
  if (!analysis.documentClass) return source;
  const target = analysis.allPackageDeclarations.length
    ? analysis.allPackageDeclarations[analysis.allPackageDeclarations.length - 1]
    : analysis.documentClass;
  const indent = indentAt(source, target.start);
  const eol = analysis.eol;
  const declaration = '\\usepackage[UTF8]{ctex}';
  const newline = source.indexOf('\n', target.end);
  if (newline < 0) return source + eol + indent + declaration;
  return source.slice(0, newline + 1) + indent + declaration + eol + source.slice(newline + 1);
}

export function setCtexEnabled(source = '', enabled = true) {
  const text = String(source || '');
  const analysis = analyzeCtexSource(text);
  if (enabled) {
    if (analysis.enabled) return text;
    return insertDeclaration(text, analysis);
  }
  if (!analysis.enabled) return text;
  if (analysis.documentClass && CTEX_CLASS.test(analysis.documentClass.name)) {
    const base = CTEX_BASE[analysis.documentClass.name];
    return text.slice(0, analysis.documentClass.nameStart) + base + text.slice(analysis.documentClass.nameEnd);
  }
  let next = text;
  for (const declaration of [...analysis.packageDeclarations].reverse()) {
    next = removeCtexDeclaration(next, declaration);
  }
  return next;
}

export function hasHanDocumentText(source = '') {
  const masked = maskComments(source);
  return /\p{Script=Han}/u.test(masked);
}
