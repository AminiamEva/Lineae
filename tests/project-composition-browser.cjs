const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve('apps/web');
const server=createServer(async(req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!path.startsWith(root+sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html'}[extname(path)]??'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const root=await navigator.storage.getDirectory();window.folder=await root.getDirectoryHandle('composed',{create:true});
   const put=async(name,text)=>{const h=await folder.getFileHandle(name,{create:true}),w=await h.createWritable();await w.write(text);await w.close();};
   await put('main.tex','\\documentclass{article}\n\\begin{document}\nRoot.\n\n\\input{a}\n\n\\include{b}\n\n\\input{c}\n\\end{document}\n');
   for(const name of ['a','b','c','d'])await put(name+'.tex',name.toUpperCase()+' child.\n');
   window.showDirectoryPicker=async()=>folder;
  });
  await page.locator('[data-group=files]').click();await page.locator('#project-open').click();
  await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent==='main.tex');
  await page.locator('[data-source-mode=body]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-project-region]').length===7);
  await page.locator('#project-toggle').click();
  await page.locator('.project-file[data-path="d.tex"]').dragTo(page.locator('[data-file-path="b.tex"]').first());
  await page.waitForFunction(()=>document.querySelectorAll('[data-project-region]').length===9);
  assert.deepEqual(await page.locator('[data-file-path]').evaluateAll(nodes=>nodes.filter(n=>['a.tex','b.tex','c.tex','d.tex'].includes(n.dataset.filePath)).map(n=>n.dataset.filePath)),['a.tex','d.tex','b.tex','c.tex']);
  const child=page.locator('[data-file-path="b.tex"] p').first();
  assert.equal(await child.textContent(),'B child.');
  await child.click();await page.keyboard.press('End');await page.keyboard.insertText(' EDIT');
  await page.keyboard.press('Control+z');assert.equal(await child.textContent(),'B child.');
  await page.keyboard.press('Control+y');assert.match(await child.textContent(),/EDIT/);
  await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]')?.textContent.includes('Saved'));
  const disk=await page.evaluate(async()=>{
   const get=async name=>(await (await folder.getFileHandle(name)).getFile()).text();
   return {main:await get('main.tex'),b:await get('b.tex'),a:await get('a.tex')};
  });
  assert.match(disk.b,/B child\. EDIT/);assert.equal(disk.a,'A child.\n');assert.match(disk.main,/\\include\{b\}/);assert.ok(!disk.main.includes('EDIT'));
  assert.deepEqual(errors,[]);
  console.log('PASS: three includes, continuous editing, file ownership, undo/redo, save all');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
