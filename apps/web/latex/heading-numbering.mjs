import {counterDeclarationAt,applyCounterDeclaration} from './counter-declarations.mjs';
import {counterProfile,formatCounter} from './counter-profile.mjs';
export function headingOutline(doc){
 const profile=counterProfile(doc.attrs?.layoutPreamble??''),items=[];
 const hierarchy=profile.chapters?['chapter','section','subsection','subsubsection']:['section','subsection','subsubsection'];
 const counters={chapter:0,section:0,subsection:0,subsubsection:0};let appendix=false;
 doc.descendants((node,position)=>{
  if(node.type.name==='counterDirective'){const declaration=counterDeclarationAt(node.attrs.latex,0);if(declaration)applyCounterDeclaration(profile,counters,declaration);return false;}
  if(node.type.name==='appendixStart'){appendix=true;delete profile.formats[profile.chapters?'chapter':'section'];counters[profile.chapters?'chapter':'section']=0;counters.subsection=0;counters.section=0;return false;}
  if(node.type.name!=='heading')return;
  const command=node.attrs.command??['section','subsection','subsubsection'][node.attrs.level-1],index=hierarchy.indexOf(command);
  if(index<0)return;
  let number='';
  const depth={chapter:0,section:1,subsection:2,subsubsection:3}[command];
  if(node.attrs.numbered!==false&&depth<=profile.secnumdepth){
   counters[command]++;for(const name of hierarchy.slice(index+1))counters[name]=0;
   number=formatCounter(command,counters,profile,appendix);
  }
  items.push({level:index+1,number,text:node.textContent,label:node.attrs.label||null,position,appendix,command,counters:Object.fromEntries(['chapter','section','subsection','subsubsection'].map(name=>[name,counters[name]??0])),chapterLabel:command==='chapter'&&number?(appendix?profile.names.appendix:profile.names.chapter)+' '+number:null});
 });return items;
}