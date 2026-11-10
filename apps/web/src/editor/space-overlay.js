export function installSpaceOverlay(editor, paper) {
  const canvas = document.createElement('canvas');
  canvas.className = 'space-overlay';
  canvas.setAttribute('aria-hidden','true');
  document.body.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  let enabled = true;
  let composing = false;
  let frame = 0;

  function draw() {
    frame=0;
    canvas.hidden=!enabled || composing || !paper.getClientRects().length;
    if (canvas.hidden) return;
    const width=document.documentElement.clientWidth;
    const height=window.innerHeight;
    const scale=window.devicePixelRatio||1;
    const pixelsWide=Math.ceil(width*scale);
    const pixelsHigh=Math.ceil(height*scale);
    if (canvas.width!==pixelsWide) canvas.width=pixelsWide;
    if (canvas.height!==pixelsHigh) canvas.height=pixelsHigh;
    canvas.style.width=`${width}px`;
    canvas.style.height=`${height}px`;
    context.setTransform(scale,0,0,scale,0,0);
    context.clearRect(0,0,width,height);
    context.fillStyle='rgba(128,128,128,.58)';
    context.strokeStyle=context.fillStyle;
    const range=document.createRange();
    for (const block of editor.view.dom.querySelectorAll('p,h1,h2,h3,pre')) {
      const bounds=block.getBoundingClientRect();
      if(bounds.bottom<0 || bounds.top>height || bounds.right<0 || bounds.left>width)continue;
      const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{
        acceptNode:node=>node.parentElement.closest('[contenteditable="false"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      for(let node=walker.nextNode();node;node=walker.nextNode()) {
        for(const match of node.data.matchAll(/[ \u00a0\t]/g)) {
          range.setStart(node,match.index);
          range.setEnd(node,match.index+1);
          const rect=range.getBoundingClientRect();
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
  editor.on('transaction',({transaction})=>{if(transaction.docChanged)schedule();});
  paper.addEventListener('compositionstart',()=>{composing=true;canvas.hidden=true;});
  paper.addEventListener('compositionend',()=>{composing=false;schedule();});
  window.addEventListener('scroll',schedule,true);
  window.addEventListener('resize',schedule);
  const observer=new ResizeObserver(schedule);
  observer.observe(paper);
  schedule();
  return value=>{enabled=value;schedule();};
}
