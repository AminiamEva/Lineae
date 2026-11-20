const assert=require('node:assert/strict');
const fixture=require('./fixtures/academic-headings.json');
module.exports=async function(context,url) {
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(url);
    const source='\\begin{document}\r\n'+fixture.headings.map(h=>h.source).join('\r\n\n')+'\n\n\\unknown{Keep}\r\n\nAfter.\n\\end{document}\r\n';
    await page.locator('input[type=file]').setInputFiles({name:'headings.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('[data-source-mode=split]').click();
    const actual=await page.locator('.ProseMirror').evaluate(element=>element.editor.getJSON().content.filter(n=>n.type==='heading'));
    assert.equal(actual.length,46);
    for(const [i,node] of actual.entries()) {
      assert.equal(node.attrs.level,fixture.headings[i].level);
      assert.equal(node.attrs.numbered,fixture.headings[i].numbered);
      assert.equal(node.content.map(n=>n.text??'').join(''),fixture.headings[i].title);
    }
    const read=async()=>{
      await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.headingCopied=text;};});
      await page.locator('.tex-actions button').nth(2).click();
      return page.evaluate(()=>window.headingCopied);
    };
    assert.equal(await read(),source);
    await page.locator('.ProseMirror').evaluate(element=>{
      const editor=element.editor;let at;
      editor.state.doc.forEach((node,pos)=>{if(node.type.name==='paragraph'&&node.textContent==='After.')at=pos+1;});
      if(at===undefined)throw new Error('paragraph missing');
      editor.view.dispatch(editor.state.tr.insertText('Edited.',at,at+6));
    });
    assert.equal(await read(),source.replace('After.','Edited.'));
    assert.equal(await page.locator('.ProseMirror pre[data-raw]').count(),1);
    assert.deepEqual(errors,[]);
    console.log('46 paper headings, levels, stars, source round trip and neighbor edit: PASS');
  } finally {await page.close();}
};
