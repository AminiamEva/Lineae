import { plain } from './document.mjs';

function groupAt(source,index) {
  if(source[index]!=='{')return null;
  let depth=1,cursor=index+1;
  while(cursor<source.length&&depth){
    if(source[cursor]==='\\'){cursor+=2;continue;}
    if(source[cursor]==='{')depth++;
    else if(source[cursor]==='}')depth--;
    cursor++;
  }
  return depth?null:{value:source.slice(index+1,cursor-1),end:cursor};
}

function parseColumns(spec) {
  const columns = [];
  let index = 0;
  while (index < spec.length) {
    const char = spec[index];
    if (char === 'l' || char === 'c' || char === 'r') {
      columns.push({ align: char === 'l' ? 'left' : char === 'c' ? 'center' : 'right', width: null });
      index++;
    } else if (char === 'p' || char === 'm' || char === 'b') {
      const group=groupAt(spec,index+1);
      if(!group)return null;
      columns.push({align:'left',width:group.value});index=group.end;
    } else if ('@!><'.includes(char)) {
      const group=groupAt(spec,index+1);if(!group)return null;index=group.end;
    } else if(char==='*') {
      const count=groupAt(spec,index+1);if(!count || !/^\d+$/.test(count.value))return null;
      const repeated=groupAt(spec,count.end),parsed=repeated&&parseColumns(repeated.value);
      if(!parsed)return null;
      for(let repeat=0;repeat<Number(count.value);repeat++)columns.push(...parsed.map(column=>({...column})));
      index=repeated.end;
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
  let text=raw.trim(),colspan=1,rowspan=1,align=null;
  for(;;){
    const multi=text.match(/^\\multicolumn\{(\d+)\}\{([^{}]*)\}\{([\s\S]*)\}$/);
    if(multi){
      colspan=Number(multi[1]);align=multi[2].includes('c')?'center':multi[2].includes('r')?'right':multi[2].includes('l')?'left':null;
      text=multi[3].trim();continue;
    }
    const row=text.match(/^\\multirow\{(\d+)\}\{([^{}]*)\}\{([\s\S]*)\}$/);
    if(row){rowspan=Number(row[1]);text=row[3].trim();continue;}
    break;
  }
  return {text,colspan,rowspan,align};
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
  const rows = [],occupied=Array(specs.length).fill(0);
  const trailing = [];
  for (const line of match[1].split(/\r?\n/)) {
    const text = line.trim();
    if (/^\\(?:toprule|midrule|bottomrule|hline)$/.test(text) || /^\\cmidrule(?:\([^)]*\))?\{[^}]*\}$/.test(text)) {
      trailing.push(text);
      continue;
    }
    const parsed=splitCells(line.replace(/[ \t]*\\\\[ \t]*$/,'')).map(parseCell),cells=[];
    let column=0,index=0;
    while(column<specs.length){
      if(occupied[column]>0){
        if(parsed[index]?.text==='' && parsed[index].colspan===1 && parsed[index].rowspan===1)index++;
        occupied[column]--;column++;continue;
      }
      const cell=parsed[index++];
      if(!cell || !plain.test(cell.text) || column+cell.colspan>specs.length)return null;
      if(Array.from({length:cell.colspan},(_,offset)=>occupied[column+offset]).some(Boolean))return null;
      cell.column=column;cells.push(cell);
      if(cell.rowspan>1)for(let offset=0;offset<cell.colspan;offset++)occupied[column+offset]=cell.rowspan-1;
      column+=cell.colspan;
    }
    if(parsed.slice(index).some(cell=>cell.text))return null;
    rows.push({
      cells: cells.map(cell => cell.text),
      spans: cells.map(cell => cell.colspan),
      rowspans: cells.map(cell => cell.rowspan),
      columnIndexes: cells.map(cell => cell.column),
      aligns: cells.map(cell => cell.align),
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
    const cells=[];let column=0;
    row.cells.forEach((cell,index) => {
      const target=row.columnIndexes?.[index]??column;
      while(column<target){cells.push('');column++;}
      const span = row.spans?.[index] ?? 1;
      const rowspan=row.rowspans?.[index]??1;
      let value=cell.trim();
      if(rowspan>1)value='\\multirow{'+rowspan+'}{*}{'+value+'}';
      if(span>1)value='\\multicolumn{'+span+'}{'+alignSpec(row.aligns?.[index],specs?.[target])+'}{'+value+'}';
      cells.push(value);column+=span;
    });
    lines.push(cells.join(' & ') + ' \\\\');
  }
  lines.push(...trailing, '\\end{tabular}');
  return lines.join(eol);
}
