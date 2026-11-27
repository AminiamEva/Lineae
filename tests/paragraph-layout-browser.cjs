const {openXeReference}=require('./xe-reference-page.cjs');
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
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openXeReference(page,'http://127.0.0.1:'+server.address().port);
 const reference=JSON.parse(await readFile('tests/fixtures/paragraph-layout/xelatex-reference.json','utf8'));
 for(const fixture of reference.cases){
 await page.locator('[data-source-mode=source]').click();const code=page.locator('.cm-content');await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(fixture.source);await page.locator('[data-source-mode=body]').click();
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
 const evidence=await page.locator('.ProseMirror p').first().evaluate(node=>{
  const lines=new Map();let previousLine=null;const walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
  while(walk.nextNode()){
   const text=walk.currentNode;if(text.parentElement.closest('.ProseMirror-widget'))continue;
   for(let index=0;index<text.length;index++){const range=document.createRange();range.setStart(text,index);range.setEnd(text,index+1);const r=range.getBoundingClientRect();if(/\s/.test(text.data[index])){if(previousLine!==null)lines.get(previousLine).text+=text.data[index];continue;}if(!r.width&&!r.height)continue;const key=Math.round(r.top*10)/10;if(key===null)continue;previousLine=key;if(!lines.has(key))lines.set(key,{text:'',x:r.left,right:r.right,y:r.top});const line=lines.get(key);line.text+=text.data[index];line.right=Math.max(line.right,r.right);}
  }
  for(const hyphen of node.querySelectorAll('.tex-discretionary-hyphen')){const r=hyphen.getBoundingClientRect();const match=[...lines.keys()].sort((a,b)=>Math.abs(a-r.top)-Math.abs(b-r.top))[0];if(match!==undefined){lines.get(match).text+='-';lines.get(match).right=Math.max(lines.get(match).right,r.right);}}
  return {width:node.clientWidth,style:getComputedStyle(node).font,optimized:node.hasAttribute('data-tex-paragraph'),lines:[...lines.values()].filter(line=>line.text.trim()).map(line=>({...line,text:line.text.trim().normalize('NFKC')}))};
 });
 console.log('PARAGRAPH '+JSON.stringify({margin:fixture.margin,expected:fixture.lines,evidence}));
 assert.equal(await page.locator('.ProseMirror p').first().getAttribute('data-tex-engine'),'xelatex');assert.equal(evidence.optimized,true);assert.deepEqual(evidence.lines.map(line=>line.text),fixture.lines.map(line=>line.text),'Line endings must match the XeLaTeX reference at margin '+fixture.margin);
 for(let i=0;i<fixture.lines.length;i++){
 const line=evidence.lines[i],expected=fixture.lines[i].bbox;
 assert.ok(Math.abs((line.right-line.x)-(expected[2]-expected[0])*4/3)<1,'Line width differs from XeLaTeX: '+JSON.stringify({margin:fixture.margin,line:i,actual:line.right-line.x,expected:(expected[2]-expected[0])*4/3}));
 if(i)assert.ok(Math.abs((line.y-evidence.lines[0].y)-(expected[1]-fixture.lines[0].bbox[1])*4/3)<.5,'Baseline spacing differs from XeLaTeX');
 }
 const sourceText=fixture.source;await page.evaluate(()=>{const editor=document.querySelector('.ProseMirror').editor;editor.view.focus();editor.commands.setTextSelection(editor.state.doc.content.size-1);});await page.keyboard.insertText(' sample');await page.waitForFunction(()=>document.querySelector('.ProseMirror').editor.state.doc.textContent.endsWith(' sample'),null,{timeout:4000});await page.keyboard.press('Control+z');
 await page.locator('[data-source-mode=source]').click();assert.equal((await code.innerText()).trimEnd(),sourceText.trimEnd(),'View layout and undo preserve source text');await page.locator('[data-source-mode=body]').click();
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
