import {blinkCaret} from '../editor/caret-motion.js';
import {paragraphHit} from '../typesetting/rtex/paragraph-geometry.mjs';
import {nativeEditMetrics,textBoundary} from './native-edit-metrics.mjs';
import {snapshotDraft} from './native-draft-ink.mjs';
import {changedTextblocks} from '../editor/changed-textblocks.mjs';

// The document model and the IME always own the same mounted editable node.
// The paper owns confirmed pixels. A dirty paragraph temporarily owns its ink
// and masks only its old native rows until both representations match again.
export function nativeParagraphOverlay(editor, panel, pages, framePending) {
  const page=editor.closest('.document-page'),main=page.closest('main');
  const metrics=nativeEditMetrics(editor.ownerDocument);
  let number=1, anchor=null, block=null, frame=0, layout=null, revision=-1, composing=false;
  let pin=null, paintedDocument=null, clickedBoundary=null;
  let maskOwner=null, maskPage=0, marker=null, finishMark=null, masks=[];
  const removedInk=new Map();
  const sheetFor=n=>pages.querySelector('[data-native-page="'+n+'"],[data-pdf-page="'+n+'"]');
  const canvas=(n=number)=>sheetFor(n)?.querySelector('canvas');
  function selectedBlock(){
    const view=editor.editor?.view;
    if(document.activeElement===editor && view && !view.composing && !composing){
      const selection=view.state.selection;
      const active=selection.node?view.nodeDOM(selection.from):
        selection.$head.depth?view.nodeDOM(selection.$head.before()):null;
      if(active?.matches?.('p,h1,h2,h3,h4,h5,h6,.math-display,pre,figcaption'))return active;
    }
    const selection=document.getSelection();
    const target=page.contains(document.activeElement)&&document.activeElement!==editor
      ? document.activeElement : selection?.focusNode;
    const element=target?.nodeType===1?target:target?.parentElement;
    const candidate=element?.closest('p,h1,h2,h3,h4,h5,h6,.math-display,pre,figcaption,[contenteditable=true]');
    return candidate && candidate!==editor && page.contains(candidate)?candidate:
      editor.querySelector('.math-display.ProseMirror-selectednode');
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
  function boundary(block,offset,scale,caret=false) {
    let point=textBoundary(block,offset);
    const s=document.getSelection();
    if(caret && !composing && s?.rangeCount && s.isCollapsed && selectionOffset(block)===offset){
      const rect=s.getRangeAt(0).getBoundingClientRect();
      if(rect.height)point={...point,x:rect.left,top:rect.top,element:s.focusNode.parentElement??block};
    }
    if(point){
      const rise=metrics(point.element,point.char).aboveRange*scale;
      return {x:point.x,y:point.top+rise,rise};
    }
    const box=block.getBoundingClientRect(),style=getComputedStyle(block);
    const rise=metrics(block).aboveLine*scale;
    return {x:box.left+((parseFloat(style.paddingLeft)||0)+(parseFloat(style.textIndent)||0))*scale,
      y:box.top+(parseFloat(style.paddingTop)||0)*scale+rise,rise};
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
    const count=paragraph?.rows.reduce((n,row)=>n+Number(sheetFor(row.page)?.dataset.paintRevision===String(revision)),0)??0;
    if(maskOwner===paragraph && maskPage===number && masks.length===count && masks.every(m=>m.isConnected))return;
    for(const m of masks)m.remove();
    maskOwner=paragraph;maskPage=number;masks=coverRows(paragraph);
  }
  function clearRemovedInk(){
    for(const items of removedInk.values())for(const mask of items)mask.remove();
    removedInk.clear();
  }
  function hideRemovedInk(){
    const previous=layout?.byElement.get(block);
    if(previous && !editor.contains(block) && !removedInk.has(previous))removedInk.set(previous,coverRows(previous));
  }
  function confirmedCaret(stop,paragraph,height,rise) {
    const sheet=sheetFor(stop.row.page);
    if(!marker){
      marker=document.createElement('span');marker.className='native-rich-caret';marker.setAttribute('aria-hidden','true');
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)blinkCaret(marker);
    }
    if(marker.parentElement!==sheet)sheet.append(marker);
    marker.style.left=stop.x*100+'%';marker.style.top=stop.y*100+'%';
    marker.style.height=height+'px';marker.style.transform='translateY(-'+rise+'px)';
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
      const view=editor.editor?.view,head=view?.state.selection.$head;
      const sameNode=!paragraph.entry.node || head?.parent===paragraph.entry.node || head?.parent.eq(paragraph.entry.node);
      if(!composing && sameNode && offset!==null && old===live && paragraph.stops?.has(offset) &&
          (!pin || !framePending() || paintedDocument===view?.state.doc && paintedDocument))
        return {stop:physicalStop(paragraph,offset,scale),offset,exact:true};
      if(pin)return pinnedReference();
      // Anchor the common prefix nearest the edit, including wrapped lines.
      let i=0,limit=Math.min(offset??0,live.length,old?.length??0);
      while(i<limit&&old[i]===live[i])i++;
      while(i>0&&!paragraph.stops?.has(i))i--;
      const first=paragraph.rows[0];
      return {offset:i,stop:paragraph.stops?.get(i)??{row:first,x:first.left,y:first.baseline}};
    }
    if(pin)return pinnedReference();
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
        const first=prior.rows[0],x=paragraphStartX(block,prev.matches('p')?first.origin:null,sheet,scale);
        return {offset:0,stop:{row:last,x,y:last.baseline+lineHeight*distance}};
      }
      if(prev.textContent.trim() || prev.matches('.math-display,figure,table'))distance++;
    }
    return null;
  }
  function physicalStop(paragraph,offset,scale){
    const forward=paragraph.stops.get(offset);
    if(!forward.upstream)return forward;
    if(clickedBoundary?.element===block && clickedBoundary.offset===offset)
      return clickedBoundary.upstream?forward.upstream:forward;
    const point=boundary(block,offset,scale,true);
    function distance(stop){
      const sheet=canvas(stop.row.page)?.getBoundingClientRect();
      if(!sheet)return Infinity;
      return Math.hypot(sheet.left+stop.x*sheet.width-point.x,sheet.top+stop.y*sheet.height-point.y);
    }
    return distance(forward.upstream)<distance(forward)?forward.upstream:forward;
  }
  function pinnedReference(){
    return {offset:pin.offset,stop:{row:{page:pin.page},x:pin.x,y:pin.y},pinned:true};
  }
  function storePin(element,offset,point,canvasRect){
    if(!canvasRect?.height||!canvasRect.width)return;
    pin={element,offset,page:number,x:(point.x-canvasRect.left)/canvasRect.width,y:(point.y-canvasRect.top)/canvasRect.height};
    if(offset===0){
      const indent=paragraphStartX(element,0,canvasRect,page.currentCSSZoom||1);
      if(indent!==null)pin.column=pin.x-indent;
    }
  }
  function paragraphStartX(element,column,box,scale){
    if(!Number.isFinite(column) || !box?.width || !element?.matches('p'))return null;
    const style=getComputedStyle(element);
    if(!['left','start','justify'].includes(style.textAlign) || style.direction==='rtl')return null;
    return column+(parseFloat(style.textIndent)||0)*scale/box.width;
  }
  function pinCurrent(){
    if(!block || pin?.element===block)return;
    const scale=page.currentCSSZoom||1,offset=selectionOffset(block)??0;
    const paragraph=layout?.byElement.get(block);
    let start=0;
    const row=paragraph?.stops?.has(offset)?physicalStop(paragraph,offset,scale).row:null;
    if(row){
      for(const [at,stop] of paragraph.stops)if(stop.row===row){start=at;break;}
    }
    storePin(block,start,boundary(block,start,scale),canvas()?.getBoundingClientRect());
  }
  function position(){
    if(block&&!editor.contains(block)){hideRemovedInk();block=selectedBlock();anchor=null;pin=null;}
    const scale=page.currentCSSZoom||page.getBoundingClientRect().width/page.offsetWidth;
    if(!Number.isFinite(scale)||scale<=0)return;
    const paragraph=layout?.byElement.get(block);
    let reference=block&&referenceFor(paragraph,scale);
    if(reference && !reference.pinned && sheetFor(reference.stop.row.page)?.dataset.paintRevision!==String(revision))
      reference=pin?pinnedReference():null;
    if(reference)number=reference.stop.row.page;
    const current=canvas(),sheet=page.querySelector('.document-sheets')?.children[number-1]??page;
    if(!current)return;
    let box=current.getBoundingClientRect();
    const paper=sheet.getBoundingClientRect();
    let shiftX=box.left-paper.left,shiftY=box.top-paper.top;
    const bounds=block?.getBoundingClientRect();
    let target=reference?.stop,point;
    if(target && bounds){
      point=boundary(block,reference.offset,scale,reference.exact);
      if(reference.exact && pin){
        // Keep the visible insertion line stationary when a whole-document
        // reflow (for example the first ctex character) changes earlier rows.
        const pinned=canvas(pin.page)?.getBoundingClientRect();
        const first=boundary(block,pin.offset,scale);
        const previous=pinned && pinned.top+pin.y*pinned.height+point.y-first.y;
        const viewport=panel.getBoundingClientRect();
        if(pinned && previous>=viewport.top && previous<=viewport.bottom){
          const delta=box.top+target.y*box.height-previous;
          if(Math.abs(delta)>1 && panel.scrollHeight>panel.clientHeight){
            panel.scrollTop+=delta;
            box=current.getBoundingClientRect();
          }
        }
        pin=null;
      }
      if(Number.isFinite(target.x))shiftX=box.left+target.x*box.width-point.x;
      shiftY=box.top+target.y*box.height-point.y;
    }else if(bounds && anchor?.block?.isConnected){
      const point=textBoundary(anchor.block,0);
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
    // A paragraph may span two native sheets. A one-sheet clip used to cut
    // off the parts of that live paragraph above or below the caret's page.
    const top=Math.max(bounds.top+shiftY-1,viewport.top),bottom=Math.min(bounds.bottom+shiftY+1,viewport.bottom);
    const gutter=block.matches('h1,h2,h3')?32*scale:2;
    const left=Math.max(bounds.left+shiftX-gutter,box.left,viewport.left),right=Math.min(bounds.right+shiftX+2,box.right,viewport.left+panel.clientWidth);
    main.style.setProperty('--native-edit-clip','inset('+(top-host.top)+'px '+(host.right-right)+'px '+(host.bottom-bottom)+'px '+(left-host.left)+'px)');
    if(reference?.exact){
      mask(null);confirmedCaret(target,paragraph,parseFloat(getComputedStyle(block).lineHeight)*scale||16,point.rise);
    }else{clearExact();mask(paragraph??null);}
  }
  // A paragraph leaving the editing plane remains visible until the page
  // that contains its replacement has actually been painted.
  const pendingRows=new Map();
  function discard(element){
    const pending=pendingRows.get(element);
    if(!pending)return;
    for(const item of [...pending.ink,...pending.masks])item.remove();
    pendingRows.delete(element);
  }
  function painted(paragraph){
    return paragraph?.rows.every(row=>sheetFor(row.page)?.dataset.paintRevision===String(revision));
  }
  function currentNode(element){
    const view=editor.editor?.view;
    if(!view || !editor.contains(element))return null;
    const pos=view.posAtDOM(element,0);
    return pos<0?null:view.state.doc.resolve(pos).parent;
  }
  function matches(paragraph,element){
    if(!paragraph || !editor.contains(element))return false;
    if(!paragraph.entry.node)return paragraph.entry.text===editingText(element);
    const node=currentNode(element);
    return Boolean(node && paragraph.entry.node.eq(node));
  }
  function settlePending(){
    if(paintedDocument && paintedDocument===editor.editor?.state.doc){
      for(const [old,covers] of removedInk){
        if(old.rows.every(row=>!sheetFor(row.page) || sheetFor(row.page).dataset.paintRevision===String(revision))){
          for(const cover of covers)cover.remove();
          removedInk.delete(old);
        }
      }
    }
    for(const [element,pending] of pendingRows){
      const paragraph=layout?.byElement.get(element);
      const fullyPainted=paintedDocument && paintedDocument===editor.editor?.state.doc &&
        [...pending.pages].every(n=>{
          const sheet=sheetFor(n);
          return !sheet || sheet.dataset.paintRevision===String(revision);
        });
      if(!element.isConnected && pending.owner && !removedInk.has(pending.owner))
        removedInk.set(pending.owner,pending.masks.splice(0));
      if(!element.isConnected || fullyPainted || (painted(paragraph)&&matches(paragraph,element))){
        discard(element);
      }else if(pending.owner!==paragraph || pending.stamp!==revision){
        for(const mask of pending.masks)mask.remove();
        pending.masks=coverRows(paragraph);
        for(const row of paragraph?.rows??[])pending.pages.add(row.page);
        pending.owner=paragraph;pending.stamp=revision;
      }
    }
  }
  function retainText(previous){
    if(!previous?.isConnected || !previous.matches('p,h1,h2,h3,h4,h5,h6,pre,figcaption,.math-display'))return;
    const owner=layout?.byElement.get(previous);
    if(painted(owner)&&matches(owner,previous)){discard(previous);return;}
    const bounds=previous.getBoundingClientRect();
    const sheets=pages.querySelectorAll('[data-native-page],[data-pdf-page]');
    let lo=0,hi=sheets.length;
    while(lo<hi){
      const mid=(lo+hi)>>>1;
      if(sheets[mid].getBoundingClientRect().bottom<bounds.top)lo=mid+1;else hi=mid;
    }
    const visible=[];
    for(let i=lo;i<sheets.length;i++){
      const element=sheets[i];
      const box=element.querySelector('canvas')?.getBoundingClientRect();
      if(!box?.width)continue;
      if(box.top>bounds.bottom)break;
      if(box.bottom>=bounds.top)visible.push({element,box});
    }
    if(!visible.length && canvas())visible.push({element:sheetFor(number),box:canvas().getBoundingClientRect()});
    const ink=snapshotDraft(previous,visible,metrics);
    discard(previous);
    if(ink.length || owner){
      const sheetNumbers=new Set(owner?.rows.map(r=>r.page));
      for(const item of ink)sheetNumbers.add(Number(item.parentElement.dataset.nativePage??item.parentElement.dataset.pdfPage));
      pendingRows.set(previous,{ink,masks:coverRows(owner),pages:sheetNumbers,owner,stamp:revision});
    }
  }
  function update(){
    if(!document.body.classList.contains('native-tex-rich-edit'))return;
    const next=selectedBlock();
    if(next && block!==next){
      const previous=block,adjacent=previous?.nextElementSibling===next;
      const previousRow=layout?.byElement.get(previous)?.rows[0];
      const column=previousRow?.page===number && previous?.matches('p')?previousRow.origin:pin?.column;
      hideRemovedInk();
      if(previous?.isConnected)retainText(previous);
      discard(next);
      if(!adjacent)anchor=null;
      block=next;pin=null;
      if(adjacent && !layout?.byElement.has(next)){
        const scale=page.currentCSSZoom||1;
        const point=boundary(next,0,scale);
        // Empty editing paragraphs are consumed as one separator by TeX.
        if(previous.matches('p')&&!previous.textContent.length)point.y=boundary(previous,0,scale).y;
        const box=canvas()?.getBoundingClientRect();
        storePin(next,0,point,box);
        if(pin && previous.matches('p') && Number.isFinite(column)){
          // Carry the typeset column edge, not the previous paragraph's
          // first glyph. The first Han commit can change ctex's paragraph indent.
          pin.column=column;
          const x=paragraphStartX(next,column,box,scale);
          if(x!==null)pin.x=x;
        }
      }
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
    if(!pin && !layout?.byElement.has(block) && index>=0 && index+1!==number && sheetFor(index+1)){
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
  window.addEventListener('lineae-layout',update);
  document.fonts?.addEventListener('loadingdone',update);
  document.addEventListener('selectionchange',schedule);
  page.addEventListener('focusin',schedule);
  function beginDraft(){
    if(!document.body.classList.contains('native-tex-rich-edit'))return;
    pinCurrent();
    clickedBoundary=null;
    clearExact();mask(layout?.byElement.get(block)??null);
  }
  page.addEventListener('beforeinput',beginDraft,true);
  page.addEventListener('keydown',event=>{
    if(['Enter','Backspace','Delete'].includes(event.key) && !event.isComposing)beginDraft();
  },true);
  page.addEventListener('compositionstart',()=>{composing=true;beginDraft();},true);
  page.addEventListener('compositionend',()=>{composing=false;schedule();},true);
  page.addEventListener('input',schedule);
  editor.editor?.on('transaction',({transaction})=>{
    if(!transaction.docChanged || !document.body.classList.contains('native-tex-rich-edit'))return;
    // A paste, undo or paragraph split can change more than the selection's
    // destination. Process all affected blocks before the next key or paint.
    const view=editor.editor.view,next=selectedBlock();
    for(const pos of changedTextblocks(transaction).keys()){
      const element=view.nodeDOM(pos);
      if(element && element!==next && element!==block)retainText(element);
    }
    if(next && next!==block)update();else schedule();
  });
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
      number=pageNumber||1;block=null;anchor=null;pin=null;
      document.body.classList.add('native-tex-rich-edit');
      position();
    },
    reveal(target,y,x,hit=null){
      block=target??selectedBlock()??editor.firstElementChild;
      discard(block);pin=null;clickedBoundary=hit;
      anchor=Number.isFinite(y)?{block,y,x}:null;
      position();schedule();
    },
    present(next,stamp,doc=null){
      layout=next;revision=stamp;paintedDocument=doc;
      settlePending();
      if(document.body.classList.contains('native-tex-rich-edit'))update();
    },
    painted(){settlePending();update();},
    hit(page,x,y){
      if(sheetFor(page)?.dataset.paintRevision!==String(revision))return null;
      const hit=paragraphHit(layout,page,x,y);
      return hit?.element.isConnected && editingText(hit.element)===hit.text ? hit:null;
    },
    update:schedule,
    clear(retain=false){
      if(retain)retainText(block);
      else for(const element of pendingRows.keys())discard(element);
      cancelAnimationFrame(followFrame);followFrame=0;
      cancelAnimationFrame(frame);frame=0;anchor=null;pin=null;block=null;composing=false;clearExact();mask(null);
      if(!retain)clearRemovedInk();
      main.style.removeProperty('--native-edit-clip');page.style.removeProperty('--native-edit-shift');
      document.body.classList.remove('native-tex-rich-edit');
    }
  };
}
