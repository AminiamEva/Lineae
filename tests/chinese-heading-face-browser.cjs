// Chinese headings must use the ctex hei face (FandolHei) for CJK text, and
// heading=false must fall back to the western article heading path.
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
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.woff2': 'font/woff2' }[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});

const document = setup => String.raw`\documentclass[UTF8,scheme=chinese]{ctexart}
\usepackage[margin=22mm]{geometry}
${setup}
\begin{document}
\section{中文标题}
正文段落。
\end{document}`;

async function measure(browser, source, name) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror h1'), { timeout: 30000 });
    await page.evaluate(async () => { await document.fonts.load('700 16px "FandolHei"'); await document.fonts.ready; });
    await page.waitForTimeout(600);
    const result = await page.evaluate(() => {
      const heading = document.querySelector('.ProseMirror h1[data-heading-command="section"]') ?? document.querySelector('.ProseMirror h1');
      const style = getComputedStyle(heading);
      return {
        text: heading.textContent,
        styled: heading.hasAttribute('data-heading-style'),
        cjkFace: heading.dataset.headingCjkFace ?? null,
        family: style.fontFamily,
        weight: Number(style.fontWeight),
        align: style.textAlign,
        heiReady: document.fonts.check('700 16px "FandolHei"'),
        songReady: document.fonts.check('700 16px "FandolSong"'),
      };
    });
    assert.deepEqual(errors, [], `${name} page errors`);
    return result;
  } finally { await page.close(); }
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const defaults = await measure(browser, document(''), 'heading-default.tex');
    assert.ok(defaults.styled, 'ctex heading uses the styled path');
    assert.equal(defaults.cjkFace, 'hei', 'ctex headings default to the hei face');
    assert.ok(defaults.family.includes('FandolHei'), `heading CJK family uses FandolHei: ${defaults.family}`);
    assert.equal(defaults.align, 'center', 'ctex section is centered');
    assert.equal(defaults.weight, 700, 'ctex section is bold');
    assert.ok(defaults.heiReady, 'FandolHei face is loaded');

    const custom = await measure(browser, document('\\ctexset{section/format=\\Large\\songti}'), 'heading-song.tex');
    assert.equal(custom.cjkFace, 'song', '\\songti is parsed into the heading face');
    assert.ok(custom.family.includes('FandolSong'), 'custom song face uses FandolSong');
    assert.ok(!custom.family.includes('FandolHei'), 'custom song face does not use FandolHei');

    const disabled = await measure(browser, document('\\ctexset{heading=false}'), 'heading-false.tex');
    assert.equal(disabled.styled, false, 'heading=false uses the western heading path');
    assert.equal(disabled.cjkFace, null, 'heading=false has no ctex heading face');
    assert.ok(!disabled.family.includes('FandolHei'), 'heading=false does not use the hei heading face');
    assert.notEqual(disabled.align, 'center', 'heading=false is not centered');

    console.log('PASS Chinese heading uses the ctex hei face');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
