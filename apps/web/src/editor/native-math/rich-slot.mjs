const branches = {body:'body', numerator:'above', denominator:'below', radicand:'body'};
const kinds = {frac:'genfrac',sqrt:'surd',group:'group'};

// Follow actual branch ancestry, rather than matching the first fraction in
// MathLive's flattened offsets. A layout hit can target an inner fraction.
export function richSlotPosition(model,atoms,owner,{role,after}) {
  const target = {num:'above',den:'below',radicand:'body'}[role];
  if(!owner||(!(target&&['frac','sqrt'].includes(owner.kind))&&
      !(role==='nucleus'&&owner.kind==='token')))return null;
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
    const step=pathIndex.get(prefix);
    if(!parent||!step||(step.kind==='token'?parent.value!==step.raw:parent.type!==kinds[step.kind]))return null;
  }
  const slot=target?parent.branch(target):null;
  if(target&&(slot?.length!==1||slot[0].type!=='first'))return null;
  const caret=target?slot[0]:after?parent:parent.leftSibling;
  if(!caret)return null;
  const offset=model.offsetOf(caret);
  return Number.isSafeInteger(offset)&&offset>=0?offset:null;
}
