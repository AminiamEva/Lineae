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

export function mathEditorSource(latex) {
  const parts = alignmentParts(latex);
  if (!parts) return latex;
  const [, , environment, body] = parts;
  if (environment === 'align' && alignmentRows(body).every(row => row.columns <= 2)) return latex;
  return '\\begin{aligned}' + body + '\\end{aligned}';
}

export function mathDocumentSource(value, previous) {
  if (mathEditorSource(previous) === previous) return value;
  const body = /^\\begin\{aligned\}([\s\S]*)\\end\{aligned\}$/.exec(value)?.[1];
  const parts = alignmentParts(previous);
  return body === undefined ? value : parts[1] + body + parts[4];
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
  if (delimiter === 'equation') return [{ index: 0, label: null }];
  if (!environment || environment.endsWith('*') ||
      !/^(?:align|alignat|flalign|gather|eqnarray|multline)$/.test(environment)) return [];
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
      if (token.startsWith('\\\\') && environment !== 'multline') rows.push({ index: rows.length, label: null });
      else if (key) row.label = key;
      else if (token === '\\notag' || token === '\\nonumber') row.unnumbered = true;
    }
  }
  if (rows.length > 1 && /\\\\(?:\*?(?:\[[^\]]*\])?)\s*$/.test(body)) rows.pop();
  return rows;
}
