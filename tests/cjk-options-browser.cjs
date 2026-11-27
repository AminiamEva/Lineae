// Step 14: non-default CJK configurations must use the same optimum-fit token
// stream instead of falling back to the browser's greedy layout.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve('apps/web');
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) return response.writeHead(403).end();
  try {
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});

const sentence = '中文段落用于验证非默认标点样式也必须进入同一个断行优化流程而不是绕过排版。';
const source = [
  '\\documentclass{article}',
  '\\usepackage[margin=22mm]{geometry}',
  '\\usepackage{xeCJK}',
  '\\xeCJKsetup{PunctStyle=kaiming, CJKecglue={0.2em}}',
  '\\begin{document}',
  Array.from({ length: 6 }, () => sentence).join(''),
  '\\end{document}',
].join('\n\n');

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'cjk-options.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror p[data-tex-paragraph]'), { timeout: 30000 });
    await page.waitForTimeout(1200);
    const result = await page.evaluate(() => {
      const paragraphs = [...document.querySelectorAll('.ProseMirror p')].filter(paragraph => paragraph.textContent.includes('中文段落'));
      return {
        paragraphs: paragraphs.length,
        laidOut: paragraphs.filter(paragraph => paragraph.hasAttribute('data-tex-paragraph')).length,
        breakWidgets: document.querySelectorAll('.ProseMirror .tex-line-break').length,
      };
    });
    assert.ok(result.paragraphs > 0, 'imported CJK paragraph exists');
    assert.equal(result.laidOut, result.paragraphs, 'every CJK paragraph uses optimum-fit');
    assert.deepEqual(errors, []);
    console.log('PASS non-default CJK options use optimum-fit');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
