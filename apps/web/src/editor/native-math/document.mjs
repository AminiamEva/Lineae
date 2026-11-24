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

// Assign disjoint owner IDs within this exact document revision. Keep
// unsupported display spans intact and preserve their ordinal in the editor.
export function projectDocumentFormulas(source) {
  const doc=parseDocument(source);
  if(!doc)return null;
  const tokens=[...sourceStructure(doc.blocks.join(''))];
  if(tokens.some(token=>token.kind==='invalid'))return null;
  const spans=tokens.filter(token=>token.topLevel&&['displayMath','inlineMath'].includes(token.kind));
  const counts={displayMath:0,inlineMath:0},ordinals={...counts};
  for(const span of spans)counts[span.kind]++;
  const formulas=[], owners=new Map();
  let projection='',cursor=0,firstTag=1;
  for(const span of spans){
    const ordinal=ordinals[span.kind]++;
    const from16=doc.start.length+span.index+span.delimiter.length,to16=from16+span.latex.length;
    const math=projectMath(span.latex,{firstTag});
    if(!math.supported)continue;
    const formula={source,from16,to16,math,ordinal,kind:span.kind,count:counts[span.kind],
      projectionFrom16:projection.length+from16-cursor};
    for(const atom of math.atoms)owners.set(atom.tag,{formula,atom});
    formulas.push(formula);
    firstTag+=math.atoms.length;
    projection+=source.slice(cursor,from16)+math.projection;cursor=to16;
  }
  return formulas.length?{source,projection:projection+source.slice(cursor),formulas,owners}:null;
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
