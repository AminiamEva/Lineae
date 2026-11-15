import {scanDependencies,dependencyMatchesPath} from './dependencies.mjs';
import {parseDocument} from '../../latex/document.mjs';
export const includeEdges=text=>scanDependencies(text).dependencies.filter(d=>['input','include'].includes(d.command));
export function referenceTarget(project,edge){return [...project.files.values()].find(f=>f.kind==='tex'&&dependencyMatchesPath(edge.command,edge.path,f.path));}
export function wouldCycle(project,ownerId,targetId){
  const seen=new Set();
  function visit(id){
    if(id===ownerId)return true;
    if(seen.has(id))return false;seen.add(id);
    return includeEdges(project.file(id).draft??'').some(e=>{const f=referenceTarget(project,e);return e.status==='literal'&&f&&visit(f.id);});
  }
  return visit(targetId);
}
export function addReference(text,path,command='input',beforeIndex){
  if(!['input','include'].includes(command)||/[\\{}%#\r\n]/.test(path))throw Error('Invalid reference');
  const parsed=parseDocument(text,{fragment:true});if(!parsed)throw Error('Invalid TeX');
  const edge=includeEdges(text)[beforeIndex];
  const at=edge?.start??text.length-parsed.end.length;
  const eol=text.includes('\r\n')?'\r\n':'\n';
  return text.slice(0,at)+eol+'\\'+command+'{'+path.replace(/\.tex$/,'')+'}'+eol+text.slice(at);
}
export function removeReference(text,index){const e=includeEdges(text)[index];if(!e||e.status!=='literal')return text;return text.slice(0,e.start)+text.slice(e.to+1);}
export function setReferenceKind(text,index,command){const e=includeEdges(text)[index];if(!e||e.status!=='literal'||!['input','include'].includes(command))return text;return text.slice(0,e.start)+'\\'+command+text.slice(e.start+1+e.command.length);}
export function moveReference(text,from,to){
  const edges=includeEdges(text);if(!edges[from]||!edges[to]||edges.some(e=>e.status!=='literal'))return text;
  const values=edges.map(e=>text.slice(e.start,e.to+1));values.splice(to,0,values.splice(from,1)[0]);
  for(let i=edges.length-1;i>=0;i--)text=text.slice(0,edges[i].start)+values[i]+text.slice(edges[i].to+1);
  return text;
}
