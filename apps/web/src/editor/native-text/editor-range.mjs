import {headingAt} from '../../../latex/headings.mjs';
import {serialize} from '../latex-codec.js';
import {proseEditEndpoints} from './projection.mjs';

export function nativeEditorRange({doc,projection,composition,file,paragraph,from,to}) {
  const endpoints=proseEditEndpoints(paragraph,from,to);
  if(!endpoints)return null;
  const matchesParts=node=>{
    if(node.type.name!==(paragraph.heading?'heading':'paragraph'))return null;
    if(paragraph.heading&&(node.attrs.command??headingAt(serialize({type:'heading',attrs:node.attrs}))?.name)!==paragraph.heading)return null;
    const parts=[];
    let index=0,offset=0;
    for(const part of paragraph.parts){
      const child=node.maybeChild(index++);
      if(!child)return null;
      const marks=child.marks.filter(mark=>mark.type.name!=='textCommand');
      parts.push({offset,marks});
      offset+=child.nodeSize;
      if(part.kind==='break'){
        if(child.type.name!=='hardBreak')return null;
      }else if(part.kind==='math'){
        if(!['math','mathBlock'].includes(child.type.name)||child.attrs.latex!==part.latex)return null;
      }else{
        // Named text symbols are separate rich nodes but share the source run's
        // formatting and UTF-16 boundaries with the surrounding prose.
        const expected=part.marks??[];
        const matches=run=>{
          const visibleMarks=run.marks.filter(mark=>mark.type.name!=='textCommand');
          return run.isText&&visibleMarks.length===expected.length&&
            visibleMarks.every(mark=>expected.includes(mark.type.name)&&marks.some(first=>first.eq(mark)));
        };
        if(!matches(child))return null;
        let value=child.text;
        while(value.length<part.text.length){
          const run=node.maybeChild(index++);
          if(!run||!matches(run))return null;
          value+=run.text;
          offset+=run.nodeSize;
        }
        if(value!==part.text)return null;
      }
    }
    return index===node.childCount?parts:null;
  };
  // Resolve repeated prose by its verified source block before falling back
  // to an unambiguous structural match.
  const owner=projection?.text===paragraph.source && projection.blocks.find(block=>
    (block.count===1||paragraph.tableCell) && block.from<=paragraph.from16 &&
    block.to>=paragraph.from16+paragraph.text.length);
  const matches=[];
  function collect(node,offset,index,sourceOwner,sourceBase=0){
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
      const parts=matchesParts(child);
      if(parts)matches.push({node:child,offset:position,index,verified:true,parts,
        sourceBlock:{from:sourceBase+sourceOwner.from,to:sourceBase+sourceOwner.to}});
      return;
    }
    if(!paragraph.tableCell){
      const parts=matchesParts(node);
      if(parts)matches.push({node,offset,index,verified:sourceOwner?.index===index,parts});
      return;
    }
    if(node.type.name!=='table'||sourceOwner?.index!==index)return;
    const {row,column}=paragraph.tableCell;
    if(row>=node.childCount||column>=node.child(row).childCount)return;
    const rowNode=node.child(row),cell=rowNode.child(column);
    if(cell.childCount!==1)return;
    const parts=matchesParts(cell.firstChild);
    if(!parts)return;
    let position=offset+3;
    for(let i=0;i<row;i++)position+=node.child(i).nodeSize;
    for(let i=0;i<column;i++)position+=rowNode.child(i).nodeSize;
    matches.push({node:cell.firstChild,offset:position,index,verified:true,parts});
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
    node.forEach((child,childOffset,childIndex)=>collect(child,offset+1+childOffset,childIndex,sourceOwner,region.from));
  });
  const match=matches.find(candidate=>composition?candidate.verified: candidate.index===owner?.index) ??
    (matches.length===1 ? matches[0] : null);
  if(!match)return null;
  const at=(run,offset)=>{
    const local=offset-run.from16;
    return match.offset+1+(match.parts[run.partIndex]?.offset??0)+(run.offsets?.indexOf(local)??local);
  };
  return {from:at(endpoints.start,from),to:at(endpoints.end,to),match,endpoints,
    marks:match.parts[endpoints.start.partIndex]?.marks};
}

export function sourceOffsetAtEditorPosition(paragraph,match,position){
  for(const run of paragraph.runs){
    const part=match.parts[run.partIndex];
    if(!part)continue;
    const offset=position-(match.offset+1+part.offset);
    const length=run.offsets?run.offsets.length-1:run.to16-run.from16;
    if(offset<0||offset>length)continue;
    return paragraph.from16+run.from16+(run.offsets?.[offset]??offset);
  }
  return null;
}
