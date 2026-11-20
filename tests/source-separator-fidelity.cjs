const assert=require('node:assert/strict');
module.exports=async(context,url)=>{
 const page=await context.newPage();page.setDefaultTimeout(60000);
 const read=async()=>{await page.evaluate(()=>{navigator.clipboard.writeText=async s=>window.separatorCopy=s;});await page.locator('.tex-actions button').nth(2).click();return page.evaluate(()=>window.separatorCopy);};
 const sources=[
  '\\documentclass{article}\r\n\\title{Preserve}\n\\begin{document}\nBefore.\r\n\n\\begin{center}Center.\\end{center}\r\n% separator\n\\begin{abstract}Abstract.\\end{abstract}\n\n\\unknown{keep}\r\n\\end{document}',
  '\\begin{document}\n\\begin{cases}1&x>0\\\\0&x<0\\end{cases}\n\\end{document}',
 ];
 if(process.env.LINEAE_PAPER_SOURCE)sources.push(require('node:fs').readFileSync(process.env.LINEAE_PAPER_SOURCE,'utf8'));
 try{await page.goto(url);for(const [index,source] of sources.entries()){
  await page.locator('input[type=file]').setInputFiles({name:'separator.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
  for(const mode of ['body','split','source','body','source']){
   await page.locator('[data-source-mode='+mode+']').click();
   if(mode==='body')await page.locator('[data-source-mode=source]').click();
   assert.equal(await read(),source,`case ${index} after ${mode}`);
  }
  console.log('separator browser: PASS untouched case '+index);
  if(index===0)for(const mode of ['body','split']){
   await page.locator('[data-source-mode='+mode+']').click();
   await page.locator('.ProseMirror').evaluate(el=>{let at;el.editor.state.doc.descendants((n,p)=>{if(n.isText&&n.text==='Before.')at=p;});if(at===undefined)throw Error('paragraph missing');el.editor.view.dispatch(el.editor.state.tr.insertText('Edited.',at,at+7));});
   await page.locator('[data-source-mode=source]').click();assert.equal(await read(),source.replace('Before.','Edited.'));
   await page.locator('.cm-content').focus();await page.keyboard.press('Control+z');assert.equal(await read(),source);
  }
 }
 }finally{await page.close();}
};
