import {composeProject,projectDocumentEdits} from './include-document.mjs';
import {sourceProjection} from '../editor/source-sync.js';

export class ProjectDocumentSession {
  #composition = null;
  get composition() { return this.#composition; }
  set composition(value) { this.#composition = value; }
  compose(project, id) { return composeProject(project,id); }
  clear() { this.#composition = null; }
  hydrate(composition, document) {
    for (const [index, region] of composition.regions.entries()) {
      const regionDoc = {type:'doc',content:document.content[index].content};
      const source = composition.sources.get(region.id).slice(region.from,region.to);
      region.doc = regionDoc;
      region.projection = sourceProjection(source,regionDoc,{fragment:true});
    }
    this.#composition = composition;
  }
  changes(document) {
    return this.#composition ? projectDocumentEdits(this.#composition,document) : null;
  }
}
