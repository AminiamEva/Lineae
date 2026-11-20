const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {build}=require('esbuild');
const entry=JSON.parse(readFileSync(__dirname+'/fixtures/academic-tabularx.json','utf8')).tables[0];
module.exports=async function(context,url){
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.setViewportSize({width:1440,height:1000});await page.goto(url);
    const bundle=await build({stdin:{contents:"export {DOMParser} from '@tiptap/pm/model';export {serialize} from './apps/web/src/editor/latex-codec.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'tabularxFixture',write:false});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const source='\\begin{document}\r\nBefore.\n\n'+entry.source+'\r\n\nAfter.\n\\end{document}\r\n';
    const open=async()=>{
      await page.locator('input[type=file]').setInputFiles({name:'paper-tabularx.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
      await page.locator('[data-source-mode=split]').click();
    };
    const read=async()=>{
      await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.tabularxCopy=text;};});
      await page.locator('.tex-actions button').nth(2).click();return page.evaluate(()=>window.tabularxCopy);
    };
    await open();
    const node=await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON().content.find(n=>n.type==='table'));
    assert.equal(node.content.length,29);assert.equal(node.attrs.tabularx.specs.length,4);assert.equal(await read(),source);
    assert.equal(await page.locator('.ProseMirror table[data-tabularx]').count(),1);
    assert.equal(await page.locator('.ProseMirror td[colspan="2"]').count(),1);
    console.log('tabularx browser: PASS paper 4 columns / 29 rows / multicolumn / exact source');
    const roundtrip=await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor,div=document.createElement('div');div.innerHTML=editor.getHTML();
      const parsed=tabularxFixture.DOMParser.fromSchema(editor.schema).parse(div).toJSON().content.find(n=>n.type==='table');
      return {source:tabularxFixture.serialize(parsed),metadata:parsed.attrs.tabularx};
    });
    assert.equal(roundtrip.source,entry.source);assert.deepEqual(roundtrip.metadata,node.attrs.tabularx);
    console.log('tabularx browser: PASS HTML roundtrip retains width, declarations and source');
    await page.locator('[data-source-mode=body]').click();
    const layout=await page.locator('.ProseMirror table[data-tabularx]').evaluate(table=>{
      const cols=[...table.querySelectorAll('col')],cells=[...table.rows[1].cells];
      return {width:table.style.width,cols:cols.map(c=>c.style.width),tableWidth:table.getBoundingClientRect().width,layout:getComputedStyle(table).tableLayout,
        sizes:cells.map(c=>c.getBoundingClientRect().width),align:cells[0].style.textAlign,
        top:table.rows[0].cells[0].style.borderTopWidth,mid:table.rows[1].cells[0].style.borderTopWidth,
        bottom:table.rows[table.rows.length-1].cells[0].style.borderBottomWidth};
    });
    console.log('tabularx layout evidence:',JSON.stringify(layout));
    assert.equal(layout.width,'100%');assert.deepEqual(layout.cols,['8.5%','auto','8.5%','auto']);
    assert.ok(layout.sizes[1]>layout.sizes[0]*2);assert.equal(layout.align,'center');
    assert.equal(layout.top,'0.8pt');assert.equal(layout.mid,'0.5pt');assert.equal(layout.bottom,'0.8pt');
    console.log('tabularx browser: PASS p column width, flexible X columns, alignment and booktabs');
    for(const mode of ['split','body']){
      await open();await page.locator('[data-source-mode='+mode+']').click();
      await page.locator('.ProseMirror').evaluate(el=>{
        const editor=el.editor;let from,to;
        editor.state.doc.descendants((n,p)=>{if(from===undefined&&n.type.name==='tableCell'){from=p+2;to=p+n.nodeSize-2;}return from===undefined;});
        editor.view.dispatch(editor.state.tr.insertText('Updated',from,to));
      });
      await page.locator('[data-source-mode=source]').click();
      const cell=node.attrs.tabularx.cells[0];
      const updated=entry.source.slice(0,cell.from)+'Updated'+entry.source.slice(cell.to);
      assert.equal(await read(),source.replace(entry.source,updated));
      await page.locator('.cm-content').focus();await page.keyboard.press('Control+z');assert.equal(await read(),source);
    }
    console.log('tabularx browser: PASS multicolumn text edit and undo in Document/Split projection');
    await open();await page.locator('.ProseMirror').evaluate(el=>el.editor.view.dispatch(el.editor.state.tr.insertText('Edited.',1,8)));
    assert.equal(await read(),source.replace('Before.','Edited.'));
    console.log('tabularx browser: PASS neighboring paragraph preserves complete synthetic table');
    await open();await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor;let pos;
      editor.state.doc.descendants((n,p)=>{if(pos===undefined&&n.type.name==='tableCell')pos=p+2;});
      editor.commands.setTextSelection(pos);editor.commands.addColumnAfter();
    });
    assert.equal(await read(),source);
    assert.equal(await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON().content.find(n=>n.type==='table').content[0].content.length),4);
    assert.deepEqual(errors,[]);
    console.log('tabularx browser: PASS structural edit cannot discard column declarations');
  }finally{await page.close();}
};
