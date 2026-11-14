// Operator-assisted Windows dialog acceptance in the actual Tauri/WebView2 app.
// The native bridge is observed and forwarded unchanged; neither picker nor
// filesystem is mocked. Frozen Tauri exports are observed at the adapter boundary.
const {chromium}=require('playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const {createHash}=require('node:crypto');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const run=resolve('test-results/file-tree-native','picker-'+Date.now());
const fixture=resolve(run,'测试工程 with spaces');
const result={passed:false,stage:'starting',checks:[],fixture};
// This runner requires a human/desktop operator, not a timing-sensitive mock.
const operatorTimeout=600000;
let child,browser,page;
async function record(){
  if(page)result.ipc=await page.evaluate(()=>window.pickerTrace).catch(()=>[]);
  await fs.writeFile(resolve(run,'result.json'),JSON.stringify(result,null,2));
}
async function snapshot(){return page.evaluate(()=>({
  source:document.querySelector('.cm-content')?.textContent??null,
  rich:document.querySelector('.ProseMirror')?.textContent??null,
  filename:document.querySelector('.tex-filename')?.textContent??null,
  active:document.querySelector('.project-file[aria-current="true"]')?.dataset.path??null,
  split:document.querySelector('[data-source-mode="split"]')?.getAttribute('aria-pressed'),
  hidden:document.querySelector('#project-explorer').hidden,
  expanded:[...document.querySelectorAll('#project-explorer details[open] > summary')].map(node=>node.textContent),
  identities:Object.entries(localStorage).filter(([key])=>key.startsWith('lineae:project-state:')),
}));}
async function picker(stage,kind){
  result.stage=stage;await record();
  const count=await page.evaluate(()=>window.pickerTrace.filter(item=>item.command==='open_project').length);
  await page.locator('#project-open').click();
  await page.waitForFunction(count=>window.pickerTrace.filter(item=>item.command==='open_project').length===count+1,count);
  console.log(`${kind==='cancel'?'NATIVE_PICKER_CANCEL_READY':'NATIVE_PICKER_SELECT_READY'} ${stage} ${fixture}`);
  await page.waitForFunction(count=>window.pickerTrace.filter(item=>item.command==='open_project')[count]?.state!=='pending',count,{timeout:operatorTimeout});
  const event=await page.evaluate(count=>window.pickerTrace.filter(item=>item.command==='open_project')[count],count);
  if(kind==='cancel'){
    if(event.boundary==='core'){assert.equal(event.state,'resolved');assert.equal(event.value,null,'Native callback reports cancellation');}
    else {assert.equal(event.state,'cancelled');assert.equal(event.errorName,'AbortError','Real bridge reports native cancellation');}
  } else {assert.equal(event.state,'resolved');assert.equal(typeof event.value,'string');}
  await page.waitForFunction(()=>document.querySelector('#project-explorer').getAttribute('aria-busy')==='false');
  await record();
  return event;
}
(async()=>{
  await fs.mkdir(resolve(fixture,'第一章'),{recursive:true});
  await fs.writeFile(resolve(fixture,'main.tex'),'\\documentclass{article}\r\n\\begin{document}\nNative picker main.\r\n\\end{document}\r\n');
  await fs.writeFile(resolve(fixture,'第一章/研究方法.tex'),'Chinese child.\r\n');
  // Run an immutable copy so an operator-held picker never locks Cargo's next
  // build output. Tauri's staged frontend is embedded in this compiled binary.
  const build=resolve('apps/desktop/src-tauri/target/debug'), app=resolve(run,'app');
  await fs.mkdir(app,{recursive:true});
  for(const name of (await fs.readdir(build)).filter(name=>name==='lineae.exe' || name.endsWith('.dll'))){
    await fs.copyFile(resolve(build,name),resolve(app,name),constants.COPYFILE_EXCL);
  }
  result.executable=resolve(app,'lineae.exe');
  result.executableSha256=createHash('sha256').update(await fs.readFile(result.executable)).digest('hex');
  child=spawn(result.executable,[],{
    env:{...process.env,WEBVIEW2_USER_DATA_FOLDER:resolve(run,'webview-profile'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9237'},stdio:'ignore',
  });
  result.pid=child.pid;console.log('NATIVE_PICKER_APP '+JSON.stringify({pid:child.pid,output:run,executable:result.executable,sha256:result.executableSha256}));
  for(let n=0;n<150;n++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9237');break;}catch{await new Promise(done=>setTimeout(done,200));}}
  assert.ok(browser,'Actual WebView2 CDP did not start');
  for(let n=0;n<100;n++){page=browser.contexts()[0]?.pages().find(page=>page.url().includes('tauri.localhost'));if(page)break;await new Promise(done=>setTimeout(done,200));}
  assert.ok(page);await page.locator('#project-open').waitFor();
  page.on('dialog',dialog=>{console.log('WEB_DIALOG '+dialog.type()+' '+dialog.message().split('\n')[0]);dialog.accept();});
  result.observer=await page.evaluate(()=>{
    window.pickerTrace=[];
    const core=window.__TAURI__?.core,invoke=core?.invoke;
    const observedInvoke=async function(command,args,options){
      const event={command,operation:args?.operation??null,boundary:'core',state:'pending'};window.pickerTrace.push(event);
      try{const value=await invoke.call(core,command,args,options);event.state='resolved';if(command==='open_project')event.value=value;return value;}
      catch(error){event.state='rejected';event.error=String(error);throw error;}
    };
    try {if(core)core.invoke=observedInvoke;}catch{}
    if(core?.invoke===observedInvoke)return 'core.invoke';
    // Tauri's global API export can be read-only. Observe our existing bridge
    // rather than claiming interception succeeded or modifying native results.
    const originalOpen=window.lineaeProject.open;
    const observedOpen=async function(...args){
      const event={command:'open_project',boundary:'adapter',state:'pending'};window.pickerTrace.push(event);
      try {const adapter=await originalOpen.apply(this,args);event.state='resolved';event.value=adapter.root;return adapter;}
      catch(error){event.state=error.name==='AbortError'?'cancelled':'rejected';event.errorName=error.name;event.error=String(error);throw error;}
    };
    window.lineaeProject.open=observedOpen;
    if(window.lineaeProject.open!==observedOpen)throw new Error('Cannot observe actual native bridge; no dialog opened');
    return 'lineaeProject.open (Tauri core export read-only)';
  });
  console.log('NATIVE_PICKER_OBSERVER '+result.observer);
  const standalone=await snapshot();
  await picker('standalone-cancel','cancel');
  assert.deepEqual(await snapshot(),standalone);
  if(result.observer==='core.invoke')assert.equal(await page.evaluate(()=>window.pickerTrace.some(event=>event.command==='project_operation')),false);
  result.checks.push('Standalone native cancellation completes through the actual bridge and preserves editor');
  await page.screenshot({path:resolve(run,'standalone-cancelled.png')});await record();

  const selected=await picker('choose-chinese-project','select');
  assert.equal(selected.value.replace(/^\\\\\?\\/,''),fixture,'Selected the fixture for this run, not a previously remembered directory');
  assert.equal(await page.locator('#project-explorer').isVisible(),false);
  assert.equal(await page.locator('.document-status > :first-child').getAttribute('id'),'project-toggle');
  await page.locator('#project-toggle').click();
  await page.locator('#project-explorer summary').filter({hasText:'第一章'}).click();
  const code=page.locator('.cm-content');
  await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' Main dirty draft');
  await page.locator('[data-path="第一章/研究方法.tex"]').click();
  await page.locator('[data-source-mode="split"]').click();
  await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' Child dirty MARKER');
  await page.waitForFunction(()=>document.querySelector('.tex-preview .ProseMirror').textContent.includes('MARKER'));
  await page.keyboard.down('Shift');for(let n=0;n<6;n++)await page.keyboard.press('ArrowLeft');await page.keyboard.up('Shift');
  await page.evaluate(()=>window.pickerCodeNode=document.querySelector('.cm-editor'));
  result.checks.push('Real Chinese/space directory selected, tree defaults hidden, two dirty sessions and Split established');
  const current=await snapshot();
  await page.screenshot({path:resolve(run,'before-dirty-cancel.png')});
  const cancelEvent=await picker('dirty-project-cancel','cancel');
  assert.ok(cancelEvent.state==='cancelled' || cancelEvent.value===null);assert.deepEqual(await snapshot(),current);
  assert.equal(await page.evaluate(()=>window.pickerCodeNode===document.querySelector('.cm-editor')),true);
  await code.focus();await page.keyboard.insertText('REPLACED');
  assert.match(await code.innerText(),/Child dirty REPLACED/);assert.doesNotMatch(await code.innerText(),/MARKER/);
  await page.keyboard.press('Control+z');assert.match(await code.innerText(),/Child dirty MARKER/);
  await page.locator('[data-path="main.tex"]').click();assert.match(await code.innerText(),/Main dirty draft/);
  await page.locator('[data-path="第一章/研究方法.tex"]').click();assert.match(await code.innerText(),/Child dirty MARKER/);
  assert.equal(await page.locator('[data-source-mode="split"]').getAttribute('aria-pressed'),'true');
  assert.equal(await fs.readFile(resolve(fixture,'第一章/研究方法.tex'),'utf8'),'Chinese child.\r\n');
  result.checks.push('Dirty native cancellation preserves file IDs, tree, active file, selection, undo, both drafts, Split and CodeMirror identity; disk remains unchanged');
  await page.screenshot({path:resolve(run,'dirty-cancelled.png')});
  result.stage='complete';result.passed=true;await record();console.log('PASS actual native picker selection and both cancellation scenarios '+run);
})().catch(async error=>{
  result.error=error.message;console.error(error);
  if(page)await page.screenshot({path:resolve(run,'failure.png')}).catch(()=>{});
  await record().catch(()=>{});process.exitCode=1;
}).finally(async()=>{
  if(child?.exitCode===null){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
  if(browser)await browser.close().catch(()=>{});
});
