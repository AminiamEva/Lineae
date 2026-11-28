import {blinkCaret} from '../editor/caret-motion.js';
import {paragraphHit,paragraphLineEdge} from '../typesetting/rtex/paragraph-geometry.mjs';
import {nativeEditMetrics,textBoundary} from './native-edit-metrics.mjs';
import {snapshotDraft} from './native-draft-ink.mjs';
import {changedTextblocks} from '../editor/changed-textblocks.mjs';
import {markCenter,paragraphEndMarker} from '../editor/paragraph-marks.mjs';

// The document model and the IME always own the same mounted editable node.
// The paper owns confirmed pixels. A dirty paragraph temporarily owns its ink
// and masks only its old native rows until both representations match again.
export function nativeParagraphOverlay(editor, panel, pages, framePending, selectOffset) {
  const page=editor.closest('.document-page'),main=page.closest('main');
  const metrics=nativeEditMetrics(editor.ownerDocument);
  let number=1, anchor=null, block=null, frame=0, layout=null, revision=-1, composing=false;
  let pin=null, paintedDocument=null, clickedBoundary=null;
  let maskOwner=null, maskPage=0, marker=null, finishMark=null, masks=[];
  const removedInk=new Map();
  const sheetFor=n=>pages.querySelector('[data-native-page="'+n+'"],[data-pdf-page="'+n+'"]');
  const canvas=(n=number)=>sheetFor(n)?.querySelector('canvas');
  // A view redraw can replace every paragraph element without a document
  // transaction or a new TeX frame. Positions belong to that exact document.
  function mountedElement(entry) {
    const view=editor.editor?.view;
    return paintedDocument && view?.state.doc===paintedDocument && Number.isInteger(entry.position)
      ? view.nodeDOM(entry.position) : entry.element;
  }
  function paragraphFor(element) {
    const captured=layout?.byElement.get(element);
    const view=editor.editor?.view;
    if(captured || !element || !layout || !paintedDocument || paintedDocument!==view?.state.doc ||
       !editor.contains(element))return captured;
    const insidePos=view.posAtDOM(element,0);
    if(insidePos<0)return null;
    const inside=paintedDocument.resolve(insidePos);
    const pos=inside.depth && inside.parent.isTextblock ? inside.before() : inside.pos;
    const paragraph=layout.byPosition.get(pos);
    return paragraph && mountedElement(paragraph.entry)===element ? paragraph : null;
  }
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
    if(block.matches('.math-display')){
      const shadow=block.querySelector('math-field')?.shadowRoot;
      const ink=shadow?.querySelector('.ML__latex')?.getBoundingClientRect();
      const strut=shadow?.querySelector('.ML__latex > .ML__strut')?.getBoundingClientRect();
      if(ink?.width && strut?.height)return {x:ink.left,y:strut.bottom,rise:strut.bottom-ink.top};
    }
    let point=textBoundary(block,offset);
    const s=document.getSelection();
    if(caret && !composing && s?.rangeCount && s.isCollapsed && selectionOffset(block)===offset){
      const rect=s.getRangeAt(0).getBoundingClientRect();
      if(rect.height)point={...point,x:rect.left,top:rect.top,
        element:s.focusNode.nodeType===1?s.focusNode:s.focusNode.parentElement??block};
    }
    if(point){
      const rise=Number.isFinite(point.baseline)?point.baseline-point.top:metrics(point.element,point.char).aboveRange*scale;
      return {x:point.x,y:point.top+rise,rise};
    }
    const box=block.getBoundingClientRect(),style=getComputedStyle(block);
    const rise=metrics(block).aboveLine*scale;
    // An empty heading still has a generated section number; the trailing
    // break is at the real insertion point beyond that number and its gap.
    const br=block.lastElementChild;
    if(br?.matches('br.ProseMirror-trailingBreak')){
      const range=block.ownerDocument.createRange();
      range.selectNode(br);
      const rect=range.getBoundingClientRect();
      if(rect.height)return {x:rect.left,y:rect.top+metrics(block).aboveRange*scale,rise:metrics(block).aboveRange*scale};
    }
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
      const left=Math.min(row.left,row.origin);
      Object.assign(m.style,{left:'calc('+left*100+'% - 1px)',width:'calc('+(row.right-left)*100+'% + 2px)',
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
    if(previous && !editor.contains(block) && !mountedElement(previous.entry)?.isConnected && !removedInk.has(previous))
      removedInk.set(previous,coverRows(previous));
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
    if(end && block.matches('p') && page.dataset.formattingMarks==='true'){
      if(!finishMark)finishMark=paragraphEndMarker(page.ownerDocument);
      const last=sheetFor(end.row.page);
      if(last && last.dataset.paintRevision===String(revision)){
        if(finishMark.parentElement!==last)last.append(finishMark);
        const scale=page.currentCSSZoom||1,size=parseFloat(getComputedStyle(block).fontSize)*scale;
        finishMark.style.left='calc('+end.x*100+'% + '+3*scale+'px)';
        finishMark.style.top='calc('+end.y*100+'% + '+markCenter(0,size)+'px)';
        finishMark.style.fontSize=height*.55+'px';
      }else finishMark.remove();
    }else {finishMark?.remove();finishMark=null;}
    main.classList.add('native-ink-confirmed');
  }
  function afterHeading(prev,next){
    if(!editor.hasAttribute('data-native-article-sections') || !next.matches('p'))return null;
    const units={H1:2.3,H2:1.5,H3:1.5}[prev.tagName];
    // article evaluates the section's afterskip in the surrounding body
    // font. The browser's heading margin is measured in the larger title font.
    return units ? units*metrics(next).ex : null;
  }
  function firstHeadingReference(scale){
    if(number!==1 || block!==editor.firstElementChild || !block?.matches('h1') ||
      !editor.hasAttribute('data-native-ctex') || !editor.hasAttribute('data-native-article-sections') ||
      !/^\p{Script=Han}+$/u.test(block.textContent) || page.querySelector('#document-meta')?.textContent.trim())return null;
    const sheet=page.querySelector('.document-sheet')??page,box=canvas()?.getBoundingClientRect();
    if(!box?.height || !box.width)return null;
    // At the top of a page the first tall box sits flush with the typeset
    // area. The horizontal Chinese JFM gives a Han glyph a height of .88em.
    const height=parseFloat(getComputedStyle(page).paddingTop)+.88*parseFloat(getComputedStyle(block).fontSize);
    const x=(boundary(block,0,scale).x-sheet.getBoundingClientRect().left)/box.width;
    return {offset:0,stop:{row:{page:1},x,y:height*scale/box.height},pinned:true};
  }
  function displayReference(paragraph,scale){
    const row=paragraph?.rows[0],targetPage=row?.page??number;
    const box=canvas(targetPage)?.getBoundingClientRect();
    if(!box?.height || !box.width)return null;
    const richSheet=page.querySelector('.document-sheets')?.children[targetPage-1]??page;
    const paper=richSheet.getBoundingClientRect(),start=boundary(block,0,scale);
    // MathLive centers the expression again as it grows. Pinning the left
    // edge of its initially empty field instead can move it half a page.
    const x=(start.x-paper.left)/box.width;
    let y=row?.baseline;
    if(y===undefined && block.parentElement===editor && editor.hasAttribute('data-native-top-skip')){
      const line=parseFloat(getComputedStyle(editor).lineHeight)*scale;
      let prev=block.previousElementSibling;
      while(prev?.matches('p:empty,p:has(> br:only-child)'))prev=prev.previousElementSibling;
      let preceding;
      if(!prev && targetPage===1 && !page.querySelector('#document-meta')?.textContent.trim()){
        preceding=(parseFloat(getComputedStyle(page).paddingTop)+Number(editor.dataset.nativeTopSkip))*scale;
      }else if(prev?.matches('p')){
        const prior=paragraphFor(prev),last=prior?.rows.at(-1);
        if(last?.page===targetPage && matches(prior,prev))preceding=last.baseline*box.height+line;
        else preceding=boundary(prev,prev.textContent.length,scale).y-paper.top+line;
      }
      if(Number.isFinite(preceding) && Number.isFinite(line)){
        const strut=block.querySelector('math-field')?.shadowRoot?.querySelector('.ML__latex > .ML__strut');
        const height=strut?.getBoundingClientRect().height??0;
        y=(preceding+(height>line ? height+96/72.27*scale : line))/box.height;
      }
    }
    return {offset:0,pinned:true,stop:{row:{page:targetPage},x,y:y??pin?.y??(start.y-paper.top)/box.height}};
  }
  function referenceFor(paragraph,scale) {
    if(block.matches('.math-display'))return displayReference(paragraph,scale);
    if(paragraph){
      const offset=selectionOffset(block),old=paragraph.entry.text, live=editingText(block);
      const view=editor.editor?.view,head=view?.state.selection.$head;
      const sameNode=!paragraph.entry.node || head?.parent===paragraph.entry.node || head?.parent.eq(paragraph.entry.node);
      if(!composing && sameNode && offset!==null && old===live && paragraph.stops?.has(offset) &&
          (!pin || !framePending() || paintedDocument===view?.state.doc && paintedDocument))
        return {stop:physicalStop(paragraph,offset,scale),offset,exact:true};
      if(!old){const first=firstHeadingReference(scale);if(first)return first;}
      if(pin)return pinnedReference();
      // Anchor the common prefix nearest the edit, including wrapped lines.
      let i=0,limit=Math.min(offset??0,live.length,old?.length??0);
      while(i<limit&&old[i]===live[i])i++;
      while(i>0&&!paragraph.stops?.has(i))i--;
      const first=paragraph.rows[0];
      return {offset:i,stop:paragraph.stops?.get(i)??{row:first,x:first.left,y:first.baseline}};
    }
    const first=firstHeadingReference(scale);
    if(first)return first;
    if(pin)return pinnedReference();
    // Consecutive empty editor paragraphs have no TeX line boxes. New ink
    // starts below the last authored line, independent of how many Enters
    // were used to reach it. DOM-only paragraphs still being typed count once.
    let distance=1;
    for(let prev=block?.previousElementSibling;prev;prev=prev.previousElementSibling){
      const prior=paragraphFor(prev);
      if(prior){
        const last=prior.rows.at(-1),sheet=canvas(last.page)?.getBoundingClientRect();
        if(!sheet?.height)break;
        const lineHeight=parseFloat(getComputedStyle(block).lineHeight)*scale/sheet.height;
        if(!Number.isFinite(lineHeight))break;
        const first=prior.rows[0],x=paragraphStartX(block,prev.matches('p')?first.origin:null,sheet,scale);
        const skip=(afterHeading(prev,block)??0)*scale/sheet.height;
        return {offset:0,stop:{row:last,x,y:last.baseline+lineHeight*distance+skip}};
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
    // A new paragraph can be laid out before the first Han commit turns on
    // ctex. Keep its column and apply the live first-line indent, even if the
    // source snapshot that changed the font arrived between two keystrokes.
    const box=canvas(pin.page)?.getBoundingClientRect();
    const x=pin.offset===0?paragraphStartX(block,pin.column,box,page.currentCSSZoom||1):null;
    return {offset:pin.offset,stop:{row:{page:pin.page},x:x??pin.x,y:pin.y},pinned:true};
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
    const paragraph=paragraphFor(block);
    let start=0;
    const row=paragraph?.stops?.has(offset)?physicalStop(paragraph,offset,scale).row:null;
    if(row){
      for(const [at,stop] of paragraph.stops)if(stop.row===row){start=at;break;}
    }
    const box=canvas()?.getBoundingClientRect();
    const point=boundary(block,start,scale);
    if(row && box && matches(paragraph,block)){
      const stop=paragraph.stops.get(start);
      const at=stop.row===row?stop:stop.upstream;
      if(at){point.x=box.left+at.x*box.width;point.y=box.top+at.y*box.height;}
    }
    storePin(block,start,point,box);
    if(pin && start===0 && row && block.matches('p'))pin.column=row.origin;
  }
  function measureTypographyChange(){
    // The first Chinese commit can change baselines throughout a formerly
    // Latin article. Measure the preceding lines once on either side of
    // that font change. Keep the edited line at its new paper coordinate
    // and preserve its viewport position during that document-wide reflow.
    if(!document.body.classList.contains('native-tex-rich-edit') || !block?.matches('p') || !block.isConnected)return;
    const first=block.parentElement.firstElementChild;
    if(first===block || !first?.matches('p') || !first.textContent)return;
    const scale=page.currentCSSZoom||1;
    const separation=()=>boundary(block,0,scale).y-boundary(first,0,scale).y;
    pinCurrent();
    const saved=pin,box=canvas()?.getBoundingClientRect(),before=separation();
    if(!saved || !box?.height)return;
    return ()=>{
      if(pin!==saved || !block.isConnected)return;
      const delta=separation()-before;
      if(Math.abs(delta)<.01)return;
      saved.y+=delta/box.height;
      panel.scrollTop+=delta;
    };
  }
  function position(){
    if(block&&!editor.contains(block)){hideRemovedInk();block=selectedBlock();anchor=null;pin=null;}
    const scale=page.currentCSSZoom||page.getBoundingClientRect().width/page.offsetWidth;
    if(!Number.isFinite(scale)||scale<=0)return;
    const paragraph=paragraphFor(block);
    let reference=block&&referenceFor(paragraph,scale);
    if(reference && !reference.pinned && sheetFor(reference.stop.row.page)?.dataset.paintRevision!==String(revision))
      reference=pin?pinnedReference():null;
    if(reference)number=reference.stop.row.page;
    const current=canvas(),sheet=page.querySelector('.document-sheets')?.children[number-1]??page;
    if(!current)return;
    const box=current.getBoundingClientRect();
    const paper=sheet.getBoundingClientRect();
    let shiftX=box.left-paper.left,shiftY=box.top-paper.top;
    const bounds=block?.getBoundingClientRect();
    let target=reference?.stop,point;
    if(target && bounds){
      point=boundary(block,reference.offset,scale,reference.exact);
      if(reference.exact)pin=null;
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
    if(pos<0)return null;
    // An atom has no editable interior. posAtDOM(atom,0) can resolve to
    // its parent's content rather than to the displayed equation itself.
    if(view.nodeDOM(pos)===element)return view.state.doc.nodeAt(pos);
    return view.state.doc.resolve(pos).parent;
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
      const paragraph=paragraphFor(element);
      const fullyPainted=paintedDocument && paintedDocument===editor.editor?.state.doc &&
        [...pending.pages].every(n=>{
          const sheet=sheetFor(n);
          return !sheet || sheet.dataset.paintRevision===String(revision);
        });
      if(!element.isConnected && pending.owner && !mountedElement(pending.owner.entry)?.isConnected && !removedInk.has(pending.owner))
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
    const owner=paragraphFor(previous);
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
      const previousParagraph=paragraphFor(previous);
      hideRemovedInk();
      if(previous?.isConnected)retainText(previous);
      discard(next);
      if(!adjacent)anchor=null;
      block=next;pin=null;
      if(adjacent && !paragraphFor(next)){
        const scale=page.currentCSSZoom||1;
        const point=boundary(next,0,scale);
        const last=previousParagraph?.rows.at(-1);
        if(last)number=last.page;
        const box=canvas()?.getBoundingClientRect();
        if(!box?.height){position();return;}
        const headingSkip=afterHeading(previous,next);
        if(next.matches('p') && (previous.matches('p') || headingSkip!==null)){
          // TeX consumes consecutive empty paragraphs and advances by one
          // baseline from the last line containing ink, including a soft wrap.
          const offset=previous.textContent.length;
          const end=boundary(previous,offset,scale);
          const baseline=last && matches(previousParagraph,previous) ? box.top+last.baseline*box.height : end.y;
          const style=getComputedStyle(next),line=parseFloat(style.lineHeight);
          if(!previous.querySelector('math-field,img') && Number.isFinite(line)){
            const advance=offset || headingSkip!==null ? line+(headingSkip??0)+(parseFloat(style.marginTop)||0) : 0;
            point.y=baseline+advance*scale;
          }
        }
        storePin(next,0,point,box);
        if(pin && next.matches('p')){
          // The page was translated to edit the previous block. The new
          // paragraph's column is relative to its sheet, not that translation.
          const richSheet=page.querySelector('.document-sheets')?.children[number-1]??page;
          const paper=richSheet.getBoundingClientRect(),style=getComputedStyle(next);
          const column=last && previous.matches('p') ? previousParagraph.rows[0].origin :
            (next.getBoundingClientRect().left-paper.left+(parseFloat(style.paddingLeft)||0)*scale)/box.width;
          if(paragraphStartX(next,column,box,scale)!==null)pin.column=column;
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
    if(!pin && !paragraphFor(block) && index>=0 && index+1!==number && sheetFor(index+1)){
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
    clearExact();mask(paragraphFor(block)??null);
  }
  page.addEventListener('beforeinput',beginDraft,true);
  page.addEventListener('keydown',event=>{
    if(event.isComposing || composing || event.keyCode===229)return;
    if(['Enter','Backspace','Delete'].includes(event.key))beginDraft();
    if((event.key!=='Home' && event.key!=='End') || event.defaultPrevented || event.ctrlKey || event.altKey ||
        event.metaKey || event.target!==editor || !selectOffset || !document.body.classList.contains('native-tex-rich-edit'))return;
    const view=editor.editor.view, head=view.state.selection.$head;
    const element=selectedBlock(), paragraph=paragraphFor(element);
    if(view.composing || !paragraph?.stops?.has(head.parentOffset) || !matches(paragraph,element))return;
    if(element!==block)update();
    const scale=page.currentCSSZoom||1;
    const {row}=physicalStop(paragraph,head.parentOffset,scale);
    if(sheetFor(row.page)?.dataset.paintRevision!==String(revision))return;
    const edge=paragraphLineEdge(paragraph.stops,row,event.key==='End');
    if(edge && selectOffset(element,edge.offset,event.shiftKey)){
      clickedBoundary={element,...edge};
      event.preventDefault();
      event.stopPropagation();
      schedule();
    }
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
    if(next && (next!==block || main.classList.contains('native-ink-confirmed')))update();else schedule();
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
      if(!hit)return null;
      const element=mountedElement(layout.byElement.get(hit.element).entry);
      return element?.isConnected && editingText(element)===hit.text ? {...hit,element}:null;
    },
    update:schedule,measureTypographyChange,
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
