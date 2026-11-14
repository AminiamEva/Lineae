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
    equal(await sizes(),['16px','16px'],'first-use defaults');
    const pageZoom=await page.locator('.document-status input[type=range]').inputValue();
    await wheel('.cm-content',-120);equal(await sizes(),['17px','16px'],'source wheel only');
    await wheel('.tex-preview',120);equal(await sizes(),['17px','15px'],'rich wheel only');
    await wheel('.cm-content',120,null);equal(await sizes(),['17px','15px'],'ordinary wheel does not zoom');
    await wheel('.cm-content',120,'Meta');equal(await sizes(),['16px','15px'],'Meta compatibility');
    equal(await page.locator('.document-status input[type=range]').inputValue(),pageZoom,'page zoom unchanged');
    equal(await page.evaluate(()=>visualViewport.scale),1,'browser page scale unchanged');
    await left.click();equal(await sizes(),['16px','15px'],'left reset independent');
    await right.click();equal(await sizes(),['16px','16px'],'right reset independent');
    await page.locator('.tex-rich-actions button').last().click();equal(await sizes(),['16px','17px'],'right plus independent');
    equal(await page.locator('.tex-preview .ProseMirror').evaluate(e=>getComputedStyle(e).fontSize),'17px','actual rich text size');
    await content.focus();await page.keyboard.press('Control+=');
    for(const mode of ['source','body','split'])await page.locator(`[data-source-mode=${mode}]`).click();
    equal(await sizes(),['17px','17px'],'mode round-trip retains sizes');
    await page.locator('.tex-divider').press('ArrowRight');equal(await sizes(),['17px','17px'],'divider retains sizes');
    const divider=await page.locator('.tex-divider').boundingBox();
    await page.mouse.move(divider.x+4,divider.y+40);await page.mouse.down();await page.mouse.move(divider.x+80,divider.y+40);await page.mouse.up();
    equal(await sizes(),['17px','17px'],'pointer resize retains sizes');
    await content.focus();for(let n=0;n<25;n++)await page.keyboard.press('Control+=');
    equal(await left.innerText(),'32px','upper bound');
    await wheel('.cm-content',-120);equal(await left.innerText(),'32px','wheel upper clamp');
    for(let n=0;n<25;n++)await page.keyboard.press('Control+-');
    equal(await left.innerText(),'11px','lower bound');
    await wheel('.cm-content',120);equal(await left.innerText(),'11px','wheel lower clamp');
    await left.click();
    await page.locator('.tex-preview .ProseMirror').focus();await page.keyboard.press('Control+=');
    equal(await sizes(),['16px','18px'],'rich keyboard independent');
    await page.keyboard.press('Control+0');equal(await right.innerText(),'16px','rich keyboard reset');
    for(let n=0;n<20;n++)await page.keyboard.press('Control+=');
    equal(await right.innerText(),'32px','rich upper bound');
    const typography=await page.locator('.tex-preview .ProseMirror').evaluate(e=>({font:getComputedStyle(e).fontSize,line:getComputedStyle(e).lineHeight,heading:parseFloat(getComputedStyle(e.querySelector('h1')).fontSize),math:parseFloat(getComputedStyle(e.querySelector('math-field')).fontSize)}));
    equal(typography.font,'32px','rich 32px actual text');equal(typography.line,'48px','rich 32px line height');
    equal(typography.heading>32&&typography.math>0,true,'heading hierarchy and math visible');
    for(let n=0;n<25;n++)await page.keyboard.press('Control+-');equal(await right.innerText(),'11px','rich lower bound');
    await right.click();
    equal(await read(),source,'all zoom operations preserve bytes');
    await page.reload();await inject();await open();equal(await sizes(),['16px','16px'],'remount retains preferences');
    await page.evaluate(()=>{localStorage.setItem('lineae.sourceFontSize','99');localStorage.setItem('lineae.richTextFontSize','8');});
    await page.reload();await inject();await open();equal(await sizes(),['32px','11px'],'historical values clamped independently');
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
