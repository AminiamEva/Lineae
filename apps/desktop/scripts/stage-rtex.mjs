import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const version='0.0.8';
const builds={
  'win32-x64':['x86_64-pc-windows-msvc','zip','b36a2e5abc6216301d180d7b800b1dbbb34672b04946d0b25d227ce6f9590e54'],
  'darwin-arm64':['aarch64-apple-darwin','tar.gz','acf5e46ab8f9ba18c2ccf3c53d8c17c40a7f9e7181df6c977357c30bbe68388f'],
  'linux-x64':['x86_64-unknown-linux-gnu','tar.gz','aeea57a8d1db33fdc509e0ac45a324043cef00e8fbe82b5d2aeba33b8bb5542d'],
};
const build=builds[process.platform+'-'+process.arch];
if(!build)throw new Error('No pinned rtex distribution for this desktop build platform.');
const [target,extension,sha256]=build;
const destination=fileURLToPath(new URL('../src-tauri/resources/rtex',import.meta.url));
const archiveName='rtex-'+target+'.'+extension;
const executable=process.platform==='win32'?'rtex.exe':'rtex';
const bundled=root=>existsSync(join(root,'bin',executable))&&existsSync(join(root,'share','rtex','tex'));
const marker=join(destination,'.archive-sha256');
if(!bundled(destination)||!existsSync(marker)||readFileSync(marker,'utf8')!==sha256){
  const temporary=mkdtempSync(join(tmpdir(),'lineae-rtex-'));
  try{
    const archive=join(temporary,archiveName);
    const url='https://github.com/HenryXiaoYang/realtime-tex/releases/download/v'+version+'/'+archiveName;
    execFileSync(process.platform==='win32'?'curl.exe':'curl',['-fsSL','--retry','3','--max-time','120',url,'-o',archive],{stdio:'inherit'});
    if(createHash('sha256').update(readFileSync(archive)).digest('hex')!==sha256)throw new Error('rtex archive checksum mismatch');
    execFileSync('tar',['-xf',archive,'-C',temporary],{stdio:'inherit'});
    const unpacked=join(temporary,'rtex-'+version+'-'+target);
    if(!bundled(unpacked))throw new Error('rtex archive is missing its executable or TeX assets');
    rmSync(destination,{recursive:true,force:true});
    cpSync(unpacked,destination,{recursive:true,preserveTimestamps:true});
    writeFileSync(marker,sha256);
  }finally{
    rmSync(temporary,{recursive:true,force:true});
  }
}
