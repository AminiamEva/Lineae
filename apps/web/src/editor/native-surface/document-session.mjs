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
    move(delta,extend){
      const before=selection.caret;
      if(!before)return false;
      if(!extend&&Math.abs(delta)===1&&selection.anchor!==before){
        const target=selection.range[delta<0?0:1];
        return selection.selectTargets(target,target);
      }
      const local=selection.move(delta,extend);
      if(extend||local!==before||Math.abs(delta)!==1)return Boolean(local);
      const stops=selection.stops;
      for(let index=selection.index+delta;index>=0&&index<stops.length;index+=delta){
        const target=stops[index];
        if(fileOf(target)===fileOf(before))return selection.selectTargets(target,target);
      }
      return Boolean(local);
    },
    leaveFormula(){
      const caret=selection.caret;
      if(caret?.kind!=='math')return false;
      const following=selection.stops.find(stop=>stop.kind==='text'&&
        fileOf(stop)===fileOf(caret)&&stop.docOffset>=caret.formula.to16);
      return following?selection.selectTargets(following,following):false;
    },
    selectRegion({path,from,to}){
      const first=selection.stops.find(stop=>fileOf(stop)===path&&stop.docOffset>=from&&stop.docOffset<=to);
      return first?selection.selectTargets(first,first):false;
    },
    reset(){selection.reset();},
  };
}
