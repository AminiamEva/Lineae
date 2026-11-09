import { plain } from './document.mjs';

function parseColumns(spec) {
  const columns = [];
  let index = 0;
  while (index < spec.length) {
    const char = spec[index];
    if (char === 'l' || char === 'c' || char === 'r') {
      columns.push({ align: char === 'l' ? 'left' : char === 'c' ? 'center' : 'right', width: null });
      index++;
    } else if (char === 'p' || char === 'm' || char === 'b') {
      const match = spec.slice(index).match(/^[pmb]\{([^{}]*)\}/);
      if (!match) return null;
      columns.push({ align: 'left', width: match[1] });
      index += match[0].length;
    } else if (char === '@') {
      const match = spec.slice(index).match(/^@\{[^{}]*\}/);
      if (!match) return null;
      index += match[0].length;
    } else if (char === '|' || char === ' ') {
      index++;
    } else return null;
  }
  return columns.length ? columns : null;
}

function splitCells(line) {
  const cells = [];
  let current = '';
  let escaped = false;
  for (const char of line) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\') { current += char; escaped = true; continue; }
    if (char === '&') { cells.push(current); current = ''; continue; }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCell(raw) {
  const text = raw.trim();
  const multi = text.match(/^\\multicolumn\{(\d+)\}\{([^{}]*)\}\{([\s\S]*)\}$/);
  if (multi) {
    const align = multi[2].includes('c') ? 'center' : multi[2].includes('r') ? 'right' : multi[2].includes('l') ? 'left' : null;
    return { text: multi[3].trim(), colspan: Number(multi[1]), align };
  }
  return { text, colspan: 1, align: null };
}

export function parseTable(source) {
  const begin = '\\begin{tabular}{';
  if (!source.startsWith(begin)) return null;
  let depth = 1;
  let index = begin.length;
  for (; index < source.length && depth; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}') depth--;
  }
  if (depth) return null;
  const columns = source.slice(begin.length, index - 1);
  const specs = parseColumns(columns);
  if (!specs) return null;
  const match = source.slice(index).match(/^\r?\n([\s\S]*?)\r?\n\\end\{tabular\}$/);
  if (!match) return null;
  const rows = [];
  const trailing = [];
  for (const line of match[1].split(/\r?\n/)) {
    const text = line.trim();
    if (/^\\(?:toprule|midrule|bottomrule|hline)$/.test(text) || /^\\cmidrule(?:\([^)]*\))?\{[^}]*\}$/.test(text)) {
      trailing.push(text);
      continue;
    }
    const parsed = splitCells(line.replace(/[ \t]*\\\\[ \t]*$/, '')).map(parseCell);
    if (parsed.some(cell => !plain.test(cell.text))) return null;
    if (parsed.reduce((total, cell) => total + cell.colspan, 0) !== specs.length) return null;
    rows.push({
      cells: parsed.map(cell => cell.text),
      spans: parsed.map(cell => cell.colspan),
      aligns: parsed.map(cell => cell.align),
      rules: trailing.splice(0),
    });
  }
  return rows.length ? { columns, specs, rows, trailing } : null;
}

function alignSpec(align, spec) {
  const value = align ?? spec?.align;
  return value === 'center' ? 'c' : value === 'right' ? 'r' : 'l';
}

export function serializeTable({ columns, specs, rows, trailing }, eol) {
  const lines = ['\\begin{tabular}{' + columns + '}'];
  for (const row of rows) {
    lines.push(...row.rules);
    const cells = row.cells.map((cell, index) => {
      const span = row.spans?.[index] ?? 1;
      if (span > 1) return '\\multicolumn{' + span + '}{' + alignSpec(row.aligns?.[index], specs?.[index]) + '}{' + cell.trim() + '}';
      return cell.trim();
    });
    lines.push(cells.join(' & ') + ' \\\\');
  }
  lines.push(...trailing, '\\end{tabular}');
  return lines.join(eol);
}
