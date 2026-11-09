import { plain } from './document.mjs';

export function parseTable(source) {
  const match = source.match(/^\\begin\{tabular\}\{([lcr]+)\}\r?\n([\s\S]*?)\r?\n\\end\{tabular\}$/);
  if (!match) return null;
  const [, columns, body] = match;
  const rows = [];
  const trailing = [];
  for (const line of body.split(/\r?\n/)) {
    const text = line.trim();
    if (/^\\(?:toprule|midrule|bottomrule|hline)$/.test(text)) {
      trailing.push(text);
      continue;
    }
    const cells = line.replace(/[ \t]*\\\\[ \t]*$/, '').split('&');
    if (cells.length !== columns.length || !cells.every(cell => plain.test(cell.trim()))) return null;
    rows.push({ cells, rules: trailing.splice(0) });
  }
  return rows.length ? { columns, rows, trailing } : null;
}

export function serializeTable({ columns, rows, trailing }, eol) {
  return [
    '\\begin{tabular}{' + columns + '}',
    ...rows.flatMap(({ cells, rules }) => [...rules, cells.join('&') + ' \\\\']),
    ...trailing,
    '\\end{tabular}',
  ].join(eol);
}
