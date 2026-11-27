// Real FileSystemFileHandles and bytes, with only the two OS pickers substituted.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {createHash}=require('node:crypto');
const {setIndentOnSave,revealToolbar,chooseEngine,readEngineSettings}=require('./workspace-ui-helpers.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sample='\uFEFF% 中文注释\r\n\\documentclass{article}\n\\newcommand{\\original}{x}\r\n\\begin{document}\n\\input{part}\r\n\nFirst paragraph.\r\n\nLast paragraph.\n\\end{document}\r\n';
const part=Buffer.from('% 子文件\r\n\\original\n');
const server=spawn(process.execPath,['scripts/serve.mjs','apps/web','39581'],{stdio:['ignore','pipe','inherit']});
(async()=>{
 await once(server.stdout,'data');const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:1550,height:1000}});page.setDefaultTimeout(8500);
  await page.goto('http://127.0.0.1:39581/');
  await setIndentOnSave(page,false);
  async function setup(id){
   await page.evaluate(async([id,sample,part])=>{
    const root=await navigator.storage.getDirectory();
    const dir=await root.getDirectoryHandle(id,{create:true});window.testDir=dir;
    for(const [name,data] of [['main.tex',sample],['part.tex',part]]){
     const file=await dir.getFileHandle(name,{create:true});const w=await file.createWritable();await w.write(data);await w.close();
    }
    window.showOpenFilePicker=async()=>[await dir.getFileHandle('main.tex')];
    window.showSaveFilePicker=async()=>dir.getFileHandle('copy.tex',{create:true});
   },[id,sample,part.toString()]);
  }
  async function open(name='main.tex'){
   await page.evaluate(name=>{window.showOpenFilePicker=async()=>[await testDir.getFileHandle(name)];},name);
   await revealToolbar(page);
   if(!await page.locator('.open').isVisible())await page.locator('[data-group=files]').click();
   await page.locator('.open').click();
   await page.waitForFunction(name=>document.querySelector('.tex-filename')?.textContent===name,name);
   await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('Last paragraph.'));
   await page.waitForTimeout(100);
  }
  async function bytes(name){return Buffer.from(await page.evaluate(async name=>Array.from(new Uint8Array(await (await (await testDir.getFileHandle(name)).getFile()).arrayBuffer())),name));}
  async function save(keys='Control+s'){
   await page.locator('#status').evaluate(el=>{window.savedFile=false;
    const observer=new MutationObserver(()=>{if(/^(Saved|已保存)$/.test(el.textContent)){window.savedFile=true;observer.disconnect();}});
    observer.observe(el,{childList:true,subtree:true,characterData:true});
   });
   await page.keyboard.press(keys);await page.waitForFunction(()=>window.savedFile);
  }
  for(const mode of ['body','source','split']){
   await setup(mode);await open();assert.equal((await readEngineSettings(page)).choice,'auto');
   await page.locator('[data-source-mode='+mode+']').click();
   await chooseEngine(page,'xelatex');await save();
   await page.waitForTimeout(350);
   assert.deepEqual(await bytes('main.tex'),Buffer.from(sample));
   if(mode==='body'){
    await page.locator('.ProseMirror p').filter({hasText:'Last paragraph.'}).click();await page.keyboard.press('End');
   }else{
    await page.locator('.cm-line').filter({hasText:'Last paragraph.'}).click();await page.keyboard.press('End');
   }
   await page.keyboard.insertText('甲');await chooseEngine(page,'lualatex');
   if(mode==='body')await page.locator('.ProseMirror').first().focus();else await page.locator('.cm-content').focus();
   await save();
   const expected=Buffer.from(sample.replace('Last paragraph.','Last paragraph.甲'));
   let got;for(let i=0;i<30;i++){
    try{got=await bytes('main.tex');if(got.equals(expected))break;}catch(e){if(!e.message.includes('NotReadableError'))throw e;}
    await page.waitForTimeout(100);
   }
   assert.deepEqual(got,expected,mode+' exact edited bytes');assert.deepEqual(await bytes('part.tex'),part);
   await open();assert.equal((await readEngineSettings(page)).choice,'lualatex');
   console.log(mode,hash(Buffer.from(sample)),hash(got),hash(part));
  }
  await chooseEngine(page,'xelatex');await page.locator('.cm-content').focus();await save('Control+Shift+s');
  await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent==='copy.tex');
  assert.deepEqual(await bytes('copy.tex'),await bytes('main.tex'));await open('copy.tex');
  assert.equal((await readEngineSettings(page)).choice,'xelatex');
  const sameIdentity=await page.evaluate(async()=>{
   const f=await testDir.getFileHandle('copy.tex'),prior=structuredClone(f);
   await f.move('renamed.tex');
   return prior.isSameEntry(await testDir.getFileHandle('renamed.tex'));
  });
  await open('renamed.tex');assert.equal((await readEngineSettings(page)).choice,sameIdentity?'xelatex':'auto');
  console.log('External move: persisted handle isSameEntry =',sameIdentity);
  console.log('PASS three modes, original bytes, scoped edit, sibling, same-name directories, save-as and external rename');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.kill());
