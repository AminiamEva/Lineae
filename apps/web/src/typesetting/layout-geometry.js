// offsetWidth/offsetHeight round physical paper dimensions to whole pixels.
// Preserve fractional CSS geometry before applying the editor zoom.
export function layoutScale(element){
 const style=getComputedStyle(element);let width=parseFloat(style.width);
 if(style.boxSizing!=='border-box')width+=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0)+(parseFloat(style.borderLeftWidth)||0)+(parseFloat(style.borderRightWidth)||0);
 return width>0?element.getBoundingClientRect().width/width:1;
}export function lineBoxAscent(element){
  const style=getComputedStyle(element);
  const line=document.createElement('span'),baseline=document.createElement('i');
  line.style.cssText='position:fixed;visibility:hidden;white-space:pre;top:0;left:0;';
  for(const key of ['fontFamily','fontStyle','fontSize','fontWeight','lineHeight'])line.style[key]=style[key];
  baseline.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';
  line.append(document.createTextNode(element.textContent.slice(0,64)),baseline);
  document.body.append(line);
  const ascent=baseline.getBoundingClientRect().top-line.getBoundingClientRect().top;
  line.remove();
  return ascent;
}