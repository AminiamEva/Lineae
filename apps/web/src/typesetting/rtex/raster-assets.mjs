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
