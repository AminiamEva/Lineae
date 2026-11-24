const assert = require('node:assert/strict');
const {once} = require('node:events');
const {spawn} = require('node:child_process');
const {readFile} = require('node:fs/promises');
const {createHash} = require('node:crypto');
const {chromium} = require('playwright');
const {openEngineSettings,chooseEngine,readEngineSettings,revealToolbar} = require('./workspace-ui-helpers.cjs');
const han = require('./fixtures/paragraph-layout/xecjk-reference.json').cases.find(c=>c.name==='han' && c.margin===45);

async function main() {
  const port = process.env.LINEAE_AUDIT_PORT || '39488';
  const server = spawn(process.execPath,['scripts/serve.mjs','apps/web',port],{stdio:['ignore','pipe','inherit']});
  let browser;
  try {
    await once(server.stdout,'data');
    browser = await chromium.launch();
    const page = await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1.5});
    page.setDefaultTimeout(8500);
    await page.goto('http://127.0.0.1:'+port);
    const profile = engine=>page.locator('.ProseMirror[data-paragraph-profile='+engine+']').first().waitFor({state:'attached'});
    await profile('lualatex');
    assert.equal(await page.locator('footer #engine-choice, .engine-panel').count(),0,'Engine lives only in Settings');
    await page.locator('#file').setInputFiles({name:'plain.tex',mimeType:'text/plain',buffer:
      Buffer.from('\\documentclass{article}\n\\begin{document}\nPlain article.\n\\end{document}\n')});
    await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('Plain')).catch(async error=>{
      console.error(await page.locator('.ProseMirror').first().textContent(),await page.locator('#status').textContent());
      throw error;
    });
    await profile('lualatex');
    const group = await openEngineSettings(page);
    const select = group.locator('#engine-choice');
    const fallback = group.locator('[data-setting="typesetting.defaultEngine"]');
    const dialog = page.locator('#settings-panel');
    const apply = page.locator('#settings-apply');
    const close = page.locator('#settings-close');
    assert.equal(await select.inputValue(),'auto');
    assert.match(await group.locator('output').innerText(),/LuaLaTeX.*(?:[Dd]efault|默认)/);
    await fallback.selectOption('xelatex');
    await apply.click();await profile('xelatex');
    await select.selectOption('xelatex');
    await apply.click();
    await fallback.selectOption('lualatex');
    await apply.click();await profile('xelatex');
    assert.equal(await select.inputValue(),'xelatex');
    await select.selectOption('auto');
    await apply.click();await profile('lualatex');
    await close.click();

    const longName='diagnostics-'.repeat(10)+'main.tex';
    const data=Buffer.from('\uFEFF% 中文注释\r\n'+han.source.replace('\\usepackage{fontspec,xeCJK}',Array(8).fill('\\usepackage{fontspec,xeCJK}').join('\r\n')));
    await page.locator('#file').setInputFiles({name:longName,mimeType:'text/plain',buffer:data});
    await profile('xelatex');
    await openEngineSettings(page);
    assert.equal(await select.inputValue(),'auto');
    assert.match(await group.locator('output').innerText(),/XeLaTeX.*xeCJK/);
    for(const [width,height] of [[1280,900],[700,640],[701,640],[360,360],[280,240],[600,240]]){
      await page.setViewportSize({width,height});
      await select.focus();await select.press('Home');await select.press('ArrowDown');
      const issues=group.locator('li');
      assert.ok((await issues.first().innerText()).includes(longName+':3:1'));
      assert.match(await issues.first().innerText(),/xeCJK/);
      await issues.last().scrollIntoViewIfNeeded();
      const bounds=await dialog.evaluate(n=>{
        const r=n.getBoundingClientRect();
        return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && n.scrollWidth<=n.clientWidth+1;
      });
      assert.ok(bounds,'readable settings at '+width+'x'+height);
      await select.press('End');assert.equal(await select.inputValue(),'xelatex');
      await select.press('Home');assert.equal(await select.inputValue(),'auto');
    }
    await select.selectOption('lualatex');
    await close.click();
    assert.equal((await readEngineSettings(page)).choice,'auto','Close discards draft');
    await profile('xelatex');
    await page.setViewportSize({width:1600,height:1100});
    const shared=await readFile(require('node:path').join(__dirname,'dual-engine/zh-han-45.tex'));
    await page.locator('#file').setInputFiles({name:'shared.tex',mimeType:'text/plain',buffer:shared});
    await profile('lualatex');
    // Read glyph rectangles from the editor, including breaks introduced by decorations.
    function firstLine(end){
      const p=[...document.querySelectorAll('.ProseMirror p')].find(n=>n.textContent.includes('中文排版'));
      if(!p)return false;
      const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);
      const range=document.createRange();let firstY,line='';
      for(let n=walker.nextNode();n;n=walker.nextNode()){
        if(n.parentElement.closest('.ProseMirror-widget'))continue;
        for(let i=0;i<n.length;i++){
          range.setStart(n,i);range.setEnd(n,i+1);const r=range.getBoundingClientRect();
          if(!r.width || !r.height)continue;
          firstY??=r.y;if(Math.abs(firstY-r.y)>3)return end?line.endsWith(end):line;
          line+=n.data[i];
        }
      }
      return end?line.endsWith(end):line;
    }
    await page.evaluate(()=>document.fonts.ready);
    for(const [choice,engine,end] of [['auto','lualatex','断'],['xelatex','xelatex','的'],['auto','lualatex','断']]){
      await chooseEngine(page,choice);await profile(engine);
      await page.waitForFunction(firstLine,end,{timeout:8500}).catch(async error=>{console.error('Observed first line',JSON.stringify(await page.evaluate(firstLine)));throw error;});
      console.log(engine,await page.evaluate(firstLine));
    }
    await page.locator('#file').setInputFiles({name:longName,mimeType:'text/plain',buffer:data});
    await profile('xelatex');
    for(const mode of ['body','source','split']){
      await page.locator('[data-source-mode='+mode+']').click();
      await chooseEngine(page,mode==='source'?'xelatex':'lualatex');
      assert.ok(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),mode+' clean');
      if(mode!=='body')assert.ok(await page.locator('.tex-dirty').evaluate(n=>n.hidden));
      await revealToolbar(page);
      if(!await page.locator('#download').isVisible())await page.locator('[data-group=files]').click();
      const pending=page.waitForEvent('download');await page.locator('#download').click();
      const zip=await readFile(await (await pending).path());
      assert.equal(zip.readUInt16LE(8),0);
      const start=30+zip.readUInt16LE(26)+zip.readUInt16LE(28);
      const bytes=zip.subarray(start,start+zip.readUInt32LE(22));assert.deepEqual(bytes,data);
      console.log(mode,'ZIP',createHash('sha256').update(bytes).digest('hex'));
    }
    console.log('PASS Settings scope, defaults, cancellation, keyboard, viewport bounds, 45 mm breaks and ZIP');
  } finally {await browser?.close();server.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
