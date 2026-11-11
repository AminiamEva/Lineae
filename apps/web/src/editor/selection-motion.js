const MAX_RECTS = 160;

function local(rect, page, zoom) {
  return {x:(rect.left-page.left)/zoom,y:(rect.top-page.top)/zoom,
    width:rect.width/zoom,height:rect.height/zoom};
}

const near = (a,b) => Math.abs(a-b)<.02;
const equal = (a,b) => near(a.x,b.x) && near(a.y,b.y) && near(a.width,b.width) && near(a.height,b.height);
const sameLine = (a,b) => Math.abs(a.y-b.y)<Math.min(a.height,b.height)/2;
const overlaps = (a,b) => Math.max(a.x,b.x) <= Math.min(a.x+a.width,b.x+b.width)+1;

// Range.getClientRects() includes entire selected element boxes. Measure the
// selected text runs instead so the highlight doesn't fill empty page width.
export function measureSelection(view, selection, page, zoom) {
  if (selection.isCollapsed) return {rects:[],backward:false};
  const {from,to}=view.state.selection;
  if (to-from>10000 || view.dom.querySelector('.lineae-multi-selected')) return null;
  const range=selection.getRangeAt(0);
  const root=range.commonAncestorContainer;
  const doc=view.dom.ownerDocument;
  const segment=doc.createRange();
  const rects=[];
  let unsupported=false;
  const walker=doc.createTreeWalker(root,NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,{
    acceptNode(node) {
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      if (node.nodeType===Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      if (node.getAttribute('contenteditable')==='false') {
        unsupported=true;
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });
  for (let node=root.nodeType===Node.TEXT_NODE ? root : walker.nextNode(); node; node=walker.nextNode()) {
    if (unsupported) return null;
    segment.setStart(node,node===range.startContainer ? range.startOffset : 0);
    segment.setEnd(node,node===range.endContainer ? range.endOffset : node.length);
    for (const bounds of segment.getClientRects()) {
      if (bounds.width<=0 || bounds.height<=0) continue;
      rects.push(local(bounds,page,zoom));
      if (rects.length>MAX_RECTS) return null;
    }
  }
  if (unsupported || !rects.length) return null;
  rects.sort((a,b)=>a.y-b.y || a.x-b.x);
  const merged=[];
  for (const rect of rects) {
    const previous=merged.at(-1);
    if (previous && near(rect.y,previous.y) && near(rect.height,previous.height) && overlaps(rect,previous)) {
      previous.width=Math.max(previous.x+previous.width,rect.x+rect.width)-previous.x;
    } else merged.push(rect);
  }
  const backward=selection.focusNode===range.startContainer && selection.focusOffset===range.startOffset;
  return {rects:merged,backward};
}

function transform({x,y,width,height}) {
  return `translate(${x}px, ${y}px) scale(${width}, ${height})`;
}

function collapsed(rect,point,atRight) {
  const x=point && sameLine(rect,point)
    ? Math.min(rect.x+rect.width,Math.max(rect.x,point.x))
    : rect.x+(atRight ? rect.width : 0);
  return {...rect,x,width:0};
}

export function createSelectionMotion(view,page) {
  const layer=page.ownerDocument.createElement('div');
  layer.className='document-selection';
  layer.setAttribute('aria-hidden','true');
  page.append(layer);
  let last={rects:[],backward:false};

  function clear() {
    if (layer.childElementCount) layer.replaceChildren();
    last={rects:[],backward:false};
    view.dom.classList.remove('has-document-selection');
  }

  function matches({rects}) {
    return last.rects.length===rects.length && rects.every((rect,i)=>equal(rect,last.rects[i]));
  }

  function draw(next,{pageRect,zoom,from,to,timing,startTime}) {
    const painted=timing ? Array.from(layer.children,span=>local(span.getBoundingClientRect(),pageRect,zoom))
      .filter(rect=>rect.width>.02) : [];
    const parts=next.rects.map(rect=>{
      const match=painted.findIndex(previous=>sameLine(previous,rect) && overlaps(previous,rect));
      const origin=match<0 ? collapsed(rect,from,next.backward) : painted.splice(match,1)[0];
      return {origin,rect};
    });
    for (const origin of painted) parts.push({origin,rect:collapsed(origin,to,!last.backward)});
    last=next;
    const spans=parts.map(()=>layer.ownerDocument.createElement('span'));
    layer.replaceChildren(...spans);
    view.dom.classList.toggle('has-document-selection',Boolean(next.rects.length));
    parts.forEach(({origin,rect},i)=>{
      const span=spans[i];
      const end=transform(rect);
      span.style.transform=end;
      if (!timing || equal(origin,rect)) {
        if (!rect.width) span.remove();
        return;
      }
      const animation=span.animate([{transform:transform(origin)},{transform:end}],{
        ...timing,id:'lineae-selection-glide',
      });
      animation.startTime=startTime;
      if (!rect.width) animation.onfinish=()=>span.remove();
    });
  }

  return {clear,matches,draw,destroy() {clear();layer.remove();}};
}
