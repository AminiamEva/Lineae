// Step 21: adding rows through the table "+" control must keep the caption
// widget DOM identity stable, with one instance and no per-frame page jump.
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
\begin{table}[htbp]
\centering
\caption{Caption lifecycle}
\begin{tabular}{ll}
\toprule
alpha & beta \\
\midrule
one & two \\
\bottomrule
\end{tabular}
\end{table}
\end{document}`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'caption.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror table') && document.querySelector('.table-caption-widget'), { timeout: 30000 });
    await page.waitForTimeout(900);
    const cellBox = await page.locator('.ProseMirror table td').last().boundingBox();
    assert.ok(cellBox, 'table cell is visible');
    await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height - 2);
    await page.waitForTimeout(300);

    const result = await page.evaluate(async () => {
      const caption = document.querySelector('.table-caption-widget');
      caption.dataset.lifecycleProbe = 'same';
      const baseTop = caption.getBoundingClientRect().top;
      const samples = [];
      let clicked = 0;
      for (let index = 0; index < 100; index++) {
        const button = document.querySelector('.table-insert-row');
        if (!button) break;
        button.click();
        clicked += 1;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const captions = [...document.querySelectorAll('.table-caption-widget')];
        const node = captions[0];
        samples.push({
          same: node === caption,
          count: captions.length,
          connected: caption.isConnected,
          probe: node?.dataset.lifecycleProbe === 'same',
          top: node ? node.getBoundingClientRect().top : null,
        });
      }
      return { baseTop, clicked, samples };
    });
    assert.equal(result.clicked, 100, 'the real + control added 100 rows');
    assert.ok(result.samples.length === 100, 'sampled every added row');
    for (const sample of result.samples) {
      assert.ok(sample.same, 'caption DOM identity stays identical');
      assert.equal(sample.count, 1, 'exactly one caption widget');
      assert.ok(sample.connected, 'caption stays connected');
      assert.ok(sample.probe, 'caption DOM is not recreated');
      assert.ok(Number.isFinite(sample.top), 'caption keeps a bounding rect');
    }
    // Early frames must not move to a different page/coordinate.
    for (const sample of result.samples.slice(0, 10)) {
      assert.ok(Math.abs(sample.top - result.baseTop) < 2.5, 'caption does not jump while rows are added');
    }

    for (let index = 0; index < 20; index++) await page.keyboard.press('Control+z');
    await page.waitForTimeout(600);
    const afterUndo = await page.evaluate(() => {
      const captions = [...document.querySelectorAll('.table-caption-widget')];
      return { count: captions.length, probe: captions[0]?.dataset.lifecycleProbe === 'same' };
    });
    assert.equal(afterUndo.count, 1, 'undo keeps one caption widget');
    assert.ok(afterUndo.probe, 'undo reuses the caption DOM');

    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForTimeout(700);
    const afterResize = await page.evaluate(() => {
      const captions = [...document.querySelectorAll('.table-caption-widget')];
      return { count: captions.length, probe: captions[0]?.dataset.lifecycleProbe === 'same' };
    });
    assert.equal(afterResize.count, 1, 'resize keeps one caption widget');
    assert.ok(afterResize.probe, 'resize reuses the caption DOM');
    assert.deepEqual(errors, []);
    console.log('PASS table caption widget lifecycle');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
