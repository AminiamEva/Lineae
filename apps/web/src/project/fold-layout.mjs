export function foldPagePlan(ranges,{pageHeight,pageGap,marginTop,marginBottom,pageCount}){
  ranges=ranges.filter((range,index)=>!ranges.some((other,otherIndex)=>otherIndex!==index&&other.from<=range.from&&other.to>=range.to&&(other.from<range.from||other.to>range.to||otherIndex<index)));
  const pitch=pageHeight+pageGap,skipped=new Set();
  for(const range of ranges){
    const first=Math.max(0,Math.floor(range.from/pitch));
    const last=Math.min(pageCount-1,Math.floor((range.to-.01)/pitch));
    for(let page=first+1;page<last;page++){
      if(range.from<=page*pitch+marginTop&&range.to>=(page+1)*pitch-pageGap-marginBottom)skipped.add(page);
    }
  }
  const before=point=>[...skipped].filter(page=>(page+1)*pitch<=point+.1).length*pitch;
  const placeholders=[];
  for(const range of ranges)for(let page=0;page<pageCount;page++){
    if(skipped.has(page))continue;
    const from=Math.max(range.from,page*pitch+marginTop),to=Math.min(range.to,page*pitch+pageHeight-marginBottom);
    if(to-from>1)placeholders.push({path:range.path,page:page+1,top:from-before(from),height:to-from});
  }
  return {skipped:[...skipped].sort((a,b)=>a-b),pageNumbers:Array.from({length:pageCount},(_,i)=>i).filter(i=>!skipped.has(i)).map(i=>i+1),placeholders,shift:before,height:pageCount*pageHeight+Math.max(0,pageCount-1)*pageGap-skipped.size*pitch};
}

export function documentLayoutBlocks(editable){
  const elements=[],selectors=[];
  Array.from(editable.children).forEach((element,index)=>{
    const selector=':nth-child('+(index+1)+')';
    if(element.matches('[data-project-region]')){
      if(element.dataset.emptyRegion==='true')return;
      Array.from(element.children).forEach((child,childIndex)=>{
        elements.push(child);selectors.push(selector+'>:nth-child('+(childIndex+1)+')');
      });
    }else{elements.push(element);selectors.push(selector);}
  });
  return {elements,selectors};
}
