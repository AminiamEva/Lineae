import {createSelectionModel} from './selection-model.mjs';
import {createMathSurface,sameFormula} from './math-surface.mjs';
import {createTextSurface,sameParagraph} from './text-surface.mjs';
import {textEdit} from '../native-text/projection.mjs';

const sameOwner=(left,right)=>Boolean(left&&right&&left.kind===right.kind&&
  (left.kind==='math'?sameFormula(left,right):sameParagraph(left,right)));
const fileOf=stop=>(stop.formula??stop.paragraph).filePath;
const tableCellOf=stop=>(stop?.paragraph??stop?.formula)?.tableCell;

// Text and math contribute geometry and edit operations. The document session
// owns one selection and one pending caret address for the visible revision.
export function createNativeDocumentSession(resolve) {
  let orderByFile=new Map();
  let documentRegions=[];
  let observedStops=[];
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
  function regionBounds(stops){
    const bounds=new Map();
    for(const stop of stops){
      const index=order(stop);
      if(index<0)continue;
      const known=bounds.get(index);
      if(!known){bounds.set(index,{first:stop,last:stop});continue;}
      if(stop.page<known.first.page||stop.page===known.first.page&&stop.top<known.first.top)known.first=stop;
      if(stop.page>known.last.page||stop.page===known.last.page&&stop.bottom>known.last.bottom)known.last=stop;
    }
    return bounds;
  }
  return {
    get surface(){return selection.caret?.kind==='text'?text:math;},
    setObservation(observed,projection,verified=false,regions=[]){
      documentRegions=regions;
      orderByFile=new Map();
      for(const [index,{path,from,to}] of regions.entries()){
        if(!orderByFile.has(path))orderByFile.set(path,[]);
        orderByFile.get(path).push({index,from,to});
      }
      sourceProjection=projection;
      text.setProjection(projection);
      observedStops=[
        ...(projection.kind==='text'?[]:math.collectStops(observed,verified)),
        ...(projection.kind==='math'?[]:text.collectStops(observed,verified)),
      ].sort(compare);
      return selection.setStops(observedStops);
    },
    fileBoundaries(){
      if(documentRegions.length<2)return [];
      const bounds=regionBounds(selection.stops);
      const positions=[];
      for(let index=1;index<documentRegions.length;index++){
        const previous=bounds.get(index-1)?.last,next=bounds.get(index)?.first;
        const {path}=documentRegions[index];
        if(!previous||!next||documentRegions[index-1].path===path)continue;
        if(previous.page===next.page&&previous.bottom<next.top){
          positions.push({path,page:next.page,y:(previous.bottom+next.top)/2});
        }else if(previous.page<next.page){
          positions.push({path,page:next.page,y:next.top,atPageStart:true});
        }
      }
      return positions;
    },
    foldFiles(paths){
      if(!paths.length){
        if(selection.stops!==observedStops)selection.setStops(observedStops);
        return [];
      }
      const bounds=regionBounds(observedStops),hidden=new Set(),ranges=[];
      const positions=[...bounds];
      for(const path of paths){
        if(path===documentRegions[0]?.path)continue;
        const indices=documentRegions.flatMap((region,index)=>region.path===path||region.trail?.includes(path)?[index]:[]);
        if(!indices.length||indices.at(-1)-indices[0]+1!==indices.length)continue;
        const regions=indices.map(index=>bounds.get(index)).filter(Boolean);
        const first=regions[0]?.first,last=regions.at(-1)?.last;
        if(!first||!last||first.page>last.page)continue;
        const previous=positions.findLast(([index])=>index<indices[0])?.[1].last;
        const following=positions.find(([index])=>index>indices.at(-1))?.[1].first;
        if(previous?.page===first.page&&previous.bottom>=first.top||
           following?.page===last.page&&following.top<=last.bottom)continue;
        const from=previous?.page===first.page?(previous.bottom+first.top)/2:first.top;
        const to=following?.page===last.page?(last.bottom+following.top)/2:last.bottom;
        const outer=ranges.find(range=>range.indices.includes(indices[0]));
        if(outer)continue;
        for(const index of indices)hidden.add(index);
        ranges.push({path,firstPage:first.page,lastPage:last.page,from,to,indices});
      }
      selection.setStops(observedStops.filter(stop=>!hidden.has(order(stop))));
      return ranges.filter((range,index)=>!ranges.some((other,otherIndex)=>
        index!==otherIndex&&other.indices.length>range.indices.length&&other.indices.includes(range.indices[0])));
    },
    select(from,to){preferredX=null;return selection.selectTargets(from,to);},
    selectAll(){
      const caret=selection.caret;
      if(!caret)return false;
      const stops=selection.stops.filter(stop=>caret.kind==='math'
        ?stop.kind==='math'&&sameFormula(caret,stop)&&caret.slot.id===stop.slot.id
        :stop.kind==='text'&&canSelect(caret,stop));
      preferredX=null;
      return stops.length>0&&selection.selectTargets(stops[0],stops.at(-1));
    },
    moveTableCell(backward){
      const caret=selection.caret,cell=tableCellOf(caret);
      if(!cell)return false;
      const cells=new Map();
      for(const stop of selection.stops){
        const target=tableCellOf(stop);
        if(target?.from16!==cell.from16||fileOf(stop)!==fileOf(caret))continue;
        const key=`${target.row}/${target.column}`;
        if(!cells.has(key))cells.set(key,stop);
      }
      const names=[...cells.keys()],index=names.indexOf(`${cell.row}/${cell.column}`);
      const next=cells.get(names[index+(backward?-1:1)]);
      if(!next)return false;
      preferredX=null;
      return selection.selectTargets(next,next);
    },
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
      if(ranges.length!==2||ranges.some(({paragraph})=>!paragraph||paragraph.container||
         paragraph.tableCell||paragraph.heading))return null;
      const edits=ranges.map(({paragraph,from,to},index)=>{
        const firstPart=paragraph.parts[0],lastPart=paragraph.parts.at(-1);
        const from16=from===0&&firstPart?.kind==='text'?firstPart.from16:from;
        const to16=to===paragraph.text.length&&lastPart?.kind==='text'?lastPart.to16:to;
        const edit=textEdit(sourceProjection,{paragraph,from16,to16,insert:index===0?insert:''});
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
    reset(){selection.reset();sourceProjection=null;preferredX=null;observedStops=[];documentRegions=[];orderByFile.clear();},
  };
}
