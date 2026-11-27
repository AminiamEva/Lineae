// Step 24: selecting a table cell opens the Table tab, leaving it returns
// home, and the headerFooter page is never stolen.
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

const source = String.raw`\documentclass{article}
\usepackage[margin=22mm]{geometry}
\begin{document}
正文段落。

\begin{table}[htbp]
\centering
\caption{Auto tab}
\begin{tabular}{ll}
alpha & beta \\
one & two \\
\end{tabular}
\end{table}

结尾段落。
\end{document}`;

const ribbonPage = page => page.evaluate(() => document.querySelector('.ribbon')?.dataset.ribbonPage ?? null);

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1000 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'auto-tab.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror table'), { timeout: 30000 });
    await page.waitForTimeout(900);
    assert.equal(await ribbonPage(page), 'home', 'starts on the home tab');

    await page.locator('.ProseMirror table td').first().click();
    await page.waitForTimeout(350);
    assert.equal(await ribbonPage(page), 'table', 'clicking a cell opens the table tab');
    assert.equal(await page.locator('.ribbon-tabs [data-group=table]').isVisible(), true, 'table tab is visible');

    await page.locator('.ProseMirror table td').last().click();
    await page.waitForTimeout(250);
    assert.equal(await ribbonPage(page), 'table', 'moving inside the table keeps the table tab');

    await page.keyboard.type('x');
    await page.waitForTimeout(250);
    assert.equal(await ribbonPage(page), 'table', 'typing in a cell does not switch tabs');

    await page.locator('.ProseMirror p').first().click();
    await page.waitForTimeout(350);
    assert.equal(await ribbonPage(page), 'home', 'leaving the table returns home');

    await page.locator('.ProseMirror table td').nth(1).click();
    await page.waitForTimeout(300);
    assert.equal(await ribbonPage(page), 'table', 're-entering the table opens it again');

    // Protected page: the table selection must not steal headerFooter.
    await page.evaluate(() => { document.querySelector('.ribbon').dataset.ribbonPage = 'headerFooter'; });
    await page.locator('.ProseMirror table td').first().click();
    await page.waitForTimeout(300);
    assert.equal(await ribbonPage(page), 'headerFooter', 'headerFooter is not stolen by a table selection');

    assert.deepEqual(errors, []);
    console.log('PASS table tab auto-open and protection');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
