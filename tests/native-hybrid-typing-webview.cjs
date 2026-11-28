// Run against the packaged Windows program (or the same Tauri binary in CI).
// Use an isolated profile so a user's document and engine choice stay intact.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const delay=ms=>new Promise(done=>setTimeout(done,ms));

async function run(exe){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'lineae-hybrid-input-'));
  const listener=net.createServer();
  await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const child=spawn(exe,[],{cwd:path.dirname(exe),windowsHide:true,stdio:'ignore',env:{...process.env,
    WEBVIEW2_USER_DATA_FOLDER:profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-address=127.0.0.1 --remote-debugging-port='+port}});
  const closed=new Promise(resolve=>child.once('close',resolve));
  let browser;
  try{
    const deadline=Date.now()+30000;
    while(!browser && Date.now()<deadline){
      assert.equal(child.exitCode,null,'Portable exited before the WebView started');
      try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:500});}
      catch{await delay(150);}
    }
    assert.ok(browser,'Windows WebView did not start');
    const context=browser.contexts()[0];
    const page=context.pages()[0]??await context.waitForEvent('page');
    await page.waitForFunction(()=>document.querySelector('#native-tex-toggle')?.dataset.engine==='lua' &&
      document.querySelector('#native-tex-preview')?.dataset.state==='current',null,{timeout:90000});
    const editor=page.locator('.document-page .ProseMirror');
    await page.locator('#native-tex-preview canvas').first().click();
    const session=await context.newCDPSession(page);
    const trace=await page.evaluateHandle(()=>{
      const dom=document.querySelector('.document-page .ProseMirror'),host=dom.closest('main'),samples=[];
      function record(){
        const selection=document.getSelection(),head=dom.editor.state.selection.$head;
        const rect=selection.rangeCount&&selection.getRangeAt(0).getBoundingClientRect();
        if(rect.height){
          const row={paragraph:head.index(0),text:head.parent.textContent,x:rect.left,y:rect.top,
            confirmed:host.classList.contains('native-ink-confirmed')};
          const last=samples.at(-1);
          if(!last || last.text!==row.text || last.y!==row.y || last.x!==row.x || last.paragraph!==row.paragraph ||
              last.confirmed!==row.confirmed)samples.push(row);
        }
        requestAnimationFrame(record);
      }
      record();return samples;
    });
    const nextPaint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const first='letters typed before a hard break, italic Office';
    await page.keyboard.type(first);await page.keyboard.press('Enter');
    await page.keyboard.type('By');await page.keyboard.press('Enter');await page.keyboard.type('C');
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed'));
    for(const character of ['中','美','学','国','文']){
      await session.send('Input.imeSetComposition',{text:'wen',selectionStart:3,selectionEnd:3});
      await nextPaint();
      assert.ok(await editor.evaluate(el=>el===document.activeElement && el.textContent.includes('wen')));
      await session.send('Input.insertText',{text:character});
      await nextPaint();
      await page.keyboard.press('Enter');
    }
    await page.keyboard.type('NEW');
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$head.parent.textContent==='NEW',null,{timeout:90000});
    await nextPaint();
    const samples=await trace.jsonValue();await trace.dispose();
    const expected=[first,'By','C中','美','学','国','文','NEW'];
    assert.deepEqual(await editor.evaluate(el=>el.editor.state.doc.content.content.map(p=>p.textContent)),expected);
    const handoff=samples.filter(s=>s.text==='NEW');
    assert.ok(handoff.some(s=>!s.confirmed) && handoff.some(s=>s.confirmed),'Sampled both local and native ink');
    const spread=(rows,axis='y')=>Math.max(...rows.map(s=>s[axis]))-Math.min(...rows.map(s=>s[axis]));
    const lastJump=spread(handoff),horizontalJump=spread(handoff,'x');
    const compositionJump=Math.max(...expected.slice(2,-1).map((word,i)=>{
      const samplesForWord=samples.filter(s=>s.paragraph===i+2 && (s.text.endsWith('wen') || s.text===word));
      assert.ok(samplesForWord.some(s=>s.text.endsWith('wen')) && samplesForWord.some(s=>s.text===word),
        'Both sides of the IME commit were sampled for '+word);
      return spread(samplesForWord);
    }));
    await page.locator('[data-source-mode=source]').click();
    const source=await page.locator('.cm-content').innerText();
    const body=source.split('\\begin{document}')[1].split('\\end{document}')[0].trim();
    assert.deepEqual(body.split(/\s*\n\s*/u),expected);
    console.log('WebView displacement in CSS pixels',JSON.stringify({compositionJump,lastJump,horizontalJump}));
    assert.ok(compositionJump<=2 && lastJump<=2 && horizontalJump<=2,
      'Same-line displacement exceeded 2 CSS pixels: '+JSON.stringify(samples.slice(-30)));
  }finally{
    await browser?.close().catch(()=>{});
    if(child.exitCode===null)child.kill();
    await Promise.race([closed,delay(3000)]);
    await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
  }
}
run(path.resolve(process.argv[2]??'apps/desktop/src-tauri/target/debug/lineae.exe')).catch(error=>{console.error(error);process.exitCode=1;});
