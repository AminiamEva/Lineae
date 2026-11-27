/** Align the mounted editor with the native page, exposing only its active block.
 * Moving or cloning a contenteditable subtree would invalidate the IME range.
 */
export function nativeParagraphOverlay(editor, panel, pages) {
  const page=editor.closest('.document-page'),main=page.closest('main');
  let number=1, anchor=null, block=null, dx=0, dy=0, frame=0;
  const canvas=()=>pages.querySelector(`[data-native-page="${number}"] canvas,[data-pdf-page="${number}"] canvas`);
  function selectedBlock(){
    const selection=document.getSelection();
    const target=page.contains(document.activeElement)&&document.activeElement!==editor
      ? document.activeElement : selection?.focusNode;
    const element=target?.nodeType===1?target:target?.parentElement;
    const candidate=element?.closest('p,h1,h2,h3,h4,h5,h6,.math-display,pre,figcaption,[contenteditable=true]');
    return candidate && candidate!==editor && page.contains(candidate)?candidate:null;
  }
  function position(){
    const current=canvas(),sheet=page.querySelectorAll('.document-sheet')[number-1]??page;
    if(!current)return;
    const box=current.getBoundingClientRect(),paper=sheet.getBoundingClientRect();
    dx+=box.left-paper.left;
    dy+=box.top-paper.top;
    const scale=page.offsetWidth?paper.width/page.offsetWidth:1;
    const move=()=>page.style.setProperty('--native-edit-shift',`${dx/scale}px ${dy/scale}px`);
    move();
    if(!block)return;
    let bounds=block.getBoundingClientRect();
    if(anchor?.block===block){
      dy+=box.top+anchor.y*box.height-bounds.top;
      move();
      bounds=block.getBoundingClientRect();
    }
    const viewport=panel.getBoundingClientRect(),host=main.getBoundingClientRect();
    const top=Math.max(bounds.top-1,box.top,viewport.top);
    const bottom=Math.min(bounds.bottom+1,box.bottom,viewport.bottom);
    const left=Math.max(bounds.left-2,box.left,viewport.left);
    const right=Math.min(bounds.right+2,box.right,viewport.left+panel.clientWidth);
    main.style.setProperty('--native-edit-clip',`inset(${top-host.top}px ${host.right-right}px ${host.bottom-bottom}px ${left-host.left}px)`);
  }
  function update(){
    if(!document.body.classList.contains('native-tex-rich-edit'))return;
    const next=selectedBlock();
    if(next && block!==next){block=next;anchor=null;}
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
    const sheets=[...page.querySelectorAll('.document-sheet')];
    const y=(caret.top+caret.bottom)/2;
    const index=sheets.findIndex(sheet=>{
      const rect=sheet.getBoundingClientRect();return y>=rect.top&&y<=rect.bottom;
    });
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
  panel.addEventListener('scroll',update,{passive:true});
  window.addEventListener('resize',schedule);
  document.addEventListener('selectionchange',schedule);
  page.addEventListener('focusin',schedule);
  page.addEventListener('input',schedule);
  page.addEventListener('keyup',()=>requestAnimationFrame(followCaret));
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
    reveal(target,y){
      block=target??selectedBlock()??editor.firstElementChild;
      anchor=Number.isFinite(y)?{block,y}:null;
      position();schedule();
    },
    update:schedule,
    clear(){
      cancelAnimationFrame(frame);frame=0;dx=0;dy=0;anchor=null;block=null;
      main.style.removeProperty('--native-edit-clip');page.style.removeProperty('--native-edit-shift');
      document.body.classList.remove('native-tex-rich-edit');
    }
  };
}
