import {rasterDrawingRanges,tikzDrawingRanges} from '../../../latex/images.mjs';

// These empty math fields live in the observation session only. Their boxes
// measure the exact TeX drawing, with zero contribution to the outer list.
export function instrumentDrawing(block,source,from,tag,attribute,filePath){
  const ranges=[...tikzDrawingRanges(block),...rasterDrawingRanges(block)].sort((a,b)=>a.from-b.from);
  if(!ranges.length)return null;
  const owners=[],parts=[];
  let cursor=0;
  const marker=owner=>`\\begingroup\\mathsurround=0pt\\attribute${attribute}=${owner} $ $\\endgroup`;
  for(const range of ranges){
    if(range.from<cursor)return null;
    const drawing={source,filePath,from16:from+range.from,to16:from+range.to,...(range.scaled&&{scaled:true}),
      ...(range.path&&{raster:range.path})};
    const raw=block.slice(range.from,range.to);
    const measured='\\begingroup\\setbox0=\\hbox{'+raw+'}\\leavevmode'+
      '\\rlap{\\smash{\\raise\\ht0\\hbox{'+marker(tag)+'}}}'+
      '\\rlap{\\smash{\\kern\\wd0\\lower\\dp0\\hbox{'+marker(tag+1)+'}}}'+
      '\\box0\\endgroup';
    parts.push(block.slice(cursor,range.from),measured);
    owners.push([tag++,{drawing,corner:'top'}],[tag++,{drawing,corner:'bottom'}]);
    cursor=range.to;
  }
  return {projection:parts.join('')+block.slice(cursor),nextTag:tag,owners,paragraphs:[]};
}
