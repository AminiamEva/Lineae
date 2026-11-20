const {revealToolbar,setIndentOnSave,createTreeEntry}=require('./workspace-ui-helpers.cjs');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile,mkdir}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve('apps/web');
const server=createServer(async(req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!path.startsWith(root+sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html'}[extname(path)]??'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}
});

(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const storage=await navigator.storage.getDirectory();window.folder=await storage.getDirectoryHandle('reopen',{create:true});
   window.put=async(name,text)=>{const w=await(await folder.getFileHandle(name,{create:true})).createWritable();await w.write(text);await w.close();};
   window.original='\\documentclass{article}\r\n% untouched preamble\r\n\\begin{document}\r\n\\section{标题}\r\n\r\n\\indent这是正文， Hello World\r\n\\end{document}\r\n';
   await put('main.tex',original);await put('single.tex',original.replace('\\section{标题}\r\n\r\n','\\section{标题}\r\n'));
   window.showDirectoryPicker=async()=>folder;
  });
  await revealToolbar(page);await page.locator('[data-group=files]').click();await page.locator('#project-open').click();
  await page.locator('.project-file[data-path="main.tex"]').waitFor();
  assert.equal(await page.locator('#project-explorer').isVisible(),true,'Opening a project reveals the file tree');
  assert.equal(await page.locator('#sidebar-files').getAttribute('open'),'','File-tree section is expanded');
  const paper=page.locator('.ProseMirror');
  async function append(text){const p=paper.locator('p').filter({hasText:'这是正文'});await p.click();await page.keyboard.press('End');await page.keyboard.insertText(text);assert.ok((await p.textContent()).includes(text),'Imported project body accepts typing');}
  await setIndentOnSave(page,false);await append(' 编辑');await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>document.querySelector('#project-explorer>[role=status]').textContent==='Saved');
  assert.equal(await page.evaluate(async()=>(await(await folder.getFileHandle('main.tex')).getFile()).text()),await page.evaluate(()=>original.replace('Hello World','Hello World 编辑')),'Only inserted text changes on disk; command spelling, comments and CRLF remain exact');
  await page.locator('.project-file[data-path="single.tex"]').click();await append(' Single');
  await page.locator('.project-file[data-path="main.tex"]').click();await append(' Back');
  await page.locator('[data-source-mode=source]').click();
  const code=page.locator('.tex-code .cm-content');await code.click();await page.keyboard.press('Control+End');await page.keyboard.press('Control+Home');await page.keyboard.press('Shift+End');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.tex-code .cm-selectionBackground')).some(n=>n.getBoundingClientRect().width>50));
  assert.ok(await page.locator('.cm-activeLine').first().evaluate(n=>getComputedStyle(n).backgroundColor!=='rgb(240, 242, 248)'),'Active line does not paint an opaque cover over selection');
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/project-source-selection.png'});
  await page.locator('[data-source-mode=body]').click();await append(' Returned');
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#project-explorer>[role=status]').textContent==='Saved');
  await page.locator('#project-close').click();await revealToolbar(page);await page.locator('[data-group=files]').click();await page.locator('#project-open').click();await append(' Reopened');
  for(const width of [1440,900,600]){
   await page.setViewportSize({width,height:900});await revealToolbar(page);
   const boxes=await page.evaluate(()=>{const a=document.querySelector('.floating-toolbar>.ribbon').getBoundingClientRect(),b=document.querySelector('#toolbar-collapse').getBoundingClientRect();return {gap:b.left-a.right,right:b.right,width:innerWidth};});
   assert.ok(boxes.gap>=0,'Collapse control is beside the ribbon, without overlap');assert.ok(boxes.right<=boxes.width,'Collapse control stays inside viewport');
  }
  assert.deepEqual(errors,[]);console.log('PASS: visible project tree, imported CJK body edits, exact source spelling/CRLF, file switching, Source return, save/reopen, visible code selection and adjacent toolbar control');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
