import {scanDependencies,dependencyMatchesPath} from './dependencies.mjs';
import {parseDocument} from '../../latex/document.mjs';
import {importBlocks} from '../editor/latex-codec.js';
import {sourceProjection,richSourceChanges} from '../editor/source-sync.js';

// Each editable region owns a disjoint source interval. Include directives and
// file preambles never become editable rich content or disappear on export.
export function composeProject(project,rootId) {
  const regions=[],sources=new Map(),issues=[],seen=new Set();
  function visit(id,stack=[]) {
    const file=project.file(id),text=file.draft;
    if(stack.includes(id)){issues.push('Cycle: '+file.path);return;}
    if(seen.has(id)){issues.push('Repeated include: '+file.path);return;}
    seen.add(id);sources.set(id,text);
    const parsed=parseDocument(text,{fragment:true});
    if(!parsed){issues.push('Invalid TeX: '+file.path);return;}
    const start=parsed.start.length,end=text.length-parsed.end.length;
    let cursor=start;
    const append=to=>{
      const raw=text.slice(cursor,to);
      const parsedRegion=parseDocument(raw,{fragment:true});
      const content=parsedRegion?.blocks.flatMap(importBlocks)??[{type:'raw',attrs:{latex:raw}}];
      if(!content.length)content.push({type:'paragraph'});
      const key=String(regions.length);
      const doc={type:'doc',content};
      regions.push({key,id,path:file.path,from:cursor,to,projection:sourceProjection(raw,doc,{fragment:true}),doc});
    };
    for(const dep of scanDependencies(text).dependencies) {
      if(!['input','include'].includes(dep.command)||dep.start<start||dep.to>=end)continue;
      append(dep.start);
      const target=[...project.files.values()].find(f=>dependencyMatchesPath(dep.command,dep.path,f.path));
      if(dep.status==='literal'&&target?.kind==='tex'&&!target.missing)visit(target.id,[...stack,id]);
      else issues.push('Unresolved include: '+dep.path);
      cursor=dep.to+1;
    }
    append(end);
  }
  visit(rootId);
  return {rootId,regions,sources,issues,content:regions.map(r=>({type:'projectRegion',attrs:{regionKey:r.key,path:r.path},content:r.doc.content}))};
}

export function projectDocumentEdits(composition,doc) {
  if(doc.content?.length!==composition.regions.length)return null;
  const patches=new Map();
  for(let i=0;i<composition.regions.length;i++) {
    const r=composition.regions[i],node=doc.content[i];
    if(node.type!=='projectRegion'||node.attrs?.regionKey!==r.key)return null;
    const changes=richSourceChanges(r.projection,{type:'doc',content:node.content??[]});
    if(!changes)return null;
    if(!patches.has(r.id))patches.set(r.id,[]);
    patches.get(r.id).push(...changes.map(c=>({...c,from:c.from+r.from,to:c.to+r.from})));
  }
  const result=new Map();
  for(const [id,changes] of patches){
    let text=composition.sources.get(id);
    for(const c of changes.sort((a,b)=>b.from-a.from))text=text.slice(0,c.from)+c.insert+text.slice(c.to);
    result.set(id,text);
  }
  return result;
}
