import {environmentEnd} from '../../../latex/tblr.mjs';
import {parseImageBlock} from '../../../latex/images.mjs';
import {sourceStructure} from '../../../latex/source-structure.mjs';

// These empty math fields live in the observation session only. Their boxes
// measure the exact TeX drawing, with zero contribution to the outer list.
export function instrumentDrawing(block,source,from,tag,attribute,filePath){
  const openings=[...sourceStructure(block)].filter(token=>token.kind==='begin'&&
    /^\\begin\{(?:tikzpicture|circuitikz)\}$/.test(token.value));
  if(openings.length!==1)return null;
  const [opening]=openings;
  const start=opening.index;
  const closing=environmentEnd(block,start,opening.value.slice(7,-1));
  if(!closing)return null;
  const raw=block.slice(start,closing.end);
  if(block.trim()!==raw){
    const image=parseImageBlock(block);
    if(image?.type!=='documentImage'||image.attrs.tikzSource!==raw)return null;
  }
  const drawing={source,filePath,from16:from+start,to16:from+closing.end};
  const marker=owner=>`\\begingroup\\mathsurround=0pt\\attribute${attribute}=${owner} $ $\\endgroup`;
  const measured='\\begingroup\\setbox0=\\hbox{'+raw+'}\\leavevmode'+
    '\\rlap{\\smash{\\raise\\ht0\\hbox{'+marker(tag)+'}}}'+
    '\\rlap{\\smash{\\kern\\wd0\\lower\\dp0\\hbox{'+marker(tag+1)+'}}}'+
    '\\box0\\endgroup';
  return {projection:block.slice(0,start)+measured+block.slice(closing.end),nextTag:tag+2,
    owners:[[tag,{drawing,corner:'top'}],[tag+1,{drawing,corner:'bottom'}]],paragraphs:[]};
}
