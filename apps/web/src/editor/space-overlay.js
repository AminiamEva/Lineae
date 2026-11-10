export function installSpaceOverlay(editor, paper) {
  const page = paper.closest('.document-page') ?? paper;
  const canvas = document.createElement('canvas');
  canvas.className = 'space-overlay';
  canvas.setAttribute('aria-hidden','true');
  page.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  let enabled = true;
  let composing = false;
  let frame = 0;
  let compositionFrame = 0;

  function draw() {
    frame=0;
    const pageRect=page.getBoundingClientRect();
    canvas.hidden=!enabled || !pageRect.width || !pageRect.height;
    if (canvas.hidden) return;
    const zoom=page.offsetWidth ? pageRect.width/page.offsetWidth : 1;
    const width=page.clientWidth;
    const height=page.clientHeight;
    const scale=window.devicePixelRatio||1;
    const pixelsWide=Math.ceil(width*scale);
    const pixelsHigh=Math.ceil(height*scale);
    if (canvas.width!==pixelsWide) canvas.width=pixelsWide;
    if (canvas.height!==pixelsHigh) canvas.height=pixelsHigh;
    context.setTransform(scale,0,0,scale,0,0);
    context.clearRect(0,0,width,height);
    context.fillStyle='rgba(128,128,128,.58)';
    context.strokeStyle=context.fillStyle;
    const range=document.createRange();
    const local=rect=>({
      left:(rect.left-pageRect.left)/zoom,
      right:(rect.right-pageRect.left)/zoom,
      top:(rect.top-pageRect.top)/zoom,
      bottom:(rect.bottom-pageRect.top)/zoom,
      width:rect.width/zoom,
      height:rect.height/zoom,
    });
    for (const block of editor.view.dom.querySelectorAll('p,h1,h2,h3,pre')) {
      const bounds=local(block.getBoundingClientRect());
      if(bounds.bottom<0 || bounds.top>height || bounds.right<0 || bounds.left>width)continue;
      if (block.tagName==='P') {
        const style=getComputedStyle(block);
        const lineHeight=Number.parseFloat(style.lineHeight)||20;
        const indent=Number.parseFloat(style.textIndent)||0;
        range.selectNodeContents(block);
        // Absolute drag handles sit above the line; they must not decide the
        // paragraph mark position. Keep only rects inside the line box.
        const rects=Array.from(range.getClientRects()).map(local)
          .filter(rect=>rect.width>0 && rect.top>=bounds.top-1 && rect.bottom<=bounds.bottom+1);
        const rect=rects.findLast(rect=>rect.width>0);
        const y=bounds.top+lineHeight/2;
        context.font=`${lineHeight*.55}px sans-serif`;
        context.textBaseline='middle';
        context.fillText('¶',(rect?.right??bounds.left+indent)+3,rect?(rect.top+rect.bottom)/2:y);
        if(indent>0) {
          const end=bounds.left+indent-4;
          context.beginPath();context.moveTo(bounds.left+2,y);context.lineTo(end,y);
          context.moveTo(end,y-3);context.lineTo(end,y+3);context.stroke();
        }
      }
      const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{
        acceptNode:node=>node.parentElement.closest('[contenteditable="false"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      for(let node=walker.nextNode();node;node=walker.nextNode()) {
        for(const match of node.data.matchAll(/[ \u00a0\t]/g)) {
          range.setStart(node,match.index);
          range.setEnd(node,match.index+1);
          const rect=local(range.getBoundingClientRect());
          if(rect.width<1 || rect.bottom<0 || rect.top>height || rect.right<0 || rect.left>width)continue;
          const x=(rect.left+rect.right)/2;
          const y=(rect.top+rect.bottom)/2;
          const radius=Math.max(.8,Math.min(2,rect.height*.057));
          context.beginPath();
          if(match[0]==='\t') {
            const end=rect.right-2;
            context.moveTo(rect.left+2,y);context.lineTo(end,y);
            context.lineTo(end-3,y-3);context.moveTo(end,y);context.lineTo(end-3,y+3);
            context.stroke();
          } else {
            context.arc(x,y,radius,0,Math.PI*2);
            if(match[0]==='\u00a0')context.stroke();else context.fill();
          }
        }
      }
    }
  }
  function schedule() { if(!frame) frame=requestAnimationFrame(draw); }
  function compositionLoop() {
    compositionFrame=0;
    if(!composing)return;
    draw();
    compositionFrame=requestAnimationFrame(compositionLoop);
  }
  editor.on('transaction',({transaction})=>{if(transaction.docChanged)schedule();});
  paper.addEventListener('compositionstart',()=>{
    composing=true;
    if(!compositionFrame)compositionFrame=requestAnimationFrame(compositionLoop);
  });
  paper.addEventListener('compositionupdate',schedule);
  paper.addEventListener('compositionend',()=>{
    composing=false;
    if(compositionFrame)cancelAnimationFrame(compositionFrame);
    compositionFrame=0;
    schedule();
  });
  document.addEventListener('selectionchange',schedule);
  window.addEventListener('scroll',schedule,true);
  window.addEventListener('resize',schedule);
  const observer=new ResizeObserver(schedule);
  observer.observe(page);
  schedule();
  return value=>{enabled=value;schedule();};
}
