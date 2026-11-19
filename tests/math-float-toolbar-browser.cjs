const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve('apps/web');
const server = createServer(async (req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html');const path=resolve(root,'.'+pathname);if(!path.startsWith(root+sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[extname(path)]??'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1280,height:900},locale:'en-US'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await page.waitForTimeout(700);const input=page.locator('input[type=file]');await input.setInputFiles({name:'math.tex',mimeType:'text/plain',buffer:Buffer.from('\\documentclass{article}\n\\begin{document}\n\nSelection $abc$\n\n\\end{document}\n')});await page.waitForFunction(()=>document.querySelector('math-field')?.value==='abc');const field=page.locator('math-field');await field.click();await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');await field.evaluate(el=>el.executeCommand('moveToMathfieldStart'));await page.keyboard.press('Shift+ArrowRight');await page.waitForTimeout(400);const bar=page.locator('.math-float-toolbar');assert.equal(await bar.isVisible(),true,'partial math selection opens toolbar');assert.equal(await bar.locator('.mft-swatch').count(),20,'20 LaTeX colors');assert.equal(await bar.locator('.mft-font').count()>0,true,'font choices visible');await bar.locator('.mft-swatch[data-color=red]').click();await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('textcolor'));const value=await field.evaluate(el=>el.value);assert.match(value,/\\textcolor\{red\}\{a\}/);const box=await bar.boundingBox();assert.ok(box&&box.width>0,'toolbar has geometry');await field.evaluate(el=>{el.selection={ranges:[[0,0]],direction:'forward'};el.dispatchEvent(new Event('selection-change',{bubbles:true}));});await page.waitForTimeout(1300);assert.equal(await bar.isVisible(),false,'collapsed selection hides toolbar');
// Regression: MathLive selection offsets are model offsets, not raw string
// indices.  A command selection must not be sliced into \ma + thbb{...}.
await page.locator('input[type=file]').setInputFiles({name:'mathbb.tex',mimeType:'text/plain',buffer:Buffer.from('\\documentclass{article}\n\\begin{document}\n\nSelection $\\mathbb{sdf}$\n\n\\end{document}\n')});
await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('mathbb'));
const field2=page.locator('math-field');
await field2.click();await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
await field2.evaluate(el=>el.executeCommand('selectAll'));
await page.waitForTimeout(400);
await bar.locator('.mft-swatch[data-color=lime]').click();
await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('textcolor'));
assert.equal(await field2.evaluate(el=>el.value),'\\textcolor{lime}{\\mathbb{sdf}}');
assert.deepEqual(errors,[]);console.log('PASS partial math toolbar');}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
