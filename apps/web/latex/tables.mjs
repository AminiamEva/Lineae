import {columnSpecs,placeRow,serializeSpanningRow} from './table-spans.mjs';

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

export function parseColumnLayout(columns, specs) {
  const boundaries = Array.from({length:specs.length + 1}, () => ({tabcolsep:true, rules:0, at:false, bang:false}));
  let column = 0;
  let pending = {rules:0, at:false, bang:false};
  const commit = () => {
    const boundary = boundaries[column];
    if (!boundary) return;
    boundary.rules += pending.rules;
    boundary.at = boundary.at || pending.at;
    boundary.tabcolsep = boundary.tabcolsep && !pending.at;
    boundary.bang = boundary.bang || pending.bang;
    pending = {rules:0, at:false, bang:false};
  };
  for (let index = 0; index < columns.length;) {
    const char = columns[index];
    if (char === ' ' || char === '\t') { index++; continue; }
    if (char === '|') { pending.rules++; index++; continue; }
    if (char === '@' || char === '!') {
      const match = columns.slice(index).match(/^[@!]\{[^{}]*\}/);
      if (!match) return null;
      if (char === '@') pending.at = true;
      else pending.bang = true;
      index += match[0].length;
      continue;
    }
    if (char === '>' || char === '<') {
      const match = columns.slice(index).match(/^[<>]\{[^{}]*\}/);
      if (!match) return null;
      index += match[0].length;
      continue;
    }
    if (char === 'l' || char === 'c' || char === 'r') {
      commit(); column++; index++; continue;
    }
    const width = columns.slice(index).match(/^[pmb]\{[^{}]*\}/);
    if (width) { commit(); column++; index += width[0].length; continue; }
    if (char === '*') {
      const count = columns.slice(index).match(/^\*\{(\d+)\}\{([^{}]*)\}/);
      if (!count) return null;
      const repeated = columnSpecs(count[2]);
      index += count[0].length;
      column += Number(count[1]) * (repeated?.length ?? 1);
      continue;
    }
    if (char === ' ' || char === '\t') { index++; continue; }
    return null;
  }
  commit();
  return {boundaries};
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
  const specs = parseColumns(columns) ?? columnSpecs(columns);
  if (!specs) return null;
  const columnLayout = parseColumnLayout(columns, specs);
  if (!columnLayout) return null;
  const match = source.slice(index).match(/^\r?\n([\s\S]*?)\r?\n\\end\{tabular\}$/);
  if (!match) return null;
  const rows = [],occupied=Array(specs.length).fill(0);
  const trailing = [];
  for (const line of match[1].split(/\r?\n/)) {
    const text = line.trim();
    if (/^\\(?:toprule|midrule|bottomrule|hline)$/.test(text) || /^\\cmidrule(?:\([^)]*\))?\{[^}]*\}$/.test(text)) {
      trailing.push(text);
      continue;
    }
    const cells=placeRow(splitCells(line.replace(/[ \t]*\\\\[ \t]*$/,'')),occupied);
    if(!cells)return null;
    rows.push({
      cells: cells.map(cell => cell.text),
      spans: cells.map(cell => cell.colspan),
      rowspans: cells.map(cell => cell.rowspan),
      columnIndexes: cells.map(cell => cell.column),
      aligns: cells.map(cell => cell.align),
      rules: trailing.splice(0),
    });
  }
  return rows.length ? { columns, specs, columnLayout, rows, trailing } : null;
}

export function serializeTable({ columns, specs, rows, trailing }, eol) {
  const lines = ['\\begin{tabular}{' + columns + '}'];
  for (const row of rows) {
    lines.push(...row.rules);
    const cells=serializeSpanningRow(row,specs);
    lines.push(cells.join(' & ') + ' \\\\');
  }
  lines.push(...trailing, '\\end{tabular}');
  return lines.join(eol);
}
