const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const root=resolve('apps/web');
const server=createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html');
  const path=resolve(root,'.'+name);
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try {
    const file=name==='/editor.mjs' && process.env.LINEAE_BUNDLE_OVERRIDE ? process.env.LINEAE_BUNDLE_OVERRIDE : path;
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]??'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.writeHead(404).end();}
});
(async()=>{
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    console.log('Windows Chromium',browser.version(),process.platform);
    const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
    const errors=[]; context.on('page',page=>page.on('pageerror',e=>errors.push(e.stack)));
    const url='http://127.0.0.1:'+server.address().port+'/';
    for(const check of (process.env.LINEAE_BROWSER_CHECKS||'source-workspace').split(',')){
      await require(process.env.LINEAE_BROWSER_TEST_OVERRIDE||'./'+check+'.cjs')(context,url);
      console.log('PASS',check);
    }
    require('node:assert/strict').deepEqual(errors,[],'no browser exceptions');
  } finally {await browser?.close();await new Promise(done=>server.close(done));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
