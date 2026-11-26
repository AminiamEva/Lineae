const maxFontBytes=32*1024*1024;
const ttcf=0x74746366;
const otto=0x4f54544f;
const trueType=0x00010000;
const macTrueType=0x74727565;
const head=0x68656164;
const pad4=size=>Math.ceil(size/4)*4;

// OpenType outline readers expect standalone font tables. LuaTeX reports
// collection members as one-based subfonts, with zero for the default face.
export function nativeFontFace(bytes,subfont=0) {
  const source=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.byteLength<4)throw new Error('Truncated native font');
  if(source.getUint32(0)!==ttcf)return bytes;
  if(bytes.byteLength<12)throw new Error('Truncated font collection');
  const version=source.getUint32(4),count=source.getUint32(8);
  const index=subfont===0?0:subfont-1;
  if(![0x00010000,0x00020000].includes(version)||!Number.isInteger(index)||index<0||index>=count||
      count>Math.floor((bytes.byteLength-12)/4))throw new Error('Invalid font collection face');
  const offset=source.getUint32(12+index*4);
  if(offset>bytes.byteLength-12)throw new Error('Invalid font collection directory');
  const kind=source.getUint32(offset),tables=source.getUint16(offset+4);
  const directorySize=12+tables*16;
  if(![otto,trueType,macTrueType].includes(kind)||!tables||offset+directorySize>bytes.byteLength)
    throw new Error('Invalid font collection directory');
  const records=[];
  let total=directorySize;
  for(let ordinal=0;ordinal<tables;ordinal++){
    const record=offset+12+ordinal*16;
    const start=source.getUint32(record+8),length=source.getUint32(record+12);
    if(start>bytes.byteLength-length||total+pad4(length)>maxFontBytes)
      throw new Error('Invalid font collection table range');
    records.push({ordinal,record,start,length,destination:total});
    total+=pad4(length);
  }
  const face=new Uint8Array(total),font=new DataView(face.buffer);
  face.set(bytes.subarray(offset,offset+directorySize));
  let adjustment;
  for(const {ordinal,record,start,length,destination} of records){
    face.set(bytes.subarray(start,start+length),destination);
    font.setUint32(12+ordinal*16+8,destination);
    if(source.getUint32(record)===head&&length>=12)adjustment=destination+8;
  }
  if(adjustment!==undefined){
    font.setUint32(adjustment,0);
    let checksum=0;
    for(let at=0;at<total;at+=4)checksum=(checksum+font.getUint32(at))>>>0;
    font.setUint32(adjustment,(0xb1b0afba-checksum)>>>0);
  }
  return face;
}
