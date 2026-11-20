const assert=require('node:assert/strict');
module.exports=async(context,url)=>{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(url);
    for(const [open,close] of [['$$','$$'],['\\[','\\]']]) {
      const source='\\begin{document}\r\nBefore.\r\n'+open+'\r\nx+y\n'+close+'\nAfter $a$ and \\(b\\).\r\n\n\\unknown{keep}\n\\end{document}\r\n';
      await page.locator('input[type=file]').setInputFiles({name:'display.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
      await page.locator('[data-source-mode=split]').click();
      const doc=await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON());
      assert.deepEqual(doc.content.map(n=>n.type),['paragraph','mathBlock','paragraph','raw']);
      assert.equal(doc.content[1].attrs.delimiter,open);
      assert.equal(doc.content[1].attrs.latex,'\r\nx+y\n');
      assert.equal(doc.content[2].content.filter(n=>n.type==='math').length,2);
      const read=async()=>{
        await page.evaluate(()=>{navigator.clipboard.writeText=async s=>{window.displayCopied=s;};});
        await page.locator('.tex-actions button').nth(2).click();
        return page.evaluate(()=>window.displayCopied);
      };
      assert.equal(await read(),source);
      await page.locator('.ProseMirror').evaluate(el=>{
        const editor=el.editor;
        editor.view.dispatch(editor.state.tr.insertText('Edited.',1,8));
      });
      assert.equal(await read(),source.replace('Before.','Edited.'));
    }
    const source='\\begin{document}\n'+String.raw`Before.\[\begin{aligned}x&=1\\[6pt]y&=2\end{aligned}\]After.`+'\n\\end{document}\n';
    await page.locator('input[type=file]').setInputFiles({name:'spacing.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('[data-source-mode=split]').click();
    const doc=await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON());
    assert.deepEqual(doc.content.map(n=>n.type),['paragraph','mathBlock','paragraph']);
    assert.ok(doc.content[1].attrs.latex.includes(String.raw`\\[6pt]`));
    assert.deepEqual(errors,[]);
    console.log('Display delimiters, mixed EOL, inline formulas, neighbor edits and row spacing: PASS');
  }finally{await page.close();}
};
