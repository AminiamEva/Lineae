// TeX can paint one staged input more than once. Assign each unambiguous
// geometry event a distinct hit ID while retaining its original source tag.
export function separateRepeatedOwners(pages,projection,regions=[]){
  const countByPath=new Map();
  for(const {path,occurrence} of regions){
    if(occurrence>0)countByPath.set(path,Math.max(countByPath.get(path)??1,occurrence+1));
  }
  if(!countByPath.size)return {pages,projection};
  const repeated=new Map(),owners=new Map(projection.owners);
  const paragraphs=[...projection.paragraphs],formulas=[...projection.formulas];
  for(const [tag,entry] of owners){
    const target=entry.paragraph??entry.formula??entry.drawing??entry.reference;
    const count=countByPath.get(target?.filePath);
    if(!count)continue;
    repeated.set(tag,{entry,count,events:new Map(),aliases:[]});
    owners.delete(tag);
  }
  let next=projection.nextTag;
  const instances=new Map();
  function occurrence(target,index,list){
    if(!instances.has(target))instances.set(target,new Map());
    const copies=instances.get(target);
    if(!copies.has(index)){
      const clone={...target,occurrence:index};
      copies.set(index,clone);list.push(clone);
    }
    return copies.get(index);
  }
  const mapped=new Map();
  for(const page of [...pages].sort((a,b)=>a.page-b.page)){
    for(const [kind,events] of Object.entries(page.dl.math_owners??{})){
      if(!['glyphs','fields'].includes(kind))continue;
      for(const event of events){
        const target=repeated.get(event.owner);
        if(!target)continue;
        const role=kind==='glyphs'?'glyph':event.role;
        if(!target.events.has(role))target.events.set(role,[]);
        target.events.get(role).push(event);
      }
    }
  }
  for(const [tag,{entry,count,events,aliases}] of repeated){
    // A missing or duplicated event cannot be attributed to a particular
    // expansion. Leave it visible but without a semantic hit target.
    for(const values of events.values()){
      if(values.length!==count||!entry.paragraph&&!entry.formula)continue;
      for(const [index,event] of values.entries()){
        if(aliases[index]===undefined){
          const target=entry.paragraph?{paragraph:occurrence(entry.paragraph,index,paragraphs)}:
            {formula:occurrence(entry.formula,index,formulas)};
          aliases[index]=next++;
          owners.set(aliases[index],{...entry,...target,sourceTag:tag});
        }
        mapped.set(event,{...event,owner:aliases[index]});
      }
    }
  }
  const remap=events=>events?.flatMap(event=>repeated.has(event.owner)?[mapped.get(event)].filter(Boolean):[event]);
  const observed=pages.map(page=>{
    const geometry=page.dl.math_owners;
    if(!geometry)return page;
    return {...page,dl:{...page.dl,math_owners:{...geometry,glyphs:remap(geometry.glyphs),fields:remap(geometry.fields)}}};
  });
  return {pages:observed,projection:{...projection,owners,paragraphs,formulas}};
}
