const assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.cwd()]}));
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const server=spawn(process.execPath,['scripts/serve.mjs','apps/web','39899'],{stdio:['ignore','pipe','inherit']});
(async()=>{
  await once(server.stdout,'data');
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1});
    page.setDefaultTimeout(7000); page.on('pageerror',e=>console.error(e.message));
    await page.route('**/index.html',async route=>{
      const res=await route.fetch();
      await route.fulfill({response:res,body:(await res.text()).replace('data-typesetting-engine="auto"','data-typesetting-engine="lualatex"')});
    });
    await page.goto('http://127.0.0.1:39899/index.html');
    await page.locator('.ProseMirror[data-paragraph-profile="lualatex"]').waitFor();
    async function load(font) {
      const source='\\documentclass{article}\n\\usepackage{luatexja-fontspec}\n\\setmainjfont[JFM=quanjiao]{'+font+'}\n\\begin{document}\n中文（测试），Lineae\n\\end{document}';
      await page.locator('#file').setInputFiles({name:'custom.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
      await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('Lineae'));
      await page.evaluate(()=>document.fonts.ready);
    }
    await load('Microsoft YaHei');
    const notice=page.locator('#typesetting-precision');
    await notice.waitFor({state:'visible'});
    const family=await page.locator('.document-page').evaluate(e=>getComputedStyle(e).getPropertyValue('--tex-cjk-font-family'));
    assert.match(family,/Microsoft YaHei/); assert.match(await notice.textContent(),/Microsoft YaHei/);
    const p=page.locator('.ProseMirror p').filter({hasText:'Lineae'}).first();
    assert.ok((await p.boundingBox()).height>0); console.log(JSON.stringify({family,notice:await notice.textContent(),text:await p.textContent()}));
    await p.click();
    await page.keyboard.press('End'); await page.keyboard.type('Q');
    assert.match(await p.textContent(), /Q/);
    await load('FandolSong-Regular.otf'); await notice.waitFor({state:'hidden'});
    console.log('Custom font preview, visible precision diagnostic, and clearing on calibrated document: PASS');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.kill());
