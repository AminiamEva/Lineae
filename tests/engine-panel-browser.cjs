const assert = require('node:assert/strict');
const {once} = require('node:events');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');

async function main() {
  const port = process.env.LINEAE_AUDIT_PORT || '39488';
  const server = spawn(process.execPath, ['scripts/serve.mjs', 'apps/web', port], {stdio:['ignore','pipe','inherit']});
  let browser;
  try {
    await once(server.stdout, 'data');
    browser = await chromium.launch();
    const page = await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1.5});
    await page.goto('http://127.0.0.1:'+port);
    await page.locator('.ProseMirror[data-paragraph-profile="lualatex"]').first().waitFor({state:'attached'});
    const body = page.locator('.engine-panel > div');
    await page.locator('.engine-panel > summary').click();
    async function checkBounds() {
      const bounds = await body.evaluate(n=>{
        const r=n.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};
      });
      console.log('panel', bounds);
      assert.ok(bounds.left>=0 && bounds.right<=bounds.width && bounds.top>=0 && bounds.bottom<=bounds.height, JSON.stringify(bounds));
    }
    for (const [width,height] of [[1280,900],[700,640],[701,640],[360,360],[280,240],[600,240]]) {
      await page.setViewportSize({width,height});
      await checkBounds();
    }
    const source=String.raw`\documentclass{article}
\usepackage{xeCJK}
\begin{document}
Text
\end{document}
`;
    const longName='diagnostics-'.repeat(10)+'main.tex';
    await page.locator('#file').setInputFiles({name:longName,mimeType:'text/plain',buffer:Buffer.from(source.replace('\\usepackage{xeCJK}', Array(8).fill('\\usepackage{xeCJK}').join('\n')))});
    const editor=page.locator('.ProseMirror[data-paragraph-profile]').first();
    const select=page.locator('#engine-choice');
    await page.waitForFunction(()=>document.querySelector('.engine-panel summary')?.textContent.includes('XeLaTeX'));
    assert.equal(await select.inputValue(),'auto');
    await select.click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror[data-paragraph-profile]')?.dataset.paragraphProfile==='lualatex');
    assert.equal(await select.inputValue(),'lualatex');
    assert.ok((await body.locator('li').first().innerText()).includes(longName+':2:1'));
    assert.match(await body.locator('li').first().innerText(),/xeCJK/);
    await checkBounds();
    assert.ok(await body.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
    assert.ok(await body.evaluate(n=>n.scrollHeight>n.clientHeight), 'long diagnostics can scroll');
    await body.locator('li').last().scrollIntoViewIfNeeded();
    await select.focus();
    await page.keyboard.press('End');
    assert.equal(await select.inputValue(),'xelatex');
    await page.keyboard.press('Home');
    assert.equal(await select.inputValue(),'auto');
    assert.equal(await editor.getAttribute('data-paragraph-profile'),'xelatex');
    await page.locator('[data-source-mode=source]').click();
    assert.ok(await page.locator('.tex-dirty').evaluate(n=>n.hidden));
    console.log('PASS panel bounds, native keyboard choices, wrapped diagnostic and clean source');
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
