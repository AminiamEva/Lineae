// offsetWidth/offsetHeight round physical paper dimensions to whole pixels.
// Preserve fractional CSS geometry before applying the editor zoom.
export function layoutScale(element){
 const style=getComputedStyle(element);let width=parseFloat(style.width);
 if(style.boxSizing!=='border-box')width+=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0)+(parseFloat(style.borderLeftWidth)||0)+(parseFloat(style.borderRightWidth)||0);
 return width>0?element.getBoundingClientRect().width/width:1;
}