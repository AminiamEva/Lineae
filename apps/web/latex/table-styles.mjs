import {readGroup} from './table-spans.mjs';

const wrappers=[
  {key:'tableScale',prefix:/^\\scalebox\{(\d+(?:\.\d+)?)\}\{/,number:true,scale:true},
  {key:'borderWidth',prefix:/^\{\s*\\setlength\s*\{\\arrayrulewidth\}\s*\{(\d+(?:\.\d+)?pt)\}\s*/},
  {key:'arrayStretch',prefix:/^\{\s*\\renewcommand\s*\{\\arraystretch\}\s*\{(\d+(?:\.\d+)?)\}\s*/,number:true},
  {key:'fontSize',prefix:/^\{\s*\\fontsize\{(\d+(?:\.\d+)?pt)\}\{\d+(?:\.\d+)?pt\}\\selectfont\s+/},
  {key:'fontSize',prefix:/^\{\s*\\(small|footnotesize|scriptsize)\s+/},
];

export function tableStyleParts(source){
  if(!source.includes('\\begin{tabular}'))return null;
  let from=source.length-source.trimStart().length,to=source.trimEnd().length;
  const attrs={},layers=new Map();
  for(;;){
    const inner=source.slice(from,to);
    const match=wrappers.map(rule=>({rule,match:rule.prefix.exec(inner)})).find(entry=>entry.match);
    if(!match)break;
    const {rule:{key,number,scale},match:[prefix,value]}=match;
    if(Object.hasOwn(attrs,key)||readGroup(inner,scale?prefix.length-1:0)?.end!==inner.length)return null;
    const start=from,end=to;
    attrs[key]=number?Number(value):value;
    from+=prefix.length;
    to--;
    from+=source.slice(from,to).length-source.slice(from,to).trimStart().length;
    to=from+source.slice(from,to).trimEnd().length;
    layers.set(key,{start,end,from,to});
  }
  const body=source.slice(from,to);
  return body.startsWith('\\begin{tabular}')&&body.endsWith('\\end{tabular}')?{from,to,body,attrs,layers}:null;
}
export function writeTableStyle(source,key,value,eol){
  const parts=tableStyleParts(source);
  if(!parts)return null;
  const layer=parts.layers.get(key);
  const style={[key]:value};
  return layer?source.slice(0,layer.start)+serializeTableStyle(source.slice(layer.from,layer.to),style,eol)+source.slice(layer.end):
    serializeTableStyle(source,style,eol);
}

export function serializeTableStyle(tabular,attrs,eol='\n'){
  if(attrs.arrayStretch&&Number(attrs.arrayStretch)!==1)
    tabular='{\\renewcommand{\\arraystretch}{'+attrs.arrayStretch+'}'+eol+tabular+eol+'}';
  if(/^(small|footnotesize|scriptsize)$/.test(attrs.fontSize??''))
    tabular='{\\'+attrs.fontSize+' '+tabular+'}';
  else if(/^\d+(?:\.\d+)?pt$/.test(attrs.fontSize??'')){
    const baseline=(Number.parseFloat(attrs.fontSize)*1.2).toFixed(1);
    tabular='{\\fontsize{'+attrs.fontSize+'}{'+baseline+'pt}\\selectfont '+tabular+'}';
  }
  if(attrs.tableScale&&Number(attrs.tableScale)!==1)tabular='\\scalebox{'+attrs.tableScale+'}{'+tabular+'}';
  if(/^\d+(?:\.\d+)?pt$/.test(attrs.borderWidth??''))
    tabular='{\\setlength{\\arrayrulewidth}{'+attrs.borderWidth+'}'+eol+tabular+eol+'}';
  return tabular;
}
