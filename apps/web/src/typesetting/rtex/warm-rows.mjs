// A conservative subset of rtex's live placement protocol. The complete
// layout remains authoritative; never infer placement for unfamiliar rows.
export function warmRows(update, layout, pages) {
  const stamp=update.versions;
  if(!stamp||!layout?.versions||update.status!=='ok'||update.pagination_stale!==false||
    update.context_stale!==false||stamp.source_revision<=layout.versions.source_revision||
    stamp.context_revision!==layout.versions.context_revision||stamp.engine_generation!==layout.versions.engine_generation||
    stamp.layout_version!==layout.versions.layout_version)return null;
  const old=layout.placements?.find(place=>place.par_id===update.par_id)?.fragments;
  const fresh=update.fragments;
  if(!Array.isArray(old)||!Array.isArray(fresh)||!fresh.length||old.length!==fresh.length||
    update.dl?.other?.length||!Array.isArray(update.dl?.lines))return null;
  const simple=items=>Array.isArray(items)&&items.every(item=>item[0]==='g'||item[0]==='r');
  const byPage=new Map(),units=new Map(),newRows=new Set();
  for(const [i,next] of fresh.entries()){
    const previous=old[i];
    if(previous.page!==next.page||previous.approximate||next.approximate||
      previous.first_line!==next.first_line||previous.last_line!==next.last_line||
      !Number.isInteger(next.first_line)||next.first_line<1)return null;
    const n=next.last_line-next.first_line+1, page=pages.get(next.page)?.dl;
    if(!page||n<=0||previous.baselines?.length!==n||next.baselines?.length!==n||
      previous.xs?.length!==n||next.xs?.length!==n)return null;
    if(!byPage.has(next.page)){byPage.set(next.page,new Map());units.set(next.page,new Set());}
    const rows=byPage.get(next.page);
    for(let k=0;k<n;k++){
      const [oldX,oldY,x,y]=[previous.xs[k],previous.baselines[k],next.xs[k],next.baselines[k]];
      if(![oldX,oldY,x,y].every(Number.isSafeInteger))return null;
      const indices=page.lines.flatMap((line,index)=>
        Math.abs(line.x-oldX)<=64&&Math.abs(line.y-oldY)<=64?[index]:[]);
      const row=next.first_line-1+k,line=update.dl.lines[row];
      if(indices.length!==1||rows.has(indices[0])||newRows.has(row)||!line||
        !simple(line.items)||!simple(page.lines[indices[0]].items))return null;
      const oldLine=page.lines[indices[0]];
      rows.set(indices[0],{line,dx:x-line.x,dy:y-line.y});
      if(oldLine.unit)units.get(next.page).add(oldLine.unit);
      newRows.add(row);
    }
  }
  if(newRows.size!==update.dl.lines.length)return null;
  for(const [number,rows] of byPage){
    const lines=pages.get(number).dl.lines,owned=units.get(number);
    if(lines.some((line,index)=>owned.has(line.unit)&&!rows.has(index)))return null;
  }
  return byPage;
}
