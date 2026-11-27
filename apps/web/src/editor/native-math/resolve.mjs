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
  const sourceTag=owned.sourceTag??endpoint.owner;
  const fence=atom.kind==='fence'&&['nucleus','math','body'].includes(endpoint.role);
  const role = fence?'body':roleOf[endpoint.role];
  const slot = formula.math.slots.find(candidate =>
    candidate.tag === sourceTag && candidate.role === role);
  if (!slot||fence&&slot.raw) return null;
  const local = endpoint.after ? slot.raw.length : 0;
  try {
    const target = editDisplayMathSlot(formula, formula.source, {...endpoint,owner:sourceTag,role:fence?'body':endpoint.role},
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

const contextIndexes=new WeakMap();

export function nativeMathContext(caret) {
  if(caret?.kind!=='math')return [];
  const {formula,slot}=caret;
  let index=contextIndexes.get(formula.math);
  if(!index){
    const atoms=formula.math.atoms;
    index={byId:new Map(atoms.map(atom=>[atom.id,atom])),byPath:new Map(atoms.map(atom=>[atom.path,atom]))};
    contextIndexes.set(formula.math,index);
  }
  const {byId,byPath}=index,current=byId.get(slot.ownerId)??caret.atom;
  const names=/^\\(i{1,3}nt|oi{1,3}nt|sum|prod|lim|min|max|log|ln|sin|cos|tan)$/;
  const parts=current.path.split('/'),labels=[];
  const addBranch=role=>{
    const position=/^cell\.(\d+)\.(\d+)$/.exec(role);
    if(position)labels.push({key:'cell',row:Number(position[1])+1,column:Number(position[2])+1});
    if(['numerator','denominator','radicand','degree','subscript','superscript'].includes(role))labels.push({key:role});
  };
  for(let end=1;end<=parts.length;end+=2){
    const path=parts.slice(0,end).join('/'),atom=byPath.get(path);
    if(!atom)continue;
    if(atom.kind==='frac'||atom.kind==='sqrt')labels.push({key:atom.kind});
    if(atom.kind==='matrix')labels.push({text:atom.command});
    const operator=names.exec(atom.nucleus??'');
    if(operator)labels.push({text:'op/'+operator[1]});
    if(atom.kind==='group'){
      const sibling=byPath.get(parts.slice(0,end-1).concat(String(Number(parts[end-1])-1)).join('/'));
      const bodyOf=names.exec(sibling?.nucleus??'');
      if(bodyOf&&/^(?:o?i{1,3}nt|sum|prod)$/.test(bodyOf[1])&&
        !formula.math.source.slice(sibling.to16,atom.from16).trim()){
        labels.push({text:'op/'+bodyOf[1]},{key:/nt$/.test(bodyOf[1])?'integrand':'operand'});
      }
    }
    addBranch(end<parts.length?parts[end]:slot.role);
  }
  return labels;
}
