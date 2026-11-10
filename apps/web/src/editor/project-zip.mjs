const utf8 = new TextEncoder();

function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) {
    crc^=byte;
    for(let bit=0;bit<8;bit++) crc=(crc>>>1)^(crc&1?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

export function safeProjectPath(path) {
  return typeof path==='string' && !/[\\:\u0000-\u001f]/.test(path)
    && path.split('/').every(part=>part && part!=='.' && part!=='..');
}

export function projectDependencies(tex) {
  const source=tex.replace(/\\begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\1\}/g,'')
    .replace(/\\[\\%]|%[^\r\n]*/g,token=>token.startsWith('%')?'':token);
  const dependencies=[];
  for(const match of source.matchAll(/\\(includegraphics|addbibresource|bibliography|input|include)(?:\[[^\]]*\])?\{([^{}]+)\}/g)) {
    const command=match[1];
    const names=command==='bibliography'?match[2].split(','):[match[2]];
    for(const raw of names) {
      let path=raw.trim();
      if(!path)continue;
      if(command==='bibliography'&&!path.endsWith('.bib'))path+='.bib';
      if((command==='input'||command==='include')&&!/\.[^/]+$/.test(path))path+='.tex';
      dependencies.push(path);
    }
  }
  return dependencies;
}

export async function buildProjectZip(entries) {
  const local=[], central=[];
  const seen=new Set();
  let offset=0, directorySize=0;
  if(entries.length>65535)throw new RangeError('Too many ZIP entries');
  for(const [path,value] of entries) {
    if(!safeProjectPath(path)||seen.has(path))throw new TypeError('Invalid ZIP entry: '+path);
    seen.add(path);
    const name=utf8.encode(path);
    const bytes=typeof value==='string'?utf8.encode(value):new Uint8Array(await value.arrayBuffer());
    if(name.length>65535 || offset+bytes.length+name.length+76>0xffffffff)throw new RangeError('ZIP entry too large');
    const crc=crc32(bytes);
    const header=new DataView(new ArrayBuffer(30));
    header.setUint32(0,0x04034b50,true);header.setUint16(4,20,true);header.setUint16(6,0x800,true);
    header.setUint16(12,33,true);header.setUint32(14,crc,true);header.setUint32(18,bytes.length,true);
    header.setUint32(22,bytes.length,true);header.setUint16(26,name.length,true);
    const record=new DataView(new ArrayBuffer(46));
    record.setUint32(0,0x02014b50,true);record.setUint16(4,20,true);record.setUint16(6,20,true);
    record.setUint16(8,0x800,true);record.setUint16(14,33,true);record.setUint32(16,crc,true);
    record.setUint32(20,bytes.length,true);record.setUint32(24,bytes.length,true);record.setUint16(28,name.length,true);
    record.setUint32(42,offset,true);
    local.push(header.buffer,name,bytes);central.push(record.buffer,name);
    offset+=30+name.length+bytes.length;directorySize+=46+name.length;
  }
  if(offset+directorySize+22>0xffffffff)throw new RangeError('ZIP archive too large');
  const end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);
  end.setUint32(12,directorySize,true);end.setUint32(16,offset,true);
  return new Blob([...local,...central,end.buffer],{type:'application/zip'});
}
