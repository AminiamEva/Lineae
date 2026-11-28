// Run against the packaged Windows program (or the same Tauri binary in CI).
// Use an isolated profile so a user's document and engine choice stay intact.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const measureHybridTyping=require('./native-hybrid-typing-scenario.cjs');
const delay=ms=>new Promise(done=>setTimeout(done,ms));

function webViewEndpoint(port){
  return new Promise((resolve,reject)=>{
    const request=http.get({host:'127.0.0.1',port,path:'/json/version',timeout:2000},response=>{
      let body='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{body+=chunk;});
      response.on('end',()=>{
        try{
          const endpoint=JSON.parse(body).webSocketDebuggerUrl;
          if(!endpoint)throw new Error('No WebView debugger endpoint in '+body);
          resolve(endpoint);
        }catch(error){reject(error);}
      });
      response.on('error',reject);
    });
    request.on('timeout',()=>request.destroy(new Error('WebView discovery timed out')));
    request.on('error',reject);
  });
}

async function run(exe){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'lineae-hybrid-input-'));
  const listener=net.createServer();
  await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const child=spawn(exe,[],{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,
    WEBVIEW2_USER_DATA_FOLDER:profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-address=127.0.0.1 --remote-debugging-port='+port}});
  let stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
  const closed=new Promise(resolve=>child.once('close',resolve));
  let browser;
  try{
    const deadline=Date.now()+45000;
    let endpoint,lastError;
    while(!endpoint && Date.now()<deadline){
      assert.equal(child.exitCode,null,'Desktop app exited before WebView startup: '+stderr);
      try{endpoint=await webViewEndpoint(port);}
      catch(error){lastError=error;await delay(150);}
    }
    assert.ok(endpoint,'WebView discovery failed: '+lastError?.message+'; '+stderr);
    browser=await chromium.connectOverCDP(endpoint,{timeout:30000});
    const context=browser.contexts()[0];
    const page=context.pages()[0]??await context.waitForEvent('page');
    await page.waitForLoadState('domcontentloaded');
    const session=await context.newCDPSession(page);
    await page.exposeFunction('lineaeTestInput',(method,params)=>session.send(method,params));
    console.log('WebView displacement in CSS pixels',JSON.stringify(await page.evaluate(measureHybridTyping)));
  }finally{
    await browser?.close().catch(()=>{});
    if(child.exitCode===null)child.kill();
    await Promise.race([closed,delay(3000)]);
    await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
  }
}
async function embedded(exe){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'lineae-hybrid-ci-'));
  const child=spawn(exe,['--lineae-hybrid-typing-check'],{env:{...process.env,WEBVIEW2_USER_DATA_FOLDER:profile},
    stdio:['ignore','ignore','pipe'],windowsHide:true});
  let output='';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',chunk=>{output=(output+chunk).slice(-12000);process.stderr.write(chunk);});
  const timer=setTimeout(()=>child.kill(),240000);
  try{
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    assert.equal(code,0,'Desktop nested input check: '+output);
    assert.match(output,/WebView displacement in CSS pixels/);
  }finally{
    clearTimeout(timer);
    await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
  }
}
const inProcess=process.argv[2]==='--embedded';
const executable=path.resolve((inProcess?process.argv[3]:process.argv[2])??'apps/desktop/src-tauri/target/debug/lineae.exe');
(inProcess?embedded:run)(executable).catch(error=>{console.error(error);process.exitCode=1;});
