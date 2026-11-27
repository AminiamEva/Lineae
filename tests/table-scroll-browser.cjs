const { revealToolbar } = require('./workspace-ui-helpers.cjs');
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
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
const rows = Array.from({ length: 60 }, (_, index) => `Row ${index + 1} & ${'text '.repeat(12)} \\\\`).join('\n');
const source = `\\documentclass{article}\n\\begin{document}\n\nBefore.\n\n\\begin{tabular}{ll}\n${rows}\n\\end{tabular}\n\nAfter.\n\n\\end{document}\n`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForTimeout(600);
    await page.locator('input[type=file]').setInputFiles({ name: 'table.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelectorAll('.ProseMirror table tr').length >= 60);
    await revealToolbar(page);
    await page.locator('[data-group=insert]').click();

    const rowButton = page.locator('button').filter({ hasText: 'Row' }).first();
    const columnButton = page.locator('button').filter({ hasText: 'Column' }).first();
    const scrollY = () => page.evaluate(() => window.scrollY);

    const cells = page.locator('.ProseMirror table td');
    await cells.nth((await cells.count()) - 1).scrollIntoViewIfNeeded();
    await cells.nth((await cells.count()) - 1).click();
    await page.waitForTimeout(150);
    // Selecting a cell opens the Table tab (step 24); return to Insert for the
    // row/column commands this regression exercises.
    await page.locator('[data-group=insert]').click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    const rowBefore = await scrollY();
    const rowCount = await page.locator('.ProseMirror table tr').count();
    await rowButton.click();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.ProseMirror table tr').count(), rowCount + 1, 'Insert row adds one row');
    assert.ok(Math.abs(await scrollY() - rowBefore) < 2, `Insert row keeps the page scroll: ${rowBefore} -> ${await scrollY()}`);

    await cells.nth(5).scrollIntoViewIfNeeded();
    await cells.nth(5).click();
    await page.waitForTimeout(150);
    await page.locator('[data-group=insert]').click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    const columnBefore = await scrollY();
    const columnCount = await page.locator('.ProseMirror table tr').first().locator('td').count();
    await columnButton.click();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.ProseMirror table tr').first().locator('td').count(), columnCount + 1, 'Insert column adds one column');
    assert.ok(Math.abs(await scrollY() - columnBefore) < 2, `Insert column keeps the page scroll: ${columnBefore} -> ${await scrollY()}`);

    assert.deepEqual(errors, []);
    console.log('PASS table row/column insert keeps scroll position');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
