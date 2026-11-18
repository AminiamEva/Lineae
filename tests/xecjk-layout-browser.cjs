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
 await page.goto('http://127.0.0.1:'+server.address().port);
 const reference=JSON.parse(await readFile('tests/fixtures/paragraph-layout/xecjk-reference.json','utf8'));
 for(const fixture of reference.cases){
 await page.locator('[data-source-mode=source]').click();const code=page.locator('.cm-content');await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(fixture.source);await page.locator('[data-source-mode=body]').click();
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
 const evidence=await page.locator('.ProseMirror p').first().evaluate(node=>{
  const lines=new Map();let previousLine=null;const walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
  while(walk.nextNode()){
   const text=walk.currentNode;if(text.parentElement.closest('.ProseMirror-widget'))continue;
   for(let index=0;index<text.length;index++){const range=document.createRange();range.setStart(text,index);range.setEnd(text,index+1);const r=range.getBoundingClientRect();if(/\s/.test(text.data[index])){if(previousLine!==null)lines.get(previousLine).text+=text.data[index];continue;}if(!r.width&&!r.height)continue;const key=[...lines.keys()].find(y=>Math.abs(y-r.top)<6)??Math.round(r.top*10)/10;if(key===null)continue;previousLine=key;if(!lines.has(key))lines.set(key,{text:'',x:r.left,right:r.right,y:r.top});const line=lines.get(key);line.text+=text.data[index];line.y=Math.min(line.y,r.top);line.right=Math.max(line.right,r.right);}
  }
  for(const hyphen of node.querySelectorAll('.tex-discretionary-hyphen')){const r=hyphen.getBoundingClientRect();const match=[...lines.keys()].sort((a,b)=>Math.abs(a-r.top)-Math.abs(b-r.top))[0];if(match!==undefined){lines.get(match).text+='-';lines.get(match).right=Math.max(lines.get(match).right,r.right);}}
  return {width:node.clientWidth,style:getComputedStyle(node).font,optimized:node.hasAttribute('data-tex-paragraph'),lines:[...lines.values()].filter(line=>line.text.trim()).map(line=>({...line,text:line.text.trim().normalize('NFC')}))};
 });
 console.log('PARAGRAPH '+JSON.stringify({margin:fixture.margin,expected:fixture.lines,evidence}));
 assert.equal(evidence.optimized,true);assert.deepEqual(evidence.lines.map(line=>line.text),fixture.lines.map(line=>line.text),'Line endings must match the XeLaTeX reference at margin '+fixture.margin);
 for(let i=0;i<fixture.lines.length;i++){
 const line=evidence.lines[i],expected=fixture.lines[i].bbox;
 assert.ok(Math.abs((line.right-line.x)-(expected[2]-expected[0])*4/3)<1,'Line width differs from XeLaTeX: '+JSON.stringify({margin:fixture.margin,line:i,actual:line.right-line.x,expected:(expected[2]-expected[0])*4/3}));
 if(i)assert.ok(Math.abs((line.y-evidence.lines[0].y)-(expected[1]-fixture.lines[0].bbox[1])*4/3)<.5,'Baseline spacing differs from XeLaTeX');
 }
 const sourceText=fixture.source;await page.locator('.ProseMirror p').first().click();await page.keyboard.press('End');await page.keyboard.type(' sample');await page.keyboard.press('Control+z');
 await page.locator('[data-source-mode=source]').click();assert.equal((await code.innerText()).trimEnd(),sourceText.trimEnd(),'View layout and undo preserve source text');await page.locator('[data-source-mode=body]').click();
 }
 const imeSource=reference.cases[0].source.replace(/中文排版[\s\S]*?(?=\n\\end\{document\})/,'中文$x$正文'+('中文输入应当保持光标位置稳定并允许连续编辑'.repeat(5)));
 await page.locator('[data-source-mode=source]').click();const imeCode=page.locator('.cm-content');await imeCode.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(imeSource);await page.locator('[data-source-mode=body]').click();await page.evaluate(()=>document.fonts.ready);
 await page.locator('.math-inline').waitFor();await page.waitForFunction(()=>document.querySelector('.math-inline math-field')?._mathfield?.model);await page.evaluate(()=>{const editor=document.querySelector('.ProseMirror').editor;let after;editor.state.doc.descendants((node,pos)=>{if(node.type.name==='math')after=pos+node.nodeSize;});editor.commands.focus();editor.commands.setTextSelection(after);});
 await page.waitForFunction(()=>document.querySelector('.ProseMirror').editor.view.hasFocus());
 const originalText=await page.evaluate(()=>document.querySelector('.ProseMirror').editor.state.doc.textContent),cdp=await page.context().newCDPSession(page);
 await page.bringToFront();await cdp.send('Input.imeSetComposition',{text:'z',selectionStart:1,selectionEnd:1});
 await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent.includes('中文xz正文'),null,{timeout:4000}).catch(async()=>assert.fail('IME DOM '+await page.evaluate(()=>document.querySelector('.ProseMirror p')?.innerHTML)));
 const imeCaret=await page.evaluate(()=>{const selection=window.getSelection(),range=selection.getRangeAt(0).cloneRange();range.collapse(false);const caret=range.getBoundingClientRect(),formula=document.querySelector('.math-inline').getBoundingClientRect();return {caret:{left:caret.left,top:caret.top},formula:{right:formula.right,top:formula.top},text:document.querySelector('.ProseMirror').editor.state.doc.textContent,nativeText:document.querySelector('.ProseMirror p').textContent,focusNode:selection.focusNode?.nodeName,focusOffset:selection.focusOffset};});
 assert.ok(imeCaret.caret.left>=imeCaret.formula.right-2&&Math.abs(imeCaret.caret.top-imeCaret.formula.top)<25,JSON.stringify(imeCaret));
 await cdp.send('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});await cdp.send('Input.insertText',{text:'中'});
 assert.equal(await page.evaluate(()=>document.querySelector('.ProseMirror').editor.state.doc.textContent),originalText.replace('中文正文','中文中正文'));
 assert.equal(await page.locator('.math-inline').getAttribute('data-latex'),'x');
 await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>document.querySelector('.ProseMirror').editor.state.doc.textContent),originalText);
 await cdp.detach();
 assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
