// Keep completed edits visible while TeX is working. These fragments come
// from the *laid-out* editable DOM; a second paragraph layout would wrap and
// clip the text differently. No element here accepts input.
export function snapshotDraft(block,sheets,measure) {
  if(!block?.isConnected || !sheets.length)return [];
  const doc=block.ownerDocument,scale=block.currentCSSZoom||1;
  const groups=new Map(),range=doc.createRange();
  const point=(x,y)=>{
    let sheet=sheets[0],distance=Infinity;
    for(const candidate of sheets){
      const gap=Math.max(candidate.box.top-y,y-candidate.box.bottom,0);
      if(gap<distance){sheet=candidate;distance=gap;}
      if(!gap)break;
    }
    if(!sheet.box.width||!sheet.box.height)return null;
    let group=groups.get(sheet.element);
    if(!group){
      group=doc.createElement('div');
      group.className='native-pending-prose';
      group.setAttribute('aria-hidden','true');
      group.inert=true;
      group.style.fontFamily=getComputedStyle(block).fontFamily;
      groups.set(sheet.element,group);
    }
    return {group,left:(x-sheet.box.left)*100/sheet.box.width+'%',top:(y-sheet.box.top)*100/sheet.box.height+'%'};
  };
  let firstBaseline=null;
  function paintText(text,rect,parent) {
    if(!text || !rect.height || !rect.width)return;
    const style=getComputedStyle(parent);
    const fontBox=measure(parent,String.fromCodePoint(text.codePointAt(0)));
    const baseline=rect.top+fontBox.aboveRange*scale;
    firstBaseline??=baseline;
    const place=point(rect.left,baseline);
    if(!place)return;
    const ink=doc.createElement('span');
    for(const prop of ['fontFamily','fontSize','fontStyle','fontWeight','fontStretch','fontVariant','fontFeatureSettings','fontKerning',
      'lineHeight','letterSpacing','wordSpacing','color','textDecoration','direction','textTransform'])
      ink.style[prop]=style[prop];
    ink.style.position='absolute';ink.style.whiteSpace='pre';ink.style.textIndent='0';
    ink.style.left=place.left;ink.style.top=place.top;ink.style.transformOrigin='0 0';
    ink.style.transform='scale('+scale+') translateY(-'+fontBox.aboveLine+'px)';
    ink.textContent=text;
    place.group.append(ink);
  }
  function textRuns(node) {
    let from=0;
    while(from<node.length){
      range.setStart(node,from);range.setEnd(node,node.length);
      const rects=range.getClientRects();
      if(!rects.length)return;
      let to=node.length;
      if(rects.length>1){
        // Long lines cost logarithmic range measurements, not one per glyph.
        let lo=from+1,hi=to;
        while(lo<hi){
          const mid=Math.ceil((lo+hi)/2);
          range.setEnd(node,mid);
          if(range.getClientRects().length<=1)lo=mid;else hi=mid-1;
        }
        to=lo;
        if(to<node.length && /[\uDC00-\uDFFF]/.test(node.data[to]))to++;
        range.setEnd(node,to);
      }
      paintText(node.data.slice(from,to),range.getBoundingClientRect(),node.parentElement);
      from=to;
    }
  }
  const walker=doc.createTreeWalker(block,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{
    acceptNode(n){
      if(n.nodeType===Node.TEXT_NODE || n.matches('math-field,img'))return NodeFilter.FILTER_ACCEPT;
      return n.matches('.ProseMirror-widget,.ProseMirror-trailingBreak')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_SKIP;
    },
  });
  let node;
  while((node=walker.nextNode())){
    if(node.nodeType===Node.TEXT_NODE){if(!node.parentElement.closest('math-field'))textRuns(node);continue;}
    const rect=node.getBoundingClientRect(),place=point(rect.left,rect.top);
    if(!place)continue;
    const copy=node.cloneNode(false);
    copy.removeAttribute('id');copy.removeAttribute('autofocus');
    if(node.matches('math-field')){copy.readOnly=true;copy.tabIndex=-1;copy.value=node.value;}
    Object.assign(copy.style,{position:'absolute',left:place.left,top:place.top,margin:'0',
      width:rect.width/scale+'px',height:rect.height/scale+'px',transformOrigin:'0 0',transform:'scale('+scale+')'});
    place.group.append(copy);
  }
  const style=getComputedStyle(block),bounds=block.getBoundingClientRect();
  const label=block.dataset.sectionNumber;
  const x=bounds.left+(parseFloat(style.paddingLeft)||0)*scale;
  const fontBox=measure(block,label?.[0]);
  firstBaseline??=bounds.top+((parseFloat(style.paddingTop)||0)+fontBox.aboveLine)*scale;
  if(label && getComputedStyle(block,'::before').content.startsWith('"'+label+'"')){
    paintText(label,{left:x,top:firstBaseline-fontBox.aboveRange*scale,width:1,height:1},block);
  }
  const indent=(parseFloat(style.textIndent)||0)*scale;
  if(block.matches('p[data-indent=true]') && indent>2*scale && block.closest('.document-page')?.dataset.formattingMarks==='true'){
    const place=point(x+scale,firstBaseline-parseFloat(style.fontSize)*scale*.32);
    const mark=doc.createElement('span');
    mark.className='native-pending-indent';
    Object.assign(mark.style,{left:place.left,top:place.top,width:(indent-2*scale)+'px'});
    place.group.append(mark);
  }
  for(const [sheet,group] of groups)sheet.append(group);
  return [...groups.values()];
}
