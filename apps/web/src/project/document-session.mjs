import {composeProject,projectDocumentEdits,regionProjection} from './include-document.mjs';

export class ProjectDocumentSession {
  #composition = null;
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
}
