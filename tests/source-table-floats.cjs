const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {build}=require('esbuild');
const fixture=JSON.parse(readFileSync(__dirname+'/fixtures/academic-table-floats.json','utf8'));

module.exports=async function checkTableFloats(context,url) {
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(url);
    const bundle=await build({stdin:{contents:"export {DOMParser} from '@tiptap/pm/model';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'tableFixture',write:false});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const sources=fixture.tables.map(table=>table.source);
    const source='\\begin{document}\r\nBefore.\n\n'+sources.join('\r\n\n')+'\n\r\nAfter.\n\\end{document}\r\n';
    await page.locator('input[type=file]').setInputFiles({name:'paper-tables.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('[data-source-mode=split]').click();
    const actual=await page.locator('.ProseMirror').evaluate(element=>{
      const raw=[...element.querySelectorAll('pre[data-raw]')];let index=0;
      return element.editor.getJSON().content.filter(n=>n.type==='raw'||n.attrs?.tblr||n.attrs?.tabularx).map(n=>{
        const saved=n.attrs.tblr??n.attrs.tabularx;
        if(saved)return {source:saved.source,environment:'table',placement:n.attrs.placement,caption:n.attrs.caption,label:n.attrs.label,centered:n.attrs.centered};
        const dom=raw[index++];return {source:JSON.parse(dom.getAttribute('data-raw-source')),
          environment:dom.getAttribute('data-table-float'),placement:dom.getAttribute('data-table-placement'),
          caption:dom.getAttribute('data-table-caption'),label:dom.getAttribute('data-table-label'),centered:dom.getAttribute('data-table-centered')==='true'};
      });
    });
    assert.equal(actual.length,38);
    actual.forEach((float,index)=>{
      assert.equal(float.environment,'table');
      for(const key of ['source','placement','caption','label','centered'])assert.equal(float[key],fixture.tables[index][key],key+' table '+index);
    });
    console.log('table browser: PASS 38 paper float descriptors and intact sources');
    const roundtrip=await page.locator('.ProseMirror').evaluate(element=>{
      const editor=element.editor,wrapper=document.createElement('div');wrapper.innerHTML=editor.getHTML();
      return tableFixture.DOMParser.fromSchema(editor.schema).parse(wrapper).toJSON().content.filter(n=>n.type==='raw'||n.attrs?.tblr||n.attrs?.tabularx).map(n=>n.attrs.tblr?.source??n.attrs.tabularx?.source??n.attrs.source);
    });
    assert.deepEqual(roundtrip,sources);
    console.log('table browser: PASS 38 float HTML roundtrips (Table or Raw)');
    const read=async()=>{
      await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.tableCopied=text;};});
      await page.locator('.tex-actions button').nth(2).click();return page.evaluate(()=>window.tableCopied);
    };
    assert.equal(await read(),source);
    await page.locator('.ProseMirror').evaluate(element=>{
      const editor=element.editor;
      editor.view.dispatch(editor.state.tr.insertText('Edited.',1,8));
    });
    assert.equal(await read(),source.replace('Before.','Edited.'));
    console.log('table browser: PASS exact source and neighbor edit across 38 floats');
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
};
