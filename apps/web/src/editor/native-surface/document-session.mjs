import {createSelectionModel} from './selection-model.mjs';
import {createMathSurface,sameFormula} from './math-surface.mjs';
import {createTextSurface,sameParagraph} from './text-surface.mjs';

const sameOwner=(left,right)=>Boolean(left&&right&&left.kind===right.kind&&
  (left.kind==='math'?sameFormula(left,right):sameParagraph(left,right)));
const fileOf=stop=>(stop.formula??stop.paragraph).filePath;

// Text and math contribute geometry and edit operations. The document session
// owns one selection and one pending caret address for the visible revision.
export function createNativeDocumentSession(resolve) {
  const selection=createSelectionModel(sameOwner,fileOf);
  const math=createMathSurface({resolve,selection});
  const text=createTextSurface({selection});
  return {
    get surface(){return selection.caret?.kind==='text'?text:math;},
    setObservation(observed,projection,verified=false){
      text.setProjection(projection);
      const stops=[
        ...(projection.kind==='text'?[]:math.collectStops(observed,verified)),
        ...(projection.kind==='math'?[]:text.collectStops(observed,verified)),
      ].sort((left,right)=>left.docOffset-right.docOffset);
      return selection.setStops(stops);
    },
    select(from,to){return selection.selectTargets(from,to);},
    reset(){selection.reset();},
  };
}
