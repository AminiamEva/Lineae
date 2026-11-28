export function readGroup(text, start) {
  if(text[start]!=='{')return null;
  let depth=1;
  for(let end=start+1;end<text.length;end++){
    if(text[end]==='\\'){end++;continue;}
    if(text[end]==='{')depth++;
    if(text[end]==='}'&&!--depth)return {value:text.slice(start+1,end),end:end+1};
  }
  return null;
}
export function columnSpecs(text,depth=0){
  if(depth>32)return null;
  const result=[];
  for(let offset=0;offset<text.length;){
    const token=text[offset++];
    if(/[\s|]/.test(token))continue;
    if('lcr'.includes(token)){result.push({align:{l:'left',c:'center',r:'right'}[token],width:null});continue;}
    const group=readGroup(text,offset);
    if(!group)return null;
    offset=group.end;
    if('pmb'.includes(token)){result.push({align:'left',width:group.value});continue;}
    if('@!><'.includes(token))continue;
    if(token!=='*'||!/^\d+$/.test(group.value))return null;
    const repeated=readGroup(text,offset);
    const columns=repeated&&columnSpecs(repeated.value,depth+1);
    const count=Number(group.value);
    if(!columns||count*columns.length+result.length>4096)return null;
    for(let n=0;n<count;n++)result.push(...columns.map(column=>({...column})));
    offset=repeated.end;
  }
  return result.length?result:null;
}
export function spanningCell(raw){
  let text=raw.trim(),colspan=1,rowspan=1,align=null;
  for(;;){
    const command=/^\\(multicolumn|multirow)/.exec(text);
    if(!command)break;
    const count=readGroup(text,command[0].length);
    const format=count&&readGroup(text,count.end);
    const body=format&&readGroup(text,format.end);
    if(!body||body.end!==text.length||!/^\d+$/.test(count.value)||Number(count.value)<1)return null;
    if(command[1]==='multirow')rowspan=Number(count.value);
    else {colspan=Number(count.value);align=format.value.includes('c')?'center':format.value.includes('r')?'right':format.value.includes('l')?'left':null;}
    text=body.value.trim();
  }
  return {text,colspan,rowspan,align};
}
export function placeRow(rawCells,occupied){
  const parsed=rawCells.map(spanningCell);
  if(parsed.some(cell=>!cell))return null;
  const cells=[];let cursor=0;
  for(let column=0;column<occupied.length;){
    if(occupied[column]){
      const skipped=parsed[cursor];
      if(skipped?.text===''&&skipped.colspan===1&&skipped.rowspan===1)cursor++;
      occupied[column++]--;continue;
    }
    const cell=parsed[cursor++];
    if(!cell||column+cell.colspan>occupied.length)return null;
    for(let delta=0;delta<cell.colspan;delta++)if(occupied[column+delta])return null;
    cells.push({...cell,column,sourceIndex:cursor-1});
    for(let delta=0;delta<cell.colspan;delta++)occupied[column+delta]=cell.rowspan-1;
    column+=cell.colspan;
  }
  return parsed.slice(cursor).some(cell=>cell.text)?null:cells;
}
export function wrapCell(value,colspan=1,rowspan=1,align){
  if(rowspan>1)value='\\multirow{'+rowspan+'}{*}{'+value+'}';
  if(colspan>1)value='\\multicolumn{'+colspan+'}{'+({center:'c',right:'r'}[align]??'l')+'}{'+value+'}';
  return value;
}
export function serializeSpanningRow(row,specs){
  const values=[];let column=0;
  row.cells.forEach((text,index)=>{
    const target=row.columnIndexes?.[index]??column;
    while(column<target){values.push('');column++;}
    const colspan=row.spans?.[index]??1;
    values.push(wrapCell(text.trim(),colspan,row.rowspans?.[index]??1,row.aligns?.[index]??specs?.[target]?.align));
    column+=colspan;
  });
  return values;
}
export function richTableRow(row,occupied,serialize){
  const values=[];let column=0;
  for(const cell of row.content??[]){
    while(column<occupied.length&&occupied[column]){values.push('');occupied[column++]--;}
    values.push(serialize(cell));
    const span=cell.attrs?.colspan??1,rows=cell.attrs?.rowspan??1;
    for(let delta=0;delta<span;delta++)occupied[column+delta]=rows-1;
    column+=span;
  }
  while(column<occupied.length){if(occupied[column])occupied[column]--;values.push('');column++;}
  return values.join(' & ')+' \\\\\n';
}
export function importedCellAttributes(row,index,specs){
  return {colspan:row.spans?.[index]??1,rowspan:row.rowspans?.[index]??1,align:row.aligns?.[index]??specs[row.columnIndexes?.[index]??index]?.align??null};
}
