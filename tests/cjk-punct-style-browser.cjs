// Step 17: PunctStyle=plain must remove the calibrated Fandol compression,
// while the default quanjiao style still applies it.
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

const body = '他说："中文（标点）测试，句号。问号？感叹号！还有「引号」和《书名》。'.repeat(4);
const document = setup => String.raw`\documentclass{article}
\usepackage[margin=22mm]{geometry}
\usepackage{xeCJK}
${setup}
\begin{document}
${body}
\end{document}`;

async function measure(browser, source, name) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror p[data-tex-paragraph]'), { timeout: 30000 });
    await page.waitForTimeout(1200);
    const result = await page.evaluate(() => [...document.querySelectorAll('.tex-cjk-punctuation')].map(element => {
      const style = getComputedStyle(element);
      return { left: Number.parseFloat(style.marginLeft) || 0, right: Number.parseFloat(style.marginRight) || 0 };
    }));
    assert.deepEqual(errors, [], `${name} page errors`);
    return result;
  } finally { await page.close(); }
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const plain = await measure(browser, document('\\xeCJKsetup{PunctStyle=plain}'), 'plain.tex');
    assert.ok(plain.length > 0, 'plain punctuation boxes are laid out');
    assert.ok(plain.every(item => Math.abs(item.left) < 0.01 && Math.abs(item.right) < 0.01), 'plain has zero punctuation margins');
    const quanjiao = await measure(browser, document(''), 'quanjiao.tex');
    assert.ok(quanjiao.length > 0, 'default punctuation boxes are laid out');
    assert.ok(quanjiao.some(item => Math.abs(item.left) > 0.01 || Math.abs(item.right) > 0.01), 'default style keeps calibrated compression');
    console.log('PASS punctuation style plain removes Fandol compression');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
