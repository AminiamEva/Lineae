export function headingOutline(doc){
 const counters=[0,0,0,0],items=[];
 const chapters=/\\documentclass(?:\[[^\]]*\])?\{(?:book|report|ctexbook|ctexrep)\}/.test(doc.attrs?.layoutPreamble??'');
 let appendix=false;
 doc.descendants((node,position)=>{
  if(node.type.name==='appendixStart'){appendix=true;counters.fill(0);return false;}
  if(node.type.name!=='heading')return;
  const command=node.attrs.command??['section','subsection','subsubsection'][node.attrs.level-1];
  const index=chapters?['chapter','section','subsection','subsubsection'].indexOf(command):['section','subsection','subsubsection'].indexOf(command);
  if(index<0)return;
  let number='';
  if(node.attrs.numbered!==false){
   counters[index]++;counters.fill(0,index+1);
   number=counters.slice(0,index+1).map((value,i)=>appendix&&i===0?(value>0&&value<=26?String.fromCharCode(64+value):''):String(value)).join('.');
  }
  items.push({level:index+1,number,text:node.textContent,label:node.attrs.label||null,position,appendix});
 });return items;
}
