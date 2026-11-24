const branches = {body:'body', numerator:'above', denominator:'below', radicand:'body'};
const kinds = {frac:'genfrac',sqrt:'surd',group:'group'};

// Follow actual branch ancestry, rather than matching the first fraction in
// MathLive's flattened offsets. A layout hit can target an inner fraction.
export function richEmptySlot(model,atoms,owner,role) {
  const target = {num:'above',den:'below',radicand:'body'}[role];
  if(!target||!owner||!['frac','sqrt'].includes(owner.kind))return null;
  const parts=owner.path.split('/'), pathIndex=new Map(atoms.map(atom=>[atom.path,atom]));
  let parent=model.root, prefix=parts[0];
  for(let i=1;i<parts.length;i+=2){
    const field=parts[i], index=Number(parts[i+1]);
    const name=branches[field];
    if(!name||!Number.isSafeInteger(index))return null;
    const children=parent.branch(name)?.filter(atom=>atom.type!=='first');
    if(!children)return null;
    const path=prefix+'/'+field;
    // Reject differing parse shapes; never treat extra MathLive nodes as an
    // equivalent source index (e.g. a synthesized script sibling).
    const expected=atoms.filter(atom=>atom.path.slice(0,atom.path.lastIndexOf('/'))===path);
    if(children.length!==expected.length)return null;
    prefix=path+'/'+index;
    parent=children[index];
    if(!parent||parent.type!==kinds[pathIndex.get(prefix)?.kind])return null;
  }
  const slot=parent.branch(target);
  if(slot?.length!==1||slot[0].type!=='first')return null;
  const offset=model.offsetOf(slot[0]);
  return Number.isSafeInteger(offset)&&offset>=0?offset:null;
}
