import {editDisplayMathSlot} from './document.mjs';

const roleOf = {
  num: 'numerator', den: 'denominator', radicand: 'radicand', degree: 'degree',
  sup: 'superscript', sub: 'subscript', cell: 'cell', nucleus: 'nucleus', body:'body',
};

// A geometry hit becomes a document offset only through the current source
// projection: no pixel is converted by guessing a node order.
export function nativeTarget(projection, endpoint) {
  if (!projection || !endpoint) return null;
  const owned = projection.owners.get(endpoint.owner);
  if (!owned?.formula || !owned?.atom) return null;
  const { formula, atom } = owned;
  const fence=atom.kind==='fence'&&['nucleus','math','body'].includes(endpoint.role);
  const role = fence?'body':roleOf[endpoint.role];
  const slot = formula.math.slots.find(candidate =>
    candidate.tag === endpoint.owner && candidate.role === role);
  if (!slot||fence&&slot.raw) return null;
  const local = endpoint.after ? slot.raw.length : 0;
  try {
    const target = editDisplayMathSlot(formula, formula.source, fence?{...endpoint,role:'body'}:endpoint,
      { from16: local, to16: local, insert: '' });
    if (!target) return null;
    return {
      kind:'math', formula, atom, owner: atom, slot, local, hit: endpoint,
      docOffset: target.selection.head, position: target.selection.head,
    };
  } catch { return null; }
}

export function createTargetResolver(getProjection) {
  return endpoint => nativeTarget(getProjection(), endpoint);
}
