import {sourceStructure} from './source-structure.mjs';
import {mathSpan} from './math-delimiters.mjs';
import {parseTableFloat} from './table-floats.mjs';

function group(source,start,open='{',close='}') {
  if(source[start]!==open)return null;
  let depth=1;
  for(let i=start+1;i<source.length;i++) {
    if(source[i]==='\\'){i++;continue;}
    if(source[i]==='%'){while(i<source.length&&!/[\r\n]/.test(source[i]))i++;continue;}
    if(open==='[' && source[i]==='{'){const g=group(source,i);if(!g)return null;i=g.end-1;continue;}
    if(source[i]===open)depth++;
    if(source[i]===close && !--depth)return {value:source.slice(start+1,i),end:i+1};
  }
  return null;
}
function trivia(source,index=0) {
  const re=/(?:\s+|%[^\r\n]*(?:\r?\n|$))*/y;
  re.lastIndex=index;re.exec(source);return re.lastIndex;
}
function clean(source) {
  return source.replace(/\\[\s\S]|%[^\r\n]*/g,value=>value[0]==='%'?'':value).trim();
}
function environmentEnd(source,start,name) {
  let depth=0;
  for(const token of sourceStructure(source.slice(start))) {
    if(token.kind==='begin' && token.value==='\\begin{'+name+'}')depth++;
    if(token.kind==='end' && token.value==='\\end{'+name+'}' && !--depth)return {start:start+token.index,end:start+token.end};
  }
  return null;
}
// Only delimiters outside groups, comments, math and environments are structural.
function delimiters(source,wanted,brackets=false) {
  const found=[];
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(c==='%'){while(i<source.length&&!/[\r\n]/.test(source[i]))i++;continue;}
    if(c==='{' || (brackets&&c==='[')) {
      const g=group(source,i,c,c==='{'?'}':']');if(!g)return null;i=g.end-1;continue;
    }
    if(c==='}')return null;
    if(c==='$' || (c==='\\'&&['(','['].includes(source[i+1]))) {
      const opener=c==='$'?(source[i+1]==='$'?'$$':'$'):source.slice(i,i+2);
      const math=mathSpan(source,i,opener);if(!math)return null;i=math.end-1;continue;
    }
    if(c==='\\') {
      const env=/^\\begin\{([^{}]+)\}/.exec(source.slice(i));
      if(env){const end=environmentEnd(source,i,env[1]);if(!end)return null;i=end.end-1;continue;}
      if(source[i+1]==='\\'&&wanted.includes('\\\\'))found.push({index:i,end:i+2,value:'\\\\'});
      const command=/^\\(?:[A-Za-z]+|[\s\S])/.exec(source.slice(i));
      i+=(command?.[0].length??1)-1;continue;
    }
    if(wanted.includes(c))found.push({index:i,end:i+1,value:c});
  }
  return found;
}
function split(source,delimiter=',') {
  const tokens=delimiters(source,[delimiter],true);if(!tokens)return null;
  let start=0;return [...tokens,{index:source.length,end:source.length}].map(t=>{const part=clean(source.slice(start,t.index));start=t.end;return part;});
}
function unwrap(source) {
  const g=group(source,0);return g?.end===source.length?g.value:source;
}
function assignment(source) {
  const token=delimiters(source,['='],true)?.[0];
  return token?[clean(source.slice(0,token.index)),clean(source.slice(token.end))]:[source,null];
}
const alignments={l:'left',c:'center',r:'right'};
function styles(value,unsupported) {
  const result={};
  for(const entry of split(unwrap(value))??[]) {
    const [key,raw]=assignment(entry),v=raw===null?key:unwrap(raw);
    if((raw===null||key==='halign')&&alignments[v])result.align=alignments[v];
    else if((raw===null||key==='valign')&&['t','m','b'].includes(v))result.verticalAlign={t:'top',m:'middle',b:'bottom'}[v];
    else if(key==='font' && /^(?:\s*\\(?:bfseries|itshape|normalfont))+$/.test(v)) {
      if(v.includes('\\normalfont')){result.fontWeight='400';result.fontStyle='normal';}
      if(v.includes('\\bfseries'))result.fontWeight='700';
      if(v.includes('\\itshape'))result.fontStyle='italic';
    } else if(entry)unsupported.push(entry);
  }
  return result;
}
function columns(source,unsupported,ranges=[]) {
  const result=[];
  for(let i=0;i<source.length;) {
    if(/\s/.test(source[i])){i++;continue;}
    const start=i,type=source[i++];if(!'Xlcr'.includes(type))return null;
    let style={align:alignments[type]??'left'};
    if(type==='X' && source[i]==='[') {
      const arg=group(source,i,'[',']');if(!arg)return null;
      style={...style,...styles(arg.value,unsupported)};i=arg.end;
    }
    result.push(style);ranges.push({from:start,to:i});if(result.length>4096)return null;
  }
  return result.length?result:null;
}
function selection(value,count) {
  const result=new Set();
  const number=text=>text==='Z'?count:/^\d+$/.test(text)?Number(text):NaN;
  for(const item of value.split(',').map(s=>s.trim())) {
    if(item==='-'){for(let i=1;i<=count;i++)result.add(i);continue;}
    const ends=item.split('-'),from=number(ends[0]),to=number(ends.at(-1));
    if(ends.length>2||!(from>=1&&to>=from&&to<=count))return null;
    for(let i=from;i<=to;i++)result.add(i);
  }
  return result;
}
function lineStyle(value) {
  let width='0.4pt',color='currentColor',style='solid';
  for(const item of split(value)??[]) {
    const [key,raw]=assignment(item),v=raw??key;
    if(/^(?:\d+(?:\.\d+)?|\.\d+)(?:pt|px|em)$/.test(v))width=v;
    else if(['solid','dashed','dotted'].includes(v))style=v;
    else if(v==='none')return '0px solid currentColor';
    else if(/^(?:black|white|red|blue|green|gray|currentColor|#[\da-f]{6})$/i.test(v))color=v;
    else if(item)return null;
  }
  return width+' '+style+' '+color;
}
function applyRule(option,horizontal,matrix,unsupported) {
  const [key,raw]=option;
  const count=matrix.length,segments=matrix[0].length;
  const indices=key=== (horizontal?'hlines':'vlines')?selection('-',count):selection(key.slice(key.indexOf('{')+1,-1),count);
  let at=0,args=[];const value=raw??'';
  while(at<value.length){const g=group(value,trivia(value,at));if(!g){args=null;break;}args.push(g.value);at=trivia(value,g.end);}
  if(!args || args.length>2 || !indices){unsupported.push(key+(raw===null?'':'='+raw));return;}
  const slots=args.length===2?selection(args[0],segments):selection('-',segments);
  const css=lineStyle(args.at(-1)??'');
  if(!slots||!css){unsupported.push(key+(raw===null?'':'='+raw));return;}
  for(const i of indices)for(const j of slots)matrix[i-1][j-1]=css;
}

export function parseTblr(source) {
  const start=/^\s*\\begin\{tblr\}/.exec(source);if(!start)return null;
  if([...sourceStructure(source)].some(t=>t.kind==='invalid'))return null;
  const closing=environmentEnd(source,start[0].indexOf('\\begin'),'tblr');
  if(!closing||source.slice(closing.end).trim())return null;
  let at=trivia(source,start[0].length);
  const unsupported=[];
  if(source[at]==='['){const outer=group(source,at,'[',']');if(!outer)return null;unsupported.push('['+outer.value+']');at=trivia(source,outer.end);}
  const settings=group(source,at);if(!settings||settings.end>closing.start)return null;
  const entries=split(settings.value);if(!entries)return null;
  const options=entries.filter(Boolean).map(assignment);
  const colspec=options.find(([key])=>key==='colspec');
  const specs=columns(colspec?unwrap(colspec[1]??''):clean(settings.value),unsupported);if(!specs)return null;
  const body=source.slice(settings.end,closing.start),tokens=delimiters(body,['&','\\\\']);if(!tokens)return null;
  const rows=[],rowEnds=[];let cells=[],from=0;
  for(const token of [...tokens,{index:body.length,end:body.length,value:'end'}]) {
    if(token.index<from)continue;
    cells.push({from:settings.end+from,to:settings.end+token.index,raw:body.slice(from,token.index)});
    from=token.end;
    if(token.value==='&')continue;
    const terminated=token.value==='\\\\';
    if(token.value==='\\\\') {
      let next=trivia(body,from);if(body[next]==='*'){from=++next;next=trivia(body,next);}
      if(body[next]==='['){const spacing=group(body,next,'[',']');if(!spacing)return null;from=spacing.end;}
    }
    if(terminated||cells.length>1||clean(cells[0].raw)){
      rows.push(cells);
      rowEnds.push({start:cells[0].from+trivia(cells[0].raw),
        from:settings.end+(terminated?from:body.trimEnd().length),terminated});
    }
    cells=[];
  }
  if(!rows.length||rows.some(row=>row.length!==specs.length))return null;
  const h=Array.from({length:rows.length+1},()=>Array(specs.length).fill(null));
  const v=Array.from({length:specs.length+1},()=>Array(rows.length).fill(null));
  const cellStyles=rows.map(()=>specs.map(s=>({...s})));
  for(const [key,value] of options) {
    if(key==='colspec'||(!colspec&&options.length===1))continue;
    if(key==='width'){unsupported.push(key+'='+value);continue;}
    if(key==='hlines'||/^hline\{[^{}]+\}$/.test(key)){applyRule([key,value],true,h,unsupported);continue;}
    if(key==='vlines'||/^vline\{[^{}]+\}$/.test(key)){applyRule([key,value],false,v,unsupported);continue;}
    if(key==='rows'||key==='cells'||/^row\{[^{}]+\}$/.test(key)) {
      const selected=key==='rows'||key==='cells'?selection('-',rows.length):selection(key.slice(4,-1),rows.length);
      if(!selected||value===null){unsupported.push(key+(value===null?'':'='+value));continue;}
      const style=styles(value,unsupported);for(const r of selected)for(const s of cellStyles[r-1])Object.assign(s,style);
    } else unsupported.push(key+(value===null?'':'='+value));
  }
  const parsed=[],coveredUntil=Array(specs.length).fill(0);
  for(let r=0;r<rows.length;r++) {
    const row=[];
    for(let c=0;c<specs.length;) {
      if(coveredUntil[c]>r){c++;continue;}
      const cell=rows[r][c];let offset=trivia(cell.raw),span=1,rowspan=1,style={...cellStyles[r][c]},spanRange;
      if(/^\\SetCell(?![A-Za-z])/.test(cell.raw.slice(offset))) {
        offset=trivia(cell.raw,offset+8);
        if(cell.raw[offset]==='[') {
          const opt=group(cell.raw,offset,'[',']');if(!opt)return null;
          const fields=split(opt.value)?.map(field=>/^\s*([cr])\s*=\s*(\d+)\s*$/.exec(field));
          if(!fields?.length||fields.some(field=>!field)||new Set(fields.map(field=>field[1])).size!==fields.length)return null;
          for(const [,key,value] of fields){
            if(key==='c')span=Number(value);
            else rowspan=Number(value);
          }
          spanRange={from:cell.from+offset+1,to:cell.from+opt.end-1};
          offset=trivia(cell.raw,opt.end);
        }
        const format=group(cell.raw,offset);if(!format)return null;
        Object.assign(style,styles(format.value,unsupported));offset=trivia(cell.raw,format.end);
      }
      if(span<1||c+span>specs.length||rowspan<1||r+rowspan>rows.length||
         coveredUntil.slice(c,c+span).some(end=>end>r))return null;
      coveredUntil.fill(r+rowspan,c,c+span);
      const text=cell.raw.slice(offset).trimEnd();
      const {align,...css}=style;
      // Rules inside a spanning cell are omitted by tabularray as well.
      for(const [side,values] of [['Top',h[r].slice(c,c+span)],['Bottom',h[r+rowspan].slice(c,c+span)],
        ['Left',v[c].slice(r,r+rowspan)],['Right',v[c+span].slice(r,r+rowspan)]]) {
        css['border'+side]=values.every(x=>x===values[0])?(values[0]??'0px solid currentColor'):'0px solid currentColor';
      }
      row.push({text,from:cell.from+offset,to:cell.from+offset+text.length,spanRange,
        attrs:{colspan:span,rowspan,align,tblrStyle:css}});
      c+=span;
    }
    parsed.push(row);
  }
  const indexed=axisOptions(settings,colspec,rows.length,specs.length);
  return {source,columns:specs.map(s=>({left:'l',center:'c',right:'r'}[s.align]??'l')).join(''),rows:parsed,unsupported,
    ...(indexed&&source[trivia(source,start[0].length)]!=='['?{rowEnds,rawRows:rows,indexed,
      columnRanges:columnSettingRanges(settings,colspec)}:{})};
}

function axisOptions(settings,colspec,height,width){
  if(!colspec)return [];
  const end=settings.value.length,base=settings.end-end-1;
  const indexed=[];
  let from=0;
  for(const cut of [...delimiters(settings.value,[','],true),{index:end,end}]){
    const raw=settings.value.slice(from,cut.index);
    const [key,value]=assignment(clean(raw));
    const start=from+trivia(raw);
    from=cut.end;
    if(!key||['colspec','width','rows','cells'].includes(key))continue;
    if(['hlines','vlines'].includes(key)&&(value===null||group(value,0)?.end===value.length))continue;
    const match=/^(row|hline|vline)(\{\s*)([1-9]\d*)\s*\}/.exec(settings.value.slice(start,cut.index));
    if(!match||key!==match[0])return null;
    const [,kind,gap,digits]=match;
    const index=Number(digits),limit={row:height,hline:height+1,vline:width+1}[kind];
    if(index>limit||kind!=='row'&&value!==null&&group(value,0)?.end!==value.length)return null;
    const at=base+start+kind.length+gap.length;
    indexed.push({kind,index,from:at,to:at+digits.length});
  }
  return indexed;
}

function adjustAxes(table,axis,position,remove){
  const relevant=axis==='row'?['row','hline']:['vline'];
  const edits=[];
  for(const {kind,index,from,to} of table.indexed){
    if(!relevant.includes(kind))continue;
    if(remove&&(index===position||kind!=='row'&&index===position+1))return null;
    if(index>position)edits.push({from,to,insert:String(index+(remove?-1:1))});
  }
  return edits;
}

function applyTblrEdits({table,base},edits,offset){
  edits.sort((left,right)=>left.from-right.from);
  const from=edits[0].from,to=edits.at(-1).to,source=table.source;
  const insert=edits.toReversed().reduce((value,edit)=>value.slice(0,edit.from-from)+
    edit.insert+value.slice(edit.to-from),source.slice(from,to));
  const draft=source.slice(0,from)+insert+source.slice(to);
  const nextOffset=edits.filter(edit=>base+edit.from<offset)
    .reduce((point,edit)=>point+edit.insert.length-(edit.to-edit.from),offset);
  return {patch:{from:base+from,to:base+to,insert,offset:nextOffset},draft};
}

function columnSettingRanges(settings,colspec){
  const base=settings.end-settings.value.length-1;
  let from=0,to=settings.value.length;
  if(colspec){
    const cuts=delimiters(settings.value,[','],true);
    let start=0,found=false;
    for(const cut of [...cuts,{index:to,end:to}]){
      const section=settings.value.slice(start,cut.index);
      if(assignment(clean(section))[0]==='colspec'){
        if(found)return [];
        const equals=delimiters(section,['='],true)?.[0];
        if(!equals)return [];
        from=start+trivia(section,equals.end);
        const value=group(settings.value,from);
        if(value){from++;to=value.end-1;}
        else to=cut.index;
        found=true;
      }
      start=cut.end;
    }
    if(!found)return [];
  }
  const ranges=[];
  if(!columns(settings.value.slice(from,to),[],ranges))return [];
  return ranges.map(range=>({from:base+from+range.from,to:base+from+range.to}));
}

function editableTblr(source) {
  let table=parseTblr(source),base=0;
  if(!table){
    const float=parseTableFloat(source);
    const [opening,...rest]=float?[...sourceStructure(float.body)].filter(token=>token.topLevel&&token.kind==='begin'):[];
    if(opening?.value!=='\\begin{tblr}'||rest.length)return null;
    const closing=environmentEnd(float.body,opening.index,'tblr');
    if(!closing)return null;
    table=parseTblr(float.body.slice(opening.index,closing.end));
    base=float.open.length+opening.index;
  }
  return table?.rowEnds?{table,base}:null;
}

export function editTblrRow(source,index,remove=false,offset) {
  const located=editableTblr(source);
  if(!located)return null;
  const {table}=located;
  const edge=table?.rowEnds?.[index];
  if(!edge||remove&&table.rows.length===1||table.rows.some(row=>row.some(cell=>cell.attrs.rowspan>1)))return null;
  const selectors=adjustAxes(table,'row',index+1,remove);
  if(!selectors)return null;
  const raw=table.source,eol=raw.includes('\r\n')?'\r\n':'\n';
  let {from}=edge,to=from;
  let insert=(edge.terminated?'':' \\\\')+eol+' & '.repeat(table.columns.length-1)+'\\\\';
  if(remove){
    const lineStart=raw.lastIndexOf('\n',edge.start-1)+1;
    const newline=/^[ \t]*\r?\n/.exec(raw.slice(edge.from));
    const wholeLine=newline&&!raw.slice(lineStart,edge.start).trim();
    from=wholeLine?lineStart:edge.start;
    to=edge.from+(wholeLine?newline[0].length:0);
    insert='';
  }
  const {patch,draft}=applyTblrEdits(located,[...selectors,{from,to,insert}],offset);
  const updated=parseTblr(draft);
  if(updated?.rows.length!==table.rows.length+(remove?-1:1)||
    !remove&&updated.rows[index+1].some(cell=>cell.text))return null;
  return patch;
}

export function editTblrColumn(source,row,column,offset,remove=false) {
  const located=editableTblr(source);
  if(!located)return null;
  const {table}=located;
  const count=table.columnRanges.length;
  if(!table.rows[row]?.[column]||!table.columnRanges[column]||remove&&count<2||
    table.rows.some(cells=>cells.length!==count))return null;
  const {from,to}=table.columnRanges[column];
  const selectors=adjustAxes(table,'column',column+1,remove);
  if(!selectors)return null;
  const edits=[...selectors,remove?{from,to,insert:''}:{from:to,to,insert:'l'}];
  for(const cells of table.rawRows){
    const cell=cells[column],end=cell.from+cell.raw.trimEnd().length;
    if(!remove){edits.push({from:end,to:end,insert:' & '});continue;}
    const a=column?cell.from-1:cell.from+trivia(cell.raw);
    const b=column?end:cell.to+1;
    if(table.source[column?a:b-1]!=='&'||a>b||table.source.slice(a,b).includes('%'))return null;
    edits.push({from:a,to:b,insert:''});
  }
  const {patch,draft}=applyTblrEdits(located,edits,offset);
  const next=parseTblr(draft);
  if(next?.rows.length!==table.rows.length||next.columns.length!==count+(remove?-1:1))return null;
  return patch;
}

export function splitTblrCell(source,row,column,offset){
  const located=editableTblr(source);
  if(!located)return null;
  const {table}=located,cell=table.rows[row]?.[column];
  if(!cell?.spanRange||cell.attrs.colspan===1&&cell.attrs.rowspan===1)return null;
  const {from,to}=cell.spanRange;
  const insert=table.source.slice(from,to).replace(/\d+/g,'1');
  const {patch,draft}=applyTblrEdits(located,[{from,to,insert}],offset);
  const next=parseTblr(draft);
  if(next?.rows[row]?.length!==table.rows[row].length+cell.attrs.colspan-1||
     next.rows[row][column].text!==cell.text||next.rows[row][column].attrs.rowspan!==1)return null;
  return patch;
}

export function mergeTblrCells(source,row,first,last){
  const located=editableTblr(source);
  if(!located||first>=last)return null;
  const {table,base}=located;
  const cells=table.rows[row];
  const selected=cells?.slice(first,last+1);
  if(!selected||selected.length!==last-first+1||selected.some(cell=>cell.attrs.colspan!==1)||
     table.rows.some(row=>row.some(cell=>cell.attrs.rowspan>1)))return null;
  const column=cells.slice(0,first).reduce((sum,cell)=>sum+cell.attrs.colspan,0);
  const raw=table.rawRows[row].slice(column,column+selected.length);
  const from=selected[0].from,to=selected.at(-1).to;
  if(raw.some((cell,index)=>cell.raw.trim()!==selected[index].text)||table.source.slice(from,to).includes('%'))return null;
  const format={left:'l',center:'c',right:'r'}[selected[0].attrs.align]??'l';
  const body=selected.map(cell=>cell.text).filter(Boolean).join(' ');
  const merged='\\SetCell[c='+selected.length+']{'+format+'} '+body;
  const insert=merged+' & '.repeat(selected.length-1);
  const {patch,draft}=applyTblrEdits(located,[{from,to,insert}]);
  const cell=parseTblr(draft)?.rows[row]?.[first];
  if(cell?.attrs.colspan!==selected.length||cell.text!==body)return null;
  return {...patch,offset:base+from+merged.length};
}

export function mergeTblrRows(source,first,last,column){
  const located=editableTblr(source);
  if(!located||first>=last)return null;
  const {table,base}=located;
  if(last>=table.rows.length||table.rows.some(row=>row.length!==table.columns.length))return null;
  const cells=table.rows.slice(first,last+1).map(row=>row[column]);
  if(cells.some((cell,index)=>!cell||cell.attrs.rowspan!==1||cell.text.includes('%')||
    table.rawRows[first+index][column].raw.trim()!==cell.text))return null;
  const format={left:'l',center:'c',right:'r'}[cells[0].attrs.align]??'l';
  const text=cells.map(cell=>cell.text).filter(Boolean).join(' ');
  const merged='\\SetCell[r='+cells.length+']{'+format+'} '+text;
  const edits=cells.map(({from,to},index)=>({from,to,insert:index?'':merged}));
  const {patch,draft}=applyTblrEdits(located,edits);
  const cell=parseTblr(draft)?.rows[first]?.[column];
  if(cell?.attrs.rowspan!==cells.length||cell.text!==text)return null;
  return {...patch,offset:base+cells[0].from+merged.length};
}

const tableKeys=['columns','booktabs','borderMode','borderWidth','caption','label','placement','centered','align'];
function tableShape(attrs){return JSON.stringify(tableKeys.map(k=>attrs[k]??null));}
function cellShape(cell){return JSON.stringify([cell.type,cell.attrs?.colspan??1,cell.attrs?.rowspan??1,cell.attrs?.align??null,cell.attrs?.colwidth??null,cell.attrs?.tblrStyle??null]);}

function cellInline(source,inline,depth=0) {
  if(depth>40)return null;
  const direct=inline(source);if(direct)return direct;
  const nodes=[];let cursor=0;
  for(const token of sourceStructure(source)) {
    if(!token.topLevel||token.index<cursor)continue;
    if(!['inlineMath','displayMath'].includes(token.kind)&&token.value!=='{')continue;
    const before=inline(source.slice(cursor,token.index));if(!before)continue;
    if(token.value==='{') {
      const arg=group(source,token.index),inside=arg&&cellInline(arg.value,inline,depth+1);
      if(!inside)return null;nodes.push(...before,...inside);cursor=arg.end;
    } else {
      nodes.push(...before,{type:'math',attrs:{latex:token.latex,display:token.kind==='displayMath',delimiter:token.delimiter}});cursor=token.end;
    }
  }
  const tail=inline(source.slice(cursor));return tail?[...nodes,...tail]:null;
}

export function importTblr(source,inline) {
  return importSourceTable(source,inline,parseTblr,'tblr');
}

// Both adapters use the same source projection and existing Table nodes.
export function importSourceTable(source,inline,parse,name) {
  let parsed=parse(source),offset=0,float;
  if(!parsed) {
    float=parseTableFloat(source);if(!float)return null;
    const starts=[...sourceStructure(float.body)].filter(t=>t.kind==='begin'&&t.topLevel);
    // Keep nested/multiple floats and unknown containers protected as Raw.
    if(starts.length!==1||starts[0].value!=='\\begin{'+name+'}')return null;
    const end=environmentEnd(float.body,starts[0].index,name);if(!end)return null;
    parsed=parse(float.body.slice(starts[0].index,end.end));if(!parsed)return null;
    offset=float.open.length+starts[0].index;
  }
  const attrs={columns:parsed.columns,booktabs:parsed.booktabs??false,borderMode:null,borderWidth:null,
    caption:float?.caption??null,label:float?.label??null,placement:float?.placement??null,centered:float?.centered??false,align:null};
  const saved=[],content=[];
  for(const row of parsed.rows) {
    const cells=[];
    for(const cell of row) {
      const value=cellInline(cell.text,inline);if(!value)return null;
      const node={type:'tableCell',attrs:cell.attrs,content:[{type:'paragraph',content:value}]};
      cells.push(node);
      saved.push({from:offset+cell.from,to:offset+cell.to,content:structuredClone(node.content),shape:cellShape(node),
        protected:/%|\\(?:hspace|vspace|newpage|clearpage|pagebreak|smallskip|medskip|bigskip)\b/.test(cell.text)});
    }
    content.push({type:'tableRow',content:cells});
  }
  return {type:'table',attrs:{...attrs,[name]:{...parsed.metadata,source,unsupported:parsed.unsupported,cells:saved,rows:content.map(r=>r.content.length),shape:tableShape(attrs)}},content};
}

// Editing supported cell contents patches original slices. Settings, wrappers,
// covered slots, comments and untouched line endings never get regenerated.
export function serializeTblr(node,serialize) {
  return serializeSourceTable(node,serialize,'tblr');
}

export function serializeSourceTable(node,serialize,name) {
  const saved=node.attrs?.[name];if(!saved)return null;
  if(tableShape(node.attrs)!==saved.shape||JSON.stringify(node.content.map(r=>r.content.length))!==JSON.stringify(saved.rows))return null;
  const cells=node.content.flatMap(r=>r.content),edits=[];
  for(let i=0;i<cells.length;i++) {
    const cell=cells[i],original=saved.cells[i];
    if(!original||cellShape(cell)!==original.shape)return null;
    const value=cell.content.map(serialize).join('').trim(),before=original.content.map(serialize).join('').trim();
    if(value===before)continue;
    if(original.protected || !Number.isInteger(original.from) || !Number.isInteger(original.to) ||
        original.from<0 || original.to<original.from || original.to>saved.source.length ||
        (edits.length && original.from<edits.at(-1).to))return null;
    const raw=saved.source.slice(original.from,original.to);
    if(raw!==before) {
      // An exact end-of-text insertion can retain known invisible TeX.
      // Other non-canonical spellings have no verified mapping.
      const tail=/^([^\\{}%\r\n]*)\\(?:mbox|hbox|textup|textmd|textnormal)\{([^\\{}%\r\n]+)\}$/.exec(raw);
      const breakTail=/^([^\\{}%\r\n]*)\\nolinebreak[ \t]*([^\\{}%\r\n]+)$/.exec(raw);
      const parts=tail??breakTail, append=value.slice(before.length);
      if(!parts || before!==parts[1]+parts[2] || !value.startsWith(before) ||
          !append || /[\\{}%&$#_^~\r\n]/.test(append))return null;
      const at=original.to-(tail?1:0);
      edits.push({from:at,to:at,value:append});
      continue;
    }
    const tokens=delimiters(value,['&','\\\\']);if(!tokens)return null;
    edits.push({from:original.from,to:original.to,value:tokens.length?'{'+value+'}':value});
  }
  return edits.reverse().reduce((text,e)=>text.slice(0,e.from)+e.value+text.slice(e.to),saved.source);
}

export {group,trivia,clean,environmentEnd,delimiters};
