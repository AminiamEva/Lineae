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
const paragraph = index => `Paragraph ${String(index + 1).padStart(3, '0')}. The quick brown fox jumps over the lazy dog while the typesetter chooses line endings.`;
const before = Array.from({ length: 30 }, (_, index) => paragraph(index)).join('\n\n');
const after = Array.from({ length: 30 }, (_, index) => paragraph(index + 30)).join('\n\n');
const rows = Array.from({ length: 10 }, (_, index) => `Row ${index + 1} & ${'text '.repeat(10)} \\\\`).join('\n');
const source = `\\documentclass{article}\n\\begin{document}\n\n${before}\n\n\\begin{tabular}{ll}\n${rows}\n\\end{tabular}\n\n${after}\n\n\\end{document}\n`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForTimeout(600);
    await page.locator('input[type=file]').setInputFiles({ name: 'table.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelectorAll('.ProseMirror table tr').length >= 10);
    await revealToolbar(page);

    const scrollY = () => page.evaluate(() => window.scrollY);
    const rowCount = () => page.locator('.ProseMirror table tr').count();
    const colCount = () => page.locator('.ProseMirror table tr').first().locator('td').count();
    const cells = page.locator('.ProseMirror table td');

    await cells.nth(6).scrollIntoViewIfNeeded();
    await cells.nth(6).click();
    await page.waitForTimeout(200);
    await page.locator('[data-group=table]').click();
    await page.waitForTimeout(150);
    const tablePanel = page.locator('.ribbon > .tools:visible');
    const actionButton = text => tablePanel.locator('button').filter({ hasText: text }).first();
    const assertNoScroll = async (before, label) => {
      const now = await scrollY();
      assert.ok(Math.abs(now - before) < 2, `${label} keeps the page scroll: ${before} -> ${now}`);
    };

    // Put the table low in the viewport so a scroll-into-view focus would move the page.
    await page.evaluate(() => {
      const cell = document.querySelectorAll('.ProseMirror table td')[6];
      window.scrollBy(0, cell.getBoundingClientRect().top - 650);
    });
    await page.waitForTimeout(150);

    const hoverEdge = async (cell, edge) => {
      const box = await cell.boundingBox();
      const x = edge === 'row' ? box.x + box.width / 2 : box.x + box.width - 3;
      const y = edge === 'row' ? box.y + box.height - 3 : box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.waitForSelector(`.${edge === 'row' ? 'table-insert-row' : 'table-insert-column'}:not([hidden])`);
    };

    // Hover "+ Row" handle.
    await hoverEdge(cells.nth(6), 'row');
    let before = await scrollY();
    const rowsBeforeHoverRow = await rowCount();
    await page.evaluate(() => document.querySelector('.table-insert-row').click());
    await page.waitForTimeout(400);
    assert.equal(await rowCount(), rowsBeforeHoverRow + 1, 'Hover insert row adds one row');
    await assertNoScroll(before, 'Hover insert row');

    // Hover "+ Column" handle.
    await hoverEdge(cells.nth(6), 'column');
    before = await scrollY();
    const colsBeforeHoverColumn = await colCount();
    await page.evaluate(() => document.querySelector('.table-insert-column').click());
    await page.waitForTimeout(400);
    assert.equal(await colCount(), colsBeforeHoverColumn + 1, 'Hover insert column adds one column');
    await assertNoScroll(before, 'Hover insert column');

    // Scroll away so the table selection is off-screen: the historical bug scrolled
    // the page back to the selection when a toolbar action called focus().
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    before = await scrollY();

    const rowsBeforeMinus = await rowCount();
    await actionButton('－ Row').click();
    await page.waitForTimeout(400);
    assert.equal(await rowCount(), rowsBeforeMinus - 1, 'Delete row removes one row');
    await assertNoScroll(before, 'Delete row');

    const colsBeforeMinus = await colCount();
    await actionButton('－ Column').click();
    await page.waitForTimeout(400);
    assert.equal(await colCount(), colsBeforeMinus - 1, 'Delete column removes one column');
    await assertNoScroll(before, 'Delete column');

    await actionButton('booktabs').click();
    await page.waitForTimeout(400);
    assert.ok(await rowCount() > 0, 'booktabs keeps the table');
    await assertNoScroll(before, 'booktabs');

    await actionButton('Left').click();
    await page.waitForTimeout(400);
    await assertNoScroll(before, 'Cell alignment');

    await actionButton('Merge').click();
    await page.waitForTimeout(400);
    await assertNoScroll(before, 'Merge');

    await actionButton('Split').click();
    await page.waitForTimeout(400);
    await assertNoScroll(before, 'Split');

    await actionButton('Delete table').click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.ProseMirror table').count(), 0, 'Delete table removes the table');
    await assertNoScroll(before, 'Delete table');

    assert.deepEqual(errors, []);
    console.log('PASS table toolbar actions keep the page scroll position');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
