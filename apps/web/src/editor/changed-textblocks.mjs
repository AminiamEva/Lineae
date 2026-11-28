// Step ranges belong to the document immediately after that step. Project
// them into the final transaction before looking up split or joined blocks.
export function changedTextblocks(transaction) {
  const blocks=new Map(),doc=transaction.doc;
  transaction.mapping.maps.forEach((map,i)=>{
    const rest=transaction.mapping.slice(i+1);
    function collect(c,d){
      const from=Math.max(0,rest.map(c,-1)-1),to=Math.min(doc.content.size,rest.map(d,1)+1);
      doc.nodesBetween(from,to,(node,pos)=>{
        if(!node.isTextblock && node.type.name!=='mathBlock')return;
        blocks.set(pos,node);
        return false;
      });
    }
    let mapped=false;
    map.forEach((_a,_b,c,d)=>{mapped=true;collect(c,d);});
    // Changing a mark or a node attribute changes the ink yet maps every
    // position to itself. These steps still own their original text ranges.
    const step=transaction.steps[i];
    if(!mapped && Number.isInteger(step.from) && Number.isInteger(step.to))collect(step.from,step.to);
    else if(!mapped && Number.isInteger(step.pos))collect(step.pos,step.pos+1);
  });
  return blocks;
}
