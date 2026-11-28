// Step ranges belong to the document immediately after that step. Project
// them into the final transaction before looking up split or joined blocks.
export function changedTextblocks(transaction) {
  const blocks=new Map(),doc=transaction.doc;
  transaction.mapping.maps.forEach((step,i)=>{
    const rest=transaction.mapping.slice(i+1);
    step.forEach((_a,_b,c,d)=>{
      const from=Math.max(0,rest.map(c,-1)-1),to=Math.min(doc.content.size,rest.map(d,1)+1);
      doc.nodesBetween(from,to,(node,pos)=>{
        if(!node.isTextblock && node.type.name!=='mathBlock')return;
        blocks.set(pos,node);
        return false;
      });
    });
  });
  return blocks;
}
