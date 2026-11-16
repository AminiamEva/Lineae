// Run focused source suites or the complete editor.cjs separately.
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const root=resolve('apps/web');
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try {res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.otf':'font/otf'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}
  catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const browser=await chromium.launch({headless:true,...(process.env.LINEAE_CHROMIUM_EXECUTABLE?{executablePath:process.env.LINEAE_CHROMIUM_EXECUTABLE}:{})});
  try{
    const context=await browser.newContext();
    for(const suite of process.argv.slice(2).length?process.argv.slice(2):['source-v21']){
      if(!/^source-[a-z0-9-]+$/.test(suite))throw new Error('Invalid suite name');
      await require('./'+suite+'.cjs')(context,'http://127.0.0.1:'+server.address().port+'/');
      console.log(suite+': PASS');
    }
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
