const {revealToolbar,setIndentOnSave,createTreeEntry}=require('./workspace-ui-helpers.cjs');
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
    await revealToolbar(page);
    await page.locator('#toolbar-collapse').click();
    equal(await page.locator('#toolbar-collapse').getAttribute('aria-expanded'),'false','toolbar hides');
    await page.locator('#toolbar-collapse').click();
    equal(await page.locator('#toolbar-collapse').getAttribute('aria-expanded'),'true','toolbar reopens');
    equal(await read(),source,'zoom and layout preserve source bytes');
    await page.reload();await inject();await open();equal(await sizes(),['16px','100%'],'remount preserves shared zoom');
    await page.evaluate(()=>{localStorage.setItem('lineae.config',(localStorage.getItem('lineae.config')??'').replace(/^\s*sourceFontSize:.*$/gm,''));localStorage.setItem('lineae.sourceFontSize','99');localStorage.setItem('lineae.richTextFontSize','8');});
    await page.reload();await inject();await open();equal(await sizes(),['32px','100%'],'obsolete preview font preference is ignored');
    await left.click();await right.click();

    await revealToolbar(page); await page.locator('[data-group=layout]').click();
    const margins=page.locator('#layout-panel select').nth(2);
    await margins.selectOption('narrow');
    assert.match(await read(),/1[.]27cm/,'Source layout control writes geometry');
    await content.focus();await page.keyboard.press('Control+z');equal(await read(),source,'Source layout undo preserves original bytes');
    await content.focus();await page.keyboard.press('Control+Shift+z');assert.match(await read(),/1[.]27cm/,'Source layout redo');
    await content.focus();await page.keyboard.press('Control+z');
    await open(source);
    // The native API is substituted only at the I/O boundary. Ctrl+S executes
    // the real production formatter, CodeMirror transaction and save pipeline.
    await page.evaluate(()=>{window.v21Writes=[];window.showSaveFilePicker=async()=>({name:'v21.tex',createWritable:async()=>({write:async text=>window.v21Writes.push(text),close:async()=>{}})});});
    const save=async()=>{const n=await page.evaluate(()=>window.v21Writes.length);await content.focus();await page.keyboard.press('Control+s');await page.waitForFunction(n=>window.v21Writes.length>n,n);return page.evaluate(()=>window.v21Writes.at(-1));};
    const before=await read(), expected=indentLatex(before).text;
    await page.evaluate(()=>{const v=v21Fixture.EditorView.findFromDOM(document.querySelector('.cm-editor'));const p=v.state.doc.toString().indexOf('Hello');v.dispatch({selection:{anchor:p,head:p+5}});v.focus();});
    equal(await save(),expected,'real save writes formatted text');
    equal(await read(),expected,'save syncs actual editor');
    equal(await page.evaluate(()=>{const s=v21Fixture.EditorView.findFromDOM(document.querySelector('.cm-editor')).state;return s.sliceDoc(s.selection.main.from,s.selection.main.to);}), 'Hello','selection mapped');
    equal(await save(),expected,'second save idempotent');
    await content.focus();await page.keyboard.press('Control+z');equal(await read(),before,'save indentation is one undo');
    await content.focus();await page.keyboard.press('Control+Shift+z');equal(await read(),expected,'redo exact');
    await open(before);await setIndentOnSave(page,false);equal(await save(),before,'opt out preserves formatting');
    await setIndentOnSave(page,true);
    await page.locator('[data-source-mode=body]').click();await page.locator('.ProseMirror').focus();
    const writesBefore=await page.evaluate(()=>window.v21Writes.length);await page.keyboard.press('Control+s');await page.waitForFunction(n=>window.v21Writes.length>n,writesBefore);
    equal(await page.evaluate(()=>window.v21Writes.at(-1)),expected,'Rich Text save formats source');
    equal(await page.locator('[data-source-mode=body]').getAttribute('aria-pressed'),'true','Rich Text save preserves mode');
    await page.locator('[data-source-mode=split]').click();equal(await read(),expected,'Rich Text save retained after switching');

    // Save fallback must export the formatted snapshot; a plain ZIP export
    // keeps the original bytes. An unconfirmed download must leave the draft intact.
    await open(before);
    await page.evaluate(()=>{window.showSaveFilePicker=undefined;});
    const fallback=page.waitForEvent('download');await content.focus();await page.keyboard.press('Control+s');
    const zip=await readFile(await (await fallback).path());
    const start=30+zip.readUInt16LE(26)+zip.readUInt16LE(28);
    equal(zip.subarray(start,start+zip.readUInt32LE(18)).toString(),expected,'save fallback ZIP formats');
    equal(await read(),before,'fallback download leaves the draft unchanged');
    const cm = () => page.evaluate(() => {
      const {doc,selection}=v21Fixture.EditorView.findFromDOM(document.querySelector('.cm-editor')).state;
      return {text:doc.toString(),selection:selection.toJSON()};
    });
    // Exercise Save As, including retry on permission failure, and errors from
    // both writable stages (the native bridge performs its write on close).
    for(const fault of ['cancel','permission','write','close','indent-disabled']){
      await open(before);
      if(fault==='indent-disabled')await setIndentOnSave(page,false);
      await content.focus();await page.keyboard.press('Control+End');await page.keyboard.insertText('%draft');
      await page.keyboard.press('Shift+ArrowLeft');
      const draft=await read(), state=await cm();
      await page.evaluate(fault=>{
        window.v21Fault=false;
        const fail=()=>{window.v21Fault=true;throw new DOMException('injected '+fault,fault==='cancel'?'AbortError':'NotAllowedError');};
        window.showSaveFilePicker=async()=>{
          if(fault==='cancel')fail();
          return {name:'unconfirmed.tex',requestPermission:async()=>'denied',createWritable:async()=>{
            if(fault==='permission')fail();
            return {write:async()=>{if(fault!=='close')fail();},close:async()=>fail()};
          }};
        };
      },fault);
      await revealToolbar(page);await page.locator('[data-group=files]').click();
      const downloaded=fault==='cancel'?null:page.waitForEvent('download');
      await page.locator('[data-tool=saveAs]').click();
      await page.waitForFunction(()=>window.v21Fault);
      if(downloaded)await downloaded;
      equal(await read(),draft,fault+' preserves exact dirty draft');
      equal(await cm(),state,fault+' preserves selection');
      equal(await page.locator('.tex-dirty').isVisible(),true,fault+' retains dirty flag');
      equal(await page.locator('.tex-filename').innerText(),'v21.tex',fault+' retains filename');
      await content.focus();await page.keyboard.press('Control+z');equal(await read(),before,fault+' preserves previous undo');
      await content.focus();await page.keyboard.press('Control+Shift+z');equal(await read(),draft,fault+' preserves redo');
      if(fault==='indent-disabled')await setIndentOnSave(page,true);
    }
    await open(before);
    await page.evaluate(()=>{
      window.v21Release=null;
      window.showSaveFilePicker=async()=>({name:'race.tex',createWritable:async()=>({
        write:async text=>{window.v21Pending=text;},
        close:()=>new Promise(resolve=>{window.v21Release=resolve;})
      })});
    });
    await content.focus();await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>!!window.v21Release);
    equal(await read(),before,'pending write leaves draft untouched');
    equal(await page.evaluate(()=>window.v21Pending),expected,'write receives immutable formatted snapshot');
    await content.focus();await page.keyboard.press('Control+End');await page.keyboard.insertText('%later');
    await page.evaluate(()=>window.v21Release());
    await page.waitForFunction(()=>document.querySelector('.tex-filename').innerText==='race.tex');
    equal(await read(),before+'%later','late completion preserves new input without formatting it');
    equal(await page.locator('.tex-dirty').isVisible(),true,'later input remains dirty');
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
    // A project root can acquire a docmute preamble at save time. Exercise
    // the browser filesystem and assert the same mixed separators on both sides.
    await page.setViewportSize({width:1440,height:1000});
    const rootSource='\\documentclass{article}\r\n\\begin{document}\nBefore\r\n\\input{part}\n\\end{document}';
    const rootFormatted=indentLatex(rootSource.replace('\\begin{document}','\\usepackage{docmute}\r\n\\begin{document}')).text;
    await page.evaluate(async rootSource=>{
      const root=await (await navigator.storage.getDirectory()).getDirectoryHandle(crypto.randomUUID(),{create:true});
      for(const [name,text] of [['main.tex',rootSource],['part.tex','\\begin{document}\npart\n\\end{document}']]){
        const writable=await (await root.getFileHandle(name,{create:true})).createWritable();
        await writable.write(text);await writable.close();
      }
      window.showDirectoryPicker=async()=>root;
    },rootSource);
    await revealToolbar(page);await page.locator('[data-group=files]').click();
    await page.locator('#project-open').click();
    await page.locator('.project-file[aria-current=true]').waitFor({state:'attached'});
    await page.locator('[data-source-mode=source]').click();
    await page.locator('#project-save').click();
    await page.waitForFunction(()=>document.querySelector('#project-explorer').getAttribute('aria-busy')==='false');
    const stored=await page.evaluate(async()=>{
      const handle=await (await window.showDirectoryPicker()).getFileHandle('main.tex');
      return (await handle.getFile()).text();
    });
    equal(stored,rootFormatted,'project root formatted on disk');
    equal(await read(),stored,'project preamble and mixed endings match disk');
    await content.focus();await page.keyboard.press('Control+z');equal(await read(),rootSource,'one undo restores entire original project source');
    await content.focus();await page.keyboard.press('Control+Shift+z');equal(await read(),stored,'redo preserves inserted and existing separators');
    equal(errors,[],'no browser errors');
    console.log('V2.1 browser assertions: '+assertions);
  } finally {await page.close();}
};
