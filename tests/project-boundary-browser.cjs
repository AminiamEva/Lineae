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
 try{res.setHeader('Content-Type',{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[extname(path)]??'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}
});

(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const root=await navigator.storage.getDirectory();window.folder=await root.getDirectoryHandle('boundaries',{create:true});
   window.put=async(name,text)=>{const w=await(await folder.getFileHandle(name,{create:true})).createWritable();await w.write(text);await w.close();};
   window.mainSource='\\documentclass[a4paper]{article}\n\\usepackage[margin=2.2cm]{geometry}\n\\usepackage{indentfirst}\n\\begin{document}\n\\section{Main heading}\n\nMain body.\n\n\\input{child}\n\\end{document}\n';
   window.childSource='\\section{Child heading}\n\nChild body.\n';
   await put('main.tex',mainSource);await put('child.tex',childSource);
   await put('nested.tex','\\documentclass{article}\n\\begin{document}\nNested root.\n\n\\input{middle}\n\\end{document}\n');await put('middle.tex','Middle body.\n\n\\input{leaf}\n');await put('leaf.tex','Leaf body.\n');
   await put('empty-root.tex','\\documentclass{article}\n\\begin{document}\nRoot.\n\n\\input{empty}\n\\end{document}\n');await put('empty.tex','\n');
   window.showDirectoryPicker=async()=>folder;
  });
  await revealToolbar(page);await page.locator('[data-group=files]').click();await page.locator('#project-open').click();await page.locator('[data-file-path="child.tex"] h1').waitFor();
  await setIndentOnSave(page,false);await mkdir('test-results',{recursive:true});
  const paper=page.locator('.ProseMirror');
  const metrics=()=>paper.evaluate(node=>{const r=node.closest('.document-page').getBoundingClientRect(),z=r.width/node.closest('.document-page').offsetWidth;return [...node.querySelectorAll('p,h1,h2,h3')].filter(n=>n.textContent.trim()).map(n=>{const b=n.getBoundingClientRect();return {text:n.textContent,x:(b.left-r.left)/z,y:(b.top-r.top)/z,height:b.height/z};});});
  for(const zoom of [100,174,251]){
   await page.locator('.document-status input[type=range]').evaluate((node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));},zoom);
   await page.waitForTimeout(180);
   const collisions=await page.evaluate(()=>{const nodes=[...document.querySelectorAll('.project-source-badge,[data-structure-marker]')];let collisions=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i].getBoundingClientRect(),b=nodes[j].getBoundingClientRect();if(a.width&&b.width&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)collisions.push([nodes[i].textContent,nodes[j].textContent]);}return collisions;});
   assert.deepEqual(collisions,[],'Source and structural markers do not overlap at '+zoom+'%');
  }
  await page.locator('.document-status input[type=range]').evaluate(node=>{node.value=100;node.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(150);
  await page.screenshot({path:'test-results/project-boundary-markers.png'});
  const before=await metrics();const height=await page.locator('.document-page').evaluate(node=>node.offsetHeight);
  const back=page.locator('.project-return-boundary[data-source-path="main.tex"]');await back.click();
  assert.deepEqual(await metrics(),before,'Choosing the empty main continuation does not move printed content');assert.equal(await page.locator('.document-page').evaluate(node=>node.offsetHeight),height);
  const owner=()=>paper.evaluate(node=>{const selection=node.editor.state.selection;for(let d=selection.$from.depth;d>0;d--)if(selection.$from.node(d).type.name==='projectRegion')return selection.$from.node(d).attrs.path;});
  assert.equal(await owner(),'main.tex');await page.keyboard.insertText('Main continuation.');assert.equal(await owner(),'main.tex');
  await page.keyboard.press('Control+z');assert.ok(!(await paper.innerText()).includes('Main continuation.'));await page.keyboard.press('Control+y');assert.match(await paper.innerText(),/Main continuation/);
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#project-explorer>[role=status]').textContent==='Saved');
  const saved=await page.evaluate(async()=>({main:await(await(await folder.getFileHandle('main.tex')).getFile()).text(),child:await(await(await folder.getFileHandle('child.tex')).getFile()).text(),originalChild:childSource}));
  assert.equal(saved.child,saved.originalChild,'Continuing the parent leaves the child byte-exact');assert.match(saved.main,/\\input\{child\}\n\nMain continuation\./,'The parent continuation has a real paragraph boundary in TeX');
  await page.locator('.project-file[data-path="nested.tex"]').click();await page.locator('.project-return-boundary[data-source-path="middle.tex"]').click();assert.equal(await owner(),'middle.tex');await page.keyboard.insertText('Middle continuation.');
  await page.locator('.project-return-boundary[data-source-path="nested.tex"]').click();assert.equal(await owner(),'nested.tex');await page.keyboard.insertText('Root continuation.');assert.match(await paper.locator('[data-file-path="nested.tex"]').last().innerText(),/Root continuation/,'Returning from a nested child focuses the parent immediately');await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#project-explorer>[role=status]').textContent==='Saved');
  const nested=await page.evaluate(async()=>{const read=async p=>(await(await folder.getFileHandle(p)).getFile()).text();return {root:await read('nested.tex'),middle:await read('middle.tex'),leaf:await read('leaf.tex')};});assert.match(nested.root,/Root continuation/);assert.ok(!nested.root.includes('Middle continuation'));assert.match(nested.middle,/Middle continuation/);assert.equal(nested.leaf,'Leaf body.\n');
  await page.locator('.project-file[data-path="empty-root.tex"]').click();await page.locator('[data-edit-path="empty.tex"]').click();assert.equal(await owner(),'empty.tex');await page.keyboard.insertText('New child.');
  await page.locator('.project-return-boundary[data-source-path="empty-root.tex"]').click();assert.equal(await owner(),'empty-root.tex');await page.keyboard.insertText('After empty child.');await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#project-explorer>[role=status]').textContent==='Saved');
  const empty=await page.evaluate(async()=>{const read=async p=>(await(await folder.getFileHandle(p)).getFile()).text();return {root:await read('empty-root.tex'),child:await read('empty.tex')};});assert.equal(empty.child,'New child.\n');assert.match(empty.root,/After empty child/);assert.ok(!empty.root.includes('New child.'));
  assert.deepEqual(errors,[]);console.log('PASS: marker collision layout at 100/174/251%, zero-flow main return control, source ownership, undo/redo, nested parent returns and initially empty child editing');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
