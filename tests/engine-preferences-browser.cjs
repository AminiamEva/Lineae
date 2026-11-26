const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const {revealToolbar,chooseEngine,readEngineSettings}=require('./workspace-ui-helpers.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=Buffer.from('\uFEFF% 源码\r\n\\documentclass{article}\n\\usepackage{etoolbox}\r\n\\ifstrequal{a}{b}{}{}\n\\usepackage{xeCJK}\r\n\\newcommand{\\keep}{原样}\n\\begin{document}\r\nPreserved text.\n\\end{document}\r\n');
const server=spawn(process.execPath,['scripts/serve.mjs','apps/web','39771'],{stdio:['ignore','pipe','inherit']});
(async()=>{
 await once(server.stdout,'data');
 const dir=await mkdtemp(join(tmpdir(),'lineae-engine-'));
 let context,page;
 async function start(expectedDefault='lualatex'){
  context=await chromium.launchPersistentContext(dir,{headless:true,viewport:{width:1600,height:1000},deviceScaleFactor:1});
  page=context.pages()[0];page.setDefaultTimeout(10000);
  page.on('pageerror',e=>console.error('pageerror',e.message));
  await page.goto('http://127.0.0.1:39771');
  await profile(expectedDefault);
 }
 const profile=engine=>page.locator('.ProseMirror[data-paragraph-profile="'+engine+'"]').first().waitFor({state:'attached'});
 const pick=value=>chooseEngine(page,value);
 const state=()=>readEngineSettings(page);
 async function load(bytes=source){
  await page.locator('#file').setInputFiles({name:'legacy.tex',mimeType:'text/plain',buffer:bytes});
  await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent==='Preserved text.');
 }
 async function openProject(create,legacy=false){
  await page.evaluate(async ([create,legacy])=>{
   const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle(legacy?'legacy-xe':'工程',{create:true});
   if(create){
    for(const [name,text] of [['main.tex','\\documentclass{article}\r\n\\input{chapter}\n\\begin{document}Root\\end{document}'],['chapter.tex',legacy?'\\usepackage{xeCJK}':'\\usepackage{luatexja}\n子文件']]){
     const w=await (await dir.getFileHandle(name,{create:true})).createWritable();await w.write(text);await w.close();
    }
   }
   window.showDirectoryPicker=async()=>dir;
  },[create,legacy]);
  await revealToolbar(page);
  if(!await page.locator('#project-open').isVisible())await page.locator('[data-group=files]').click();
  await page.locator('#project-open').click();
  await page.locator('.project-file[aria-current=true]').waitFor({state:'attached'});
 }
 try {
  await start();console.log('Chromium',await page.evaluate(()=>navigator.userAgent));
  assert.equal((await state()).choice,'auto');
  await page.locator('#settings-open').click();
  const setting=page.locator('[data-setting="typesetting.defaultEngine"]');
  await setting.evaluate(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  const language=page.locator('[data-setting="interface.language"]');
  await language.evaluate(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  await language.selectOption('zh-CN');
  await setting.selectOption('xelatex');
  await page.locator('#settings-apply').click();await profile('xelatex');
  assert.equal(await page.locator('label[for=engine-choice] span').textContent(),'当前文档引擎');
  if(!await page.locator('#settings-panel').isVisible())await page.locator('#settings-open').click();
  await setting.evaluate(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  await language.evaluate(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  await language.selectOption('en');
  await setting.selectOption('lualatex');await page.locator('#settings-apply').click();await profile('lualatex');
  if(await page.locator('#settings-panel').isVisible())await page.locator('#settings-close').click();
  assert.equal(await page.locator('label[for=engine-choice] span').textContent(),'Current document engine');
  await load(Buffer.from(source.toString().replace('\\usepackage{xeCJK}','\\usepackage{xeCJK,luatexja}')));
  await profile('unresolved');assert.equal((await state()).diagnostics.length,2);
  await load();await profile('xelatex');
  assert.match((await state()).status,/xeCJK/);
  await pick('lualatex');await profile('lualatex');
  assert.match((await state()).diagnostics.join(' '),/legacy\.tex:5:1.*xeCJK/);
  const pm=page.locator('.ProseMirror').first();
  await pm.click();await page.keyboard.press('End');
  await page.keyboard.insertText('Q');
  const selection=()=>pm.evaluate(el=>{const s=el.editor?.state.selection;return s?[s.anchor,s.head]:[window.getSelection().anchorOffset,window.getSelection().focusOffset];});
  const pos=await selection();await pick('xelatex');await profile('xelatex');
  await pm.focus();assert.deepEqual(await selection(),pos);
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>!document.querySelector('.ProseMirror').textContent.includes('Q'));
  await page.keyboard.press('Control+y');await page.waitForFunction(()=>document.querySelector('.ProseMirror').textContent.includes('Q'));
  await page.keyboard.press('Control+z');
  await pm.focus();const cdp=await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition',{text:'中',selectionStart:1,selectionEnd:1});
  await page.locator('#engine-choice').evaluate(n=>{
   n.value='lualatex';n.dispatchEvent(new Event('change'));n.form.requestSubmit();
  });
  assert.match(await page.locator('#settings-panel [role=alert]').textContent(),/composing|输入法/);
  await profile('xelatex');
  await cdp.send('Input.insertText',{text:'中'});assert.match(await pm.textContent(),/中/);
  await load();await pick('auto');await profile('xelatex');await pick('lualatex');await profile('lualatex');
  assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),true);
  await page.locator('[data-source-mode=source]').click();
  assert.equal(await page.locator('.tex-dirty').evaluate(n=>!n.hidden),false);
  const cm=page.locator('.cm-content');
  await cm.click();await page.keyboard.press('Control+End');await page.keyboard.insertText('% draft');
  await page.keyboard.press('Shift+ArrowLeft');
  const cmSelection=()=>cm.evaluate(n=>{const s=window.getSelection();return [s.toString(),s.anchorOffset,s.focusOffset];});
  const anchor=await cmSelection();assert.equal(anchor[0],'t');
  await pick('xelatex');await profile('xelatex');
  await page.waitForFunction(()=>document.activeElement?.closest('.cm-content') && getSelection().toString()==='t',null,{timeout:3000});
  assert.deepEqual(await cmSelection(),anchor);
  assert.equal(await page.locator('.tex-dirty').evaluate(n=>!n.hidden),true);
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>!document.querySelector('.cm-content').textContent.includes('% draft'));
  await pick('lualatex');await profile('lualatex');
  await revealToolbar(page);
  if(!await page.locator('#download').isVisible())await page.locator('[data-group=files]').click();
  const pending=page.waitForEvent('download');await page.locator('#download').click();
  const zip=await readFile(await (await pending).path());assert.equal(zip.readUInt16LE(8),0);
  const offset=30+zip.readUInt16LE(26)+zip.readUInt16LE(28);
  const out=zip.subarray(offset,offset+zip.readUInt32LE(22));assert.deepEqual(out,source);console.log('ZIP SHA-256',sha(source),sha(out));
  await context.close();await start();await load();await profile('lualatex');
  assert.equal((await state()).choice,'lualatex');
  await openProject(true);await profile('lualatex');assert.equal((await state()).choice,'auto');
  await pick('xelatex');await profile('xelatex');
  assert.match((await state()).diagnostics.join(' '),/chapter\.tex:1:1/);
  await context.close();await start();await openProject(false);await profile('xelatex');assert.equal((await state()).choice,'xelatex');
  const a=page;
  page=await context.newPage();await page.goto('http://127.0.0.1:39771');await openProject(false);
  const b=page;
  async function appendDraft(mark){
    await page.locator('[data-source-mode=source]').click();
    const code=page.locator('.cm-content');await code.focus();await page.keyboard.press('Control+End');await page.keyboard.insertText(mark);
    await page.waitForFunction(mark=>Object.keys(localStorage).some(k=>k.includes('project-recovery') && localStorage[k].includes(mark)),mark);
  }
  page=a;await pick('auto');await appendDraft('window-A');
  page=b;await appendDraft('window-B');
  const prefs=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.endsWith(':engine')).map(k=>JSON.parse(localStorage[k]).choice));
  assert.ok((await prefs()).includes('auto'));
  await pick('lualatex');page=a;await pick('xelatex');
  page=b;await page.locator('.cm-content').focus();await page.keyboard.insertText('B2');
  assert.ok((await prefs()).includes('xelatex'));
  await context.close();await start();await openProject(false);await profile('xelatex');
  const drafts=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('project-recovery')).map(k=>localStorage[k]));
  for(const marker of ['window-A','window-B'])assert.ok(drafts.some(d=>d.includes(marker)),marker);
  await openProject(true,true);await profile('xelatex');
  assert.equal((await state()).choice,'auto');
  await pick('lualatex');await profile('lualatex');
  assert.match((await state()).diagnostics.join(' '),/chapter\.tex:1:1.*xeCJK/);
  await page.locator('#settings-open').click();
  await page.locator('[data-setting="typesetting.defaultEngine"]').selectOption('xelatex');await page.locator('#settings-apply').click();
  await profile('lualatex');assert.equal(await page.locator('#engine-choice').inputValue(),'lualatex');
  await page.locator('#settings-close').click();
  await context.close();await start('xelatex');await openProject(false,true);await profile('lualatex');
  assert.equal((await state()).choice,'lualatex');
  await page.reload();await page.evaluate(()=>{indexedDB.open=()=>{throw new DOMException('Denied','SecurityError');};});
  await openProject(false);
  assert.match((await state()).status,/unavailable|无法保存/);
  assert.match(await page.locator('.ProseMirror').first().textContent(),/Root/);
  console.log('PASS global settings, standalone bytes and restart, selection, undo/redo, IME and directory checkpoint across browser restart');
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.kill());
