const assert=require('node:assert/strict');
const {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {build}=require('esbuild');
const entries=JSON.parse(readFileSync(__dirname+'/fixtures/academic-figures.json','utf8')).figures;
module.exports=async function(context,url){
  const page=await context.newPage(),errors=[],assetRoot=mkdtempSync(join(tmpdir(),'lineae-figure-test-'));
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.setViewportSize({width:1440,height:1000});await page.goto(url);
    const bundle=await build({stdin:{contents:"export {DOMParser} from '@tiptap/pm/model';export {serialize} from './apps/web/src/editor/latex-codec.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'figureFixture',write:false});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const source='\\begin{document}\r\nBefore.\n\n'+entries.map(f=>f.source).join('\r\n\n')+'\n\nAfter.\n\\end{document}\r\n';
    const open=async(text=source)=>{
      await page.locator('input[type=file]').setInputFiles({name:'paper-figures.tex',mimeType:'text/plain',buffer:Buffer.from(text)});
      await page.locator('[data-source-mode=split]').click();
    };
    const read=async()=>{
      await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.figureCopy=text;};});
      await page.locator('.tex-actions button').nth(2).click();return page.evaluate(()=>window.figureCopy);
    };
    await open();
    const nodes=await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON().content.filter(n=>n.type==='documentImage'));
    assert.equal(nodes.length,11);assert.ok(nodes.every(n=>n.attrs.figureSource));assert.equal(await read(),source);
    const missing=page.locator('.document-image[data-resource-state=missing]');
    assert.equal(await missing.count(),11);
    assert.equal(await missing.locator('img[src]').count(),0);
    for(const entry of entries)assert.ok((await missing.locator('[role=status]').allTextContents()).some(text=>text.includes(entry.path)));
    console.log('figure browser: PASS all 11 synthetic figures, missing states and exact source');
    const roundtrip=await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor,div=document.createElement('div');div.innerHTML=editor.getHTML();
      return figureFixture.DOMParser.fromSchema(editor.schema).parse(div).toJSON().content.filter(n=>n.type==='documentImage').map(n=>({attrs:n.attrs,source:figureFixture.serialize(n)}));
    });
    assert.deepEqual(roundtrip.map(n=>n.attrs),nodes.map(n=>n.attrs));
    for(let i=0;i<11;i++)assert.equal(roundtrip[i].source.trim(),entries[i].source);
    console.log('figure browser: PASS HTML/JSON metadata and source roundtrip');
    for(const mode of ['split','body']){
      await open();await page.locator('[data-source-mode='+mode+']').click();
      await page.locator('.ProseMirror').evaluate(el=>el.editor.view.dispatch(el.editor.state.tr.insertText('Edited.',1,8)));
      await page.locator('[data-source-mode=source]').click();assert.equal(await read(),source.replace('Before.','Edited.'));
      await page.locator('.cm-content').focus();await page.keyboard.press('Control+z');assert.equal(await read(),source);
    }
    console.log('figure browser: PASS Document/Split neighboring edits and undo retain all figures');
    await open();await page.locator('[data-source-mode=body]').click();
    const image=page.locator('.document-image').first();await image.hover();
    await image.locator('.document-image-controls button').first().click();
    await page.locator('.editor-dialog input').fill('\\textwidth');await page.locator('.editor-dialog button[type=submit]').click();
    await page.locator('[data-source-mode=source]').click();
    assert.equal(await read(),source.replace('0.6\\linewidth','\\textwidth'));
    console.log('figure browser: PASS width dialog patches only original argument');

    // This generated one-pixel asset tests loading only; it is NOT a paper image.
    mkdirSync(join(assetRoot,'figures'));const synthetic=join(assetRoot,'figures','unit.png');
    writeFileSync(synthetic,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=','base64'));
    const sample='\\begin{document}\n\\begin{figure}[H]\n\\centering\n\\includegraphics[width=\\textwidth]{figures/unit}\n\\caption{Synthetic loading test}\n\\end{figure}\n\\end{document}\n';
    const attach=async()=>{
      await page.locator('[data-source-mode=body]').click();
      await page.locator('[data-group=files]').click();
      const chooser=page.waitForEvent('filechooser');await page.locator('[data-tool=assets]').click();await (await chooser).setFiles(assetRoot);
    };
    await open(sample);await attach();
    await page.locator('.document-image[data-resource-state=ready]').waitFor();
    assert.equal(await page.locator('.document-image img').evaluate(el=>el.naturalWidth),1);
    assert.equal(await page.locator('.document-image img').evaluate(el=>el.style.width),'100%');
    await page.locator('[data-source-mode=source]').click();assert.equal(await read(),sample);
    console.log('figure browser: PASS attached project asset, extensionless path and textwidth');
    writeFileSync(synthetic,'intentionally invalid PNG for error handling');await attach();
    await page.locator('.document-image[data-resource-state=error]').waitFor();
    assert.equal(await page.locator('.document-image img').isVisible(),false);
    assert.equal(await page.locator('.document-image').count(),1);
    console.log('figure browser: PASS undecodable image keeps its node and error state');
    await open(sample);assert.equal(await page.locator('.document-image[data-resource-state=missing]').count(),1);
    assert.equal(await page.locator('.document-image img[src]').count(),0);assert.equal(await read(),sample);
    assert.deepEqual(errors,[]);
    console.log('figure browser: PASS opening another document clears stale resource previews');
  }finally{
    await page.close();
    assert.ok(assetRoot.startsWith(join(tmpdir(),'lineae-figure-test-')));
    rmSync(assetRoot,{recursive:true,force:true});
  }
};
