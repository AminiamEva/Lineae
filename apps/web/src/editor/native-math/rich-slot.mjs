const branches = {body:'body', numerator:'above', denominator:'below', radicand:'body',degree:'above',
  superscript:'superscript',subscript:'subscript',cell:'body'};
const kinds = {frac:'genfrac',sqrt:'surd',group:'group',matrix:'array',fence:'leftright'};
const script = name=>name==='superscript'||name==='subscript';
function branch(atom,name) {
  const direct=atom.branch(name);
  if(!script(name)||direct?.length)return direct;
  return atom.rightSibling?.type==='subsup'?atom.rightSibling.branch(name):direct;
}

// Follow actual branch ancestry, rather than matching the first fraction in
// MathLive's flattened offsets. A layout hit can target an inner fraction.
export function richSlotPosition(model,atoms,owner,{role,after}) {
  const target = {num:'above',den:'below',radicand:'body',degree:'above',sup:'superscript',sub:'subscript',cell:'body'}[role];
  if(!owner||(!(target&&(script(target)||['frac','sqrt','cell'].includes(owner.kind)))&&
      !(role==='nucleus'&&owner.kind==='token')))return null;
  const parts=owner.path.split('/'), pathIndex=new Map(atoms.map(atom=>[atom.path,atom]));
  let parent=model.root, prefix=parts[0];
  for(let i=1;i<parts.length;i+=2){
    const field=parts[i], index=Number(parts[i+1]);
    const cell=/^cell\.(\d+)\.(\d+)$/.exec(field);
    if(cell){
      if(index!==0||parent.type!=='array')return null;
      const content=parent.getCell(Number(cell[1]),Number(cell[2]));
      if(!content)return null;
      prefix+='/'+field+'/0';
      if(pathIndex.get(prefix)?.kind!=='cell')return null;
      parent={branch:name=>name==='body'?content:null};
      continue;
    }
    const name=branches[field];
    if(!name||!Number.isSafeInteger(index))return null;
    const rendered=branch(parent,name);
    if(!rendered)return null;
    const path=prefix+'/'+field;
    // Reject differing parse shapes; never treat extra MathLive nodes as an
    // equivalent source index (e.g. a synthesized script sibling).
    const expected=atoms.filter(atom=>atom.path.slice(0,atom.path.lastIndexOf('/'))===path);
    const children=[];
    for(const item of rendered){
      if(item.type==='first')continue;
      if(item.type==='subsup'){
        const owner=expected[children.length-1];
        if(children.at(-1)!==item.leftSibling||!owner?.slotIds.some(id=>/:(?:superscript|subscript)$/.test(id)))return null;
      }else children.push(item);
    }
    if(children.length!==expected.length)return null;
    prefix=path+'/'+index;
    parent=children[index];
    const step=pathIndex.get(prefix);
    if(!parent||!step||(step.kind==='token'?
      parent.value!==step.nucleus&&parent.command!==step.nucleus&&!(step.nucleus==='-'&&parent.value==='−'):
      parent.type!==kinds[step.kind]))return null;
  }
  const slot=target?branch(parent,target):null;
  if(target&&(slot?.length!==1||slot[0].type!=='first'))return null;
  const caret=target?slot[0]:after?parent:parent.leftSibling;
  if(!caret)return null;
  const offset=model.offsetOf(caret);
  return Number.isSafeInteger(offset)&&offset>=0?offset:null;
}
