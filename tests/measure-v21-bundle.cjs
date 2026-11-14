// Usage: node tests/measure-v21-bundle.cjs <clean baseline archive directory>
// Reuse identical paths/dependencies/options, substituting only baseline sources,
// so esbuild's generated module-path comments do not distort the comparison.
const {build}=require('esbuild');
const {readFile}=require('node:fs/promises');
const {resolve,relative,join,sep}=require('node:path');
const {gzipSync}=require('node:zlib');
(async()=>{
  const root=process.cwd(),baseline=resolve(process.argv[2]);
  const options={entryPoints:['apps/web/src/main.js'],bundle:true,format:'esm',loader:{'.yaml':'text'},write:false};
  const measure=bytes=>({bytes:bytes.length,gzip:gzipSync(bytes).length});
  const old=await build({...options,plugins:[{name:'baseline-source',setup(builder){
    builder.onLoad({filter:/\.(?:js|mjs|yaml)$/},async args=>{
      const path=relative(root,args.path);
      if(!path.startsWith('apps'+sep+'web'+sep))return;
      return {contents:await readFile(join(baseline,path)),loader:path.endsWith('.yaml')?'text':'js'};
    });
  }}]});
  const current=await build(options);
  const before=measure(old.outputFiles[0].contents),after=measure(current.outputFiles[0].contents);
  const beforeCss=measure(await readFile(join(baseline,'apps/web/source-workspace.css'))),afterCss=measure(await readFile('apps/web/source-workspace.css'));
  console.log(JSON.stringify({before,after,delta:{bytes:after.bytes-before.bytes,gzip:after.gzip-before.gzip},beforeCss,afterCss,cssDelta:{bytes:afterCss.bytes-beforeCss.bytes,gzip:afterCss.gzip-beforeCss.gzip},dependenciesAdded:0},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
