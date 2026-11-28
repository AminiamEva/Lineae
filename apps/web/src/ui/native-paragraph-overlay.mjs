/** Align the mounted editor with the native page, exposing only its active block.
 * Moving or cloning a contenteditable subtree would invalidate the IME range.
 */
export function nativeParagraphOverlay(editor, panel, pages, framePending) {
  const page=editor.closest('.document-page'),main=page.closest('main');
  let number=1, anchor=null, block=null, dx=0, dy=0, frame=0;
  const canvas=()=>pages.querySelector(`[data-native-page="${number}"] canvas,[data-pdf-page="${number}"] canvas`);
  function selectedBlock(){
    const selection=document.getSelection();
    const target=page.contains(document.activeElement)&&document.activeElement!==editor
      ? document.activeElement : selection?.focusNode;
    const element=target?.nodeType===1?target:target?.parentElement;
    const candidate=element?.closest('p,h1,h2,h3,h4,h5,h6,.math-display,pre,figcaption,[contenteditable=true]');
    return candidate && candidate!==editor && page.contains(candidate)?candidate:
      editor.querySelector('.math-display.ProseMirror-selectednode');
  }
  function position(){
    const current=canvas(),sheet=page.querySelector('.document-sheets')?.children[number-1]??page;
    if(!current)return;
    if(block&&!editor.contains(block)){block=selectedBlock();anchor=null;}
    const box=current.getBoundingClientRect(),paper=sheet.getBoundingClientRect();
    let shiftX=box.left-paper.left,shiftY=box.top-paper.top;
    const bounds=block?.getBoundingClientRect();
    const scale=page.offsetWidth?paper.width/page.offsetWidth:1;
    if(!Number.isFinite(scale)||scale<=0)return;
    if(bounds&&anchor?.block?.isConnected){
      const reference=anchor.block;
      let textBox=null;
      if(Number.isFinite(anchor.x) && reference.firstChild?.nodeType===Node.TEXT_NODE){
        const range=document.createRange();
        range.setStart(reference.firstChild,0);
        range.setEnd(reference.firstChild,Math.min(1,reference.firstChild.length));
        textBox=range.getClientRects()[0];
      }
      if(textBox)shiftX=box.left+anchor.x*box.width-textBox.left;
      shiftY=box.top+anchor.y*box.height-(textBox?.top??reference.getBoundingClientRect().top)-(anchor.ascent??0)*scale;
    }
    const viewport=panel.getBoundingClientRect(),host=main.getBoundingClientRect();
    const viewRight=viewport.left+panel.clientWidth;
    dx+=shiftX;dy+=shiftY;
    const shift=`${(dx/scale).toFixed(3)}px ${(dy/scale).toFixed(3)}px`;
    if(page.style.getPropertyValue('--native-edit-shift')!==shift)page.style.setProperty('--native-edit-shift',shift);
    if(!bounds)return;
    const top=Math.max(bounds.top+shiftY-1,box.top,viewport.top);
    const bottom=Math.min(bounds.bottom+shiftY+1,box.bottom,viewport.bottom);
    const gutter=block.matches('h1,h2,h3')?32*scale:2;
    const left=Math.max(bounds.left+shiftX-gutter,box.left,viewport.left);
    const right=Math.min(bounds.right+shiftX+2,box.right,viewRight);
    main.style.setProperty('--native-edit-clip',`inset(${top-host.top}px ${host.right-right}px ${host.bottom-bottom}px ${left-host.left}px)`);
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
    if(!surface || !previous?.isConnected || !previous.matches('p,h1,h2,h3') ||
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
      if(framePending() && block?.nextElementSibling===next)retainText(block);
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
    if(index>=0 && index+1!==number && pages.querySelector('[data-native-page="'+(index+1)+'"],[data-pdf-page="'+(index+1)+'"]')){
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
    alignPainted(renderer){
      update();
      if(!block?.matches('p')||block.childNodes.length!==1||block.firstChild.nodeType!==Node.TEXT_NODE)return;
      const text=block.textContent;
      if(!text||/\s/.test(text))return;
      const lines=renderer.paintedLines(number,text);
      if(!lines.length)return;
      const matches=[...editor.querySelectorAll('p')].filter(p=>p.textContent===text);
      if(matches.length!==lines.length||matches.length>1&&pages.querySelectorAll('canvas').length!==1)return;
      const line=lines[matches.indexOf(block)];
      if(!line)return;
      const style=getComputedStyle(block),ctx=document.createElement('canvas').getContext('2d');
      ctx.font=style.fontStyle+' '+style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
      const ascent=ctx.measureText(text).fontBoundingBoxAscent;
      if(!Number.isFinite(ascent))return;
      anchor={block,x:line.x,y:line.baseline,ascent};
      position();
    },
    update:schedule,releaseRows,
    clear(retain=false){
      if(retain)retainText(block);
      else releaseRows();
      cancelAnimationFrame(followFrame);followFrame=0;
      cancelAnimationFrame(frame);frame=0;dx=0;dy=0;anchor=null;block=null;
      main.style.removeProperty('--native-edit-clip');page.style.removeProperty('--native-edit-shift');
      document.body.classList.remove('native-tex-rich-edit');
    }
  };
}
