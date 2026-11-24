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
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+server.address().port);
 const load=async body=>{await page.locator('input[type=file]').setInputFiles({name:'regression.tex',mimeType:'text/plain',buffer:Buffer.from(body)});await page.waitForTimeout(500);};
 const paper=page.locator('.ProseMirror');
 await load('\\documentclass{book}\n\\title{Example}\n\\date{2026.11.22}\n\\begin{document}\n\\maketitle\n\\frontmatter\n\\chapter{Preface}\n\nFront body.\n\n\\mainmatter\n\\chapter{Main}\n\nMain body.\n\n\\backmatter\n\\chapter{References}\n\nBack body.\n\\end{document}\n');
 assert.equal(await page.locator('.doc-date').textContent(),'2026.11.22');
 for(const text of ['Front body.','Main body.','Back body.']){await paper.locator('p').filter({hasText:text}).click();await page.keyboard.press('End');await page.keyboard.insertText(' edited');await page.waitForFunction(t=>document.querySelector('.ProseMirror').editor.state.doc.textContent.includes(t+' edited'),text);}
 await page.locator('.doc-title').fill('Yield 50%');await page.locator('.doc-title').blur();
 await page.locator('[data-source-mode=source]').click();const saved=await page.locator('.cm-content').innerText();assert.match(saved,/\\title\{Yield 50\\%\}/);for(const name of ['front','main','back'])assert.ok(saved.includes('\\'+name+'matter'));await page.locator('[data-source-mode=body]').click();assert.equal(await page.locator('.doc-title').textContent(),'Yield 50%');
 await load('\\documentclass{article}\n\\title{Date}\n\\date{\\today}\n\\begin{document}\n\\maketitle\nBody.\n\\newpage\nNext page.\n\\end{document}\n');assert.ok((await page.locator('.doc-date').textContent()).length>5);assert.equal(await paper.locator('[data-page-break],.page-break').count(),1);
 await load('\\documentclass{article}\n\\newcommand{\\custom}{Custom}\n\\begin{document}\n\\custom\n\\section{Editable}\nText.\n\\end{document}\n');await paper.locator('h1').click();await page.keyboard.press('End');await page.keyboard.insertText(' changed');await page.waitForFunction(()=>document.querySelector('.ProseMirror').editor.state.doc.textContent.includes('Editable changed'));

 await page.route('**/vendor/mp-tikz-wasm/index.js',route=>route.fulfill({contentType:'text/javascript',body:'export const MetaPost={create:async()=>({latex:async()=>{window.previewCompiles=(window.previewCompiles||0)+1;return {status:"ok",pages:[\'<svg xmlns="http://www.w3.org/2000/svg" width="120pt" height="60pt" viewBox="0 0 120 60"><path d="M0 0L120 60"/></svg>\']};}})};'}));
 await page.route('**/vendor/mp-tikz-wasm/figures.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isCompleteDocument=()=>false;export const wrapTikz=source=>source;'}));
 await load('\\documentclass{article}\n\\begin{document}\n\\begin{tikzpicture}\n\\draw (0,0)--(2,1);\n\\end{tikzpicture}\n\nAfter diagram.\n\\end{document}\n');
 await page.locator('.tikz-general-preview-ready svg').waitFor();
 await page.evaluate(()=>{window.previewNode=document.querySelector('.tikz-general-preview');const editor=document.querySelector('.ProseMirror').editor;editor.view.dispatch(editor.state.tr.setMeta('probe',true));});
 assert.ok(await page.evaluate(()=>window.previewNode===document.querySelector('.tikz-general-preview')),'An unchanged diagram keeps its rendered DOM during editor transactions');
 for(const mode of ['source','split','body']){await page.locator('[data-source-mode='+mode+']').click();if(mode!=='source')await page.locator('.tikz-general-preview-ready svg').waitFor({state:'attached'});}
 assert.equal(await page.evaluate(()=>window.previewCompiles),1,'View switches reuse the rendered diagram');

 console.log('PASS requested book editing, matter source, date, metadata escaping, page break and macro-adjacent heading');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
