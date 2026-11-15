import {composeProject,projectDocumentEdits} from './include-document.mjs';
import {sourceProjection} from '../editor/source-sync.js';

// Owns file provenance and source projections, never fonts, layout, or input rules.
export class ProjectDocumentSession {
  composition=null;
  compose(project,id){return composeProject(project,id);}
  hydrate(composition,doc){
    composition.regions.forEach((region,index)=>{
      region.doc={type:'doc',content:doc.content[index].content};
      region.projection=sourceProjection(composition.sources.get(region.id).slice(region.from,region.to),region.doc,{fragment:true});
    });
    this.composition=composition;
  }
  changes(doc){return this.composition?projectDocumentEdits(this.composition,doc):null;}
  clear(){this.composition=null;}
}
