const assert=require('node:assert/strict');
const {build}=require('esbuild');
const {readFile,mkdir}=require('node:fs/promises');
const {join}=require('node:path');

module.exports=async function checkV2(context,url) {
  const fixture=await build({stdin:{contents:"export {EditorView} from '@codemirror/view';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'v2Fixture',write:false});
  const page=await context.newPage();
  let assertions=0;
  const equal=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
  try {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(url);
    await page.addScriptTag({content:fixture.outputFiles[0].text});
    const sample='\\documentclass{article}\r\n\\newcommand{\\secret}[1]{#1}\n\\begin{document}\nHello world.\n\n\\unknown{keep me}\r\n\nSecond paragraph.\r\n\\end{document}\r\n';
    await page.locator('input[type=file]').setInputFiles({name:'v2.tex',mimeType:'text/plain',buffer:Buffer.from(sample)});
    await page.locator('[data-source-mode=source]').click();
    const content=page.locator('.cm-content');
    const read=()=>page.evaluate(()=>v2Fixture.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString());
    const set=async text=>{
      await page.evaluate(text=>{const v=v2Fixture.EditorView.findFromDOM(document.querySelector('.cm-editor'));v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:text.length}});v.focus();},text);
      await page.keyboard.press('Escape');
    };
    const copy=async()=>{
      await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.v2Copied=text;};});
      await page.locator('.tex-actions button').nth(2).click();
      return page.evaluate(()=>window.v2Copied);
    };
    equal(await copy(),sample,'source opens byte-exact');
    const bounds=await page.locator('.tex-workspace').boundingBox(),head=await page.locator('header').boundingBox();
    equal(bounds.width,1440,'full available width');equal(bounds.y>=head.y+head.height,true,'toolbar stays visible');
    const richSize=await page.locator('.ProseMirror').evaluate(e=>getComputedStyle(e).fontSize);
    await content.focus();await page.keyboard.press('Control+0');await page.keyboard.press('Control+=');
    equal(await page.locator('.tex-zoom-label').innerText(),'17px','font shortcut');
    equal(await page.locator('.ProseMirror').evaluate(e=>getComputedStyle(e).fontSize),richSize,'rich font unaffected');
    for(let i=0;i<20;i++)await page.keyboard.press('Control+=');
    equal(await page.locator('.tex-zoom-label').innerText(),'32px','upper bound');
    for(let i=0;i<25;i++)await page.keyboard.press('Control+-');
    equal(await page.locator('.tex-zoom-label').innerText(),'11px','lower bound');
    await page.keyboard.press('Control+0');equal(await copy(),sample,'zoom never edits source');
    await page.locator('[data-source-mode=split]').click();
    equal(await page.locator('.tex-preview .ProseMirror').isEditable(),true,'existing rich editor is editable');
    equal(await page.locator('.tex-divider').getAttribute('aria-valuenow'),'50','initial equal split');
    await page.locator('.tex-divider').press('ArrowRight');equal(await page.locator('.tex-divider').getAttribute('aria-valuenow'),'52','keyboard resize');
    const richParagraph=page.locator('.ProseMirror p').filter({hasText:'Hello world.'});
    await richParagraph.click();await page.keyboard.press('Home');await page.keyboard.insertText('Edited ');
    equal(await copy(),sample.replace('Hello world.','Edited Hello world.'),'rich edit patches only exact source span');
    await richParagraph.click();await page.keyboard.press('Control+z');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror').textContent.includes('Hello world.')&&!document.querySelector('.ProseMirror').textContent.includes('Edited'));
    equal(await copy(),sample,'rich undo uses shared byte-faithful source history');
    await content.focus();await page.keyboard.press('Control+y');await page.waitForTimeout(350);
    equal(await copy(),sample.replace('Hello world.','Edited Hello world.'),'source redo restores rich edit');
    const beforeProtected=await copy();
    await page.locator('.ProseMirror').evaluate(e=>{
      const editor=e.editor;let position;editor.state.doc.forEach((node,pos)=>{if(node.type.name==='raw')position=pos;});
      editor.view.dispatch(editor.state.tr.delete(position,position+editor.state.doc.nodeAt(position).nodeSize));
    });
    equal(await copy(),beforeProtected,'protected unknown block cannot be deleted from rich view');
    equal((await page.locator('.tex-message').innerText()).length>0,true,'boundary disclosed');
    await page.locator('[data-source-mode=source]').click();
    for(const [typed,expected] of [['{}','{}'],['()','()'],['[]','[]'],['$x$','$x$'],['$$x$$','$$x$$'],['\\(x\\)','\\(x\\)'],['\\[x\\]','\\[x\\]']]) {
      await set('');await page.keyboard.type(typed);equal(await read(),expected,'pair '+typed);
    }
    await set('');await page.keyboard.type('$');await page.keyboard.press('Backspace');equal(await read(),'','paired deletion');
    await set('% comment ');await page.keyboard.type('{$');equal(await read(),'% comment {$','no pairs in comments');
    await set('\\begin{verbatim}\n');await page.keyboard.type('{$');equal(await read(),'\\begin{verbatim}\n{$','no pairs in verbatim');
    await set('');await page.keyboard.type('\\sec');await page.locator('.cm-tooltip-autocomplete').waitFor();await page.waitForTimeout(150);await page.keyboard.press('Enter');
    equal(await read(),'\\section{}','command completion');
    await set('');await page.keyboard.type('\\begin{ite');await page.locator('.cm-tooltip-autocomplete').waitFor();await page.waitForTimeout(150);await page.keyboard.press('Tab');
    equal(await read(),'\\begin{itemize}\n    \n\\end{itemize}','paired environment completion');
    await set('\\begin{align}');await page.keyboard.press('Enter');equal(await read(),'\\begin{align}\n    \n\\end{align}','manual environment Enter');
    await set('\\begin{enum}');await page.keyboard.press('Enter');
    equal((await read()).includes('\\end{enum}'),false,'abbreviated environment Enter does not insert a mismatched closer');
    await set('\\begin{enum}\n\\end{enum}');
    await page.evaluate(()=>{
      const view=v2Fixture.EditorView.findFromDOM(document.querySelector('.cm-editor'));
      const text=view.state.doc.toString();
      view.dispatch({selection:{anchor:text.indexOf('\\begin{enum}')+'\\begin{enum}'.length}});
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    await page.locator('.cm-tooltip-autocomplete').waitFor();
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    equal(await read(),'\\begin{enumerate}\n\\end{enumerate}','existing environment closer is renamed');
    await set('\\begin{itemize}\n    \\item x');await page.keyboard.press('Enter');
    equal((await read()).endsWith('\n    '),true,'environment indentation');
    await set('\\begin{itemize}\n    \\item x\n\\end{itemize}');
    const unfolded=await read();await page.locator('.cm-foldGutter .cm-gutterElement').filter({hasText:'⌄'}).first().click();
    equal(await page.locator('.cm-foldPlaceholder').count(),1,'environment folds');equal(await read(),unfolded,'fold does not change bytes');
    for(const [name,group] of [['itemize','insert'],['enumerate','insert'],['equation','math'],['align','math'],['figure','insert'],['▦','table']]) {
      await set('');await page.locator('[data-group='+group+']').click();
      const control=page.locator('[data-source-action="'+name+'"]').filter({visible:true});
      await control.first().click();const text=await read();equal(text.includes('\\begin{'+(name==='▦'?'table':name)+'}'),true,'toolbar '+name);
      equal(await content.evaluate(e=>e.contains(document.activeElement)||e===document.activeElement),true,'snippet keeps focus');
      await page.keyboard.press('Control+z');equal(await read(),'','snippet has one undo step');
    }
    await page.locator('[data-group=table]').click();equal(await page.locator('[data-source-action=merge]').isDisabled(),true,'unsupported toolbar operation disabled');
    await set('text');await page.keyboard.press('Control+a');await page.locator('[data-group=home]').click();await page.locator('[data-source-action=B]').filter({visible:true}).first().click();equal(await read(),'\\textbf{text}','selection wraps in snippet');
    for (const selected of ['\\ref{sec:one}','${literal} \\custom{x}','a\nb']) {
      await set(selected);await page.keyboard.press('Control+a');
      await page.locator('[data-source-action=B]').filter({visible:true}).first().click();
      equal(await read(),'\\textbf{'+selected+'}','literal selection wrapping');
      await page.keyboard.press('Control+z');equal(await read(),selected,'wrapped selection undo');
      await page.keyboard.press('Control+y');equal(await read(),'\\textbf{'+selected+'}','wrapped selection redo');
    }
    await content.focus();await page.keyboard.press('Control+f');equal(await page.locator('.cm-search').isVisible(),true,'find');await page.keyboard.press('Escape');equal(await page.locator('.cm-search').count(),0,'escape closes find');
    // Restore original imported source before a real ZIP check.
    await page.locator('input[type=file]').setInputFiles({name:'v2.tex',mimeType:'text/plain',buffer:Buffer.from(sample)});
    await page.locator('[data-source-mode=body]').click();await page.locator('[data-source-mode=split]').click();
    await page.locator('.ProseMirror p').filter({hasText:'Hello world.'}).click();await page.keyboard.press('End');await page.keyboard.insertText(' More.');
    const expected=sample.replace('Hello world.','Hello world. More.');
    await page.locator('[data-group=files]').click();const downloading=page.waitForEvent('download');await page.locator('#download').click();const zip=await readFile(await (await downloading).path());
    const nameLength=zip.readUInt16LE(26),extraLength=zip.readUInt16LE(28),length=zip.readUInt32LE(18);
    equal(zip.subarray(30+nameLength+extraLength,30+nameLength+extraLength+length),Buffer.from(expected),'real ZIP after rich edit preserves mixed EOL and macros');
    if(process.env.LINEAE_SCREENSHOTS){await mkdir(process.env.LINEAE_SCREENSHOTS,{recursive:true});await page.screenshot({path:join(process.env.LINEAE_SCREENSHOTS,'v2-split.png')});}
    await page.setViewportSize({width:620,height:860});equal(await page.locator('.tex-preview').isVisible(),true,'narrow split keeps both editors');
    equal(await page.locator('.tex-code').isVisible(),true,'narrow source stays visible');
    console.log('V2 browser assertions passed:',assertions);
  } finally {await page.close();}
};
