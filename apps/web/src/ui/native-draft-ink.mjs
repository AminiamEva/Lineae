import {markCenter,paragraphEndMarker} from '../editor/paragraph-marks.mjs';

const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const eastAsian=/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\u3000-\u303f\uff00-\uffef]/u;

// Keep completed edits visible while TeX is working. These fragments come
// from the *laid-out* editable DOM; a second paragraph layout would wrap and
// clip the text differently. No element here accepts input.
export function snapshotDraft(block,sheets,measure) {
  sheets=sheets.filter(sheet=>sheet.box.width>0 && sheet.box.height>0);
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
  let firstBaseline=null,lastEnd=null;
  function paintText(text,rect,parent,wholeJustifiedLine=false) {
    if(!text || !rect.height || !rect.width)return;
    const style=getComputedStyle(parent);
    const fontBox=measure(parent,String.fromCodePoint(text.codePointAt(0)));
    const baseline=rect.top+fontBox.aboveRange*scale;
    firstBaseline??=baseline;
    lastEnd={x:rect.right,y:baseline};
    const place=point(rect.left,baseline);
    if(!place)return;
    const ink=doc.createElement('span');
    for(const prop of ['fontFamily','fontSize','fontStyle','fontWeight','fontStretch','fontVariant','fontFeatureSettings','fontKerning',
      'lineHeight','letterSpacing','wordSpacing','color','textDecoration','direction','textTransform'])
      ink.style[prop]=style[prop];
    ink.style.position='absolute';ink.style.whiteSpace='pre';ink.style.textIndent='0';
    if(wholeJustifiedLine){
      // Give the browser the width of this *already broken* line, including
      // any trailing space. It can reproduce its own justification and font
      // shaping in one pass, without an element or font probe per character.
      ink.style.width=rect.width/scale+'px';ink.style.textAlign='justify';
      ink.style.textAlignLast='justify';ink.style.textJustify=style.textJustify;
    }
    ink.style.left=place.left;ink.style.top=place.top;ink.style.transformOrigin='0 0';
    ink.style.transform='scale('+scale+') translateY(-'+fontBox.aboveLine+'px)';
    ink.textContent=text;
    place.group.append(ink);
  }
  const onlyText=block.firstChild?.nodeType===Node.TEXT_NODE &&
    [...block.childNodes].slice(1).every(n=>n.nodeType===Node.ELEMENT_NODE && n.matches('br.ProseMirror-trailingBreak'));
  function oneLine(rects){
    // A hanging space in pre-wrap can have its own rectangle on the same row.
    return rects.length<=1 || Math.abs(rects[0].top-rects[rects.length-1].top)<.25;
  }
  function paintLine(node,from,to){
    const text=node.data.slice(from,to);
    const style=getComputedStyle(node.parentElement);
    const emit=(start,end)=>{
      range.setStart(node,from+start);range.setEnd(node,from+end);
      paintText(text.slice(start,end),range.getBoundingClientRect(),node.parentElement);
    };
    if(!style.textAlign.startsWith('justify')){emit(0,text.length);return;}
    if((onlyText || (from>0 && to<node.length)) && style.direction==='ltr'){
      range.setStart(node,from);range.setEnd(node,to);
      paintText(text,range.getBoundingClientRect(),node.parentElement,true);return;
    }
    // Justification is computed for the entire line. A detached span loses
    // the extra space between words and between Han glyphs. Retain the
    // measured origins of those runs, keeping Latin ligatures shaped together.
    for(const match of text.matchAll(/\s+|\S+/gu)){
      const start=match.index,end=start+match[0].length;
      if(!eastAsian.test(match[0]) && style.textJustify!=='inter-character'){
        emit(start,end);continue;
      }
      let word=start;
      for(const {segment,index} of graphemes.segment(match[0])){
        if(!eastAsian.test(segment) && style.textJustify!=='inter-character')continue;
        const at=start+index;
        if(at>word)emit(word,at);
        word=at+segment.length;emit(at,word);
      }
      if(word<end)emit(word,end);
    }
  }
  function textRuns(node) {
    let from=0;
    while(from<node.length){
      range.setStart(node,from);range.setEnd(node,node.length);
      const rects=range.getClientRects();
      if(!rects.length)return;
      let to=node.length;
      if(!oneLine(rects)){
        // Long lines cost logarithmic range measurements, not one per glyph.
        let lo=from+1,hi=to;
        while(lo<hi){
          const mid=Math.ceil((lo+hi)/2);
          range.setEnd(node,mid);
          if(oneLine(range.getClientRects()))lo=mid;else hi=mid-1;
        }
        to=lo;
        if(to<node.length && /[\uDC00-\uDFFF]/.test(node.data[to]))to++;
        range.setEnd(node,to);
      }
      paintLine(node,from,to);
      from=to;
    }
  }
  const walker=doc.createTreeWalker(block,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{
    acceptNode(n){
      if(n.nodeType===Node.TEXT_NODE || n.matches('math-field,img'))return NodeFilter.FILTER_ACCEPT;
      return n.matches('.ProseMirror-widget,.ProseMirror-trailingBreak,.math-drag-handle')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_SKIP;
    },
  });
  let node;
  while((node=walker.nextNode())){
    if(node.nodeType===Node.TEXT_NODE){if(!node.parentElement.closest('math-field'))textRuns(node);continue;}
    const formula=node.matches('math-field');
    const painted=formula?node.shadowRoot?.querySelector('.ML__latex'):node;
    if(!painted)continue;
    const rect=painted.getBoundingClientRect(),place=point(rect.left,rect.top);
    if(!place)continue;
    let copy;
    if(formula){
      // Preserve the glyphs MathLive has already shaped. Mounting a second
      // field queues a fresh layout and briefly paints an empty input frame.
      copy=doc.createElement('span');
      copy.className='native-pending-formula';
      const shadow=copy.attachShadow({mode:'open'}),source=node.shadowRoot;
      shadow.adoptedStyleSheets=source.adoptedStyleSheets;
      for(const style of source.querySelectorAll('style'))shadow.append(style.cloneNode(true));
      const glyphs=painted.cloneNode(true);
      const baseline=painted.querySelector(':scope > .ML__strut')?.getBoundingClientRect().bottom;
      if(Number.isFinite(baseline)){
        firstBaseline??=baseline;
        lastEnd={x:rect.right,y:baseline};
      }
      for(const item of glyphs.querySelectorAll('.ML__caret,.ML__text-caret,.ML__latex-caret,.ML__selection'))item.remove();
      for(const item of glyphs.querySelectorAll('.ML__selected,.ML__contains-caret,.ML__contains-highlight'))
        item.classList.remove('ML__selected','ML__contains-caret','ML__contains-highlight');
      const style=getComputedStyle(painted);
      Object.assign(copy.style,{font:style.font,color:style.color,lineHeight:style.lineHeight,display:'block',padding:'0',border:'0',background:'transparent'});
      Object.assign(glyphs.style,{position:'absolute',top:'0',left:'0',margin:'0'});
      shadow.append(glyphs);
    }else{
      copy=node.cloneNode(false);
      copy.removeAttribute('id');
    }
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
  const showMarks=block.matches('p') && block.closest('.document-page')?.dataset.formattingMarks==='true';
  if(showMarks && lastEnd){
    const place=point(lastEnd.x+3*scale,markCenter(lastEnd.y,parseFloat(style.fontSize)*scale));
    const end=paragraphEndMarker(doc);
    Object.assign(end.style,{left:place.left,top:place.top,fontSize:parseFloat(style.lineHeight)*scale*.55+'px'});
    place.group.append(end);
  }
  if(showMarks && lastEnd && indent>6*scale){
    const place=point(x+2*scale,markCenter(firstBaseline,parseFloat(style.fontSize)*scale));
    const mark=doc.createElement('span');
    mark.className='native-pending-indent';
    Object.assign(mark.style,{left:place.left,top:place.top,width:Math.max(0,indent-6*scale)+'px',height:6*scale+'px'});
    place.group.append(mark);
  }
  for(const [sheet,group] of groups)sheet.append(group);
  return [...groups.values()];
}
