import {createSelectionModel} from './selection-model.mjs';
import {createMathSurface,sameFormula} from './math-surface.mjs';
import {createTextSurface,sameParagraph} from './text-surface.mjs';
import {textEdit} from '../native-text/projection.mjs';

const sameOwner=(left,right)=>Boolean(left&&right&&left.kind===right.kind&&
  (left.kind==='math'?sameFormula(left,right):sameParagraph(left,right)));
const fileOf=stop=>(stop.formula??stop.paragraph).filePath;

// Text and math contribute geometry and edit operations. The document session
// owns one selection and one pending caret address for the visible revision.
export function createNativeDocumentSession(resolve) {
  let orderByFile=new Map();
  const order=stop=>orderByFile.get(fileOf(stop))?.find(region=>
    stop.docOffset>=region.from&&stop.docOffset<=region.to)?.index??-1;
  const canSelect=(from,to)=>sameOwner(from,to)||Boolean(from?.kind==='text'&&to?.kind==='text'&&
    !from.paragraph.tableCell&&!to.paragraph.tableCell&&
    (fileOf(from)===fileOf(to)||(order(from)>=0&&order(to)>=0)));
  const compare=(left,right)=>order(left)-order(right)||left.docOffset-right.docOffset;
  const selection=createSelectionModel(sameOwner,fileOf,canSelect);
  const math=createMathSurface({resolve,selection});
  const text=createTextSurface({selection});
  let sourceProjection=null;
  let preferredX=null;
  const center=stop=>(stop.top+stop.bottom)/2;
  return {
    get surface(){return selection.caret?.kind==='text'?text:math;},
    setObservation(observed,projection,verified=false,regions=[]){
      orderByFile=new Map();
      for(const [index,{path,from,to}] of regions.entries()){
        if(!orderByFile.has(path))orderByFile.set(path,[]);
        orderByFile.get(path).push({index,from,to});
      }
      sourceProjection=projection;
      text.setProjection(projection);
      const stops=[
        ...(projection.kind==='text'?[]:math.collectStops(observed,verified)),
        ...(projection.kind==='math'?[]:text.collectStops(observed,verified)),
      ].sort(compare);
      return selection.setStops(stops);
    },
    select(from,to){preferredX=null;return selection.selectTargets(from,to);},
    proseRanges(anchor,head){
      if(anchor?.kind!=='text'||head?.kind!=='text'||!canSelect(anchor,head)||
         (anchor.paragraph===head.paragraph&&anchor.local===head.local))return [];
      const [from,to]=compare(anchor,head)<=0?[anchor,head]:[head,anchor];
      if(from.paragraph===to.paragraph)return [{paragraph:from.paragraph,from:from.local,to:to.local}];
      const groups=new Set([from.paragraph]);
      for(const stop of selection.stops){
        if((order(from)>=0?order(stop)>=0:fileOf(stop)===fileOf(from))&&compare(stop,from)>0&&compare(stop,to)<0){
          if(stop.kind==='text')groups.add(stop.paragraph);
          else if(stop.formula.kind==='displayMath')groups.add(stop.formula);
        }
      }
      groups.add(to.paragraph);
      return [...groups].map(group=>group.math?{formula:group}:{
        paragraph:group,from:group===from.paragraph?from.local:0,to:group===to.paragraph?to.local:group.text.length,
      });
    },
    editAcrossFiles(insert) {
      const [first,last]=selection.range;
      if(first?.kind!=='text'||last?.kind!=='text'||fileOf(first)===fileOf(last))return null;
      const ranges=this.proseRanges(first,last);
      if(ranges.length!==2||ranges.some(range=>!range.paragraph||range.paragraph.container||
         range.paragraph.parts.length!==1||range.paragraph.parts[0].kind!=='text'||
         range.paragraph.parts[0].marks?.length))return null;
      const edits=ranges.map(({paragraph,from,to},index)=>{
        const edit=textEdit(sourceProjection,{paragraph,from16:from,to16:to,insert:index===0?insert:''});
        return edit?.text.trim()?{...edit,paragraph}:null;
      });
      if(edits.some(edit=>!edit))return null;
      const [start]=edits;
      return selection.record({kind:'project-range',edits,paragraph:start.paragraph,source:start.source},
        start.paragraph.from16+start.selection,first);
    },
    move(delta,extend){
      preferredX=null;
      const before=selection.caret;
      if(!before)return false;
      if(!extend&&Math.abs(delta)===1&&selection.anchor!==before){
        const target=selection.range[delta<0?0:1];
        return selection.selectTargets(target,target);
      }
      const local=selection.move(delta,extend);
      if(local!==before||Math.abs(delta)!==1)return Boolean(local);
      const stops=selection.stops;
      for(let index=selection.index+delta;index>=0&&index<stops.length;index+=delta){
        const target=stops[index];
        if(extend&&canSelect(selection.anchor,target))return selection.selectTargets(selection.anchor,target);
        if(!extend&&(fileOf(target)===fileOf(before)||(order(target)>=0&&order(before)>=0)))
          return selection.selectTargets(target,target);
      }
      return Boolean(local);
    },
    moveVertical(direction,extend,jumpPage=false){
      const from=selection.caret;
      if(!from||Math.abs(direction)!==1)return false;
      preferredX??=from.x;
      const anchor=extend?selection.anchor:null;
      let target=null,targetPage=Infinity,targetY=Infinity,targetX=Infinity;
      for(const stop of selection.stops){
        if(stop===from||fileOf(stop)!==fileOf(from)&&order(stop)<0||
            (from.kind==='math'&&!sameFormula(from,stop))||
            (anchor&&!canSelect(anchor,stop)))continue;
        const pageDelta=(stop.page-from.page)*direction;
        const yDelta=(center(stop)-center(from))*direction;
        const minLineGap=Math.min(from.bottom-from.top,stop.bottom-stop.top)/2;
        if(pageDelta<0||(!pageDelta&&(jumpPage||yDelta<=minLineGap)))continue;
        const distanceY=jumpPage?Math.abs(yDelta):pageDelta?(direction>0?center(stop):-center(stop)):yDelta;
        const distanceX=Math.abs(stop.x-preferredX);
        if(pageDelta>targetPage||(pageDelta===targetPage&&
           (distanceY>targetY||distanceY===targetY&&distanceX>=targetX)))continue;
        target=stop;targetPage=pageDelta;targetY=distanceY;targetX=distanceX;
      }
      return target?selection.selectTargets(anchor??target,target):false;
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
    expectInitialText(edit,offset,path){
      selection.record(edit,offset,{kind:'text',paragraph:{filePath:path}});
    },
    expectInitialMath(edit,offset,path){
      selection.record(edit,offset,{kind:'math',formula:{filePath:path}});
    },
    reset(){selection.reset();sourceProjection=null;preferredX=null;orderByFile.clear();},
  };
}
