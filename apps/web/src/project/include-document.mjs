import {parseDocument} from '../../latex/document.mjs';
import {importBlocks} from '../editor/latex-codec.js';
import {sourceProjection,richSourceChanges} from '../editor/source-sync.js';
import {includeEdges,referenceTarget} from './include-operations.mjs';

function regionFor(text, from, to, file, key) {
  const source = text.slice(from,to);
  const document = parseDocument(source,{fragment:true});
  const nodes = document?.blocks.flatMap(importBlocks) ?? [{type:'raw',attrs:{latex:source}}];
  if (!nodes.length) nodes.push({type:'paragraph'});
  const doc = {type:'doc',content:nodes};
  return {key, id:file.id, path:file.path, from, to, doc, projection:sourceProjection(source,doc,{fragment:true})};
}

export function composeProject(project, rootId) {
  const result = {rootId, regions:[], sources:new Map(), issues:[], content:[]};
  const included = new Set();
  function visit(id, ancestry) {
    const file = project.file(id);
    if (ancestry.has(id)) { result.issues.push('Cycle: ' + file.path); return; }
    if (included.has(id)) { result.issues.push('Repeated include: ' + file.path); return; }
    included.add(id);
    const source = file.draft;
    result.sources.set(id,source);
    const document = parseDocument(source,{fragment:true});
    if (!document) { result.issues.push('Invalid TeX: ' + file.path); return; }
    const start = document.start.length;
    const limit = source.length - document.end.length;
    let position = start;
    const append = end => {
      const region = regionFor(source,position,end,file,String(result.regions.length));
      result.regions.push(region);
      result.content.push({type:'projectRegion',attrs:{regionKey:region.key,path:file.path},content:region.doc.content});
    };
    const nextAncestry = new Set(ancestry).add(id);
    for (const reference of includeEdges(source)) {
      const end = reference.end ?? reference.to + 1;
      if (reference.start < start || end > limit) continue;
      append(reference.start);
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
  if (doc.content?.length !== composition.regions.length) return null;
  const changesByFile = new Map();
  for (const [index, region] of composition.regions.entries()) {
    const node = doc.content[index];
    if (node.type !== 'projectRegion' || node.attrs?.regionKey !== region.key) return null;
    const changes = richSourceChanges(region.projection,{type:'doc',content:node.content ?? []});
    if (!changes) return null;
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
