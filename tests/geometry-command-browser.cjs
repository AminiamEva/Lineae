// A runtime \geometry{...} command must drive the page metrics, and text
// directly before an environment must still import the environment.
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
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.otf': 'font/otf' }[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});

const source = String.raw`\documentclass{article}
\usepackage{geometry}
\geometry{a4paper, left=1.2cm, right=1.2cm, top=1.2cm, bottom=1.8cm}
\begin{document}
Text before
\begin{itemize}
\item One
\item Two
\end{itemize}
After
\end{document}
`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'geometry-command.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror'), { timeout: 30000 });
    await page.waitForTimeout(1000);
    const result = await page.evaluate(() => {
      const pageElement = document.querySelector('.document-page');
      const style = getComputedStyle(pageElement);
      const items = [...document.querySelectorAll('.ProseMirror ul li')].map(item => item.textContent.trim());
      return {
        width: style.getPropertyValue('--page-width').trim(),
        height: style.getPropertyValue('--page-height').trim(),
        top: style.getPropertyValue('--page-margin-top').trim(),
        right: style.getPropertyValue('--page-margin-right').trim(),
        bottom: style.getPropertyValue('--page-margin-bottom').trim(),
        left: style.getPropertyValue('--page-margin-left').trim(),
        items,
        rawHasItemize: [...document.querySelectorAll('.ProseMirror pre[data-raw]')].some(pre => pre.textContent.includes('\\begin{itemize}')),
        paragraphs: [...document.querySelectorAll('.ProseMirror > p')].map(paragraph => paragraph.textContent.trim()),
      };
    });
    assert.equal(result.width, '210mm', 'a4page width');
    assert.equal(result.height, '297mm', 'a4paper height');
    assert.equal(result.top, '1.2cm');
    assert.equal(result.right, '1.2cm');
    assert.equal(result.bottom, '1.8cm');
    assert.equal(result.left, '1.2cm');
    assert.deepEqual(result.items, ['One', 'Two'], 'list without a preceding blank line imports');
    assert.equal(result.rawHasItemize, false, 'no raw fallback for the list');
    assert.deepEqual(result.paragraphs.slice(0, 3), ['Text before', 'After'], 'surrounding paragraphs are preserved');
    assert.deepEqual(errors, []);
    console.log('PASS runtime geometry command and blank-line-free environments');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
