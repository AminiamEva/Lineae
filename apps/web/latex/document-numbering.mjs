import {sourceStructure} from './source-structure.mjs';
import {environmentEnd} from './tblr.mjs';
function hasNumberedCaption(attrs) {
  if(attrs.caption===null || attrs.caption===undefined)return false;
  const source=attrs.figureSource??attrs.tblr?.source??attrs.tabularx?.source;
  const opening=typeof source==='string'?/^\s*\\begin\{((?:figure|table)\*?)\}/.exec(source):null;
  const closing=opening?environmentEnd(source,source.indexOf('\\begin'),opening[1]):null;
  if(closing) {
    const body=source.slice(opening[0].length,closing.start);
    for(const token of sourceStructure(body))if(token.topLevel && token.value==='\\caption')return body[token.end]!=='*';
  }
  return true;
}
import {counterDeclarationAt,applyCounterDeclaration} from './counter-declarations.mjs';
import {counterProfile,formatCounter} from './counter-profile.mjs';
import {headingOutline} from './heading-numbering.mjs';
import {numberedMathRows} from './math-environments.mjs';
const cache=new WeakMap();
export function documentNumbers(doc){
 if(cache.has(doc))return cache.get(doc);
 const profile=counterProfile(doc.attrs?.layoutPreamble??''),headings=new Map(headingOutline(doc).map(item=>[item.position,item]));
 const counters={chapter:0,section:0,subsection:0,subsubsection:0,equation:0,figure:0,table:0},objects=new Map(),labels=[];let appendix=false,current={number:null,title:'',kind:'label'};
 const add=(key,details)=>{if(!key)return;const old=labels.find(item=>item.key===key);if(old){Object.assign(old,{ambiguous:true,number:null,position:null});return;}labels.push({key,...details});};
 doc.descendants((node,position,parent)=>{
  if(node.type.name==='counterDirective'){const declaration=counterDeclarationAt(node.attrs.latex,0);if(declaration)applyCounterDeclaration(profile,counters,declaration);return false;}
  if(node.type.name==='appendixStart'){appendix=true;delete profile.formats[profile.chapters?'chapter':'section'];counters.chapter=profile.chapters?0:counters.chapter;counters.section=0;counters.subsection=0;return false;}
  const heading=headings.get(position);
  if(heading){
   if(heading.number){
    const changed=new Set([heading.command,...({chapter:['section','subsection','subsubsection'],section:['subsection','subsubsection'],subsection:['subsubsection']}[heading.command]??[])]);
    Object.assign(counters,heading.counters);
    for(const [name,parent] of Object.entries(profile.resets))if(changed.has(parent))counters[name]=0;
   }
   current={number:heading.number||null,title:heading.text,kind:'heading',position};add(node.attrs.label,current);
  }
  if(node.type.name==='mathBlock'){
   const rows=numberedMathRows(node.attrs).map(row=>{
    if(row.unnumbered&&row.tag===undefined)return {...row,number:null};
    // TeX's explicit tags replace the automatic number and do not step it.
    const number=row.tag??formatCounter('equation',{...counters,equation:++counters.equation},profile,appendix);
    current={number,title:node.attrs.latex,kind:'equation',position};add(row.label??(row.index===(node.attrs.labelRow??0)?node.attrs.label:null),current);return {...row,number};
   });objects.set(position,{kind:'equation',rows});
  }
  const kind=node.type.name==='table'?'table':['documentImage','subfigures'].includes(node.type.name)?'figure':null;
  if(kind&&parent?.type.name!=='subfigures'){
   const numbered=hasNumberedCaption(node.attrs)&&node.attrs.captionNumbered!==false;
   const number=numbered?formatCounter(kind,{...counters,[kind]:++counters[kind]},profile,appendix):null;
   current={number,title:node.attrs.caption??node.attrs.path??'',kind,position};
   if(numbered)objects.set(position,current);add(node.attrs.label,current);
  }
  if(node.type.name==='raw')current={kind:'label',number:null,title:'',position:null};
  if(node.type.name==='label')add(node.attrs.key,current.kind==='label'?{...current,position}:current);
 });
 const result={profile,headings,objects,labels};cache.set(doc,result);return result;
}

// Page numbering for book/report: frontmatter roman, mainmatter arabic restart.
export function toRoman(n) {
  if (n <= 0) return String(n);
  const table = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}
// displayPageNumber(index, {frontmatter, mainStart}) -> {text, value, odd}
// value = LaTeX \\value{page} (drives \\ifodd parity and E/O slots);
// text  = rendered \\thepage (roman in frontmatter, restarted arabic in mainmatter).
export function displayPageNumber(index, { frontmatter = false, mainStart = null } = {}) {
  const inMain = frontmatter && mainStart !== null && index >= mainStart;
  const value = inMain ? index - mainStart + 1 : index + 1;
  return { text: frontmatter && !inMain ? toRoman(value) : String(value), value, odd: value % 2 === 1 };
}
