// Actual Tauri/WebView2 integration. The native picker is operated separately;
// no native backend or directory handle is substituted in this test.
const {chromium}=require('playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const output=resolve('test-results/phase1/desktop-final');
const fixture=resolve(output,'Lineae-Phase1-Acceptance 中文-'+Date.now());
let child,browser,page;
async function start(){
 child=spawn(resolve('apps/desktop/src-tauri/target/debug/lineae.exe'),[],{env:{...process.env,WEBVIEW2_USER_DATA_FOLDER:resolve(output,'webview-profile'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9235'},stdio:'ignore'});
 for(let n=0;n<150;n++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9235');break;}catch{await new Promise(done=>setTimeout(done,200));}}
 assert.ok(browser,'WebView2 CDP did not start');
 for(let n=0;n<100;n++){page=browser.contexts()[0]?.pages().find(p=>p.url().includes('tauri.localhost'));if(page)break;await new Promise(done=>setTimeout(done,200));}
 assert.ok(page);await page.locator('#project-open').waitFor();
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#project-open').click();
 console.log('NATIVE_PICKER_READY '+fixture);
 await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('main.tex'),null,{timeout:180000});
 assert.equal(await page.locator('#project-explorer').isVisible(),false);
 assert.equal(await page.locator('.document-status > :first-child').getAttribute('id'),'project-toggle');
 await page.locator('#project-toggle').click();
 await page.locator('#project-explorer summary').filter({hasText:'sections'}).click();
}
async function edit(path,text){await page.locator(`[data-path="${path}"]`).click();await page.locator('.cm-content').click();await page.keyboard.press('Control+End');await page.keyboard.insertText(text);}
(async()=>{
 await fs.mkdir(output,{recursive:true});await fs.cp('tests/fixtures/project-acceptance',fixture,{recursive:true});
 await fs.mkdir(resolve(fixture,'figures'),{recursive:true});
 await fs.writeFile(resolve(fixture,'figures/experiment.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=','base64'));
 const method=await fs.readFile(resolve(fixture,'sections/method.tex'),'utf8');await fs.writeFile(resolve(fixture,'sections/method.tex'),method.replace(/\r?\n/g,'\r\n'));
 await start();
 await edit('sections/introduction.tex',' Native intro draft');
 await edit('sections/method.tex',' Native method draft');
 await page.locator('[data-source-mode="split"]').click();
 await page.waitForFunction(()=>document.querySelector('.tex-preview')?.textContent.includes('Native method draft'));
 await page.screenshot({path:resolve(output,'before-termination.png')});
 const checkpoint=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('lineae:project-')));
 assert.ok(checkpoint.some(([key,value])=>key.includes('recovery')&&value.includes('Native intro draft')&&value.includes('Native method draft')));
 const metadata=checkpoint.find(([key])=>key.includes('project-state'))[1];
 async function journalReady(){for(const name of await fs.readdir(fixture)){if(!name.startsWith('.lineae-state-'))continue;try{const state=JSON.parse(await fs.readFile(resolve(fixture,name),'utf8'));if(JSON.stringify(state.drafts).includes('Native intro draft')&&JSON.stringify(state.drafts).includes('Native method draft'))return true;}catch{}}return false;}
 for(let n=0;n<100 && !await journalReady();n++)await new Promise(done=>setTimeout(done,100));
 assert.ok(await journalReady());
 const killedPid=child.pid;execFileSync('taskkill',['/PID',String(killedPid),'/T','/F']);await new Promise(done=>setTimeout(done,1000));
 browser=null;await fs.writeFile(resolve(fixture,'sections/method.tex'),'external editor changed after kill');
 await start();
 const restoredMetadata=await page.evaluate(()=>Object.entries(localStorage).find(([key])=>key.includes('project-state'))[1]);assert.equal(restoredMetadata,metadata);
 await page.locator('[data-path="sections/method.tex"]').click();assert.match(await page.locator('.cm-content').innerText(),/Native method draft/);
 await page.locator('#project-save').click();await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('changed on disk'));
 assert.equal(await fs.readFile(resolve(fixture,'sections/method.tex'),'utf8'),'external editor changed after kill');
 await page.locator('[data-path="sections/introduction.tex"]').click();assert.match(await page.locator('.cm-content').innerText(),/Native intro draft/);
 await page.locator('#project-save').click();await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
 assert.match(await fs.readFile(resolve(fixture,'sections/introduction.tex'),'utf8'),/Native intro draft/);
 // Regression: exercise the final bridge/Rust operations through real WebView2.
 page.removeAllListeners('dialog');
 page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'sections/重命名 intro.tex':undefined));
 await page.getByRole('button',{name:'重命名 introduction.tex',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('sections/重命名 intro.tex'));
 await edit('sections/重命名 intro.tex',' Native move draft');
 page.removeAllListeners('dialog');
 page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'chapters/移动 intro.tex':undefined));
 await page.getByRole('button',{name:'移动 重命名 intro.tex',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('chapters/移动 intro.tex'));
 assert.match(await page.locator('.cm-content').innerText(),/Native move draft/);
 await page.locator('#project-save').click();
 await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
 assert.match(await fs.readFile(resolve(fixture,'chapters/移动 intro.tex'),'utf8'),/Native move draft/);
 await assert.rejects(fs.stat(resolve(fixture,'sections/introduction.tex')),{code:'ENOENT'});
 await assert.rejects(fs.stat(resolve(fixture,'sections/重命名 intro.tex')),{code:'ENOENT'});
 const currentText=await page.locator('.cm-content').innerText();
 // Keep partial evidence even when an operator cannot complete the OS dialog.
 await page.screenshot({path:resolve(output,'native-moved-before-cancel.png')});
 await fs.writeFile(resolve(output,'result.json'),JSON.stringify({passed:false,corePassed:true,fixture,pending:['native picker cancellation'],checks:['native picker twice','forced process-tree recovery','external conflict refusal','Chinese rename/move and saved bytes']},null,2));
 console.log('PASS native core workflow; cancellation remains pending');
 await page.locator('#project-open').click();
 console.log('NATIVE_PICKER_CANCEL_READY');
 await page.waitForFunction(()=>document.querySelector('#project-explorer').getAttribute('aria-busy')==='false',null,{timeout:180000});
 assert.equal(await page.locator('.cm-content').innerText(),currentText);
 await page.screenshot({path:resolve(output,'recovered-desktop.png')});
 await fs.writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,killedPid,fixture,checks:['actual native picker twice plus cancellation','hidden tree and leftmost toggle','multi-file drafts','Split preview','forced Tauri process tree termination','persisted file identities','confirmed recovery','external conflict refusal','unchanged-file recovered draft save','Chinese rename and move with dirty draft and new-path save']},null,2));
 console.log('PASS actual Tauri forced-termination/recovery and native filesystem acceptance');
 // The test owns this process tree and its fixtures; WebView2's CDP close alone
 // does not reliably end the native shell while recovered drafts are dirty.
 if(child.exitCode===null)execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});
 await browser.close();
})().catch(error=>{console.error(error);if(child && child.exitCode===null){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});}catch{}}process.exitCode=1;});
