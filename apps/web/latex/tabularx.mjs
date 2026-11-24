import {sourceStructure} from './source-structure.mjs';
import {group,trivia,clean,environmentEnd,delimiters,importSourceTable} from './tblr.mjs';

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
  const specs=[],gaps=[],vertical=[];let prefix='',style={};
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
    if(specs.length>4096)return null;
    prefix='';style={};
  }
  return specs.length&&!prefix?{specs,gaps,vertical}:null;
}

function parseAlignedTable(source,name) {
  const opening=/^\s*\\begin\{(longtable|tabularx)\}/.exec(source);
  if(opening?.[1]!==name)return null;
  if([...sourceStructure(source)].some(t=>t.kind==='invalid'))return null;
  const close=environmentEnd(source,opening[0].indexOf('\\begin'),name);
  if(!close||source.slice(close.end).trim())return null;
  const width=name==='longtable' ? {value:'\\textwidth',end:opening[0].length} : group(source,trivia(source,opening[0].length));if(!width)return null;
  let at=trivia(source,width.end),position=null;
  if(source[at]==='['){const pos=group(source,at,'[',']');if(!pos)return null;position=pos.value;at=trivia(source,pos.end);}
  const preamble=group(source,at);if(!preamble||preamble.end>close.start)return null;
  if(name==='longtable' && (!/^(?:[lcr|\s]|p\{\d+(?:\.\d+)?(?:mm|cm|pt|in)\})+$/.test(preamble.value) || /\\(?:caption|kill|noalign)\b/.test(source.slice(preamble.end,close.start))))return null;
  const unsupported=[],columns=parseColumns(preamble.value,width.value,unsupported);if(!columns)return null;
  const {specs,gaps,vertical}=columns;
  const body=source.slice(preamble.end,close.start),tokens=delimiters(body,['&','\\\\']);if(!tokens)return null;
  let from=0,cells=[],sectionStart=0;
  const rawRows=[],rules=[],sections={};
  for(const token of [...tokens,{index:body.length,end:body.length,value:'end'}]) {
    if(token.index<from)continue;
    let begin=from;
    if(!cells.length) {
      begin=trivia(body,begin);
      if(name==='longtable'){
        for(;;){
          const marker=/^\\end(firsthead|head|foot|lastfoot)(?![a-zA-Z])/.exec(body.slice(begin));
          if(!marker)break;
          const kind=marker[1];
          if(Object.hasOwn(sections,kind))return null;
          sections[kind]=[sectionStart,rawRows.length];
          sectionStart=rawRows.length;
          begin=trivia(body,begin+marker[0].length);
        }
      }
      for(;;) {
        const rule=/^\\(toprule|midrule|bottomrule)(?![A-Za-z])/.exec(body.slice(begin));if(!rule)break;
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
    if(cells.length>1||clean(cells[0].raw))rawRows.push(cells);
    cells=[];
    if(token.value==='\\\\') {
      let next=trivia(body,from);
      if(body[next]==='*'){from=++next;next=trivia(body,next);}
      if(body[next]==='['){const spacing=group(body,next,'[',']');if(!spacing)return null;from=spacing.end;}
    }
  }
  if(rawRows.length<=sectionStart)return null;
  const rows=[];
  for(let r=0;r<rawRows.length;r++) {
    let column=0;const row=[];
    for(const raw of rawRows[r]) {
      if(column>=specs.length)return null;
      let begin=trivia(raw.raw),end=Math.max(begin,raw.raw.trimEnd().length),span=1,spec=specs[column],override=null;
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
      }
      if(span<1||column+span>specs.length)return null;
      const top=rules.findLast(rule=>rule.boundary===r),bottom=rules.findLast(rule=>rule.boundary===r+1);
      const css={verticalAlign:'top',...spec.style,
        borderTop:top?.css??'0px solid currentColor',borderBottom:bottom?.css??'0px solid currentColor',
        borderLeft:(override?override.vertical.includes(0):vertical.includes(column))?'0.4pt solid currentColor':'0px solid currentColor',
        borderRight:(override?override.vertical.includes(1):vertical.includes(column+span))?'0.4pt solid currentColor':'0px solid currentColor'};
      if(spec.widthCSS)css.width=spec.widthCSS;
      if((override?.gaps??gaps).some(g=>g.column===(override?0:column)&&!clean(g.source)))css.paddingLeft='0px';
      if((override?.gaps??gaps).some(g=>g.column===(override?1:column+span)&&!clean(g.source)))css.paddingRight='0px';
      row.push({text:raw.raw.slice(begin,end),from:raw.from+begin,to:raw.from+end,
        attrs:{colspan:span,rowspan:1,align:spec.align,tblrStyle:css}});
      column+=span;
    }
    if(column!==specs.length)return null;rows.push(row);
  }
  return {source,columns:specs.map(s=>alignments[s.type]?s.type:s.type==='p'?'p{'+s.width+'}':'l').join(''),
    booktabs:rules.length>0,rows,unsupported,
    metadata:{...(Object.keys(sections).length?{sections}:{}),width:width.value,widthCSS:widthCSS(width.value),position,preamble:preamble.value,specs,gaps,rules}};
}

export function parseTabularx(source) { return parseAlignedTable(source,'tabularx'); }

export function importLongtable(source,inline) {
  return importSourceTable(source,inline,text=>parseAlignedTable(text,'longtable'),'longtable');
}

export function importTabularx(source,inline) {
  return importSourceTable(source,inline,parseTabularx,'tabularx');
}
