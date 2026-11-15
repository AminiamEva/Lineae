const assert = require('node:assert/strict');
const {build} = require('esbuild');
const {mkdir,writeFile,readFile} = require('node:fs/promises');
const {join} = require('node:path');
const {createHash} = require('node:crypto');

module.exports = async (context,url) => {
  const page = await context.newPage();
  const evidence = process.env.LINEAE_V21_ARTIFACTS;
  let assertions = 0;
  const equal = (a,b,message) => {assert.deepEqual(a,b,message);assertions++;};
  const sha = text => createHash('sha256').update(text).digest('hex');
  const {indentLatex} = await import('../apps/web/src/editor/latex-indent.mjs');
  const sourceEndings = text => text.match(/\r\n|\r|\n/g) || [];
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(url);
    await page.evaluate(()=>{localStorage.removeItem('lineae.sourceFontSize');localStorage.removeItem('lineae.richTextFontSize');localStorage.removeItem('lineae.indentOnSave');});
    await page.reload();
    const fixture = await build({stdin:{contents:"export {EditorView} from '@codemirror/view';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'v21Fixture',write:false});
    const inject = () => page.addScriptTag({content:fixture.outputFiles[0].text});
    await inject();
    const source = '\\documentclass{article}\r\n\\begin{document}\n\\section{Zoom and save}\nHello 中文 $x+y$.\n\n\\begin{itemize}\n\\item First\n\\item Second\n\\end{itemize}\n\\end{document}\r\n';
    const open = async (text=source) => {
      await page.locator('input[type=file]').setInputFiles({name:'v21.tex',mimeType:'text/plain',buffer:Buffer.from(text)});
      await page.locator('[data-source-mode=split]').click();
    };
    await open();
    const left = page.locator('.tex-zoom-label'), right = page.locator('.tex-rich-zoom-label');
    const content = page.locator('.cm-content');
    const read = async () => {
      await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.v21Copied=text;};});
      await page.locator('.tex-actions button').nth(2).click();
      return page.evaluate(()=>window.v21Copied);
    };
    const sizes=async()=>[await left.innerText(),await right.innerText()];
    const wheel=async(selector,delta,modifier='Control')=>{
      await page.locator(selector).hover();
      if(modifier)await page.keyboard.down(modifier);
      await page.mouse.wheel(0,delta);
      if(modifier)await page.keyboard.up(modifier);
      await page.waitForTimeout(85);
    };
    equal(await sizes(),['16px','100%'],'source font and physical preview defaults');
    const metrics=()=>page.locator('.tex-preview .document-page').evaluate(e=>({width:e.getBoundingClientRect().width,font:getComputedStyle(e.querySelector('.ProseMirror')).fontSize}));
    const baseline=await metrics();
    await wheel('.cm-content',-120);equal(await left.innerText(),'17px','source wheel changes only code font');
    equal(await metrics(),baseline,'source font leaves page geometry and typography unchanged');
    await page.locator('.tex-rich-actions button').last().click();
    equal(await right.innerText(),'110%','preview uses percentage');
    const enlarged=await metrics();
    equal(Math.abs(enlarged.width/baseline.width-1.1)<.005,true,'preview zoom scales physical paper');
    equal(enlarged.font,baseline.font,'preview zoom preserves document typography');
    equal(await page.locator('.document-status input[type=range]').inputValue(),'110','preview and Document share zoom');
    await page.locator('[data-source-mode=body]').click();
    equal(await page.locator('.document-page').evaluate(e=>getComputedStyle(e).zoom),'1.1','Document preserves preview zoom');
    await page.locator('[data-source-mode=split]').click();
    equal(await right.innerText(),'110%','Split preserves percentage');
    await right.click();equal(await right.innerText(),'100%','preview reset');
    await page.locator('.tex-preview').focus();
    for(let n=0;n<25;n++)await page.keyboard.press('Control+=');
    equal(await right.innerText(),'300%','maximum page zoom');
    for(let n=0;n<30;n++)await page.keyboard.press('Control+-');
    equal(await right.innerText(),'50%','minimum page zoom');
    await right.click();await left.click();
    await content.focus();for(let n=0;n<25;n++)await page.keyboard.press('Control+=');
    equal(await left.innerText(),'32px','source upper bound');
    for(let n=0;n<25;n++)await page.keyboard.press('Control+-');
    equal(await left.innerText(),'11px','source lower bound');
    await left.click();
    equal(await page.locator('.document-status .tex-foot').count(),1,'source metadata belongs to the shared status bar');
    equal(await page.locator('.tex-workspace .tex-foot').count(),0,'no duplicate source footer');
    equal(await page.locator('.tex-head .tex-rich-actions').count(),1,'preview controls share the file title bar');
    await page.locator('#toolbar-collapse').click();
    equal(await page.locator('#toolbar-collapse').getAttribute('aria-expanded'),'true','toolbar expands');
    await page.locator('#toolbar-collapse').click();
    equal(await page.locator('#toolbar-collapse').getAttribute('aria-expanded'),'false','toolbar collapses');
    equal(await read(),source,'zoom and layout preserve source bytes');
    await page.reload();await inject();await open();equal(await sizes(),['16px','100%'],'remount preserves shared zoom');
    await page.evaluate(()=>{localStorage.setItem('lineae.sourceFontSize','99');localStorage.setItem('lineae.richTextFontSize','8');});
    await page.reload();await inject();await open();equal(await sizes(),['32px','100%'],'obsolete preview font preference is ignored');
    await left.click();await right.click();

    // The native API is substituted only at the I/O boundary. Ctrl+S executes
    // the real production formatter, CodeMirror transaction and save pipeline.
    await page.evaluate(()=>{window.v21Writes=[];window.showSaveFilePicker=async()=>({name:'v21.tex',createWritable:async()=>({write:async text=>window.v21Writes.push(text),close:async()=>{}})});});
    const save=async()=>{const n=await page.evaluate(()=>window.v21Writes.length);await content.focus();await page.keyboard.press('Control+s');await page.waitForFunction(n=>window.v21Writes.length>n,n);return page.evaluate(()=>window.v21Writes.at(-1));};
    const before=await read(), expected=indentLatex(before).text;
    await page.evaluate(()=>{const v=v21Fixture.EditorView.findFromDOM(document.querySelector('.cm-editor'));const p=v.state.doc.toString().indexOf('Hello');v.dispatch({selection:{anchor:p,head:p+5}});});
    equal(await save(),expected,'real save writes formatted text');
    equal(await read(),expected,'save syncs actual editor');
    equal(await page.evaluate(()=>{const s=v21Fixture.EditorView.findFromDOM(document.querySelector('.cm-editor')).state;return s.sliceDoc(s.selection.main.from,s.selection.main.to);}), 'Hello','selection mapped');
    equal(await save(),expected,'second save idempotent');
    await content.focus();await page.keyboard.press('Control+z');equal(await read(),before,'save indentation is one undo');
    await content.focus();await page.keyboard.press('Control+y');equal(await read(),expected,'redo exact');
    await open(before);await page.locator('.tex-indent-setting input').uncheck();equal(await save(),before,'opt out preserves formatting');
    await page.locator('.tex-indent-setting input').check();
    await page.locator('[data-source-mode=body]').click();await page.locator('.ProseMirror').focus();
    const writesBefore=await page.evaluate(()=>window.v21Writes.length);await page.keyboard.press('Control+s');await page.waitForFunction(n=>window.v21Writes.length>n,writesBefore);
    equal(await page.evaluate(()=>window.v21Writes.at(-1)),expected,'Rich Text save formats source');
    equal(await page.locator('[data-source-mode=body]').getAttribute('aria-pressed'),'true','Rich Text save preserves mode');
    await page.locator('[data-source-mode=split]').click();equal(await read(),expected,'Rich Text save retained after switching');

    // Save fallback must export the formatted snapshot; a plain ZIP export
    // keeps the original bytes. Cancellation leaves the transaction undoable.
    await open(before);
    await page.evaluate(()=>{window.showSaveFilePicker=undefined;});
    const fallback=page.waitForEvent('download');await content.focus();await page.keyboard.press('Control+s');
    const zip=await readFile(await (await fallback).path());
    const start=30+zip.readUInt16LE(26)+zip.readUInt16LE(28);
    equal(zip.subarray(start,start+zip.readUInt32LE(18)).toString(),expected,'save fallback ZIP formats');
    await open(before);
    await page.evaluate(()=>{window.showSaveFilePicker=async()=>{throw new DOMException('Cancelled','AbortError');};});
    await content.focus();await page.keyboard.press('Control+s');
    equal(await read(),expected,'cancelled save keeps reviewable formatting');
    await content.focus();await page.keyboard.press('Control+z');equal(await read(),before,'cancelled save indentation can be undone');
    await page.evaluate(()=>{window.showSaveFilePicker=async()=>({name:'v21.tex',createWritable:async()=>({write:async text=>window.v21Writes.push(text),close:async()=>{}})});});

    const mixed=Buffer.from(require('./fixtures/source-workspace-mixed-eol.json').expected.base64,'base64').toString();
    await open(mixed);const mixedAfter=await save();
    equal(mixedAfter,indentLatex(mixed).text,'452 byte sample save');
    equal(sourceEndings(mixedAfter),sourceEndings(mixed),'452 byte separator sequence preserved');
    await content.focus();await page.keyboard.press('Control+z');equal(sha(await read()),sha(mixed),'452 byte undo SHA');
    if(evidence){
      await mkdir(evidence,{recursive:true});
      await writeFile(join(evidence,'save-before.tex'),mixed);await writeFile(join(evidence,'save-after.tex'),mixedAfter);
      await writeFile(join(evidence,'eol-sha256.json'),JSON.stringify({beforeBytes:Buffer.byteLength(mixed),afterBytes:Buffer.byteLength(mixedAfter),beforeSha256:sha(mixed),afterSha256:sha(mixedAfter),beforeEolSha256:sha(sourceEndings(mixed).join('')),afterEolSha256:sha(sourceEndings(mixedAfter).join('')),nonIndentSha256:sha(mixed.replace(/^[ \t]+/gm,'')),afterNonIndentSha256:sha(mixedAfter.replace(/^[ \t]+/gm,''))},null,2));
    }
    await open();await save();
    for(const [width,height] of [[1920,1080],[1440,900],[768,1024],[390,844]]) {
      await page.setViewportSize({width,height});
      const boxes=await page.locator('.tex-modes button').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,scroll:e.scrollWidth,client:e.clientWidth})));
      equal(Math.max(...boxes.map(b=>b.width))-Math.min(...boxes.map(b=>b.width))<.1,true,'equal modes '+width);
      equal(boxes.every(b=>b.height===boxes[0].height&&b.scroll<=b.client),true,'labels fit '+width);
      equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow '+width);
      await page.locator('[data-source-mode=body]').focus();
      await page.keyboard.press('Tab');
      equal(await page.locator('[data-source-mode=source]').evaluate(e=>getComputedStyle(e).outlineStyle),'solid','visible focus '+width);
      if(evidence)await page.screenshot({path:join(evidence,`viewport-${width}x${height}.png`)});
    }
    equal(errors,[],'no browser errors');
    console.log('V2.1 browser assertions: '+assertions);
  } finally {await page.close();}
};
