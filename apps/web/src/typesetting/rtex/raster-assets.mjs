// Resolve only bytes already included in the staged snapshot. LuaLaTeX may
// report a relative name or the absolute name of its temporary project copy.
export function stagedRasterPath(file) {
  if(typeof file!=='string')return null;
  let path=file.replaceAll('\\','/');
  if(path.startsWith('/')||/^[A-Za-z]:/.test(path)){
    const staged=/\/lineae-native-tex-[\da-f]{8}-[\da-f]{32}-[\da-f]{16}\/(.+)$/i.exec(path);
    if(!staged)return null;
    path=staged[1];
  }
  if(path.startsWith('./'))path=path.slice(2);
  if(path.split('/').some(part=>!part||part==='.'||part==='..')||/[:\0]/.test(path))return null;
  return path;
}

export function stagedRaster(snapshot,file) {
  const path=stagedRasterPath(file);
  const asset=path&&snapshot?.files?.find(entry=>entry.path===path);
  if(!asset)return null;
  const data=new Uint8Array(asset.bytes);
  const png=/\.png$/i.test(path)&&[137,80,78,71,13,10,26,10].every((byte,index)=>data[index]===byte);
  const jpeg=/\.jpe?g$/i.test(path)&&data[0]===255&&data[1]===216&&data[2]===255;
  if(!png&&!jpeg)return null;
  return {kind:'raster',mime:png?'image/png':'image/jpeg',data};
}

export function rasterContains({transform,box},x,y) {
  const [a,b,c,d,e,f]=transform;
  const determinant=a*d-b*c;
  if(!Number.isFinite(determinant)||determinant===0)return false;
  const localX=(d*(x-e)-c*(y-f))/determinant;
  const localY=(a*(y-f)-b*(x-e))/determinant;
  const [left,top,width,height]=box;
  return localX>=left&&localX<=left+width&&localY>=top&&localY<=top+height;
}

export function matchingRasterHit(hits,file,box){
  const path=stagedRasterPath(file);
  const matches=hits.filter(hit=>{
    if(hit.path!==path)return false;
    const [a,b,c,d,e,f]=hit.transform,[x,y,w,h]=hit.box;
    const points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]];
    const xs=points.map(([u,v])=>a*u+c*v+e),ys=points.map(([u,v])=>b*u+d*v+f);
    const left=Math.min(...xs),top=Math.min(...ys);
    const bounds=[left,top,Math.max(...xs)-left,Math.max(...ys)-top];
    // The PDF transformation coefficients are decimal approximations. Compare
    // the image in page coordinates, allowing for the serialized precision.
    const rounding=2+(w+h)*1e-5;
    return bounds.every((value,axis)=>Math.abs(value-box[axis])<=rounding);
  });
  return matches.length===1?matches[0]:null;
}

export function registeredRasterHits(display,getRaster) {
  const items=[...(display.other??[]),...(display.lines??[]).flatMap(line=>line.items??[])];
  const identity=[1,0,0,1,0,0];
  const hits=[],stack=[];
  let transform=identity;
  for(const [command,index,x,y,width,height] of items){
    if(command==='M'){
      if(index==='save'){stack.push(transform);continue;}
      if(index==='restore'){
        if(!stack.length)return [];
        transform=stack.pop();continue;
      }
      if(index!=='set'||typeof width!=='string'||![x,y].every(Number.isFinite))return [];
      const values=width.trim().split(/\s+/).map(Number);
      if(values.length!==4||!values.every(Number.isFinite))return [];
      // Match the painter: PDF matrices are y-up, while page hits are y-down.
      const [u,v,w,z]=values,[a,b,c,d,e,f]=transform;
      const dx=x-u*x+w*y,dy=y+v*x-z*y;
      transform=[a*u-c*v,b*u-d*v,-a*w+c*z,-b*w+d*z,a*dx+c*dy+e,b*dx+d*dy+f];
      if(!transform.every(Number.isFinite))return [];
      continue;
    }
    if(command!=='i'||![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)continue;
    const image=display.images_info?.[index],path=stagedRasterPath(image?.file);
    if(!path||image.cached_picture||image.page>1||image.pages>1||!getRaster?.(image.file))continue;
    hits.push({path,transform,box:[x,y,width,height]});
  }
  return stack.length?[]:hits;
}
