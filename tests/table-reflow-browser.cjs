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
const rows = Array.from({ length: 12 }, (_, index) => `Row ${index + 1} & ${'text '.repeat(10)} \\\\`).join('\n');
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
    await page.waitForFunction(() => document.querySelectorAll('.ProseMirror table tr').length >= 12);
    await revealToolbar(page);
    await page.locator('[data-group=insert]').click();
    const snapshot = () => page.evaluate(() => {
      const pageElement = document.querySelector('.document-page');
      const pageRect = pageElement.getBoundingClientRect();
      const zoom = pageRect.width / pageElement.offsetWidth || 1;
      const first = document.querySelector('.ProseMirror > p');
      const firstRect = first.getBoundingClientRect();
      return {
        pageCount: Number(pageElement.dataset.pageCount),
        scrollY: window.scrollY,
        first: [Math.round(firstRect.top), Math.round(firstRect.height)],
        pageBreaksInFirst: first.querySelectorAll('.pagination-line-break').length,
        rows: document.querySelectorAll('.ProseMirror table tr').length,
      };
    });
    const cells = page.locator('.ProseMirror table td');
    await cells.nth(8).scrollIntoViewIfNeeded();
    await cells.nth(8).click();
    await page.waitForTimeout(200);
    const selected = await snapshot();
    await page.locator('button').filter({ hasText: 'Row' }).first().click();
    await page.waitForTimeout(700);
    const inserted = await snapshot();
    assert.equal(inserted.rows, selected.rows + 1, 'Insert row adds one row');
    assert.equal(inserted.scrollY, selected.scrollY, 'Insert row keeps the scroll position');
    assert.deepEqual(inserted.first, selected.first, 'Content before the table is not reflowed');
    assert.equal(inserted.pageBreaksInFirst, 0, 'No pagination break is placed in the first paragraph');
    assert.ok(inserted.pageCount <= selected.pageCount + 2, `Inserting one row adds at most two pages: ${selected.pageCount} -> ${inserted.pageCount}`);
    assert.deepEqual(errors, []);
    console.log('PASS table row insert leaves earlier pages untouched');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
