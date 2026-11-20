const standalone = /^(?:align|alignat|flalign|gather|multline|equation|eqnarray|xalignat)\*?$|^(?:xxalignat|IEEEeqnarray|displaymath|math|empheq)$/;

export function displayEnvironment(latex) {
  const name = /^\s*\\begin\{([^{}]+)\}/.exec(latex)?.[1];
  return name && standalone.test(name) ? name : null;
}

function alignmentParts(latex) {
  const parts = /^(\s*\\begin\{(align|alignat|flalign)\*?\})([\s\S]*?)(\\end\{\2\*?\}\s*)$/.exec(latex);
  if (parts?.[2] === 'alignat') {
    const argument = /^\s*\{\d+\}/.exec(parts[3])?.[0];
    if (argument) {
      parts[1] += argument;
      parts[3] = parts[3].slice(argument.length);
    }
  }
  return parts;
}

function alignmentRows(body) {
  const rows = [];
  let start = 0, depth = 0, braces = 0, columns = 1;
  for (const match of body.matchAll(/%[^\n]*|\\(begin|end)\{[^{}]+\}|\\\\\*?(?:\[[^\]]*\])?|\\.|[{}&]/g)) {
    const [token, boundary] = match;
    if (boundary) depth += boundary === 'begin' ? 1 : -1;
    else if (token === '{') braces++;
    else if (token === '}') braces--;
    else if (!depth && !braces && token === '&') columns++;
    else if (!depth && !braces && token.startsWith('\\\\')) {
      rows.push({ start, end: match.index, columns });
      start = match.index + token.length;
      columns = 1;
    }
  }
  if (body.slice(start).trim() || rows.length === 0) rows.push({ start, end: body.length, columns });
  return rows;
}

const LIMIT_OPERATORS = 'limsup|liminf|lim|sum|prod|coprod|bigcup|bigcap|bigvee|bigwedge|bigoplus|bigotimes|bigodot|biguplus|bigsqcup|max|min|sup|inf|det|gcd|Pr';
const limitOperator = new RegExp(`\\\\(${LIMIT_OPERATORS})(?![A-Za-z])(?!\\\\limits|\\\\nolimits)`, 'g');

const displayAnnotation = /\\(tag\*?)\s*\{([^{}]*)\}|\\notag(?![A-Za-z])|\\nonumber(?![A-Za-z])/g;
const rowAnnotation = /\\(?:tag\*?\s*\{[^{}]*\}|notag(?![A-Za-z])|nonumber(?![A-Za-z])|label\s*\{[^{}]+\})/g;

function stripRowAnnotations(latex, { labels = true } = {}) {
  return latex.replace(labels ? rowAnnotation : displayAnnotation, '');
}

// MathLive does not implement equation metadata such as \tag, \notag, and
// \label. The editing source omits those commands and the document source
// restores their exact spelling from the previous LaTeX value.
function rowAnnotations(body) {
  return alignmentRows(body).map(({ start, end }) => {
    const text = body.slice(start, end);
    return [...text.matchAll(rowAnnotation)].map(match => match[0]);
  });
}

function applyRowAnnotations(body, annotations) {
  const rows = alignmentRows(body);
  let output = '';
  let cursor = 0;
  rows.forEach(({ start, end }, index) => {
    const text = body.slice(start, end);
    const content = text.replace(/\s+$/, '');
    const suffix = annotations[index]?.join('') ?? '';
    output += body.slice(cursor, start) + content + suffix + text.slice(content.length);
    cursor = end;
  });
  return output + body.slice(cursor);
}

function environmentBody(latex) {
  const match = /^(\s*\\begin\{([^{}]+)\})([\s\S]*)(\\end\{\2\}\s*)$/.exec(latex);
  return match ? { open: match[1], body: match[3], close: match[4] } : null;
}

function restoreTrailingAnnotation(value, previous) {
  rowAnnotation.lastIndex = 0;
  if (rowAnnotation.test(value)) return value;
  rowAnnotation.lastIndex = 0;
  const suffix = [...previous.matchAll(rowAnnotation)].map(match => match[0]).join('');
  if (!suffix) return value;
  const end = /\\end\{[^{}]+\}\s*$/.exec(value);
  return end ? value.slice(0, end.index) + suffix + value.slice(end.index) : value + suffix;
}

export function mathEditorSource(latex, { inline = false } = {}) {
  latex = latex.replace(/\\textasciicircum(?:\{\})?(?![a-zA-Z])/g, '\\text{ˆ}');
  if (inline && !/\\(?:displaystyle|textstyle)\b/.test(latex)) {
    // MathLive always stacks limits under these operators. TeX uses side
    // limits in inline math, so force that layout for the editing view.
    latex = latex.replace(limitOperator, '\\$1\\nolimits');
  }
  const parts = alignmentParts(latex);
  if (!parts) return stripRowAnnotations(latex, { labels:!inline });
  const [, , , body] = parts;
  return '\\begin{aligned}' + stripRowAnnotations(body) + '\\end{aligned}';
}

export function mathDocumentSource(value, previous, { inline = false } = {}) {
  value = value.replace(/\\text\{ˆ\}/g, '\\textasciicircum{}');
  if (inline && !/\\nolimits(?![A-Za-z])/.test(previous)) value = value.replace(/\\nolimits(?![A-Za-z])/g, '');
  const body = /^\\begin\{aligned\}([\s\S]*)\\end\{aligned\}$/.exec(value)?.[1];
  const parts = alignmentParts(previous);
  if (body !== undefined && parts) {
    return parts[1] + applyRowAnnotations(body, rowAnnotations(parts[3])) + parts[4];
  }
  const current = environmentBody(value);
  const source = environmentBody(previous);
  if (current && source && current.open.trim() === source.open.trim()) {
    return current.open + applyRowAnnotations(current.body, rowAnnotations(source.body)) + current.close;
  }
  return restoreTrailingAnnotation(value, previous);
}

export function appendAlignmentPair(latex) {
  const parts = alignmentParts(latex);
  if (!parts) return null;
  let [, open, environment, body, close] = parts;
  for (const { end, columns } of alignmentRows(body).reverse()) {
    const slots = ' & \\placeholder{}'.repeat(2 + columns % 2);
    body = body.slice(0, end) + slots + body.slice(end);
  }
  if (environment === 'alignat') open = open.replace(/\{(\d+)\}$/, (_, count) => '{' + (Number(count) + 1) + '}');
  return open + body + close;
}

export function alignmentLabel(latex, index, key) {
  const parts = alignmentParts(latex);
  if (!parts || !key) return latex;
  const [, open, , body, close] = parts;
  const row = alignmentRows(body)[index];
  if (!row) return latex;
  const end = row.start + body.slice(row.start, row.end).trimEnd().length;
  return open + body.slice(0, end) + '\\label{' + key + '}' + body.slice(end) + close;
}

export function numberedMathRows({ latex, delimiter }) {
  const environment = displayEnvironment(latex);
  if (delimiter === 'equation' || delimiter === 'equation*') {
    const tag = /\\(tag\*?)\s*\{([^{}]*)\}/.exec(latex);
    if (delimiter === 'equation*' && !tag) return [];
    return [{
      index: 0,
      label: null,
      ...(tag ? { tag: tag[2].trim(), ...(tag[1] === 'tag*' ? { tagStar: true } : {}) } : {}),
    }];
  }
  if (!environment || !/^(?:align|alignat|flalign|gather|eqnarray|multline)\*?$/.test(environment)) return [];
  const starred = environment.endsWith('*');
  const body = latex.slice(latex.indexOf('}') + 1, latex.lastIndexOf('\\end{'));
  const rows = [{ index: 0, label: null }];
  let depth = 0;
  let groups = 0;
  for (const [token, boundary, key] of body.matchAll(/%[^\n]*|\\(begin|end)\{[^{}]+\}|\\label\{([^{}]+)\}|\\(?:notag|nonumber)\b|\\\\(?:\*?(?:\[[^\]]*\])?)|\\.|[{}]/g)) {
    if (boundary) depth += boundary === 'begin' ? 1 : -1;
    else if (token === '{') groups++;
    else if (token === '}') groups--;
    else if (!depth && !groups) {
      const row = rows.at(-1);
      if (token.startsWith('\\\\') && !environment.startsWith('multline')) rows.push({ index: rows.length, label: null });
      else if (key) row.label = key;
      else if (token === '\\notag' || token === '\\nonumber') row.unnumbered = true;
    }
  }
  if (rows.length > 1 && /\\\\(?:\*?(?:\[[^\]]*\])?)\s*$/.test(body)) rows.pop();
  const texts = alignmentRows(body);
  for (const row of rows) {
    const text = texts[row.index] ? body.slice(texts[row.index].start, texts[row.index].end) : '';
    const tag = /\\(tag\*?)\s*\{([^{}]*)\}/.exec(text);
    if (!tag) continue;
    row.tag = tag[2].trim();
    if (tag[1] === 'tag*') row.tagStar = true;
    delete row.unnumbered;
  }
  if (starred) {
    if (rows.every(row => row.tag === undefined)) return [];
    for (const row of rows) if (row.tag === undefined) row.unnumbered = true;
  }
  return rows;
}
