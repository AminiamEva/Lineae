// Real FileSystemFileHandles and bytes, with only the two OS pickers substituted.
const assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.cwd()]}));
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {createHash}=require('node:crypto');
const {setIndentOnSave,revealToolbar}=require(require('node:path').resolve('tests/workspace-ui-helpers.cjs'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const sample='\uFEFF% 中文注释\r\n\\documentclass{article}\n\\newcommand{\\original}{x}\r\n\\begin{document}\n\\input{part}\r\n\nFirst paragraph.\r\n\nLast paragraph.\n\\end{document}\r\n';
const part=Buffer.from('% 子文件\r\n\\original\n');
const server=spawn(process.execPath,['scripts/serve.mjs','apps/web',String(process.env.LINEAE_AUDIT_PORT||39191)],{stdio:['ignore','pipe','inherit']});
(async()=>{
 await once(server.stdout,'data');const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:1550,height:1000}});page.setDefaultTimeout(8500);
  await page.goto('http://127.0.0.1:'+(process.env.LINEAE_AUDIT_PORT||39191)+'/');
  page.on('console',m=>{if(m.text().startsWith('trace '))console.log(m.text());});
  await page.evaluate(()=>{
    const trace=event=>{
      const active=document.activeElement, dom=getSelection();
      const pm=document.querySelector('.ProseMirror')?.editor?.state.selection;
      const cm=document.querySelector('.cm-content')?.cmView?.view?.state?.selection?.main;
      console.log('trace '+JSON.stringify({ms:performance.now(),event,focus:active?.className,dom:[dom?.anchorOffset,dom?.focusOffset,dom?.toString()],pm:pm&&[pm.anchor,pm.head],cm:cm&&[cm.anchor,cm.head]}));
    };
    for(const e of ['keydown','keyup','selectionchange','focusin','change','input'])document.addEventListener(e,v=>trace(e+' '+(v.key||'')),true);
    const style=document.querySelector('style[data-lineae-pagination]');
    if(style)new MutationObserver(()=>trace('pagination')).observe(style,{childList:true});
  });
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
  async function choose(v){await page.locator('.engine-panel').evaluate(n=>n.open=true);await page.locator('#engine-choice').selectOption(v);}
  async function save(keys='Control+s'){
   await page.locator('#status').evaluate(el=>{window.savedFile=false;
    const observer=new MutationObserver(()=>{if(/^(Saved|已保存)$/.test(el.textContent)){window.savedFile=true;observer.disconnect();}});
    observer.observe(el,{childList:true,subtree:true,characterData:true});
   });
   await page.keyboard.press(keys);await page.waitForFunction(()=>window.savedFile);
  }
  for(const mode of [process.argv[2]]){
   await setup(mode);await open();assert.equal(await page.locator('#engine-choice').inputValue(),'auto');
   await page.locator('[data-source-mode='+mode+']').click();
   await choose('xelatex');await save();
   await page.waitForTimeout(350);
   assert.deepEqual(await bytes('main.tex'),Buffer.from(sample));
   if(mode==='body'){
    await page.locator('.ProseMirror p').filter({hasText:'Last paragraph.'}).click();await page.keyboard.press('End');
   }else{
    await page.locator('.cm-line').filter({hasText:'Last paragraph.'}).click();await page.keyboard.press('End');
   }
   await page.keyboard.insertText('甲');
   await page.waitForFunction(sel=>document.querySelector(sel)?.textContent.includes('Last paragraph.甲'),mode==='body'?'.ProseMirror':'.cm-content');
   if(process.argv[3]==='forward')await page.keyboard.press('ArrowLeft');
   await page.keyboard.press(process.argv[3]==='forward'?'Shift+ArrowRight':'Shift+ArrowLeft');
   const surface=page.locator(mode==='body'?'.ProseMirror':'.cm-content').first();
   const snapshot=()=>surface.evaluate(n=>{
     if(n.editor){const {anchor,head}=n.editor.state.selection;return [anchor,head,n.editor.state.doc.textBetween(Math.min(anchor,head),Math.max(anchor,head))];}
     const s=getSelection();return [s.anchorOffset,s.focusOffset,s.toString()];
   });
   console.log('immediate selection',mode,process.argv[3],JSON.stringify(await snapshot()));
   // Chromium updates the native Selection and the ProseMirror selection on separate events.
   await page.waitForFunction(sel=>{
     const n=document.querySelector(sel),m=n.editor;
     if(!n.contains(document.activeElement))return false;
     if(getSelection()?.toString()!=='甲')return false;
     if(m){const {from,to}=m.state.selection;return m.state.doc.textBetween(from,to)==='甲';}
     const cm=n.cmView?.view;if(!cm)return false;
     const {from,to}=cm.state.selection.main;return cm.state.doc.sliceString(from,to)==='甲';
   },mode==='body'?'.ProseMirror':'.cm-content',{timeout:3000});
   const before=await snapshot();console.log('selection before switch',mode,before,await surface.evaluate(n=>({active:document.activeElement?.className,documentFocus:document.hasFocus(),native:getSelection()?.toString(),pm:n.editor?.state.selection.toJSON(),anchor:getSelection()?.anchorNode?.textContent?.slice(-60)})));assert.equal(before[2],'甲');
   await choose('lualatex');await surface.focus();
   const after=await snapshot();assert.deepEqual(after,before);
   await page.keyboard.press('Control+z');
   await page.waitForFunction(sel=>!document.querySelector(sel).textContent.includes('Last paragraph.甲'),mode==='body'?'.ProseMirror':'.cm-content');
   await page.keyboard.press(mode==='body'?'Control+y':'Control+Shift+z');
   await page.waitForFunction(sel=>document.querySelector(sel).textContent.includes('Last paragraph.甲'),mode==='body'?'.ProseMirror':'.cm-content');
   console.log('selection / undo / redo',mode,JSON.stringify(before),JSON.stringify(after));
   await save();
   const expected=Buffer.from(sample.replace('Last paragraph.','Last paragraph.甲'));
   let got;for(let i=0;i<30;i++){
    try{got=await bytes('main.tex');if(got.equals(expected))break;}catch(e){if(!e.message.includes('NotReadableError'))throw e;}
    await page.waitForTimeout(100);
   }
   assert.deepEqual(got,expected,mode+' exact edited bytes');assert.deepEqual(await bytes('part.tex'),part);
   await open();assert.equal(await page.locator('#engine-choice').inputValue(),'lualatex');
   console.log(mode,hash(Buffer.from(sample)),hash(got),hash(part));
  }
  console.log('PASS',process.argv[2],process.argv[3]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.kill());
