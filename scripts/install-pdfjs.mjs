import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const version='4.10.38';
const integrity='sha512-/Y3fcFrXEAsMjJXeL9J8+ZG9U01LbuWaYypvDW2ycW1jL269L3js3DVBjDJ0Up9Np1uqDXsDrRihHANhZOlwdQ==';
const output=join(root,'apps/web/vendor/pdfjs');
const marker=join(output,'SOURCE.json');
const required=['legacy/build/pdf.mjs','legacy/build/pdf.worker.mjs','cmaps/LICENSE',
  'standard_fonts/LICENSE_FOXIT','standard_fonts/LICENSE_LIBERATION','LICENSE'];
let installed=false;
try {
  const source=JSON.parse(readFileSync(marker,'utf8'));
  installed=source.version===version && source.integrity===integrity &&
    required.every(path=>existsSync(join(output,path)));
}catch{/* A fresh remote checkout has no generated vendor directory. */}
if(!installed) {
  const temporary=mkdtempSync(join(tmpdir(),'lineae-pdfjs-'));
  try {
    const url=`https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-${version}.tgz`;
    const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw new Error(`PDF.js download failed: HTTP ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if('sha512-'+createHash('sha512').update(bytes).digest('base64')!==integrity)
      throw new Error('PDF.js archive integrity mismatch');
    writeFileSync(join(temporary,'pdfjs.tgz'),bytes);
    mkdirSync(join(temporary,'runtime'));
    execFileSync('tar',['-xzf','pdfjs.tgz','-C','runtime','--strip-components=1',
      'package/legacy/build/pdf.mjs','package/legacy/build/pdf.worker.mjs',
      'package/cmaps','package/standard_fonts','package/LICENSE'],{cwd:temporary,stdio:'inherit'});
    cpSync(join(temporary,'runtime'),output,{recursive:true});
    writeFileSync(marker,JSON.stringify({name:'pdfjs-dist',version,url,integrity,
      license:'Apache-2.0',changes:'unmodified selected runtime files',
      standardFonts:'Unmodified upstream fonts; see included LICENSE_FOXIT and LICENSE_LIBERATION',
      cmaps:'Adobe CMaps; see included cmaps/LICENSE'},null,2)+'\n');
  }finally{rmSync(temporary,{recursive:true,force:true});}
}
console.log(`PDF.js ${version} offline module, worker, CMaps, standard fonts and licenses ready`);
