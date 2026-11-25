import {composeProject,projectDocumentEdits,regionProjection} from './include-document.mjs';

export class ProjectDocumentSession {
  #composition = null;
  #history = new WeakMap();
  get composition() { return this.#composition; }
  set composition(value) { this.#composition = value; }
  compose(project, id, options) { return composeProject(project,id,options); }
  clear() { this.#composition = null; }
  hydrate(composition, document) {
    for (const [index, region] of composition.regions.entries()) {
      const regionDoc = {type:'doc',content:document.content[index].content};
      const source = composition.sources.get(region.id).slice(region.from,region.to);
      region.doc = regionDoc;
      region.projection = regionProjection(region,source,regionDoc);
    }
    this.#composition = composition;
  }
  rebase(composition, document) {
    const current=this.#composition;
    if(!current||!composition||composition.rootId!==current.rootId||
      composition.regions.length!==document.content.length||composition.regions.length!==current.regions.length)return false;
    for(const [index,region] of composition.regions.entries()){
      const node=document.content[index],before=current.regions[index];
      if(node.type!=='projectRegion'||region.key!==node.attrs.regionKey||region.id!==before.id||
        region.path!==node.attrs.path)return false;
      Object.assign(region,{continuation:before.continuation,beforeReference:before.beforeReference,eol:before.eol});
    }
    this.hydrate(composition,document);
    return true;
  }
  changes(document) {
    return this.#composition ? projectDocumentEdits(this.#composition,document) : null;
  }
  verify(project, document, drafts) {
    const current=this.#composition;
    if(!current||!drafts.size)return null;
    const files=new Map([...project.files.values()].map(file=>[file.id,file]));
    for(const [id,draft] of drafts){
      const file=files.get(id);
      if(!file||!current.sources.has(id))return null;
      files.set(id,{...file,draft});
    }
    const next=composeProject({files,file:id=>files.get(id)},current.rootId);
    if(next.regions.length!==current.regions.length||next.regions.length!==document.childCount||
      JSON.stringify(next.issues)!==JSON.stringify(current.issues))return null;
    for(const [index,region] of next.regions.entries()){
      const node=document.child(index);
      if(region.id!==current.regions[index].id||region.path!==node.attrs.path||
        !document.type.schema.nodeFromJSON(next.content[index]).eq(node))return null;
    }
    return next;
  }
  record(project, transition) {
    const history=this.#history.get(project)??[];
    history.push(transition);
    if(history.length>100)history.shift();
    this.#history.set(project,history);
  }
  restore(project, transaction) {
    for(const transition of this.#history.get(project)?.toReversed()??[]){
      const forward=transition.before.doc.eq(transaction.before)&&transition.after.doc.eq(transaction.doc);
      const backward=transition.after.doc.eq(transaction.before)&&transition.before.doc.eq(transaction.doc);
      if(!forward&&!backward)continue;
      const [previous,next]=forward?[transition.before,transition.after]:[transition.after,transition.before];
      if([...previous.drafts].some(([id,draft])=>!this.#composition?.sources.has(id)||
        project.file(id).draft!==draft))continue;
      const composition=this.verify(project,transaction.doc,next.drafts);
      if(composition)return {composition,drafts:next.drafts};
    }
    return null;
  }
}
