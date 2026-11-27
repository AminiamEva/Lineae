// Read only declarative counter formats. Unknown macros stay outside this model.
import { chineseNumber } from './chinese-numbering.mjs';
export function texDeclarations(source='') {
  return source.replace(/\\[%{}]|%[^\r\n]*/g, token=>token[0]==='%'?'':token);
}
function group(text,start){
  if(text[start]!=='{')return null;
  let depth=1;
  for(let i=start+1;i<text.length;i++){
    if(text[i]==='\\'){i++;continue;}
    if(text[i]==='{')depth++;else if(text[i]==='}'&&!--depth)return {value:text.slice(start+1,i),end:i+1};
  }
  return null;
}
function splitTopLevel(text){
  const parts=[];let depth=0,start=0;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='\\'){i++;continue;}
    if(c==='{')depth++;else if(c==='}')depth=Math.max(0,depth-1);
    else if(c===','&&depth===0){parts.push(text.slice(start,i));start=i+1;}
  }
  parts.push(text.slice(start));
  return parts.map(part=>part.trim()).filter(Boolean);
}
function stripBraces(value){
  const text=String(value??'').trim();
  return text.startsWith('{')&&text.endsWith('}')?text.slice(1,-1).trim():text;
}
export function counterProfile(preamble=''){
  const source=texDeclarations(preamble);
  const match=/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/.exec(source);
  const className=(match?.[2]??'article').trim(),chapters=/^(?:book|report|ctexbook|ctexrep)$/.test(className);
  const options=(match?.[1]??'').split(',').map(v=>v.trim());
  const formats={part:'\\Roman{part}'},names={chapter:'Chapter',appendix:'Appendix',part:'Part'},resets={equation:chapters?'chapter':null,figure:chapters?'chapter':null,table:chapters?'chapter':null};
  for(const command of source.matchAll(/\\(?:re)?newcommand\*?\s*(?:\{\\([A-Za-z]+)\}|\\([A-Za-z]+))\s*/g)){
    const name=command[1]??command[2],value=group(source,command.index+command[0].length)?.value;
    if(value===undefined)continue;
    if(name.startsWith('the'))formats[name.slice(3)]=value;
    if(name==='appendixname')names.appendix=value;
    if(name==='chaptername')names.chapter=value;
    if(name==='partname')names.part=value;
  }
  for(const command of source.matchAll(/\\ctexset\s*/g)){
    const body=group(source,command.index+command[0].length);
    if(!body)continue;
    for(const entry of splitTopLevel(body.value)){
      const equal=entry.indexOf('=');
      if(equal<0)continue;
      const key=entry.slice(0,equal).trim(),value=entry.slice(equal+1).trim();
      const numberLevel=/^(part|chapter|section|subsection|subsubsection)\/number$/.exec(key);
      if(numberLevel)formats[numberLevel[1]]=stripBraces(value);
    }
  }
  for(const command of source.matchAll(/\\(?:numberwithin|counterwithin)\s*\{(equation|figure|table)\}\s*\{(chapter|section|subsection)\}/g)){
    resets[command[1]]=command[2];formats[command[1]]='\\the'+command[2]+'.\\arabic{'+command[1]+'}';
  }
  for(const command of source.matchAll(/\\counterwithout\s*\{(equation|figure|table)\}\s*\{(?:chapter|section|subsection)\}/g)){
    resets[command[1]]=null;formats[command[1]]='\\arabic{'+command[1]+'}';
  }
  const depth=[...source.matchAll(/\\setcounter\s*\{secnumdepth\}\s*\{(-?\d+)\}/g)].at(-1);
  const tocDepth=[...source.matchAll(/\\setcounter\s*\{tocdepth\}\s*\{(-?\d+)\}/g)].at(-1);
  return {className,chapters,openRight:options.includes('openright')||(/book$/.test(className)&&!options.includes('openany')),formats,names,resets,secnumdepth:depth?Number(depth[1]):chapters?2:3,tocdepth:tocDepth?Number(tocDepth[1]):chapters?2:3};
}
function roman(number){
  let out='';for(const [value,glyph] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(number>=value){out+=glyph;number-=value;}return out;
}
export function formatCounter(name,counters,profile,appendix=false,seen=new Set()){
  if(seen.has(name))return '';
  seen=new Set(seen).add(name);
  const primary=profile.chapters?'chapter':'section';
  let format=profile.formats[name];
  if(appendix&&name===primary&&format===undefined)format='\\Alph{'+name+'}';
  if(format===undefined){
    if(name==='chapter'||name==='section'&&!profile.chapters)format='\\arabic{'+name+'}';
    else if(['section','subsection','subsubsection'].includes(name))format='\\the'+({section:'chapter',subsection:'section',subsubsection:'subsection'}[name])+'.\\arabic{'+name+'}';
    else if(profile.resets[name])format=(name==='equation'&&profile.resets[name]==='chapter'&&!counters.chapter?'':'\\the'+profile.resets[name]+'.')+'\\arabic{'+name+'}';
    else format='\\arabic{'+name+'}';
  }
  return format.replace(/\\(arabic|Alph|alph|Roman|roman|chinese|zhnum|zhnumber)\s*\{([^}]+)\}|\\the([A-Za-z]+)/g,(_,style,counter,parent)=>{
    if(parent)return formatCounter(parent,counters,profile,appendix,seen);
    const n=counters[counter]??0;
    if(style==='chinese'||style==='zhnum'||style==='zhnumber')return chineseNumber(n);
    if(style==='arabic')return String(n);
    if(style==='Alph'||style==='alph')return n>0&&n<=26?String.fromCharCode((style==='Alph'?64:96)+n):'';
    return style==='roman'?roman(n).toLowerCase():roman(n);
  });
}