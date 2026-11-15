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
  await page.evaluate(async()=>{
   const storage=await navigator.storage.getDirectory();window.folder=await storage.getDirectoryHandle('project-editing',{create:true});
   const put=async(name,text)=>{const stream=await (await folder.getFileHandle(name,{create:true})).createWritable();await stream.write(text);await stream.close();};
   await put('main.tex','\\documentclass[12pt]{article}\n\\usepackage{fontspec}\n\\setmainfont{Georgia}\n\\setCJKmainfont{SimSun}\n\\begin{document}\n\n\\end{document}\n');
   await put('indent.tex','\\documentclass{article}\n\\begin{document}\n\\section{Heading}\nFirst paragraph.\n\nSecond paragraph.\n\\end{document}\n');
   await put('child.tex','Child file.\n');window.showDirectoryPicker=async()=>folder;
  });
  await revealToolbar(page);await page.locator('[data-group=files]').click();await page.locator('#project-open').click();await page.waitForFunction(()=>document.querySelector('.project-file[data-path="main.tex"]'));
  const paper=page.locator('.ProseMirror');assert.equal(await paper.evaluate(node=>!!node.closest('[inert]')),false);
  await paper.click();await page.keyboard.type('#a');await page.keyboard.insertText('中文');assert.equal(await paper.locator('p').first().textContent(),'#a中文');
  await page.keyboard.press('Enter');await page.keyboard.insertText('Second');assert.match(await paper.innerText(),/Second/);
  await revealToolbar(page);await page.locator('[data-group=home]').click();await page.locator('select[aria-label="Paragraph style"]').selectOption('1');
  await page.keyboard.press('End');
  const font=await paper.locator('h1').evaluate(node=>({family:getComputedStyle(node).fontFamily,size:Number.parseFloat(getComputedStyle(node).fontSize)*72.27/96,weight:getComputedStyle(node).fontWeight}));
  assert.match(font.family,/Georgia/);assert.match(font.family,/SimSun/);assert.equal(font.weight,'700');
  assert.ok(Math.abs(Number.parseFloat(await page.locator('[data-format-attribute=fontSize]').inputValue())-font.size)<.02,'Size menu reflects heading size');
  assert.equal(await page.locator('[data-format-attribute=fontFamily]').inputValue(),'Georgia');
  await page.keyboard.press('Enter');await page.keyboard.insertText('Indented body');
  assert.equal(await paper.locator('p').last().getAttribute('data-explicit-indent'),'true');
  assert.ok(await paper.locator('p').last().evaluate(node=>Number.parseFloat(getComputedStyle(node).textIndent)>0));
  await paper.locator('h1').click();await page.keyboard.press('End');await page.keyboard.press('Control+j');await page.keyboard.insertText('CtrlJ body');
  assert.match(await paper.innerText(),/CtrlJ body/);assert.equal(await paper.locator('h1').textContent(),'Second');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>document.querySelector('#project-explorer > [role=status]').textContent==='Saved');
  const disk=await page.evaluate(async()=>(await (await folder.getFileHandle('main.tex')).getFile()).text());
  assert.match(disk,/\\#a中文/);assert.match(disk,/\\indent CtrlJ body/);assert.match(disk,/\\indent Indented body/);
  await page.keyboard.type('\\');await page.locator('.command-menu input').fill('input');await page.locator('#latex-candidates button').filter({hasText:/^\\input$/}).click();
  await page.locator('.editor-dialog input').fill('child');await page.locator('.editor-dialog button[type=submit]').click();
  await page.locator('[data-project-region][data-file-path="child.tex"]').waitFor();
  const child=page.locator('[data-file-path="child.tex"] p').first();await child.click();await page.keyboard.press('End');await page.keyboard.type(' editing');await page.keyboard.press('Enter');await page.keyboard.insertText('New child paragraph');
  assert.match(await page.locator('[data-file-path="child.tex"]').innerText(),/New child paragraph/);
  await page.locator('#toolbar-collapse').click();assert.equal(await page.locator('.ribbon-tabs').isVisible(),true);assert.equal(await page.locator('#toolbar-collapse svg').count(),1);assert.equal(await page.locator('.ribbon>.tools').filter({visible:true}).count(),0);
  await page.locator('[data-group=layout]').click();
  for(const input of await page.locator('#layout-panel input').all())assert.equal(await input.evaluate(node=>node.getBoundingClientRect().width<=64.1),true);
  if(!await page.locator('#project-explorer').isVisible())await page.locator('#project-toggle').click();
  assert.equal(await page.locator('.project-diagnostics').evaluate(node=>node.getBoundingClientRect().height<20),true);
  await page.locator('.project-file[data-path="indent.tex"]').click();
  const first=paper.locator('p').filter({hasText:'First paragraph.'});
  const indent=()=>first.evaluate(node=>Number.parseFloat(getComputedStyle(node).textIndent));
  await first.click();await page.keyboard.press('End');
  assert.equal(await indent(),0,'Existing first paragraph retains imported default');
  await page.keyboard.press('Control+i');
  assert.ok(await indent()>0,'Ctrl+I explicitly indents first paragraph');
  await page.keyboard.press('Control+i');assert.equal(await indent(),0,'Ctrl+I can remove explicit indent');
  const paragraphCommand=async name=>{
    await first.click();await page.keyboard.press('End');await page.keyboard.type('\\');
    await page.locator('.command-menu input').fill(name);
    await page.locator('#latex-candidates button').filter({hasText:new RegExp('^\\\\'+name+'$')}).click();
  };
  await paragraphCommand('indent');assert.ok(await indent()>0,'GUI command indents existing first paragraph');
  await paragraphCommand('noindent');assert.equal(await indent(),0,'GUI command removes first paragraph indent');
  assert.ok(await paper.locator('p').filter({hasText:'Second paragraph.'}).evaluate(node=>Number.parseFloat(getComputedStyle(node).textIndent)>0),'Following paragraphs retain default indent');
  assert.deepEqual(errors,[]);console.log('PASS: project typing, IME text, heading exit/indent, actual typography, input completion, child edits, ribbon tabs and bounds');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
