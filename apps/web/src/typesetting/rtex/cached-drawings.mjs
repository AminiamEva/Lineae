export function cachedDrawingBox(item){
  if(item[0]!=='u'||item[1]!=='cached_picture'||typeof item[2]!=='string')return null;
  const parts=item[2].trim().split(/\s+/).map(Number);
  return parts.length===5&&parts.every(Number.isSafeInteger)&&parts[3]>0&&parts[4]>0?parts.slice(1):null;
}

export function matchObservedDrawingFonts(original,observed){
  const described=fonts=>Object.entries(fonts).map(([key,descriptor])=>[
    Number(key),JSON.stringify(Object.entries(descriptor).filter(([field])=>field!=='id').sort(([a],[b])=>a.localeCompare(b))),
  ]);
  const raw=described(original.fonts),measured=described(observed.fonts);
  const ids=new Map(raw.map(([id,signature])=>[signature,id]));
  if(ids.size!==raw.length||measured.length!==raw.length)return null;
  const remapped=new Map();
  for(const [id,signature] of measured){
    if(!ids.has(signature)||remapped.has(id))return null;
    remapped.set(id,ids.get(signature));
  }
  if(new Set(remapped.values()).size!==ids.size)return null;
  let unverified=false;
  const normalize=items=>items.map(item=>{
    if(item[0]!=='g')return item;
    const id=remapped.get(item[1]);
    if(id===undefined)unverified=true;
    return [item[0],id,...item.slice(2)];
  });
  const other=normalize(observed.other),lines=observed.lines.map(line=>({...line,items:normalize(line.items)}));
  return unverified?null:{...observed,fonts:original.fonts,other,lines};
}

export function sameCachedDrawingItems(original,observed,drawings){
  const left=original.filter(item=>item[0]!=='m'),right=observed.filter(item=>item[0]!=='m');
  let index=0;
  for(const item of left){
    if(JSON.stringify(item)===JSON.stringify(right[index])){index++;continue;}
    const box=cachedDrawingBox(item);
    if(!box||drawings.filter(drawing=>drawing.box.every((value,axis)=>value===box[axis])).length!==1)return false;
    const start=index;
    // Observation may expand an opaque cached picture into PDF drawing ops.
    // Keep every non-picture operator in its original order.
    while(right[index]?.[0]==='l'&&right[index]?.[2]==='data')index++;
    if(index===start)return false;
  }
  return index===right.length;
}
