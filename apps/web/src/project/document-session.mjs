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
  changes(document) {
    return this.#composition ? projectDocumentEdits(this.#composition,document) : null;
  }
}
