import {createSelectionModel} from './selection-model.mjs';
import {createMathSurface,sameFormula} from './math-surface.mjs';
import {createTextSurface,sameParagraph} from './text-surface.mjs';
import {textEdit} from '../native-text/projection.mjs';

const sameOwner=(left,right)=>Boolean(left&&right&&left.kind===right.kind&&
  (left.kind==='math'?sameFormula(left,right):sameParagraph(left,right)));
const fileOf=stop=>(stop.formula??stop.paragraph).filePath;
const copyOf=stop=>(stop.formula??stop.paragraph).occurrence??0;
const tableCellOf=stop=>(stop?.paragraph??stop?.formula)?.tableCell;
export const sameTable=(left,right)=>{
  const a=tableCellOf(left),b=tableCellOf(right);
  return Boolean(a&&b&&a.from16===b.from16&&fileOf(left)===fileOf(right)&&copyOf(left)===copyOf(right)&&
    (a.row===b.row||a.vertical&&b.vertical&&a.column===b.column));
};
const overlapsLine=(left,right)=>left?.page===right.page&&left.top<right.bottom&&left.bottom>right.top;
const editableRangeContainers=new Set(['theoremBlock','blockquote','orderedList','bulletList','descriptionList','multiColumn']);

// Text and math contribute geometry and edit operations. The document session
// owns one selection and one pending caret address for the visible revision.
export function createNativeDocumentSession(resolve) {
  let orderByFile=new Map();
  let documentRegions=[];
  let observedStops=[];
  const displayEdges=new Map();
  const order=stop=>orderByFile.get(fileOf(stop))?.find(region=>
    copyOf(stop)===region.occurrence&&stop.docOffset>=region.from&&stop.docOffset<=region.to)?.index??-1;
  const compare=(left,right)=>order(left)-order(right)||left.docOffset-right.docOffset;
  function canSelect(from,to){
    if(sameOwner(from,to))return true;
    if(!from||!to||fileOf(from)!==fileOf(to)&&(order(from)<0||order(to)<0))return false;
    if(from.kind==='text'&&to.kind==='text')return sameTable(from,to)||!tableCellOf(from)&&!tableCellOf(to);
    if(from.kind==='math'&&to.kind==='math'){
      const [first,last]=compare(from,to)<0?[from,to]:[to,from];
      return !tableCellOf(first)&&!tableCellOf(last)&&first===displayEdges.get(first.formula)?.[0]&&
        last===displayEdges.get(last.formula)?.[1];
    }
    const [prose,math]=from.kind==='text'?[from,to]:[to,from];
    const edges=displayEdges.get(math.formula);
    if(!edges||tableCellOf(prose)||tableCellOf(math))return false;
    return math===(compare(math,prose)<0?edges[0]:edges[1]);
  }
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
      for(const [index,{path,from,to,occurrence=0}] of regions.entries()){
        if(!orderByFile.has(path))orderByFile.set(path,[]);
        orderByFile.get(path).push({index,from,to,occurrence});
      }
      sourceProjection=projection;
      text.setProjection(projection);
      observedStops=[
        ...(projection.kind==='text'?[]:math.collectStops(observed,verified)),
        ...(projection.kind==='math'?[]:text.collectStops(observed,verified)),
      ].sort(compare);
      displayEdges.clear();
      for(const stop of observedStops){
        if(stop.formula?.kind!=='displayMath')continue;
        const edges=displayEdges.get(stop.formula);
        if(edges)edges[1]=stop;
        else displayEdges.set(stop.formula,[stop,stop]);
      }
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
      const groups=paths.flatMap(path=>{
        if(path===documentRegions[0]?.path)return [];
        const groups=[];
        for(const [index,region] of documentRegions.entries()){
          if(region.path!==path&&!region.trail?.includes(path))continue;
          const last=groups.at(-1);
          if(last?.indices.at(-1)===index-1)last.indices.push(index);
          else groups.push({path,indices:[index]});
        }
        return groups;
      });
      for(const {path,indices} of groups){
        const regions=indices.map(index=>bounds.get(index)).filter(Boolean);
        const first=regions[0]?.first,last=regions.at(-1)?.last;
        if(!first||!last||first.page>last.page)continue;
        const previous=positions.findLast(([index])=>index<indices[0])?.[1].last;
        const following=positions.find(([index])=>index>indices.at(-1))?.[1].first;
        const firstShared=overlapsLine(previous,first),lastShared=overlapsLine(following,last);
        function sharedLine(anchor){
          const line=observedStops.filter(stop=>overlapsLine(stop,anchor));
          const inside=line.filter(stop=>indices.includes(order(stop)));
          if(!inside.length||inside.some(stop=>stop.kind!=='text'))return null;
          const left=Math.min(...inside.map(stop=>stop.x)),right=Math.max(...inside.map(stop=>stop.x));
          if(left>=right||line.some(stop=>!indices.includes(order(stop))&&stop.x>=left&&stop.x<=right))return null;
          return {page:anchor.page,left,right,top:Math.min(...inside.map(stop=>stop.top)),
            bottom:Math.max(...inside.map(stop=>stop.bottom))};
        }
        const startLine=firstShared?sharedLine(first):null;
        const endLine=lastShared?sharedLine(last):null;
        if(firstShared&&!startLine||lastShared&&!endLine)continue;
        const sameLine=(firstShared||lastShared)&&overlapsLine(first,last);
        const lineMasks=[startLine,endLine].filter(Boolean);
        if(sameLine&&lineMasks.length>1)lineMasks.pop();
        const from=startLine?.bottom??(previous?.page===first.page?(previous.bottom+first.top)/2:first.top);
        const to=endLine?.top??(following?.page===last.page?(last.bottom+following.top)/2:last.bottom);
        const outer=ranges.find(range=>range.indices.includes(indices[0]));
        if(outer)continue;
        for(const index of indices)hidden.add(index);
        ranges.push({path,firstPage:first.page,lastPage:last.page,from,to,indices,
          ...(lineMasks.length?{lineMasks,sameLine}:{})});
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
        :caret.paragraph.tableCell?sameOwner(caret,stop):canSelect(caret,stop));
      preferredX=null;
      return stops.length>0&&selection.selectTargets(stops[0],stops.at(-1));
    },
    moveTableCell(backward){
      const caret=selection.caret,cell=tableCellOf(caret);
      if(!cell)return false;
      const cells=new Map();
      for(const stop of selection.stops){
        const target=tableCellOf(stop);
        if(target?.from16!==cell.from16||fileOf(stop)!==fileOf(caret)||copyOf(stop)!==copyOf(caret))continue;
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
      if(!canSelect(anchor,head)||anchor.kind==='math'&&head.kind==='math'&&sameFormula(anchor,head)||
         (anchor.paragraph===head.paragraph&&anchor.local===head.local))return [];
      const [from,to]=compare(anchor,head)<=0?[anchor,head]:[head,anchor];
      if(from.paragraph&&from.paragraph===to.paragraph)return [{paragraph:from.paragraph,from:from.local,to:to.local}];
      if(sameTable(from,to)){
        const a=tableCellOf(from),b=tableCellOf(to);
        const first=Math.min(a.column,b.column),last=Math.max(a.column,b.column);
        const top=Math.min(a.row,b.row),bottom=Math.max(a.row,b.row);
        const paragraphs=new Set(selection.stops.flatMap(stop=>{
          if(stop.kind!=='text'||!sameTable(from,stop))return [];
          const cell=tableCellOf(stop);
          return cell.row>=top&&cell.row<=bottom&&cell.column>=first&&cell.column<=last?[stop.paragraph]:[];
        }));
        return [...paragraphs].map(paragraph=>({paragraph,from:0,to:paragraph.text.length}));
      }
      const groups=new Set([from.paragraph??from.formula]);
      for(const stop of selection.stops){
        if((order(from)>=0?order(stop)>=0:fileOf(stop)===fileOf(from))&&compare(stop,from)>0&&compare(stop,to)<0){
          if(stop.kind==='text')groups.add(stop.paragraph);
          else if(stop.formula.kind==='displayMath')groups.add(stop.formula);
        }
      }
      groups.add(to.paragraph??to.formula);
      return [...groups].map(group=>group.math?{formula:group}:{
        paragraph:group,from:group===from.paragraph?from.local:0,to:group===to.paragraph?to.local:group.text.length,
      });
    },
    structuralRanges(anchor,head){
      const ranges=this.proseRanges(anchor,head);
      if(tableCellOf(anchor)||tableCellOf(head))return ranges;
      const seen=new Map();
      return ranges.flatMap(range=>{
        const owner=range.paragraph??range.formula;
        const cell=owner.tableCell;
        if(!cell)return [range];
        const key=JSON.stringify([owner.filePath,owner.occurrence??0]);
        if(!seen.has(key))seen.set(key,new Set());
        const tables=seen.get(key);
        if(tables.has(cell.from16))return [];
        tables.add(cell.from16);
        return [{table:{...cell,owner}}];
      });
    },
    editAcrossFiles(insert) {
      const [first,last]=selection.range;
      if(first?.kind!=='text'||last?.kind!=='text'||order(first)<0||order(last)<=order(first))return null;
      const ranges=this.structuralRanges(first,last);
      const sources=new Map();
      for(const {paragraph,formula,table} of ranges){
        const owner=paragraph??formula??table.owner;
        if(sources.has(owner.filePath)&&sources.get(owner.filePath)!==owner.occurrence)return null;
        sources.set(owner.filePath,owner.occurrence);
      }
      if(ranges.length<2||ranges.some(({paragraph},index)=>paragraph&&(paragraph.tableCell||
        paragraph.heading&&index>0&&index<ranges.length-1||
        paragraph.container&&!editableRangeContainers.has(paragraph.container.type))))return null;
      const edits=ranges.map(({paragraph,formula,table,from,to},index)=>{
        if(table){
          const {from16:start,to16:end,owner}=table;
          if(!documentRegions.some(region=>region.path===owner.filePath&&
            (region.occurrence??0)===(owner.occurrence??0)&&start>=region.from&&end<=region.to))return null;
          return {table,source:owner.source.slice(0,start)+owner.source.slice(end),patch:{from:0,to:end-start,insert:''}};
        }
        if(formula){
          const {outerFrom16:start,outerTo16:end,filePath,source}=formula;
          if(!documentRegions.some(region=>region.path===filePath&&start>=region.from&&end<=region.to))return null;
          if(fileOf(first)===filePath&&first.docOffset>=start&&first.docOffset<end||
             fileOf(last)===filePath&&last.docOffset>start&&last.docOffset<=end)return null;
          return {formula,source:source.slice(0,start)+source.slice(end),patch:{from:0,to:end-start,insert:''}};
        }
        const firstPart=paragraph.parts[0],lastPart=paragraph.parts.at(-1);
        const from16=from===0&&firstPart?.kind==='text'?firstPart.from16:from;
        const to16=to===paragraph.text.length&&lastPart?.kind==='text'?lastPart.to16:to;
        const edit=textEdit(sourceProjection,{paragraph,from16,to16,insert:index===0?insert:''});
        const wholeParagraph=index>0&&index<ranges.length-1&&from16===0&&to16===paragraph.text.length;
        return edit&&(wholeParagraph||edit.text.trim())?{...edit,paragraph}:null;
      });
      if(edits.some(edit=>!edit))return null;
      const [start]=edits;
      const updates=edits.flatMap(({paragraph,formula,table,patch})=>{
        const owner=paragraph??formula??table.owner,to=paragraph?.from16??formula?.outerFrom16??table.from16;
        return owner.filePath===start.paragraph.filePath?[{offset:to,patch}]:[];
      }).sort((left,right)=>right.offset-left.offset);
      const source=updates.reduce((value,{offset,patch})=>value.slice(0,offset+patch.from)+
        (patch.latex??patch.insert)+value.slice(offset+patch.to),start.paragraph.source);
      return selection.record({kind:'project-range',edits,paragraph:start.paragraph,source},
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
      if(!extend&&delta===1&&before.kind==='math'&&math.leaveFormatting())return true;
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
    moveVertical(direction,extend,jumpPage=false,viewport){
      const from=selection.caret;
      if(!from||Math.abs(direction)!==1)return false;
      preferredX??=from.x;
      const anchor=extend?selection.anchor:null;
      const currentY=viewport?.position(from);
      const useViewport=Number.isFinite(currentY);
      let target=null,targetPage=Infinity,targetY=Infinity,targetX=Infinity;
      for(const stop of selection.stops){
        if(stop===from||fileOf(stop)!==fileOf(from)&&order(stop)<0||
            (from.kind==='math'&&anchor?.kind!=='text'&&!sameFormula(from,stop))||
            (anchor&&!canSelect(anchor,stop)))continue;
        let pageDelta=0,distanceY;
        if(useViewport){
          const distance=(viewport.position(stop)-currentY)*direction;
          if(!Number.isFinite(distance)||distance<=2)continue;
          distanceY=Math.abs(distance-viewport.height);
        }else{
          pageDelta=(stop.page-from.page)*direction;
          const yDelta=(center(stop)-center(from))*direction;
          const minLineGap=Math.min(from.bottom-from.top,stop.bottom-stop.top)/2;
          if(pageDelta<0||(!pageDelta&&(jumpPage||yDelta<=minLineGap)))continue;
          distanceY=jumpPage?Math.abs(yDelta):pageDelta?(direction>0?center(stop):-center(stop)):yDelta;
        }
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
        fileOf(stop)===fileOf(caret)&&copyOf(stop)===copyOf(caret)&&stop.docOffset>=caret.formula.to16);
      return following?selection.selectTargets(following,following):false;
    },
    editAdjacentFormula(){
      const caret=selection.caret;
      if(!caret||caret!==selection.anchor)return false;
      let related=caret;
      if(caret.kind==='text'){
        const {source}=caret.paragraph,offset=caret.docOffset;
        const adjacent=selection.stops.filter(stop=>stop.kind==='math'&&order(stop)===order(caret)&&
          fileOf(stop)===fileOf(caret)&&copyOf(stop)===copyOf(caret)&&stop.formula.source===source);
        related=adjacent.find(({formula})=>formula.outerFrom16>=offset&&
          !source.slice(offset,formula.outerFrom16).trim())??adjacent.findLast(({formula})=>
          formula.outerTo16<=offset&&!source.slice(formula.outerTo16,offset).trim());
      }
      const last=related&&selection.stops.findLast(stop=>stop.kind==='math'&&sameFormula(stop,related));
      if(!last)return false;
      preferredX=null;
      return selection.selectTargets(last,last);
    },
    selectRegion({path,from,to,source,heading,occurrence=0}){
      const first=selection.stops.find(stop=>fileOf(stop)===path&&stop.docOffset>=from&&stop.docOffset<=to&&
        copyOf(stop)===occurrence&&
        (source===undefined||(stop.paragraph??stop.formula).source===source)&&
        (heading===undefined||stop.paragraph?.heading===heading));
      return first?selection.selectTargets(first,first):false;
    },
    selectTextRange({path,source,from,to}){
      const stopAt=offset=>selection.stops.find(stop=>stop.kind==='text'&&stop.paragraph.filePath===path&&
        stop.paragraph.source===source&&stop.docOffset===offset);
      const start=stopAt(from),end=stopAt(to);
      return Boolean(start&&end&&sameParagraph(start,end)&&selection.selectTargets(start,end));
    },
    expectInitialText(edit,offset,path){
      const caret=selection.caret,occurrence=caret&&fileOf(caret)===path?copyOf(caret):0;
      selection.record(edit,offset,{kind:'text',paragraph:{filePath:path,occurrence}});
    },
    expectInitialMath(edit,offset,path){
      const caret=selection.caret,occurrence=caret&&fileOf(caret)===path?copyOf(caret):0;
      selection.record(edit,offset,{kind:'math',formula:{filePath:path,occurrence}});
    },
    reset(){selection.reset();sourceProjection=null;preferredX=null;observedStops=[];documentRegions=[];orderByFile.clear();displayEdges.clear();},
  };
}
