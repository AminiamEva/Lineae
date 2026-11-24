import {parseDocument} from '../../../latex/document.mjs';
import {sourceStructure} from '../../../latex/source-structure.mjs';
import {applySlotEdit,projectMath} from './source.mjs';

// First direct-edit scope: one top-level display. Multiple displays require
// a document-wide owner registry; never let independent owner IDs collide.
export function projectDisplayMath(source,previous) {
  const doc=parseDocument(source);
  if(!doc)return null;
  const tokens=[...sourceStructure(doc.blocks.join(''))];
  if(tokens.some(token=>token.kind==='invalid'))return null;
  const displays=tokens.filter(token=>token.topLevel&&token.kind==='displayMath');
  if(displays.length!==1)return null;
  const span=displays[0],from16=doc.start.length+span.index+span.delimiter.length;
  const to16=from16+span.latex.length;
  const math=projectMath(span.latex,{
    previous:previous?.delimiter===span.delimiter&&previous.from16===from16?previous.math:undefined,
  });
  if(!math.supported)return null;
  return Object.freeze({source,from16,to16,delimiter:span.delimiter,math,
    projection:source.slice(0,from16)+math.projection+source.slice(to16)});
}

export function editDisplayMathSlot(projection,currentSource,hit,edit) {
  if(!projection||projection.source!==currentSource||!hit)return null;
  const role={num:'numerator',den:'denominator',sup:'superscript',sub:'subscript',radicand:'radicand',
    nucleus:'nucleus'}[hit.role];
  const slots=projection.math.slots.filter(slot=>slot.tag===hit.owner&&slot.role===role);
  if(slots.length!==1)return null;
  const result=applySlotEdit(projection.math,{...edit,slotId:slots[0].id});
  const {from16:base}=projection,{patch,selection}=result;
  return {
    patch:{from:base+patch.from,to:base+patch.to,insert:patch.insert},
    selection:{anchor:base+selection.anchor16,head:base+selection.head16,slotId:selection.slotId},
  };
}
