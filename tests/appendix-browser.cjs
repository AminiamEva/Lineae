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
 try{res.setHeader('Content-Type',{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.otf':'font/otf'}[extname(path)]??'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}
});


(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);
  const load=async text=>{await page.locator('[data-source-mode=source]').click();const code=page.locator('.cm-content');await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(text);await page.locator('[data-source-mode=body]').click();};
  const source='\\documentclass{article}\n\\begin{document}\n\\section{Main}\n\nBody.\n\n\\appendix\n\\section{Proofs}\\label{app:proof}\n\nAppendix body. See \\ref{app:proof}.\n\n\\subsection{Detail}\n\nDetail body.\n\n\\section*{Notes}\n\n\\section{Data}\n\\end{document}\n';
  await load(source);const paper=page.locator('.ProseMirror');await page.locator('[data-appendix-start]').waitFor({state:'attached'});
  assert.deepEqual(await paper.locator('[data-section-number]').evaluateAll(nodes=>nodes.map(n=>n.dataset.sectionNumber)),['1','A','A.1','B']);
  assert.equal(await page.locator('[data-appendix-start]').evaluate(node=>node.getBoundingClientRect().height),0);
  assert.equal(await paper.locator('.ref-node').textContent(),'A');
  await paper.locator('p').filter({hasText:'Appendix body.'}).click();await page.keyboard.press('End');await page.keyboard.insertText(' Edited');assert.match(await paper.innerText(),/Edited/);await page.keyboard.press('Control+z');assert.ok(!(await paper.innerText()).includes('Edited'));await page.keyboard.press('Control+y');assert.match(await paper.innerText(),/Edited/);
  await page.locator('[data-source-mode=source]').click();assert.match(await page.locator('.cm-content').innerText(),/\\appendix/);await page.locator('[data-source-mode=body]').click();assert.equal(await paper.locator('h1').nth(1).getAttribute('data-section-number'),'A');
  const chapterSource='\\documentclass{report}\n\\begin{document}\n\\chapter{Main}\n\n\\section{Body}\n\n\\appendix\n\\chapter{Proofs}\\label{app:chapter}\n\n\\section{Detail}\n\n\\chapter{Data}\n\\end{document}\n';await load(chapterSource);
  console.log('chapter DOM',await paper.innerHTML());assert.deepEqual(await paper.locator('[data-section-number]').evaluateAll(nodes=>nodes.map(n=>n.dataset.sectionNumber)),['1','1.1','A','A.1','B']);
  assert.deepEqual(errors,[]);console.log('PASS: appendix imports, chapter/section reset, nested numbering, reference target, zero-flow marker, rich editing, undo/redo and source round-trip');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
