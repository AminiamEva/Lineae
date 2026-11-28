// Range rectangles describe a font box, not an alphabetic baseline. Measure
// the browser's actual font fallback and half-leading outside the editable DOM.
export function nativeEditMetrics(doc) {
  const cache=new Map();
  const line=doc.createElement('span'),baseline=doc.createElement('i');
  const sample=doc.createTextNode('');
  line.setAttribute('aria-hidden','true');
  line.style.cssText='position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;white-space:pre;padding:0;border:0;';
  baseline.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline;';
  line.append(sample,baseline);
  const range=doc.createRange();
  doc.fonts?.addEventListener('loadingdone',()=>cache.clear());
  return (element,character='M')=>{
    const style=getComputedStyle(element);
    const font=[style.fontStyle,style.fontWeight,style.fontSize+'/'+style.lineHeight,style.fontFamily].join(' ');
    const key=font+'|'+character;
    if(cache.has(key))return cache.get(key);
    line.style.font=font;
    sample.data=character||'M';
    doc.body.append(line);
    range.selectNodeContents(sample);
    const y=baseline.getBoundingClientRect().top;
    const result={aboveRange:y-range.getBoundingClientRect().top,aboveLine:y-line.getBoundingClientRect().top};
    line.remove();
    if(cache.size>=256)cache.clear();
    cache.set(key,result);
    return result;
  };
}

// Find real ink at a model offset. Soft line breaks and justification widgets
// are view decorations and must never consume a character.
export function textBoundary(element,offset) {
  const doc=element.ownerDocument;
  const walker=doc.createTreeWalker(element,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{
    acceptNode(node){
      if(node.nodeType===Node.TEXT_NODE)return NodeFilter.FILTER_ACCEPT;
      if(node.matches('.ProseMirror-widget,.ProseMirror-trailingBreak,[contenteditable=false]'))return NodeFilter.FILTER_REJECT;
      return node.nodeName==='BR'?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP;
    },
  });
  const range=doc.createRange();
  let left=offset,last=null,node;
  while((node=walker.nextNode())){
    if(node.nodeName==='BR'){if(left===0)return last;left--;last=null;continue;}
    if(!node.length)continue;
    if(left>node.length){left-=node.length;continue;}
    const end=left===node.length, char=end?Array.from(node.data.slice(-2)).at(-1):String.fromCodePoint(node.data.codePointAt(left));
    range.setStart(node,end?left-char.length:left);
    range.setEnd(node,end?left:left+char.length);
    const rect=range.getBoundingClientRect();
    const point=rect.height?{x:end?rect.right:rect.left,top:rect.top,element:node.parentElement,char}:null;
    if(!end)return point??last;
    last=point;left=0;
  }
  return last;
}
