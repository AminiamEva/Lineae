const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');

const root=resolve('apps/web');
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+sep))return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
      '.css':'text/css','.otf':'font/otf','.woff2':'font/woff2'})[extname(path)]??'application/octet-stream');
    res.end(await readFile(path));
  }catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      // Transport/UI test only. Real TeX geometry is separately required by
      // native-tex.yml; this synthetic list never counts as engine evidence.
      window.nativeProbe={calls:[],events:[],revision:1,session:0,failFont:false,delayOpen:false};
      const p=window.nativeProbe;
      p.layout=()=>({event:'LayoutUpdate',compile:{state:'Ok'},convergence:{state:'Converged'},
        versions:{source_revision:p.revision,context_revision:1,engine_generation:0,layout_version:p.revision},
        pages_total:1,pages_changed:[{page:1,exact:true,dl:{kind:'page',page:1,
          page_width:39000000,page_height:55000000,width:0,height:0,depth:0,flags:{},images_info:{},
          fonts:{15:{id:15,filename:'/fixture/lmroman10-regular.otf',subfont:1,size:655360,extend:1000,squeeze:1000}},
          other:[],lines:[{x:6500000,y:6500000,w:600000,h:600000,d:0,
            items:[['g',15,97,null,6500000,6500000,327680,0]]}]}}]});
      window.__TAURI__={core:{invoke:async(command,args)=>{
        p.calls.push({command,args});
        if(command==='native_tex_open') {
          p.source=args.source;p.revision=1;
          const sessionId=String(++p.session);
          if(p.delayOpen)await new Promise(done=>{p.resolveOpen=done;});
          p.events.push(p.layout());
          return {sessionId,sourceRevision:1};
        }
        if(command==='native_tex_poll')return p.events.splice(0);
        if(command==='native_tex_update') {
          p.source=args.source;p.revision++;
          p.events.push(p.layout());
          return {editId:p.revision,sourceRevision:p.revision,routed:'fast'};
        }
        if(command==='native_tex_font') {
          if(p.failFont)throw 'The native font is unavailable';
          return [...new Uint8Array(await(await fetch('/assets/fonts/latin-modern/lmroman10-regular.otf')).arrayBuffer())];
        }
        if(command==='native_tex_export')return {jobId:1,sourceRevision:args.sourceRevision,path:'approved.pdf'};
        if(command==='native_tex_close')return;
        throw new Error('Unexpected IPC command '+command);
      }}};
    });
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    await page.locator('input#file').setInputFiles({name:'native.tex',mimeType:'text/plain',
      buffer:Buffer.from('\\documentclass{article}\n\\begin{document}\nBefore $abc$ after.\n\\end{document}\n')});
    const field=page.locator('math-field');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value==='abc');
    await field.click();
    await field.evaluate(field=>{field.dataset.testIdentity='original';field.position=field.lastOffset;});
    const before=await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON());
    assert.deepEqual(await page.evaluate(()=>nativeProbe.calls),[],'No startup compiler execution or implicit document trust');
    const button=page.locator('#native-tex-toggle'),panel=page.locator('#native-tex-preview');
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'MATH-FIELD','Preview does not steal the editing focus');
    assert.deepEqual(await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON()),before,'Opening preview never rewrites source or editor state');
    assert.equal(await field.getAttribute('data-test-identity'),'original','Native preview does not replace the existing editable surface');
    assert.equal(await panel.locator('canvas').count(),1);
    assert.ok(await panel.locator('canvas').evaluate(canvas=>canvas.width>1),'Actual Canvas painting completes before current state');
    await page.keyboard.type('d');
    await page.waitForFunction(()=>nativeProbe.source?.includes('abcd'));
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.keyboard.press('Control+z');
    await page.waitForFunction(()=>document.querySelector('math-field').value==='abc');
    await page.waitForFunction(()=>!nativeProbe.source?.includes('abcd'));
    await page.keyboard.press('Control+y');
    await page.waitForFunction(()=>document.querySelector('math-field').value==='abcd');
    await page.waitForFunction(()=>nativeProbe.source?.includes('abcd') &&
      document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-zoom').selectOption('150');
    await page.locator('#native-tex-export').click();
    assert.ok(await page.evaluate(()=>nativeProbe.calls.some(call=>call.command==='native_tex_export' &&
      call.args.sourceRevision===nativeProbe.revision)),'Export names the exact confirmed source revision');
    await page.locator('#native-tex-close').click();
    assert.equal(await panel.isHidden(),true);
    assert.equal(await field.getAttribute('data-test-identity'),'original');
    await page.evaluate(()=>{nativeProbe.failFont=true;});
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='error');
    assert.equal(await page.locator('#native-tex-export').isDisabled(),true,'Missing resources cannot be presented as exact rendering');
    assert.equal(await panel.locator('canvas').count(),0,'No generic font fallback is painted');
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>{nativeProbe.failFont=false;nativeProbe.delayOpen=true;});
    await button.click();
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>nativeProbe.resolveOpen());
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_close' && call.args.sessionId==='3'));
    assert.equal(await panel.isHidden(),true,'A late native open cannot reopen a closed preview');
    assert.equal(await field.evaluate(field=>field.value),'abcd','Preview failures and cancellation preserve edits');
    assert.deepEqual(errors,[]);
    console.log('PASS native preview transport/UI: explicit startup, Canvas resources, retained editor/history, sync, export revision and cancellation (not engine evidence)');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
