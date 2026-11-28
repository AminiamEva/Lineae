// rtex placement IDs refer to source spans. Display-list line.par and line.unit
// belong to the output routine and are deliberately never treated as source IDs.
const ligatures = new Map([...'\uFB00\uFB01\uFB02\uFB03\uFB04\uFB05\uFB06'].map((c,i) => [c,['ff','fi','fl','ffi','ffl','st','st'][i]]));
const space = c => Boolean(c && /\s/u.test(c));
const tolerance = 64; // SP rounding of independently recorded fragment positions

const rowIndices=new WeakMap();
function pageIndex(entry, replacements) {
  const dl=entry.dl, cacheKey=replacements??dl;
  if(rowIndices.has(cacheKey))return rowIndices.get(cacheKey);
  const rows=dl.lines.map((original,index) => {
    const replacement=replacements?.get(index);
    const line=replacement?.line ?? original;
    const dx=replacement?.dx ?? 0, dy=replacement?.dy ?? 0;
    return {x:line.x+dx,y:line.y+dy,line,dx,dy,dl};
  });
  rows.sort((a,b)=>a.y-b.y);
  rowIndices.set(cacheKey,rows);
  return rows;
}

function placedRow(rows,x,y) {
  let a=0,b=rows.length;
  while (a<b) {
    const middle=(a+b)>>>1;
    if (rows[middle].y<y-tolerance) a=middle+1; else b=middle;
  }
  let found=null;
  for (; a<rows.length && rows[a].y<=y+tolerance; a++) {
    if (Math.abs(rows[a].x-x)>tolerance) continue;
    if (found) return null;
    found=rows[a];
  }
  return found;
}

function rowGeometry(record, page) {
  if(record.geometry?.page===page)return record.geometry;
  const {line,dx,dy,dl}=record,w=dl.page_width,h=dl.page_height;
  if (!(w>0 && h>0)) return null;
  const glyphs=[];
  let left=Infinity,right=-Infinity;
  for (const item of line.items) {
    if (item[0]==='g') {
      const [, ,code, ,x,y,advance]=item;
      if (![x,y,advance].every(Number.isFinite)) return null;
      const start=(x+dx)/w,end=(x+dx+advance)/w;
      left=Math.min(left,start,end);right=Math.max(right,start,end);
      const char=Number.isInteger(code)&&code>=0&&code<=0x10ffff ? String.fromCodePoint(code) : '';
      glyphs.push({char:ligatures.get(char)??char,left:start,right:end,y:(y+dy)/h});
    } else if (item[0]==='r') {
      left=Math.min(left,(item[1]+dx)/w);right=Math.max(right,(item[1]+dx+item[3])/w);
    }
  }
  if (!Number.isFinite(left)) return null;
  record.geometry={page,left,right,baseline:record.y/h,top:(record.y-line.h)/h,bottom:(record.y+line.d)/h,glyphs};
  return record.geometry;
}

// Only map caret boundaries if the glyph sequence of this *already owned*
// paragraph accounts for the text. A non-bijective shaping cluster has no
// inferred interior caret; the mounted editor handles that case.
function caretStops(rows,entry) {
  if (!entry || entry.text===null) return null;
  const text=entry.text;
  const glyphs=rows.flatMap(row=>row.glyphs.map(g=>({g,row})));
  let skip=0;
  if (entry.heading) {
    const label=entry.element.getAttribute?.('data-section-number')??'';
    if (label && glyphs.slice(0,[...label].length).map(({g})=>g.char).join('')===label) skip=[...label].length;
  }
  const stops=new Map();
  let offset=0;
  for(let i=skip;i<glyphs.length;i++) {
    const {g,row}=glyphs[i];
    while(space(text[offset])) offset++;
    if (!g.char || !text.startsWith(g.char,offset)) {
      if (g.char==='-' && glyphs[i+1]?.row!==row && offset>0) continue;
      return null;
    }
    const at={row,x:g.left,y:g.y};
    stops.set(offset,at);
    offset+=g.char.length;
    stops.set(offset,{row,x:g.right,y:g.y});
  }
  while(space(text[offset])) offset++;
  return stops.size && offset===text.length ? stops : null;
}

export function paragraphFrame(layout, pages, owners, warm) {
  const byElement=new Map(),byPage=new Map(),indices=new Map();
  if (!layout || !owners?.size) return {byElement,byPage};
  for(const place of layout.placements??[]) {
    const entry=owners.get(place.par_id);
    if (!entry) continue;
    const fragments=warm?.update.par_id===place.par_id ? warm.update.fragments : place.fragments;
    const rows=[];
    let valid=true;
    for(const frag of fragments??[]) {
      const page=pages.get(frag.page);
      const count=frag.last_line-frag.first_line+1;
      if (!page || frag.approximate || !(count>0) || frag.xs?.length!==count || frag.baselines?.length!==count) {valid=false;break;}
      if (!indices.has(frag.page)) indices.set(frag.page,pageIndex(page,warm?.pages.get(frag.page)));
      for(let i=0;i<count;i++) {
        const row=placedRow(indices.get(frag.page),frag.xs[i],frag.baselines[i]);
        const geometry=row && rowGeometry(row,frag.page);
        if (!geometry) {valid=false;break;}
        rows.push(geometry);
      }
      if (!valid) break;
    }
    if (!rows.length||!valid) continue;
    // Most paragraphs never receive a caret in this frame. Shape-to-text
    // alignment is only needed for a hit or the active selection.
    let stops;
    const paragraph={entry,rows,get stops(){
      if(stops===undefined)stops=caretStops(rows,entry);
      return stops;
    }};
    byElement.set(entry.element,paragraph);
    for(const row of rows) {
      if (!byPage.has(row.page)) byPage.set(row.page,[]);
      byPage.get(row.page).push({paragraph,row});
    }
  }
  return {byElement,byPage};
}

export function paragraphHit(frame,page,x,y) {
  const hits=(frame?.byPage.get(page)??[]).filter(({row})=>
    x>=row.left-.003 && x<=row.right+.003 && y>=row.top-.002 && y<=row.bottom+.002);
  if(hits.length!==1) return null;
  const {paragraph,row}=hits[0];
  if(!paragraph.stops) return null;
  let offset=null, distance=Infinity;
  for(const [pos,stop] of paragraph.stops) {
    if(stop.row!==row) continue;
    if(Math.abs(stop.x-x)<distance) {offset=pos;distance=Math.abs(stop.x-x);}
  }
  return offset===null?null:{element:paragraph.entry.element,text:paragraph.entry.text,offset};
}
