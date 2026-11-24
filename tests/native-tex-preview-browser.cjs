const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const installMockNativeTex=require('./native-math/mock-bridge.cjs');

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
  let page;
  try {
    page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
    const mod=process.platform==='darwin'?'Meta':'Control';
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(installMockNativeTex);
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
    assert.ok(await page.evaluate(()=>nativeProbe.ruleRects.some(rect=>rect.w===3000000 && rect.h===6554)),
      'Thin rules retain native TeX geometry instead of being widened to a device-pixel minimum');
    await page.keyboard.type('d');
    await page.waitForFunction(()=>nativeProbe.source?.includes('abcd'));
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.keyboard.press(mod+'+z');
    await page.waitForFunction(()=>document.querySelector('math-field').value==='abc');
    await page.waitForFunction(()=>!nativeProbe.source?.includes('abcd'));
    await page.keyboard.press(mod+'+y');
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
    await page.evaluate(()=>{nativeProbe.delayOpen=false;});
    const input=await readFile('tests/native-math/fixtures/empty-denominator.tex');
    const expected=await readFile('tests/native-math/fixtures/filled-denominator.tex','utf8');
    await page.locator('input#file').setInputFiles({name:'denominator.tex',mimeType:'text/plain',buffer:input});
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\frac'));
    await field.click();
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await field.evaluate(field=>{
      const model=field._mathfield.model;
      const fraction=model.atoms.find(atom=>atom.type==='genfrac');
      field.position=model.offsetOf(fraction.branch('below')[0]);
      window.nativeProbe.denominatorBefore={value:field.value,position:field.position,
        atoms:fraction.branch('below').map(atom=>({type:atom.type,value:atom.value}))};
    });
    await page.keyboard.type('b');
    await page.waitForFunction(()=>nativeProbe.revision>1);
    assert.equal(await page.evaluate(()=>nativeProbe.source.replace(/\r\n/g,'\n')),expected.replace(/\r\n/g,'\n'),
      'Filling the denominator changes exactly one source letter');
    await page.keyboard.press(mod+'+z');
    await page.waitForFunction(original=>nativeProbe.source?.replace(/\r\n/g,'\n')===original,input.toString().replace(/\r\n/g,'\n'));
    await page.keyboard.press(mod+'+y');
    await page.waitForFunction(expected=>nativeProbe.source?.replace(/\r\n/g,'\n')===expected,expected.replace(/\r\n/g,'\n'));
    assert.deepEqual(errors,[]);
    console.log('PASS native preview transport/UI: explicit startup, Canvas resources, retained editor/history, sync, export revision and cancellation (not engine evidence)');
  }catch(error){
    if(page)console.error('Native preview UI diagnostic:',await page.evaluate(()=>({
      state:document.querySelector('#native-tex-preview')?.dataset.state,
      status:document.querySelector('#native-tex-preview [role=status]')?.textContent,
      source:window.nativeProbe?.source?.slice(0,1600),
      value:document.querySelector('math-field')?.value,
      denominatorBefore:window.nativeProbe?.denominatorBefore,
      calls:window.nativeProbe?.calls.slice(-6).map(call=>({command:call.command,key:call.args?.key})),
    })));
    throw error;
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
