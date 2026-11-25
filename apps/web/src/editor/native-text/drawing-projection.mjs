import {environmentEnd} from '../../../latex/tblr.mjs';

// These empty math fields live in the observation session only. Their boxes
// measure the exact TeX drawing, with zero contribution to the outer list.
export function instrumentDrawing(block,source,from,tag,attribute,filePath){
  const opening=/^\s*\\begin\{(tikzpicture|circuitikz)\}/.exec(block);
  if(!opening)return null;
  const start=opening[0].indexOf('\\begin');
  const closing=environmentEnd(block,start,opening[1]);
  if(!closing||block.slice(closing.end).trim())return null;
  const drawing={source,filePath,from16:from+start,to16:from+closing.end};
  const marker=owner=>`\\begingroup\\mathsurround=0pt\\attribute${attribute}=${owner} $ $\\endgroup`;
  const raw=block.slice(start,closing.end);
  const measured='\\begingroup\\setbox0=\\hbox{'+raw+'}\\leavevmode'+
    '\\rlap{\\smash{\\raise\\ht0\\hbox{'+marker(tag)+'}}}'+
    '\\rlap{\\smash{\\kern\\wd0\\lower\\dp0\\hbox{'+marker(tag+1)+'}}}'+
    '\\box0\\endgroup';
  return {projection:block.slice(0,start)+measured+block.slice(closing.end),nextTag:tag+2,
    owners:[[tag,{drawing,corner:'top'}],[tag+1,{drawing,corner:'bottom'}]],paragraphs:[]};
}
