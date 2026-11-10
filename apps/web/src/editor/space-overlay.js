const SVG = 'http://www.w3.org/2000/svg';

function shape(name, attributes = {}) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

export function installSpaceOverlay(editor, paper) {
  const page = paper.closest('.document-page') ?? paper;
  const overlay = shape('svg', { class:'space-overlay', 'aria-hidden':'true' });
  page.append(overlay);
  let enabled = true;
  let composing = false;
  let frame = 0;
  let compositionFrame = 0;

  function draw() {
    frame=0;
    const pageRect=page.getBoundingClientRect();
    overlay.hidden=!enabled || !pageRect.width || !pageRect.height;
    if (overlay.hidden) return;
    const zoom=page.offsetWidth ? pageRect.width/page.offsetWidth : 1;
    const width=page.clientWidth;
    const height=page.clientHeight;
    overlay.setAttribute('viewBox',`0 0 ${width} ${height}`);
    overlay.setAttribute('width','100%');
    overlay.setAttribute('height','100%');
    overlay.replaceChildren();
    const color='rgba(128,128,128,.58)';
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
        const rects=Array.from(range.getClientRects()).map(local)
          .filter(rect=>rect.width>0 && rect.top>=bounds.top-1 && rect.bottom<=bounds.bottom+1);
        const rect=rects.findLast(rect=>rect.width>0);
        const y=bounds.top+lineHeight/2;
        const mark=shape('text',{
          x:(rect?.right??bounds.left+indent)+3,
          y:rect?(rect.top+rect.bottom)/2:y,
          'font-size':lineHeight*.55,
          'font-family':'sans-serif',
          'text-anchor':'start',
          'dominant-baseline':'middle',
          fill:color,
        });
        mark.textContent='¶';
        overlay.append(mark);
        if(indent>0) {
          const end=bounds.left+indent-4;
          overlay.append(shape('line',{x1:bounds.left+2,y1:y,x2:end,y2:y,stroke:color,'stroke-width':1}));
          overlay.append(shape('line',{x1:end,y1:y-3,x2:end,y2:y+3,stroke:color,'stroke-width':1}));
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
          if(match[0]==='\t') {
            const end=rect.right-2;
            overlay.append(shape('path',{
              d:`M ${rect.left+2} ${y} L ${end} ${y} L ${end-3} ${y-3} M ${end} ${y} L ${end-3} ${y+3}`,
              fill:'none',stroke:color,'stroke-width':1,
            }));
          } else {
            overlay.append(shape('circle',{
              cx:x,cy:y,r:Math.max(.8,Math.min(2,rect.height*.057)),
              fill:match[0]==='\u00a0'?'none':color,
              stroke:match[0]==='\u00a0'?color:'none','stroke-width':1,
            }));
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
