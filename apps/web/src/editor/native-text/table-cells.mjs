import {parseTable} from '../../../latex/tables.mjs';
import {placeRow,readGroup} from '../../../latex/table-spans.mjs';

function contentRange(part,offset) {
  let text=part.trim();
  offset+=part.length-part.trimStart().length;
  for(let command; (command=/^\\(?:multicolumn|multirow)(?=\{)/.exec(text));){
    const count=readGroup(text,command[0].length);
    const format=count&&readGroup(text,count.end);
    const body=format&&readGroup(text,format.end);
    if(!body||body.end!==text.length)return null;
    offset+=format.end+1+body.value.length-body.value.trimStart().length;
    text=body.value.trim();
  }
  return /[\\{}$%#_^~]/.test(text)?null:{text,offset};
}

// Reuse the importer's span placement so skipped multirow placeholders do
// not shift ProseMirror cell indexes. Only edit text inside known wrappers.
export function plainTableCells(block) {
  const leading=block.length-block.trimStart().length;
  const raw=block.trim(),begin='\\begin{tabular}';
  if(!raw.startsWith(begin))return null;
  const spec=readGroup(raw,begin.length);
  const newline=spec&&/^[ \t]*\r?\n/.exec(raw.slice(spec.end));
  const closing=/\r?\n[ \t]*\\end\{tabular\}$/.exec(raw);
  if(!newline||!closing)return null;
  const table=parseTable(raw);
  if(!table)return null;
  const start=spec.end+newline[0].length;
  const body=raw.slice(start,closing.index);
  const occupied=Array(table.specs.length).fill(0),cells=[];
  let row=0;
  for(const line of body.matchAll(/[^\r\n]+/g)){
    if(/^\s*\\(?:hline|toprule|midrule|bottomrule|cmidrule(?:\([^)]*\))?\{[^}]*\})\s*$/.test(line[0]))continue;
    const parts=line[0].replace(/[ \t]*\\\\[ \t]*$/,'').split('&');
    const placed=placeRow(parts,occupied);
    if(!placed||!table.rows[row]||placed.length!==table.rows[row].cells.length)return null;
    let offset=leading+start+line.index;
    const offsets=parts.map(part=>{const result=offset;offset+=part.length+1;return result;});
    for(const [column,cell] of placed.entries()){
      const range=contentRange(parts[cell.sourceIndex],offsets[cell.sourceIndex]);
      if(!range||range.text!==cell.text||range.text!==table.rows[row].cells[column])return null;
      cells.push({row,column,...range});
    }
    row++;
  }
  return row===table.rows.length?cells:null;
}
