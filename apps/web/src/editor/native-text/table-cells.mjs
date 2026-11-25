import {parseTable} from '../../../latex/tables.mjs';

// Accept only source rows whose physical cells match the existing importer.
// More complex cells stay outside this adapter until they have source maps.
export function plainTableCells(block) {
  const leading=block.length-block.trimStart().length;
  const raw=block.trim();
  const opening=/^\\begin\{tabular\}\{[^{}]+\}[ \t]*\r?\n/.exec(raw);
  const closing=/\r?\n[ \t]*\\end\{tabular\}$/.exec(raw);
  if(!opening||!closing)return null;
  const table=parseTable(raw);
  if(!table)return null;
  const body=raw.slice(opening[0].length,closing.index);
  const cells=[];
  let row=0;
  for(const line of body.matchAll(/[^\r\n]+/g)){
    if(/^\s*\\(?:hline|toprule|midrule|bottomrule)\s*$/.test(line[0]))continue;
    const content=line[0].replace(/[ \t]*\\\\[ \t]*$/,'');
    if(!table.rows[row]||table.rows[row].cells.length!==content.split('&').length)return null;
    let offset=leading+opening[0].length+line.index;
    for(const [column,part] of content.split('&').entries()){
      const text=part.trim();
      if(table.rows[row].spans[column]!==1||table.rows[row].rowspans[column]!==1||
         table.rows[row].cells[column].trim()!==text||/[\\{}$%#_^~]/.test(text))return null;
      cells.push({row,column,text,offset:offset+part.length-part.trimStart().length});
      offset+=part.length+1;
    }
    row++;
  }
  return row===table.rows.length?cells:null;
}
