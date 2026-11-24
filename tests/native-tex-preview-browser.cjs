const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const installMockNativeTex=require('./native-math/mock-bridge.cjs');
const {revealToolbar}=require('./workspace-ui-helpers.cjs');

const root=resolve('apps/web');
const server=createServer(async(req,res)=>{
  if(req.url==='/native-acceptance.pdf'&&process.env.LINEAE_NATIVE_PDF){
    try {res.setHeader('Content-Type','application/pdf');res.end(await readFile(process.env.LINEAE_NATIVE_PDF));}
    catch{res.writeHead(404).end();}
    return;
  }
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
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current' &&
      document.querySelector('#native-tex-preview').dataset.renderer==='pdf');
    assert.equal(await panel.locator('[data-pdf-page] canvas').count(),1,'Unsupported direct font rendering uses an actual PDF page, not a generic-font substitute');
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>{nativeProbe.failPdf=true;});
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='error');
    assert.equal(await page.locator('#native-tex-export').isDisabled(),true,'Missing resources cannot be presented as exact rendering');
    assert.equal(await panel.locator('canvas').count(),0,'No generic font fallback is painted');
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>{nativeProbe.failFont=false;nativeProbe.failPdf=false;nativeProbe.delayOpen=true;});
    await button.click();
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>nativeProbe.resolveOpen());
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_close' && call.args.sessionId===String(nativeProbe.session)));
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
    await page.locator('#native-tex-close').click();
    await page.evaluate(async()=>{
      const root=await navigator.storage.getDirectory();
      window.luaProjectDirectory=await root.getDirectoryHandle('lua-'+crypto.randomUUID(),{create:true});
      const put=async(dir,name,bytes)=>{
        const file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable();
        await writer.write(bytes);await writer.close();
      };
      await put(luaProjectDirectory,'main.tex','\\documentclass{article}\n\\begin{document}\n\\input{chapters/one}\n\\end{document}\n');
      const chapter=await luaProjectDirectory.getDirectoryHandle('chapters',{create:true});
      await put(chapter,'one.tex','Original chapter.\n');
      await put(luaProjectDirectory,'image.png',new Uint8Array([0,255,13,10]));
      window.showDirectoryPicker=async()=>luaProjectDirectory;
    });
    page.on('dialog',dialog=>dialog.accept());
    await revealToolbar(page);await page.locator('[data-group=files]').click();
    await page.locator('#project-open').click();
    await page.locator('.project-file[aria-current=true]').waitFor({state:'attached'});
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    const projectOpen=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_open').at(-1).args);
    assert.equal(projectOpen.mainFile,'main.tex');
    assert.match(projectOpen.source,/\\input\{chapters\/one\}/,'Compile the actual main source rather than a flattened editor projection');
    assert.ok(projectOpen.files.some(file=>file.path==='chapters/one.tex'));
    assert.deepEqual(projectOpen.files.find(file=>file.path==='image.png').bytes,[0,255,13,10]);
    const previousId=await page.evaluate(()=>String(nativeProbe.session));
    if(!await page.locator('#project-explorer').isVisible())await page.locator('#project-toggle').click();
    const folder=page.locator('#project-explorer summary').filter({hasText:/^chapters$/});
    if(!await folder.evaluate(node=>node.parentElement.open))await folder.click();
    await page.locator('[data-path="chapters/one.tex"]').click();
    await page.locator('[data-source-mode=source]').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press(mod+'+a');
    await page.evaluate(()=>{nativeProbe.restartNext=true;});
    await page.keyboard.type('Changed chapter.\n');
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_update' &&
      call.args.files?.some(file=>file.path==='chapters/one.tex' &&
        new TextDecoder().decode(new Uint8Array(file.bytes))==='Changed chapter.\n')));
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    assert.notEqual(await page.evaluate(()=>String(nativeProbe.session)),previousId,'Dependency changes may replace the native session without resetting editor history');
    assert.match(await page.locator('.cm-content').textContent(),/Changed chapter\./);
    assert.deepEqual(errors,[]);
    if(process.env.LINEAE_NATIVE_PDF){
      await page.close();
      page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
      await page.addInitScript(installMockNativeTex);
      await page.addInitScript(()=>{
        nativeProbe.failFont=true;
        const invoke=window.__TAURI__.core.invoke;
        window.__TAURI__.core.invoke=async(command,args)=>{
          if(command==='native_tex_render_pdf')return [...new Uint8Array(
            await(await fetch('/native-acceptance.pdf')).arrayBuffer())];
          return invoke(command,args);
        };
      });
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
      await page.locator('input#file').setInputFiles({name:'preview.tex',mimeType:'text/plain',buffer:input});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current'&&
        document.querySelector('#native-tex-preview').dataset.renderer==='pdf');
      assert.ok(await page.locator('[data-pdf-page="1"] canvas').evaluate(canvas=>canvas.width>1));
      const text=await page.evaluate(async()=>{
        const api=await import('/vendor/pdfjs/legacy/build/pdf.mjs');
        api.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/legacy/build/pdf.worker.mjs';
        const task=api.getDocument({data:new Uint8Array(await(await fetch('/native-acceptance.pdf')).arrayBuffer()),
          isEvalSupported:false,useSystemFonts:false});
        const doc=await task.promise,words=[];
        for(let number=1;number<=doc.numPages;number++)
          words.push(...(await(await doc.getPage(number)).getTextContent()).items.map(item=>item.str??''));
        await task.destroy();return words.join(' ');
      });
      assert.match(text,/42/,'Actual LuaLaTeX PDF includes executed Lua output');
      assert.match(text,/TikZ/,'Actual drawing document reached the PDF renderer');
      console.log('PASS real LuaLaTeX-generated PDF rendered with the bundled PDF.js worker');
    }
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
