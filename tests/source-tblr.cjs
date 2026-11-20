const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {build}=require('esbuild');
const fixture=JSON.parse(readFileSync(__dirname+'/fixtures/academic-tblr.json','utf8'));
module.exports=async function(context,url) {
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(url);
    const bundle=await build({stdin:{contents:"export {DOMParser} from '@tiptap/pm/model';export {serialize} from './apps/web/src/editor/latex-codec.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'tblrFixture',write:false});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const source='\\begin{document}\r\nBefore.\n\n'+fixture.tables.map(t=>t.source).join('\r\n\n')+'\n\nAfter.\r\n\\end{document}\n';
    const open=async(text=source)=>{
      await page.locator('input[type=file]').setInputFiles({name:'tblr-paper.tex',mimeType:'text/plain',buffer:Buffer.from(text)});
      await page.locator('[data-source-mode=split]').click();
    };
    const read=async()=>{
      await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.tblrCopy=text;};});
      await page.locator('.tex-actions button').nth(2).click();return page.evaluate(()=>window.tblrCopy);
    };
    await open();
    const actual=await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON().content.filter(n=>n.type==='table'));
    assert.equal(actual.length,37);assert.equal(await page.locator('.ProseMirror table[data-tblr]').count(),37);
    actual.forEach((node,i)=>assert.equal(node.attrs.tblr.source,fixture.tables[i].source));
    assert.equal(await read(),source);
    console.log('tblr browser: PASS 37 Table nodes and untouched source');
    const html=await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor,wrapper=document.createElement('div');wrapper.innerHTML=editor.getHTML();
      return tblrFixture.DOMParser.fromSchema(editor.schema).parse(wrapper).toJSON().content.filter(n=>n.type==='table').map(tblrFixture.serialize);
    });
    assert.deepEqual(html,fixture.tables.map(t=>t.source));
    console.log('tblr browser: PASS 37 HTML roundtrips');
    const style=await page.locator('.ProseMirror table[data-tblr]').first().locator('td').first().evaluate(el=>{
      const s=getComputedStyle(el);return {align:s.textAlign,vertical:s.verticalAlign,bold:s.fontWeight,border:s.borderTopStyle};
    });
    assert.equal(style.align,'center');assert.equal(style.vertical,'middle');assert.equal(style.bold,'700');assert.equal(style.border,'solid');
    assert.ok(await page.locator('.ProseMirror td[colspan="2"]').count()>0);
    console.log('tblr browser: PASS alignment, row font, rules and colspan');
    const replaceFirst=()=>page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor;let from,to;
      editor.state.doc.descendants((node,pos)=>{if(from===undefined&&node.type.name==='tableCell'){from=pos+2;to=pos+node.nodeSize-2;}return from===undefined;});
      editor.view.dispatch(editor.state.tr.insertText('EditedCell',from,to));
    });
    for(const mode of ['split','body']) {
      await open();await page.locator('[data-source-mode='+mode+']').click();
      await replaceFirst();
      await page.locator('[data-source-mode=source]').click();
      const first=actual[0].attrs.tblr,range=first.cells[0];
      const updated=first.source.slice(0,range.from)+'EditedCell'+first.source.slice(range.to);
      assert.equal(await read(),source.replace(first.source,updated));
      await page.locator('.cm-content').focus();await page.keyboard.press('Control+z');assert.equal(await read(),source);
    }
    console.log('tblr browser: PASS cell edits and undo in Split/Document');
    await open();
    await page.locator('.ProseMirror').evaluate(el=>el.editor.view.dispatch(el.editor.state.tr.insertText('Edited.',1,8)));
    assert.equal(await read(),source.replace('Before.','Edited.'));
    console.log('tblr browser: PASS neighbor edit preserves all 37 tables');
    await open();
    await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor;let pos;
      editor.state.doc.descendants((node,p)=>{if(pos===undefined&&node.type.name==='tableCell')pos=p+2;});
      editor.commands.setTextSelection(pos);editor.commands.addRowAfter();
    });
    assert.equal(await read(),source);
    const rows=await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON().content.find(n=>n.type==='table').content.length);
    assert.equal(rows,actual[0].content.length);
    assert.deepEqual(errors,[]);
    console.log('tblr browser: PASS unsupported structural edit preserves source');
    for (const [body, expected] of [
      [String.raw`A\nolinebreak B`, String.raw`A\nolinebreak BQ`],
      [String.raw`A\mbox{B}`, String.raw`A\mbox{BQ}`],
    ]) {
      const sample = '\\begin{document}\r\n\\begin{tblr}{X}'+body+'\\end{tblr}\n\\end{document}';
      await open(sample);
      await page.locator('[data-source-mode=body]').click();
      await page.locator('.ProseMirror td p').click();
      await page.keyboard.press('End');
      await page.keyboard.insertText('Q');
      await page.locator('[data-source-mode=source]').click();
      assert.equal(await read(),sample.replace(body,expected));
    }
    console.log('tblr browser: PASS real cell edits keep layout commands and nested boxes');
  }finally{await page.close();}
};
