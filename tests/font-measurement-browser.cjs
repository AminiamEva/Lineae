const assert = require('node:assert/strict');
const {resolve, extname, sep} = require('node:path');
const {readFile} = require('node:fs/promises');
const {chromium} = require('playwright');

(async () => {
  const root = resolve('apps/web');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:1});
    await page.route('http://lineae.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({contentType:'text/html',body:
        '<meta charset=utf-8><link rel=stylesheet href="/pages.css"><span id=sample style="font:16px \'Latin Modern Roman\',FandolSong">office AV 中文</span>'});
      const file = resolve(root,'.'+path);
      if (!file.startsWith(root+sep)) return route.abort();
      const mime = {'.mjs':'text/javascript','.css':'text/css','.otf':'font/otf','.woff2':'font/woff2'};
      try {await route.fulfill({contentType:mime[extname(file)],body:await readFile(file)});}
      catch {await route.abort();}
    });
    await page.goto('http://lineae.test/');
    const evidence = await page.evaluate(async () => {
      const {createFontMeasurement} = await import('/src/typesetting/font-measurement.mjs');
      const sample = document.getElementById('sample');
      await document.fonts.ready;
      const context = document.createElement('canvas').getContext('2d');
      const native = context.measureText.bind(context);
      let calls = 0;
      context.measureText = text => {if(text === sample.textContent) calls++; return native(text);};
      const metrics = createFontMeasurement(context,document.fonts,document);
      const results = [];
      for (const engine of ['xelatex','lualatex','xelatex']) {
        metrics.select({engine,version:1},'\\setmainfont{lmroman10-regular.otf}');
        const style = getComputedStyle(sample), before = calls;
        const width = metrics.measure(sample.textContent,style), first = calls;
        metrics.measure(sample.textContent,style);
        results.push({engine,width,first:first-before,second:calls-first});
      }
      sample.style.fontVariantLigatures='no-common-ligatures';
      const noLiga=metrics.measure(sample.textContent,getComputedStyle(sample));
      const range=document.createRange(); range.selectNodeContents(sample);
      return {results,noLiga,displayed:range.getBoundingClientRect().width};
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const {root:doc} = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#sample'});
    const {fonts} = await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    console.log(JSON.stringify({browser:browser.version(),fonts,...evidence},null,2));
    assert.ok(fonts.some(f => f.postScriptName === 'LMRoman10-Regular' && f.isCustomFont));
    assert.ok(fonts.some(f => f.postScriptName === 'FandolSong-Regular' && f.isCustomFont));
    for (const {first,second,width} of evidence.results) {
      assert.equal(first,1);assert.equal(second,0);assert.ok(width>0);
    }
    assert.ok(Math.abs(evidence.noLiga-evidence.displayed)<.02);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
