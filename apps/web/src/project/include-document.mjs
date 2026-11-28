import {parseDocument} from '../../latex/document.mjs';
import {importBlocks} from '../editor/latex-codec.js';
import {sourceProjection,richSourceChanges} from '../editor/source-sync.js';
import {includeEdges,referenceTarget} from './include-operations.mjs';

export function regionProjection(region,source,doc){
  const count=(source.match(/\r\n|\r|\n/g)??[]).length;
  const empty=!source.trim()&&(region.continuation||region.beforeReference);
  const separated=source+region.eol.repeat(Math.max(0,2-count));
  const emptyPrefix=empty?(region.continuation?separated:''):undefined;
  const emptySuffix=empty?(region.beforeReference?(region.continuation?region.eol.repeat(2):separated):region.eol):undefined;
  return sourceProjection(source,doc,{fragment:true,emptyPrefix,emptySuffix});
}

function regionFor(text, from, to, file, key, continuation, beforeReference) {
  const source = text.slice(from,to);
  const document = parseDocument(source,{fragment:true});
  const nodes = document?.blocks.flatMap(importBlocks) ?? [{type:'raw',attrs:{latex:source}}];
  if (!nodes.length) nodes.push({type:'paragraph'});
  const doc = {type:'doc',content:nodes};
  const region={key,id:file.id,path:file.path,from,to,doc,continuation,beforeReference,eol:text.includes('\r\n')?'\r\n':'\n'};
  region.projection=regionProjection(region,source,doc);
  return region;
}

export function composeProject(project, rootId, {boundariesOnly=false,repeated='reject'}={}) {
  const result = {rootId,repeated,hasRepeated:false,regions:[],sources:new Map(),issues:[],content:[]};
  const included = new Map();
  let expanded=0;
  function visit(id, ancestry) {
    const file = project.file(id);
    if (ancestry.has(id)) { result.issues.push('Cycle: ' + file.path); return; }
    if(repeated==='all'&&++expanded>10000){
      if(expanded===10001)result.issues.push('Too many expanded includes');
      return;
    }
    const occurrence=included.get(id)??0;
    if(occurrence)result.hasRepeated=true;
    if(occurrence&&repeated!=='all'){
      if(repeated==='reject')result.issues.push('Repeated include: '+file.path);
      return;
    }
    included.set(id,occurrence+1);
    const source = file.draft;
    result.sources.set(id,source);
    const document = parseDocument(source,{fragment:true});
    if (!document) { result.issues.push('Invalid TeX: ' + file.path); return; }
    const start = document.start.length;
    const limit = source.length - document.end.length;
    let position = start;
    const append = (end,beforeReference=false) => {
      const key=String(result.regions.length);
      const region=boundariesOnly?{key,id:file.id,path:file.path,from:position,to:end}:
        regionFor(source,position,end,file,key,position>start,beforeReference);
      if(repeated==='all')region.occurrence=occurrence;
      result.regions.push(region);
      result.content.push({type:'projectRegion',attrs:{regionKey:region.key,path:file.path,trail:[...ancestry].map(parent=>project.file(parent).path)},content:region.doc?.content??[]});
    };
    const nextAncestry = new Set(ancestry).add(id);
    for (const reference of includeEdges(source)) {
      const end = reference.end ?? reference.to + 1;
      if (reference.start < start || end > limit) continue;
      append(reference.start,true);
      const child = referenceTarget(project,reference);
      if (reference.status === 'literal' && child && !child.missing) visit(child.id,nextAncestry);
      else result.issues.push('Unresolved include: ' + reference.path);
      position = end;
    }
    append(limit);
  }
  visit(rootId,new Set());
  return result;
}

export function projectDocumentEdits(composition, doc) {
  if(composition.repeated==='all')return null;
  if (doc.content?.length !== composition.regions.length) return null;
  const changesByFile = new Map();
  for (const [index, region] of composition.regions.entries()) {
    const node = doc.content[index];
    if (node.type !== 'projectRegion' || node.attrs?.regionKey !== region.key) return null;
    const changes = richSourceChanges(region.projection,{type:'doc',content:node.content ?? []},{editProse:true});
    if(!changes)return null;
    const owned = changesByFile.get(region.id) ?? [];
    owned.push(...changes.map(change => ({...change,from:region.from + change.from,to:region.from + change.to})));
    changesByFile.set(region.id,owned);
  }
  const drafts = new Map();
  for (const [id, changes] of changesByFile) {
    let draft = composition.sources.get(id);
    for (const change of changes.sort((left,right) => right.from - left.from)) {
      draft = draft.slice(0,change.from) + change.insert + draft.slice(change.to);
    }
    drafts.set(id,draft);
  }
  return drafts;
}
