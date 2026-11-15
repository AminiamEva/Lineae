const {mkdir}=require('node:fs/promises');
const {revealToolbar,setIndentOnSave,createTreeEntry}=require('./workspace-ui-helpers.cjs');
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
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async({main})=>{
   const storage=await navigator.storage.getDirectory();window.folder=await storage.getDirectoryHandle('project-usability',{create:true});
   window.put=async(name,text)=>{const w=await (await folder.getFileHandle(name,{create:true})).createWritable();await w.write(text);await w.close();};
   await put('main.tex',main);await put('long.tex',Array.from({length:12},(_,i)=>'Paragraph '+i+' '+('included content '.repeat(60))).join('\n\n')+'\n');
   window.showDirectoryPicker=async()=>folder;
  },{main:"\\documentclass[a4paper]{article}\n\\usepackage[margin=2.2cm]{geometry}\n\\usepackage{indentfirst}\n\\begin{document}\n\\section{标题}\n\n默认缩进的正文。\n\\end{document}\n"});
  await revealToolbar(page);await page.locator('[data-group=files]').click();await page.locator('#project-open').click();
  await page.locator('.ProseMirror h1').waitFor();const paper=page.locator('.ProseMirror');
  const body=paper.locator('p').filter({hasText:'默认缩进的正文。'});
  assert.ok(await body.evaluate(node=>Number.parseFloat(getComputedStyle(node).textIndent)>0),'First body paragraph is indented by default');
  assert.equal(await body.getAttribute('data-explicit-indent'),null,'Default indent needs no manual paragraph command');
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/project-default.png'});
  assert.equal(await page.locator('#toolbar-collapse svg').count(),1);assert.equal(await page.locator('#toolbar-collapse').textContent(),'');
  assert.ok(await page.locator('#settings-open').evaluate(node=>node.getBoundingClientRect().left<100),'Settings is on the left');
  if(!await page.locator('#project-explorer').isVisible())await page.locator('#project-toggle').click();
  assert.ok(await page.locator('#sidebar-files .sidebar-section-content').evaluate(node=>node.getBoundingClientRect().height>=150));
  for(const id of ['sidebar-files','sidebar-includes','sidebar-outline']){
   const prevented=await page.locator('#'+id+' summary').first().evaluate(node=>!node.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:50,clientY:180})));
   assert.equal(prevented,true);await page.locator('#project-context-menu').waitFor();await page.keyboard.press('Escape');
  }
  await page.locator('.project-tree').dispatchEvent('contextmenu',{bubbles:true,cancelable:true,clientX:70,clientY:180});
  await page.locator('#project-context-menu [role=menuitem]').filter({hasText:/^(New file|新建文件)$/}).click();await createTreeEntry(page,'new.tex');
  const template=await page.evaluate(async()=>(await (await folder.getFileHandle('new.tex')).getFile()).text());
  assert.match(template,/margin=2\.2cm/);assert.match(template,/indentfirst/);assert.match(template,/documentclass\[a4paper\]/);
  await paper.click();await page.keyboard.insertText('New file body.');await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>document.querySelector('#project-explorer>[role=status]').textContent==='Saved');
  await page.locator('.project-file[data-path="main.tex"]').click();
  await paper.locator('p').filter({hasText:'默认缩进'}).click();await page.keyboard.press('End');await page.keyboard.insertText(' Continue.');
  assert.match(await paper.innerText(),/Continue/,'Switching back after saving a new file keeps Document editable');
  await page.locator('[data-source-mode=source]').click();assert.ok(await page.locator('#settings-open').evaluate(node=>node.getBoundingClientRect().left<100),'Settings stays left in Source');const code=page.locator('.tex-code .cm-content');await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText("\\documentclass[a4paper]{article}\n\\usepackage[margin=2.2cm]{geometry}\n\\usepackage{indentfirst}\n\\begin{document}\nBefore Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before Before \n\n\\input{long}\n\n\\input{new}\n\nAfter.\n\\end{document}\n");
  await page.locator('[data-source-mode=body]').click();
  await page.locator('[data-project-region][data-file-path="long.tex"]').waitFor();
  const after=paper.locator('p').filter({hasText:/^After\./});await after.click();await page.keyboard.press('End');await page.keyboard.insertText(' Edited.');
  assert.match(await after.textContent(),/Edited/,'Source edits can be followed immediately by Document edits');
  assert.equal(await paper.evaluate(node=>!!node.closest('[inert]')),false);
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#project-explorer>[role=status]').textContent==='Saved');
  const sourceBefore=await page.evaluate(async()=>(await (await folder.getFileHandle('main.tex')).getFile()).text());
  assert.match(sourceBefore,/After\. Edited/);assert.ok(sourceBefore.includes('\\usepackage{docmute}'),'Complete child templates record compilation support in the parent source');
  assert.equal(await page.locator('[data-file-path="long.tex"]').first().evaluate(node=>{const style=getComputedStyle(node);return style.paddingTop==='0px'&&style.paddingBottom==='0px'&&style.borderTopWidth==='0px';}),true,'File wrapper adds no vertical annotation space');
  assert.equal(await page.locator('[data-file-path="long.tex"]').first().evaluate(node=>getComputedStyle(node,'::before').content),'none');
  if(!await page.locator('#project-explorer').isVisible())await page.locator('#project-toggle').click();
  const longRow=page.locator('.include-row').filter({has:page.locator('.include-file',{hasText:'long'})});
  const newRow=page.locator('.include-row').filter({has:page.locator('.include-file',{hasText:'new'})});
  await longRow.locator('.include-drag-handle').dragTo(newRow);await page.waitForFunction(()=>Array.from(document.querySelectorAll('.include-file')).map(n=>n.textContent).join(',')==='new,long');
  await longRow.locator('[data-include-fold]').click();
  await page.waitForFunction(()=>!!document.querySelector('.document-page[data-project-folding=true]')?.dataset.skippedPages);
  await page.locator('.project-fold-placeholder').first().scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  await page.screenshot({path:'test-results/project-folded-start.png'});
  await page.locator('.project-fold-placeholder').last().scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  await page.screenshot({path:'test-results/project-folded-end.png'});
  const skipped=await page.locator('.document-page').getAttribute('data-skipped-pages');assert.ok(skipped.length>0);
  assert.ok(await page.locator('.project-fold-placeholder').count()>=2,'Folded boundary pages show explicit placeholders');
  assert.equal(await page.locator('.document-sheet:visible .document-page-number').evaluateAll(nodes=>nodes.some((n,i)=>i&&Number(n.textContent)>Number(nodes[i-1].textContent)+1)),true,'Visible page numbers skip hidden interior pages');
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#project-explorer').getAttribute('aria-busy')==='false'&&document.querySelector('#project-explorer>[role=status]').textContent==='Saved');const sourceAfter=await page.evaluate(async()=>(await (await folder.getFileHandle('main.tex')).getFile()).text());
  assert.equal(sourceAfter,sourceBefore.replace(/\\input\{long\}([\s\S]*?)\\input\{new\}/,String.raw`\input{new}$1\input{long}`),'Folding preserves source; only drag ordering changed it');
  await page.locator('.project-fold-placeholder').first().click();await page.waitForFunction(()=>!document.querySelector('.document-page[data-project-folding]'));
  await longRow.locator('[data-include-action=remove]').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.include-file')).some(n=>n.textContent==='long'));
  const tail=paper.locator('p').filter({hasText:'After.'});await tail.click();
  assert.equal(await paper.evaluate(node=>node.editor.state.selection.$from.parent.type.name),'paragraph','Click after removing a reference stays inside text');
  await page.keyboard.press('End');assert.equal(await paper.evaluate(node=>node.editor.state.selection.$from.parent.type.name),'paragraph');
  await page.keyboard.insertText(' Still editable.');assert.match(await paper.innerText(),/Still editable/);
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#project-explorer>[role=status]').textContent==='Saved');
  const final=await page.evaluate(async()=>(await (await folder.getFileHandle('main.tex')).getFile()).text());assert.ok(!final.includes('\input{long}'));assert.match(final,/Still editable/);
  assert.deepEqual(errors,[]);console.log('PASS: default indentation, left settings, SVG fold control, full sidebar menus, new-file template, save/source re-entry, zero-flow provenance, drag order, fold pages and reference removal');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
