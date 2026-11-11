const standalone = /^(?:align|alignat|flalign|gather|multline|equation|eqnarray|xalignat)\*?$|^(?:xxalignat|IEEEeqnarray|displaymath|math|empheq)$/;

export function displayEnvironment(latex) {
  const name = /^\s*\\begin\{([^{}]+)\}/.exec(latex)?.[1];
  return name && standalone.test(name) ? name : null;
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
