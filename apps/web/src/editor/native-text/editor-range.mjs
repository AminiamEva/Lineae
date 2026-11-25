import {proseEditEndpoints} from './projection.mjs';

export function nativeEditorRange({doc,projection,composition,file,paragraph,from,to}) {
  const endpoints=proseEditEndpoints(paragraph,from,to);
  if(!endpoints)return null;
  const matchesParts=node=>{
    if(node.type.name!==(paragraph.heading?'heading':'paragraph')||node.childCount!==paragraph.parts.length)return false;
    if(paragraph.heading&&node.attrs.command!==paragraph.heading)return false;
    return paragraph.parts.every((part,index)=>{
      const child=node.child(index);
      const marks=part.marks??[];
      if(part.kind==='break')return child.type.name==='hardBreak';
      return part.kind==='text'
        ?child.isText&&child.text===part.text&&
          child.marks.length===marks.length&&child.marks.every(mark=>marks.includes(mark.type.name))
        :(child.type.name==='math'||child.type.name==='mathBlock')&&child.attrs.latex===part.latex;
    });
  };
  // Resolve repeated prose by its verified source block before falling back
  // to an unambiguous structural match.
  const owner=projection?.text===paragraph.source && projection.blocks.find(block=>
    (block.count===1||paragraph.tableCell) && block.from<=paragraph.from16 &&
    block.to>=paragraph.from16+paragraph.text.length);
  const matches=[];
  function collect(node,offset,index,sourceOwner){
    if(paragraph.container){
      const {type,path}=paragraph.container;
      if(sourceOwner?.index!==index||node.type.name!==type)return;
      let child=node,position=offset;
      for(const childIndex of path){
        if(childIndex>=child.childCount)return;
        position++;
        for(let i=0;i<childIndex;i++)position+=child.child(i).nodeSize;
        child=child.child(childIndex);
      }
      if(!matchesParts(child))return;
      matches.push({node:child,offset:position,index,verified:true});
      return;
    }
    if(!paragraph.tableCell){
      if(matchesParts(node))matches.push({node,offset,index,verified:sourceOwner?.index===index});
      return;
    }
    if(node.type.name!=='table'||sourceOwner?.index!==index)return;
    const {row,column}=paragraph.tableCell;
    if(row>=node.childCount||column>=node.child(row).childCount)return;
    const rowNode=node.child(row),cell=rowNode.child(column);
    if(cell.childCount!==1||!matchesParts(cell.firstChild))return;
    let position=offset+3;
    for(let i=0;i<row;i++)position+=node.child(i).nodeSize;
    for(let i=0;i<column;i++)position+=rowNode.child(i).nodeSize;
    matches.push({node:cell.firstChild,offset:position,index,verified:true});
  }
  doc.forEach((node,offset,index)=>{
    if(!composition){
      collect(node,offset,index,owner);
      return;
    }
    if(node.type.name!=='projectRegion'||node.attrs.path!==file.path)return;
    const region=composition.regions[index];
    if(!region||paragraph.from16<region.from)return;
    const sourceOwner=composition.sources.get(file.id)===paragraph.source && region.projection?.blocks.find(block=>
      (block.count===1||paragraph.tableCell)&&region.from+block.from<=paragraph.from16 &&
      region.from+block.to>=paragraph.from16+paragraph.text.length);
    node.forEach((child,childOffset,childIndex)=>collect(child,offset+1+childOffset,childIndex,sourceOwner));
  });
  const match=matches.find(candidate=>composition?candidate.verified: candidate.index===owner?.index) ??
    (matches.length===1 ? matches[0] : null);
  if(!match)return null;
  const {offset:found,node:foundNode}=match;
  const at=(run,offset)=>{
    let position=found+1;
    for(let index=0;index<run.partIndex;index++)position+=foundNode.child(index).nodeSize;
    const local=offset-run.from16;
    return position+(run.offsets?.indexOf(local)??local);
  };
  return {from:at(endpoints.start,from),to:at(endpoints.end,to),match,endpoints};
}
