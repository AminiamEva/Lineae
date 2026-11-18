import {counterProfile,formatCounter} from './counter-profile.mjs';
import {headingOutline} from './heading-numbering.mjs';
import {numberedMathRows} from './math-environments.mjs';
const cache=new WeakMap();
export function documentNumbers(doc){
 if(cache.has(doc))return cache.get(doc);
 const profile=counterProfile(doc.attrs?.layoutPreamble??''),headings=new Map(headingOutline(doc).map(item=>[item.position,item]));
 const counters={chapter:0,section:0,subsection:0,subsubsection:0,equation:0,figure:0,table:0},objects=new Map(),labels=[];let appendix=false,current={number:null,title:'',kind:'label'};
 const add=(key,details)=>{if(key&&!labels.some(item=>item.key===key))labels.push({key,...details});};
 doc.descendants((node,position,parent)=>{
  if(node.type.name==='appendixStart'){appendix=true;counters.chapter=profile.chapters?0:counters.chapter;counters.section=0;counters.subsection=0;return false;}
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
  if(kind&&parent?.type.name!=='subfigures'&&(kind==='table'?Boolean(node.attrs.captionEnabled||node.attrs.caption):(node.attrs.captionEnabled??typeof node.attrs.caption==='string'))&&node.attrs.captionNumbered!==false){
   counters[kind]++;const number=formatCounter(kind,counters,profile,appendix);current={number,title:node.attrs.caption??'',kind,position};objects.set(position,current);add(node.attrs.label,current);
  }
  if(node.type.name==='label')add(node.attrs.key,{...current,position});
 });
 const result={profile,headings,objects,labels};cache.set(doc,result);return result;
}