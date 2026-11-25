import {sourceStructure} from './source-structure.mjs';
import {group,trivia,clean,environmentEnd,delimiters,importSourceTable} from './tblr.mjs';
import {parseTableFloat} from './table-floats.mjs';
import {parseTable} from './tables.mjs';
import {wrapCell,readGroup} from './table-spans.mjs';

const alignments={l:'left',c:'center',r:'right'};
const dimension=/^(?:\d+(?:\.\d+)?|\.\d+)(?:pt|px|cm|mm|in|em|ex)$/;
function relativeWidth(value) {
  const match=/^(\d+(?:\.\d+)?|\.\d+)?\\textwidth$/.exec(clean(value));
  return match?Number(match[1]??1):null;
}
function widthCSS(value,total='\\textwidth') {
  const text=clean(value),fraction=relativeWidth(text),parent=relativeWidth(total);
  if(fraction!==null&&parent>0)return Number((100*fraction/parent).toFixed(6))+'%';
  return dimension.test(text)?text:null;
}
function declaration(source,unsupported) {
  const result={};let known=true;
  for(const token of sourceStructure(source)) {
    if(!token.topLevel||token.kind!=='command')continue;
    switch(token.value) {
      case '\\centering':result.align='center';break;
      case '\\raggedright':result.align='left';break;
      case '\\raggedleft':result.align='right';break;
      case '\\arraybackslash':break;
      case '\\bfseries':result.fontWeight='700';break;
      case '\\itshape':result.fontStyle='italic';break;
      default:known=false;
    }
  }
  if(!known)unsupported.push('>{'+source+'}');
  return result;
}
function parseColumns(preamble,total,unsupported) {
  const specs=[],gaps=[],vertical=[],starts=[],ends=[];let prefix='',style={};
  for(let i=0;i<preamble.length;) {
    i=trivia(preamble,i);if(i===preamble.length)break;
    const tokenStart=i,token=preamble[i++];
    if(token==='|'){vertical.push(specs.length);continue;}
    if(['>','<','@','!'].includes(token)) {
      const start=trivia(preamble,i),arg=group(preamble,start);if(!arg)return null;i=arg.end;
      if(token==='>'){prefix+=preamble.slice(tokenStart,arg.end);Object.assign(style,declaration(arg.value,unsupported));}
      else if(token==='@'){gaps.push({column:specs.length,source:arg.value});if(clean(arg.value))unsupported.push('@{'+arg.value+'}');}
      else unsupported.push(token+'{'+arg.value+'}');
      continue;
    }
    if(!'Xlcrp'.includes(token))return null;
    let width=null;
    if(token==='p') {
      const arg=group(preamble,trivia(preamble,i));if(!arg)return null;
      width=arg.value;i=arg.end;
    }
    const {align,...css}=style;
    specs.push({type:token,width,widthCSS:width===null?null:widthCSS(width,total),prefix,
      align:align??alignments[token]??'left',style:css});
    starts.push(tokenStart);
    ends.push(i);
    if(specs.length>4096)return null;
    prefix='';style={};
  }
  return specs.length&&!prefix?{specs,gaps,vertical,starts,ends}:null;
}

export function parseTabularx(source) {
  return parseColumnTable(source,'tabularx');
}

function parseColumnTable(source,environment,{allowMultirow=false}={}) {
  const opening=/^\s*\\begin\{(tabularx|tabular)\}/.exec(source);
  if(opening?.[1]!==environment)return null;
  if([...sourceStructure(source)].some(t=>t.kind==='invalid'))return null;
  const close=environmentEnd(source,opening[0].indexOf('\\begin'),environment);
  if(!close||source.slice(close.end).trim())return null;
  const width=environment==='tabularx'?group(source,trivia(source,opening[0].length))
    :{end:opening[0].length,value:'\\textwidth'};
  if(!width)return null;
  let at=trivia(source,width.end),position=null;
  if(source[at]==='['){const pos=group(source,at,'[',']');if(!pos)return null;position=pos.value;at=trivia(source,pos.end);}
  const preamble=group(source,at);if(!preamble||preamble.end>close.start)return null;
  const unsupported=[],columns=parseColumns(preamble.value,width.value,unsupported);if(!columns)return null;
  const {specs,gaps,vertical}=columns;
  if(environment==='tabular'&&(specs.some(spec=>spec.type==='X')||
    /\\(?:cline|cmidrule)(?![A-Za-z])/.test(source)||
    !allowMultirow&&/\\multirow(?![A-Za-z])/.test(source)))return null;
  const body=source.slice(preamble.end,close.start),tokens=delimiters(body,['&','\\\\']);if(!tokens)return null;
  let from=0,cells=[];const rawRows=[],rowEnds=[],rules=[];
  for(const token of [...tokens,{index:body.length,end:body.length,value:'end'}]) {
    if(token.index<from)continue;
    let begin=from;
    if(!cells.length) {
      begin=trivia(body,begin);
      for(;;) {
        const rule=/^\\(toprule|midrule|bottomrule|hline)(?![A-Za-z])/.exec(body.slice(begin));
        if(!rule||rule[1]==='hline'&&environment!=='tabular')break;
        const ruleStart=begin;begin=trivia(body,begin+rule[0].length);
        let weight=rule[1]==='midrule'?'0.5pt':'0.8pt';
        if(body[begin]==='[') {
          const arg=group(body,begin,'[',']');if(!arg)return null;
          if(dimension.test(clean(arg.value)))weight=clean(arg.value);
          else unsupported.push(body.slice(ruleStart,arg.end));
          begin=trivia(body,arg.end);
        }
        rules.push({boundary:rawRows.length,name:rule[1],css:weight+' solid currentColor'});
      }
    }
    if(begin>token.index)return null;
    cells.push({from:preamble.end+begin,to:preamble.end+token.index,raw:body.slice(begin,token.index)});
    from=token.end;
    if(token.value==='&')continue;
    if(token.value==='\\\\') {
      let next=trivia(body,from);
      if(body[next]==='*'){from=++next;next=trivia(body,next);}
      if(body[next]==='['){const spacing=group(body,next,'[',']');if(!spacing)return null;from=spacing.end;}
    }
    if(token.value==='\\\\'||cells.length>1||clean(cells[0].raw)){
      rawRows.push(cells);
      rowEnds.push({start:cells[0].from,from:preamble.end+(token.value==='end'?body.trimEnd().length:from),
        terminated:token.value!=='end'});
    }
    cells=[];
  }
  if(!rawRows.length)return null;
  const rows=[],coveredUntil=Array(specs.length).fill(0);
  for(let r=0;r<rawRows.length;r++) {
    let column=0;const row=[];
    for(const raw of rawRows[r]) {
      if(column>=specs.length)return null;
      if(coveredUntil[column]>r){
        if(clean(raw.raw))return null;
        column++;
        continue;
      }
      const trimmed=raw.raw.trimEnd().length,sourceEnd=raw.from+trimmed;
      let begin=trivia(raw.raw),end=Math.max(begin,trimmed),span=1,rowspan=1,spec=specs[column],override=null,spanRange,rowspanRange;
      const command=/^\\multicolumn(?![A-Za-z])/.exec(raw.raw.slice(begin));
      if(command) {
        const count=group(raw.raw,trivia(raw.raw,begin+command[0].length));
        const format=count&&group(raw.raw,trivia(raw.raw,count.end));
        const text=format&&group(raw.raw,trivia(raw.raw,format.end));
        if(!text||clean(raw.raw.slice(text.end))||!/^\s*\d+\s*$/.test(count.value))return null;
        span=Number(count.value);override=parseColumns(format.value,width.value,unsupported);
        if(!override||override.specs.length!==1)return null;spec=override.specs[0];
        // Patch only the third argument; keep the multicolumn wrapper intact.
        begin=trivia(raw.raw,trivia(raw.raw,format.end)+1);end=begin+raw.raw.slice(begin,text.end-1).trimEnd().length;
        spanRange={from:raw.from+count.end-1-count.value.length,to:raw.from+count.end-1};
      }
      if(environment==='tabularx'&&raw.raw.startsWith('\\multirow{',begin)){
        const count=readGroup(raw.raw,begin+'\\multirow'.length);
        const width=count&&readGroup(raw.raw,count.end),content=width&&readGroup(raw.raw,width.end);
        if(!content||content.end!==end||!/^\d+$/.test(count.value))return null;
        rowspan=Number(count.value);
        rowspanRange={from:raw.from+begin,to:raw.from+end,value:content.value,contentFrom:raw.from+width.end+1};
        begin=trivia(raw.raw,width.end+1);end=begin+raw.raw.slice(begin,content.end-1).trimEnd().length;
      }
      if(span<1||column+span>specs.length||rowspan<1||r+rowspan>rawRows.length||
         coveredUntil.slice(column,column+span).some(end=>end>r))return null;
      coveredUntil.fill(r+rowspan,column,column+span);
      const top=rules.findLast(rule=>rule.boundary===r),bottom=rules.findLast(rule=>rule.boundary===r+rowspan);
      const css={verticalAlign:'top',...spec.style,
        borderTop:top?.css??'0px solid currentColor',borderBottom:bottom?.css??'0px solid currentColor',
        borderLeft:(override?override.vertical.includes(0):vertical.includes(column))?'0.4pt solid currentColor':'0px solid currentColor',
        borderRight:(override?override.vertical.includes(1):vertical.includes(column+span))?'0.4pt solid currentColor':'0px solid currentColor'};
      if(spec.widthCSS)css.width=spec.widthCSS;
      if((override?.gaps??gaps).some(g=>g.column===(override?0:column)&&!clean(g.source)))css.paddingLeft='0px';
      if((override?.gaps??gaps).some(g=>g.column===(override?1:column+span)&&!clean(g.source)))css.paddingRight='0px';
      row.push({text:raw.raw.slice(begin,end),from:raw.from+begin,to:raw.from+end,
        sourceStart:raw.from,sourceEnd,sourceDelimiter:raw.to,spanRange,rowspanRange,
        attrs:{colspan:span,rowspan,align:spec.align,tblrStyle:css}});
      column+=span;
    }
    if(column!==specs.length)return null;rows.push(row);
  }
  return {source,columns:specs.map(s=>alignments[s.type]?s.type:s.type==='p'?'p{'+s.width+'}':'l').join(''),
    booktabs:rules.length>0,rows,rowEnds,unsupported,
    columnStarts:columns.starts.map(start=>preamble.end-preamble.value.length-1+start),
    columnEnds:columns.ends.map(end=>preamble.end-preamble.value.length-1+end),
    metadata:{width:width.value,widthCSS:widthCSS(width.value),position,preamble:preamble.value,specs,gaps,rules}};
}

const rowSpansIndex=(table,index,remove)=>table.rows.some((row,start)=>start<=index&&row.some(({attrs})=>
  attrs.rowspan>1&&index<start+attrs.rowspan-(remove?0:1)));
const hasRowSpans=table=>table.rows.some(row=>row.some(({attrs})=>attrs.rowspan>1));

function columnTableSource(source,options){
  const parse=raw=>parseTabularx(raw)??parseColumnTable(raw,'tabular',options);
  let table=parse(source),start=0;
  if(!table){
    const float=parseTableFloat(source);
    const [open,...rest]=float?[...sourceStructure(float.body)].filter(token=>token.topLevel&&token.kind==='begin'):[];
    const name=open&&/^\\begin\{(tabularx|tabular)\}$/.exec(open.value)?.[1];
    if(!name||rest.length)return null;
    const close=environmentEnd(float.body,open.index,name);
    if(!close)return null;
    table=parse(float.body.slice(open.index,close.end));
    start=float.open.length+open.index;
  }
  return table?{table,start,parse}:null;
}

export function insertTableSourceRow(source,index) {
  const location=columnTableSource(source);
  if(!location)return null;
  const {table,start,parse}=location,edge=table.rowEnds[index],columns=table.metadata.specs.length;
  if(!edge||rowSpansIndex(table,index,false))return null;
  const eol=table.source.includes('\r\n')?'\r\n':'\n';
  const row=' & '.repeat(columns-1)+'\\\\';
  const {from}=edge,insert=(edge.terminated?'':' \\\\')+eol+row;
  const draft=table.source.slice(0,from)+insert+table.source.slice(from);
  const updated=parse(draft);
  if(updated?.rows.length!==table.rows.length+1||updated.rows[index+1].some(cell=>cell.text))return null;
  return {from:start+from,to:start+from,insert};
}

export function insertTableSourceColumn(source,row,column,offset){
  const location=columnTableSource(source);
  if(!location)return null;
  const {table,start}=location,cells=table.rows[row];
  if(!cells?.[column]||hasRowSpans(table))return null;
  const boundary=cells.slice(0,column+1).reduce((count,cell)=>count+cell.attrs.colspan,0);
  const from=table.columnEnds[boundary-1],edits=[{from,to:from,insert:'l'}];
  for(const cells of table.rows){
    let index=0;
    for(const cell of cells){
      index+=cell.attrs.colspan;
      if(index<boundary)continue;
      if(index===boundary)edits.push({from:cell.sourceEnd,to:cell.sourceEnd,insert:' & '});
      else {
        if(!cell.spanRange)return null;
        const old=table.source.slice(cell.spanRange.from,cell.spanRange.to);
        edits.push({...cell.spanRange,insert:old.replace(/\d+/,String(cell.attrs.colspan+1))});
      }
      break;
    }
  }
  return changeTableSourceColumns(location,edits,1,offset);
}

function changeTableSourceColumns({table,start,parse},edits,count,offset){
  const from=edits[0].from,to=edits.at(-1).to;
  const insert=edits.toReversed().reduce((value,change)=>
    value.slice(0,change.from-from)+change.insert+value.slice(change.to-from),table.source.slice(from,to));
  const draft=table.source.slice(0,from)+insert+table.source.slice(to);
  const updated=parse(draft);
  if(updated?.rows.length!==table.rows.length||updated.metadata.specs.length!==table.metadata.specs.length+count)return null;
  let nextOffset=offset;
  for(const change of edits)if(start+change.from<offset)nextOffset+=change.insert.length-(change.to-change.from);
  return {from:start+from,to:start+to,insert,offset:nextOffset};
}

export function removeTableSourceColumn(source,row,column){
  const location=columnTableSource(source);
  if(!location)return null;
  const {table,start}=location,cells=table.rows[row];
  if(!cells?.[column]||table.metadata.specs.length<2||hasRowSpans(table))return null;
  const logical=cells.slice(0,column).reduce((count,cell)=>count+cell.attrs.colspan,0);
  if(table.metadata.specs[logical].prefix||table.metadata.preamble.includes('<'))return null;
  const edits=[{from:table.columnStarts[logical],to:table.columnEnds[logical],insert:''}];
  for(const cells of table.rows){
    let position=0;
    for(const [index,cell] of cells.entries()){
      position+=cell.attrs.colspan;
      if(position<=logical)continue;
      if(cell.attrs.colspan>1&&cell.spanRange){
        const old=table.source.slice(cell.spanRange.from,cell.spanRange.to);
        edits.push({...cell.spanRange,insert:old.replace(/\d+/,String(cell.attrs.colspan-1))});
      }else{
        const from=index?cell.sourceStart-1:cell.sourceStart;
        const to=index?cell.sourceEnd:cell.sourceDelimiter+1;
        if(table.source[index?from:to-1]!=='&')return null;
        edits.push({from,to,insert:''});
      }
      break;
    }
  }
  return changeTableSourceColumns(location,edits,-1);
}

export function removeTableSourceRow(source,index){
  const location=columnTableSource(source);
  if(!location)return null;
  const {table,start,parse}=location,edge=table.rowEnds[index];
  if(!edge||table.rows.length===1||rowSpansIndex(table,index,true))return null;
  const raw=table.source,lineStart=raw.lastIndexOf('\n',edge.start-1)+1;
  const newline=/^[ \t]*\r?\n/.exec(raw.slice(edge.from));
  const wholeLine=newline&&!raw.slice(lineStart,edge.start).trim();
  const from=wholeLine?lineStart:edge.start,to=edge.from+(wholeLine?newline[0].length:0);
  if(parse(raw.slice(0,from)+raw.slice(to))?.rows.length!==table.rows.length-1)return null;
  return {from:start+from,to:start+to,insert:''};
}

export function splitTableSourceCell(source,row,column,offset){
  const location=columnTableSource(source);
  if(!location)return null;
  const {table,start,parse}=location;
  const cell=table.rows[row]?.[column];
  if(!cell?.spanRange||cell.attrs.colspan<=1||cell.attrs.rowspan>1&&!cell.rowspanRange)return null;
  const {from,to}=cell.spanRange;
  const count=table.source.slice(from,to);
  const single=count.replace(/\d+/,'1');
  const rowspan=cell.rowspanRange;
  const contents=rowspan
    ?table.source.slice(to,rowspan.from)+rowspan.value+table.source.slice(rowspan.to,cell.sourceEnd)
    :table.source.slice(to,cell.sourceEnd);
  const insert=single+contents+' & '.repeat(cell.attrs.colspan-1);
  const draft=table.source.slice(0,from)+insert+table.source.slice(cell.sourceEnd);
  const next=parse(draft);
  const restored=next?.rows[row]?.[column];
  if(next?.rows.length!==table.rows.length||next.rows[row].length!==table.rows[row].length+cell.attrs.colspan-1||
     restored?.text!==cell.text||restored.attrs.rowspan!==1||restored.attrs.colspan!==1)return null;
  const shift=single.length-count.length-(rowspan?rowspan.contentFrom-rowspan.from:0);
  return {from:start+from,to:start+cell.sourceEnd,insert,offset:offset+shift};
}

export function mergeTableSourceCells(source,row,first,last){
  const location=columnTableSource(source);
  if(!location||first>=last)return null;
  const {table,start,parse}=location;
  const selected=table.rows[row]?.slice(first,last+1);
  if(!selected||selected.length!==last-first+1||selected.some(cell=>cell.attrs.colspan!==1||cell.attrs.rowspan!==1||cell.spanRange))return null;
  const from=selected[0].sourceStart,to=selected.at(-1).sourceEnd;
  if(table.source.slice(from,to).includes('%'))return null;
  const format={left:'l',center:'c',right:'r'}[selected[0].attrs.align]??'l';
  const body=selected.map(cell=>cell.text).filter(Boolean).join(' ');
  const insert='\\multicolumn{'+selected.length+'}{'+format+'}{'+body+'}';
  const draft=table.source.slice(0,from)+insert+table.source.slice(to);
  const next=parse(draft);
  const merged=next?.rows[row]?.[first];
  if(next?.rows.length!==table.rows.length||merged?.attrs.colspan!==selected.length||merged.text!==body)return null;
  return {from:start+from,to:start+to,insert,offset:start+from+insert.length-1};
}

export function mergeTableSourceRows(source,first,last,column){
  const location=columnTableSource(source);
  if(!location||first>=last)return null;
  const {table,start}=location;
  const structured=table.source.trimStart().startsWith('\\begin{tabularx}');
  if(last>=table.rows.length||table.rows.some(row=>row.some(cell=>cell.attrs.colspan!==1||cell.attrs.rowspan!==1))||
     table.metadata.rules.some(({boundary})=>boundary>first&&boundary<=last))return null;
  const cells=table.rows.slice(first,last+1).map(row=>row[column]);
  if(cells.some(cell=>!cell||cell.text.includes('%')))return null;
  const from=cells[0].sourceStart,to=cells.at(-1).sourceEnd;
  const body=cells.map(cell=>cell.text).filter(Boolean).join(' ');
  const wrapper=wrapCell(body,1,cells.length);
  let insert=table.source.slice(from,to);
  for(const [index,cell] of [...cells.entries()].reverse()){
    insert=insert.slice(0,cell.sourceStart-from)+(index?'':wrapper)+insert.slice(cell.sourceEnd-from);
  }
  const draft=table.source.slice(0,from)+insert+table.source.slice(to);
  const next=structured?parseTabularx(draft):parseTable(draft.trim());
  const merged=next?.rows[first];
  const actual=structured?merged?.[column]:merged&&{attrs:{rowspan:merged.rowspans[column]},text:merged.cells[column]};
  if(next?.rows.length!==table.rows.length||actual?.attrs.rowspan!==cells.length||actual.text!==body)return null;
  return {from:start+from,to:start+to,insert,offset:start+from+wrapper.length-1};
}

export function splitTableSourceRowspan(source,row,column,offset){
  const location=columnTableSource(source,{allowMultirow:true});
  if(!location)return null;
  const {table,start}=location;
  if(table.source.trimStart().startsWith('\\begin{tabularx}')){
    const cell=table.rows[row]?.[column],span=cell?.rowspanRange;
    if(!span||cell.attrs.rowspan<2||cell.attrs.colspan!==1)return null;
    const {from,to,value:insert,contentFrom}=span;
    const draft=table.source.slice(0,from)+insert+table.source.slice(to);
    const next=parseTabularx(draft);
    if(next?.rows.length!==table.rows.length||next.rows[row]?.[column]?.text!==cell.text||
       next.rows[row][column].attrs.rowspan!==1)return null;
    return {from:start+from,to:start+to,insert,offset:Math.max(start+from,offset+from-contentFrom)};
  }
  const imported=parseTable(table.source.trim());
  const layout=imported?.rows[row];
  const logical=layout?.columnIndexes[column];
  const cell=table.rows[row]?.[logical];
  if(!cell||layout.rowspans[column]<2||layout.spans[column]!==1||cell.spanRange||
     table.rows.some(row=>row.some(entry=>entry.attrs.colspan!==1))||!cell.text.startsWith('\\multirow{'))return null;
  const count=readGroup(cell.text,'\\multirow'.length);
  const width=count&&readGroup(cell.text,count.end);
  const body=width&&readGroup(cell.text,width.end);
  if(!body||body.end!==cell.text.length)return null;
  const draft=table.source.slice(0,cell.from)+body.value+table.source.slice(cell.to);
  const next=parseTable(draft.trim());
  const restored=next?.rows.slice(row+1,row+layout.rowspans[column]);
  if(next?.rows.length!==imported.rows.length||next.rows[row].rowspans[column]!==1||
     restored.length!==layout.rowspans[column]-1||
     !restored.every(covered=>covered.cells[covered.columnIndexes.indexOf(logical)]===''))return null;
  return {from:start+cell.from,to:start+cell.to,insert:body.value,offset:Math.max(start+cell.from,offset-width.end-1)};
}

export function importTabularx(source,inline) {
  return importSourceTable(source,inline,parseTabularx,'tabularx');
}
