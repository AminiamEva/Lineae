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
  await page.evaluate(async({main,child})=>{
   const root=await navigator.storage.getDirectory(),folder=await root.getDirectoryHandle('render-parity',{create:true});
   for(const [name,source]of [['main.tex',main],['child.tex',child]]){const w=await(await folder.getFileHandle(name,{create:true})).createWritable();await w.write(source);await w.close();}
   window.showDirectoryPicker=async()=>folder;
  },{main:"\\documentclass[a4paper]{article}\n\\usepackage[margin=2.2cm]{geometry}\n\\usepackage{indentfirst}\n\\begin{document}\n\\section{Root heading}\n\nRoot body.\n\n\\input{child}\n\nTail body.\n\\end{document}\n",child:"\\section{Included heading}\n\nIncluded body.\n"});
  await revealToolbar(page);await page.locator('[data-group=files]').click();await page.locator('#project-open').click();
  await page.locator('[data-file-path="child.tex"] h1').waitFor();
  await page.waitForTimeout(200);
  const metrics=()=>page.locator('.ProseMirror').evaluate(node=>{
   const page=node.closest('.document-page'),origin=page.getBoundingClientRect();
   return [...node.querySelectorAll('h1,h2,h3,p')].filter(block=>block.textContent.trim()&&block.getClientRects().length).map(block=>{
    const r=block.getBoundingClientRect(),style=getComputedStyle(block);
    return {text:block.textContent,x:r.left-origin.left,y:r.top-origin.top,width:r.width,height:r.height,font:style.fontFamily,size:style.fontSize,lineHeight:style.lineHeight,indent:style.textIndent};
   });
  });
  const included=await metrics();
  await page.locator('[data-source-mode=source]').click();const code=page.locator('.tex-code .cm-content');await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText("\\documentclass[a4paper]{article}\n\\usepackage[margin=2.2cm]{geometry}\n\\usepackage{indentfirst}\n\\begin{document}\n\\section{Root heading}\n\nRoot body.\n\n\\section{Included heading}\n\nIncluded body.\n\n\nTail body.\n\\end{document}\n");
  await page.locator('[data-source-mode=body]').click();await page.waitForFunction(()=>!document.querySelector('[data-project-region]'));await page.waitForTimeout(200);
  const flat=await metrics();assert.equal(included.length,flat.length);
  for(let i=0;i<flat.length;i++){
   for(const key of ['text','font','size','lineHeight','indent'])assert.equal(included[i][key],flat[i][key],key+' differs at '+flat[i].text);
   for(const key of ['x','y','width','height'])assert.ok(Math.abs(included[i][key]-flat[i][key])<.8,key+' differs at '+flat[i].text+': '+included[i][key]+' vs '+flat[i][key]);
  }
  assert.deepEqual(errors,[]);console.log('PASS: included headings, first paragraphs and file boundaries have the same geometry and fonts as flattened source');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
