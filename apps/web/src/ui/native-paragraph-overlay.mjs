import {blinkCaret} from '../editor/caret-motion.js';
import {paragraphHit} from '../typesetting/rtex/paragraph-geometry.mjs';

// The document model and the IME always own the same mounted editable node.
// The paper owns confirmed pixels. A dirty paragraph temporarily owns its ink
// and masks only its old native rows until both representations match again.
export function nativeParagraphOverlay(editor, panel, pages, framePending) {
  const page=editor.closest('.document-page'),main=page.closest('main');
  const metrics=document.createElement('canvas').getContext('2d');
  let number=1, anchor=null, block=null, frame=0, layout=null, revision=-1, composing=false;
  let maskOwner=null, maskPage=0, marker=null, finishMark=null, masks=[];
  const removedInk=new Map();
  const sheetFor=n=>pages.querySelector('[data-native-page="'+n+'"],[data-pdf-page="'+n+'"]');
  const canvas=(n=number)=>sheetFor(n)?.querySelector('canvas');
  function selectedBlock(){
    const selection=document.getSelection();
    const target=page.contains(document.activeElement)&&document.activeElement!==editor
      ? document.activeElement : selection?.focusNode;
    const element=target?.nodeType===1?target:target?.parentElement;
    const candidate=element?.closest('p,h1,h2,h3,h4,h5,h6,.math-display,pre,figcaption,[contenteditable=true]');
    return candidate && candidate!==editor && page.contains(candidate)?candidate:
      editor.querySelector('.math-display.ProseMirror-selectednode');
  }
  function rangePoint(element,offset) {
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{
      acceptNode:n=>n.nodeType===Node.TEXT_NODE || n.nodeName==='BR' ? NodeFilter.FILTER_ACCEPT :
        n.matches('[contenteditable=false],.ProseMirror-widget') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP
    });
    let left=offset, node;
    while((node=walker.nextNode())){
      if(node.nodeName==='BR'){left--;continue;}
      if(left>node.length){left-=node.length;continue;}
      if(left<0 || !node.length) continue;
      const r=document.createRange(),end=left===node.length;
      r.setStart(node,end?left-1:left);r.setEnd(node,end?left:left+1);
      const rect=r.getBoundingClientRect();
      if(rect.height)return {x:end?rect.right:rect.left,top:rect.top,element:node.parentElement};
    }
    return null;
  }
  function editingText(element) {
    const view=editor.editor?.view, selection=view?.state.selection;
    if(selection?.$head.depth && view.nodeDOM(selection.$head.before())===element){
      const node=selection.$head.parent;
      if(node.isTextblock)return node.textBetween(0,node.content.size,'','\n');
    }
    return element.textContent;
  }
  function selectionOffset(element) {
    const selection=document.getSelection();
    if(!selection?.isCollapsed||!element.contains(selection.focusNode))return null;
    const view=editor.editor?.view, head=view?.state.selection.$head;
    if(head?.depth && view.nodeDOM(head.before())===element)return head.parentOffset;
    const r=document.createRange();r.selectNodeContents(element);
    r.setEnd(selection.focusNode,selection.focusOffset);
    return r.toString().length;
  }
  function ascent(element,scale) {
    const s=getComputedStyle(element);
    metrics.font=s.fontStyle+' '+s.fontWeight+' '+s.fontSize+' '+s.fontFamily;
    return (metrics.measureText('Mg').fontBoundingBoxAscent||parseFloat(s.fontSize)*.8)*scale;
  }
  function clearExact() {
    main.classList.remove('native-ink-confirmed');
    marker?.remove(); marker=null;
    finishMark?.remove(); finishMark=null;
  }
  function coverRows(paragraph,onlyPage){
    const covered=[];
    for(const row of paragraph?.rows??[]){
      if(onlyPage && row.page!==onlyPage)continue;
      const sheet=sheetFor(row.page);
      if(!sheet || sheet.dataset.paintRevision!==String(revision))continue;
      const m=document.createElement('span');m.className='native-draft-mask';m.setAttribute('aria-hidden','true');
      Object.assign(m.style,{left:'calc('+row.left*100+'% - 1px)',width:'calc('+(row.right-row.left)*100+'% + 2px)',
        top:'calc('+row.top*100+'% - 1px)',height:'calc('+(row.bottom-row.top)*100+'% + 2px)'});
      sheet.append(m);covered.push(m);
    }
    return covered;
  }
  function mask(paragraph) {
    if(maskOwner===paragraph && maskPage===number && masks.every(m=>m.isConnected))return;
    for(const m of masks)m.remove();
    maskOwner=paragraph;maskPage=number;masks=coverRows(paragraph,number);
  }
  function clearRemovedInk(){
    for(const items of removedInk.values())for(const mask of items)mask.remove();
    removedInk.clear();
  }
  function hideRemovedInk(){
    const previous=layout?.byElement.get(block);
    if(previous && !editor.contains(block) && !removedInk.has(previous))removedInk.set(previous,coverRows(previous));
  }
  function confirmedCaret(stop,paragraph,height,scale) {
    const sheet=sheetFor(stop.row.page);
    if(!marker){
      marker=document.createElement('span');marker.className='native-rich-caret';marker.setAttribute('aria-hidden','true');
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)blinkCaret(marker);
    }
    if(marker.parentElement!==sheet)sheet.append(marker);
    marker.style.left=stop.x*100+'%';marker.style.top=stop.y*100+'%';
    marker.style.height=height+'px';marker.style.transform='translateY(-'+ascent(block,scale)+'px)';
    const end=paragraph.stops.get(paragraph.entry.text.length);
    if(end && page.dataset.formattingMarks==='true'){
      if(!finishMark){finishMark=document.createElement('span');finishMark.className='native-rich-endmark';finishMark.setAttribute('aria-hidden','true');finishMark.textContent='¶';}
      const last=sheetFor(end.row.page);
      if(last && last.dataset.paintRevision===String(revision)){
        if(finishMark.parentElement!==last)last.append(finishMark);
        finishMark.style.left=end.x*100+'%';finishMark.style.top=end.y*100+'%';finishMark.style.fontSize=height*.60+'px';
      }else finishMark.remove();
    }else {finishMark?.remove();finishMark=null;}
    main.classList.add('native-ink-confirmed');
  }
  function referenceFor(paragraph,scale) {
    if(paragraph){
      const offset=selectionOffset(block),old=paragraph.entry.text, live=editingText(block);
      if(!composing && offset!==null && old===live && paragraph.stops?.has(offset))
        return {stop:paragraph.stops.get(offset),offset,exact:true};
      // Anchor the common prefix nearest the edit, including wrapped lines.
      let i=0,limit=Math.min(offset??0,live.length,old?.length??0);
      while(i<limit&&old[i]===live[i])i++;
      while(i>0&&!paragraph.stops?.has(i))i--;
      const first=paragraph.rows[0];
      return {offset:i,stop:paragraph.stops?.get(i)??{row:first,x:first.left,y:first.baseline}};
    }
    // Consecutive empty editor paragraphs have no TeX line boxes. New ink
    // starts below the last authored line, independent of how many Enters
    // were used to reach it. DOM-only paragraphs still being typed count once.
    let distance=1;
    for(let prev=block?.previousElementSibling;prev;prev=prev.previousElementSibling){
      const prior=layout?.byElement.get(prev);
      if(prior){
        const last=prior.rows.at(-1),sheet=canvas(last.page)?.getBoundingClientRect();
        if(!sheet?.height)break;
        const lineHeight=parseFloat(getComputedStyle(block).lineHeight)*scale/sheet.height;
        if(!Number.isFinite(lineHeight))break;
        const first=prior.rows[0],x=block.matches('p')&&prev.matches('p')?first.left:null;
        return {offset:0,stop:{row:last,x,y:last.baseline+lineHeight*distance}};
      }
      if(prev.textContent.trim() || prev.matches('.math-display,figure,table'))distance++;
    }
    return null;
  }
  function position(){
    if(block&&!editor.contains(block)){hideRemovedInk();block=selectedBlock();anchor=null;}
    const scale=page.currentCSSZoom||page.getBoundingClientRect().width/page.offsetWidth;
    if(!Number.isFinite(scale)||scale<=0)return;
    const paragraph=layout?.byElement.get(block);
    let reference=block&&referenceFor(paragraph,scale);
    if(reference && sheetFor(reference.stop.row.page)?.dataset.paintRevision!==String(revision))reference=null;
    if(reference)number=reference.stop.row.page;
    const current=canvas(),sheet=page.querySelector('.document-sheets')?.children[number-1]??page;
    if(!current)return;
    const box=current.getBoundingClientRect(),paper=sheet.getBoundingClientRect();
    let shiftX=box.left-paper.left,shiftY=box.top-paper.top;
    const bounds=block?.getBoundingClientRect();
    const target=reference?.stop;
    if(target && bounds){
      let point;
      const s=document.getSelection();
      if(!composing && s?.rangeCount && selectionOffset(block)===reference.offset){
        const rect=s.getRangeAt(0).getBoundingClientRect();
        if(rect.height)point={x:rect.left,top:rect.top,element:s.focusNode.parentElement??block};
      }
      point??=rangePoint(block,reference.offset);
      const style=getComputedStyle(block);
      const fallbackX=bounds.left+((parseFloat(style.paddingLeft)||0)+(parseFloat(style.textIndent)||0))*scale;
      if(Number.isFinite(target.x))shiftX=box.left+target.x*box.width-(point?.x??fallbackX);
      shiftY=box.top+target.y*box.height-(point?.top??bounds.top)-ascent(point?.element??block,scale);
    }else if(bounds && anchor?.block?.isConnected){
      const point=rangePoint(anchor.block,0);
      if(point && Number.isFinite(anchor.x))shiftX=box.left+anchor.x*box.width-point.x;
      shiftY=box.top+anchor.y*box.height-(point?.top??anchor.block.getBoundingClientRect().top);
    }
    // Invert the *applied* CSS translation, not successive measurement
    // deltas. Scrolling, zoom changes and re-entering a page are idempotent.
    const applied=getComputedStyle(page).translate.split(' ').map(parseFloat);
    const x=(Number.isFinite(applied[0])?applied[0]:0)+shiftX/scale;
    const y=(Number.isFinite(applied[1])?applied[1]:0)+shiftY/scale;
    const shift=x.toFixed(4)+'px '+y.toFixed(4)+'px';
    if(page.style.getPropertyValue('--native-edit-shift')!==shift)page.style.setProperty('--native-edit-shift',shift);
    if(!bounds)return;
    const viewport=panel.getBoundingClientRect(),host=main.getBoundingClientRect();
    const top=Math.max(bounds.top+shiftY-1,box.top,viewport.top),bottom=Math.min(bounds.bottom+shiftY+1,box.bottom,viewport.bottom);
    const gutter=block.matches('h1,h2,h3')?32*scale:2;
    const left=Math.max(bounds.left+shiftX-gutter,box.left,viewport.left),right=Math.min(bounds.right+shiftX+2,box.right,viewport.left+panel.clientWidth);
    main.style.setProperty('--native-edit-clip','inset('+(top-host.top)+'px '+(host.right-right)+'px '+(host.bottom-bottom)+'px '+(left-host.left)+'px)');
    if(reference?.exact){
      mask(null);confirmedCaret(target,paragraph,parseFloat(getComputedStyle(block).lineHeight)*scale||16,scale);
    }else{clearExact();mask(paragraph??null);}
  }
  // On Enter the editing clip moves immediately, but a cold TeX pass may
  // still be drawing the preceding paragraph. Bridge ordinary prose only.
  const pendingRows=new Map();
  function releaseRows(revision){
    for(const [element,row] of pendingRows){
      if(revision!==undefined&&row.isConnected&&row.parentElement.dataset.paintRevision!==String(revision))continue;
      row.remove();pendingRows.delete(element);
    }
  }
  function retainText(previous){
    const surface=canvas();
    if(layout?.byElement.get(previous)?.entry.text===previous?.textContent && previous)return;
    if(!surface || !previous?.textContent.trim() || !previous.isConnected || !previous.matches('p,h1,h2,h3') ||
       previous.querySelector('math-field,img,input,[contenteditable=false]'))return;
    const sheet=surface.getBoundingClientRect(),rect=previous.getBoundingClientRect();
    if(!sheet.width || rect.top<sheet.top || rect.bottom>sheet.bottom)return;
    const row=document.createElement('div'),style=getComputedStyle(previous);
    const scale=rect.width/previous.offsetWidth;
    if(!Number.isFinite(scale)||scale<=0)return;
    function copyTextStyle(target,computed){
      for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','fontVariant','lineHeight','fontFeatureSettings',
        'letterSpacing','wordSpacing','whiteSpace','textAlign','textIndent','direction','color','textDecoration','verticalAlign'])
        target.style[key]=computed[key];
    }
    copyTextStyle(row,style);
    if(previous.hasAttribute('data-section-number')&&getComputedStyle(previous,'::before').content!=='none'){
      const prefix=document.createElement('span');
      prefix.textContent=previous.getAttribute('data-section-number');
      prefix.style.marginInlineEnd=getComputedStyle(previous,'::before').marginInlineEnd;
      row.append(prefix);
    }
    function copyInline(parent,target){
      for(const child of parent.childNodes){
        if(child.nodeType===Node.TEXT_NODE){target.append(document.createTextNode(child.data));continue;}
        if(child.nodeType!==Node.ELEMENT_NODE)continue;
        const copy=document.createElement(child.tagName==='BR'?'br':'span');
        copyTextStyle(copy,getComputedStyle(child));
        copyInline(child,copy);target.append(copy);
      }
    }
    copyInline(previous,row);
    Object.assign(row.style,{position:'absolute',background:'white',pointerEvents:'none',
      overflow:'hidden',transformOrigin:'top left',transform:'scale('+scale+')',
      left:((rect.left-sheet.left)/sheet.width*100)+'%',top:((rect.top-sheet.top)/sheet.height*100)+'%',
      width:(rect.width/scale)+'px',height:(rect.height/scale)+'px'});
    row.className='native-pending-prose';
    row.setAttribute('aria-hidden','true');
    const indent=parseFloat(style.textIndent);
    if(indent>4){
      row.style.setProperty('--pending-indent',(indent-4)+'px');
      row.style.setProperty('--pending-midline',(parseFloat(style.lineHeight)/2)+'px');
      row.dataset.indented='true';
    }
    pendingRows.get(previous)?.remove();
    surface.parentElement.append(row);
    pendingRows.set(previous,row);
  }
  function update(){
    if(!document.body.classList.contains('native-tex-rich-edit'))return;
    const next=selectedBlock();
    if(next && block!==next){
      hideRemovedInk();
      if(framePending() && block?.nextElementSibling===next && layout?.byElement.get(block)?.entry.text!==block.textContent)retainText(block);
      pendingRows.get(next)?.remove();pendingRows.delete(next);
      if(block?.nextElementSibling!==next)anchor=null;
      block=next;
    }
    position();
  }
  function followCaret(){
    if(!document.body.classList.contains('native-tex-rich-edit')||!editor.contains(document.activeElement))return;
    const selection=document.getSelection();
    if(!selection?.rangeCount||!editor.contains(selection.focusNode))return;
    const range=selection.getRangeAt(0).cloneRange();
    range.collapse(selection.focusNode===range.startContainer&&selection.focusOffset===range.startOffset);
    const caret=range.getBoundingClientRect();
    if(!caret.height)return;
    const sheets=page.querySelector('.document-sheets')?.children;
    const y=(caret.top+caret.bottom)/2;
    let low=0,high=(sheets?.length??0)-1,index=-1;
    while(low<=high){
      const middle=(low+high)>>>1,rect=sheets[middle].getBoundingClientRect();
      if(y<rect.top)high=middle-1;
      else if(y>rect.bottom)low=middle+1;
      else {index=middle;break;}
    }
    if(!layout?.byElement.has(block) && index>=0 && index+1!==number && pages.querySelector('[data-native-page="'+(index+1)+'"],[data-pdf-page="'+(index+1)+'"]')){
      number=index+1;anchor=null;position();
    }
    const rect=range.getBoundingClientRect(),view=panel.getBoundingClientRect();
    if(rect.bottom>view.bottom-8)panel.scrollTop+=rect.bottom-view.bottom+8;
    else if(rect.top<view.top+8)panel.scrollTop+=rect.top-view.top-8;
  }
  function schedule(){
    if(frame||!document.body.classList.contains('native-tex-rich-edit'))return;
    frame=requestAnimationFrame(()=>{frame=0;update();});
  }
  panel.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  window.addEventListener('lineae-layout',schedule);
  document.addEventListener('selectionchange',schedule);
  page.addEventListener('focusin',schedule);
  function beginDraft(){
    if(!document.body.classList.contains('native-tex-rich-edit'))return;
    clearExact();mask(layout?.byElement.get(block)??null);
  }
  page.addEventListener('beforeinput',beginDraft,true);
  page.addEventListener('compositionstart',()=>{composing=true;beginDraft();},true);
  page.addEventListener('compositionend',()=>{composing=false;schedule();},true);
  page.addEventListener('input',schedule);
  let followFrame=0;
  page.addEventListener('keyup',()=>{
    if(!followFrame)followFrame=requestAnimationFrame(()=>{followFrame=0;followCaret();});
  });
  main.addEventListener('pointerdown',event=>{
    if(!block || event.button!==0 || !document.body.classList.contains('native-tex-rich-edit'))return;
    if(block.contains(event.target)&&!block.textContent.trim())return;
    if(event.target.closest('math-field,button,input,img,[contenteditable=false]'))return;
    const range=document.createRange();
    range.selectNodeContents(block);
    if([...range.getClientRects()].some(r=>event.clientX>=r.left-2 && event.clientX<=r.right+2 &&
      event.clientY>=r.top-2 && event.clientY<=r.bottom+2))return;
    event.preventDefault();event.stopPropagation();
    panel.dispatchEvent(new Event('lineae-native-paper-blank'));
  },true);
  main.addEventListener('wheel',event=>{
    if(!document.body.classList.contains('native-tex-rich-edit')||event.ctrlKey||event.metaKey)return;
    event.preventDefault();
    const unit=event.deltaMode===1?16:event.deltaMode===2?panel.clientHeight:1;
    panel.scrollBy(event.deltaX*unit,event.deltaY*unit);
  },{passive:false});
  return {
    begin(pageNumber){
      number=pageNumber||1;block=null;anchor=null;
      document.body.classList.add('native-tex-rich-edit');
      position();
    },
    reveal(target,y,x){
      block=target??selectedBlock()??editor.firstElementChild;
      pendingRows.get(block)?.remove();pendingRows.delete(block);
      anchor=Number.isFinite(y)?{block,y,x}:null;
      position();schedule();
    },
    present(next,stamp){
      if(next!==layout)clearRemovedInk();
      layout=next;revision=stamp;
      for(const [element,row] of pendingRows){
        const confirmed=layout?.byElement.get(element);
        if(confirmed?.entry.text===element.textContent && confirmed.rows.every(r=>sheetFor(r.page)?.dataset.paintRevision===String(revision))){
          row.remove();pendingRows.delete(element);
        }
      }
      if(document.body.classList.contains('native-tex-rich-edit'))update();
    },
    hit(page,x,y){
      if(sheetFor(page)?.dataset.paintRevision!==String(revision))return null;
      const hit=paragraphHit(layout,page,x,y);
      return hit?.element.isConnected && editingText(hit.element)===hit.text ? hit:null;
    },
    update:schedule,releaseRows,
    clear(retain=false){
      if(retain)retainText(block);
      else releaseRows();
      cancelAnimationFrame(followFrame);followFrame=0;
      cancelAnimationFrame(frame);frame=0;anchor=null;block=null;composing=false;clearExact();mask(null);
      if(!retain)clearRemovedInk();
      main.style.removeProperty('--native-edit-clip');page.style.removeProperty('--native-edit-shift');
      document.body.classList.remove('native-tex-rich-edit');
    }
  };
}
