// Step 11: TOC entries and page numbers are resolved by source position.
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
const sent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut mauris tellus, volutpat at hendrerit ac, vulputate vel metus. Nunc interdum nisl non quam egestas fringilla. Pellentesque tincidunt vulputate massa, nec rutrum risus.';
const para = label => `${label} ` + Array.from({ length: 4 }, () => sent).join(' ');
const source = [
  '\\documentclass{article}',
  '\\usepackage[margin=22mm]{geometry}',
  '\\setcounter{tocdepth}{1}',
  '\\begin{document}',
  '\\tableofcontents',
  '\\section{第一节}',
  para('一'), para('一甲'),
  '\\subsection{隐藏小节}',
  '\\section*{星号节}',
  '\\section{第二节}',
  para('二'), para('二甲'),
  '\\addcontentsline{toc}{section}{显式项}',
  '\\section{第三节}',
  para('三'), para('三甲'),
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
    await page.locator('input[type=file]').first().setInputFiles({ name: 'toc.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('[data-toc-view] .toc-entry'), { timeout: 30000 });
    await page.waitForTimeout(1600);
    const result = await page.evaluate(() => {
      const pageElement = document.querySelector('.document-page');
      const sheet = pageElement.querySelector('.document-sheet');
      const pageRect = pageElement.getBoundingClientRect();
      const pitch = sheet.offsetHeight + (Number.parseFloat(getComputedStyle(pageElement).getPropertyValue('--page-gap')) || 0);
      const zoom = pageRect.width / pageElement.offsetWidth || 1;
      return {
        rows: [...document.querySelectorAll('[data-toc-view] .toc-entry')].map(row => ({
          text: [row.querySelector('.toc-number')?.textContent, row.querySelector('.toc-entry-text')?.textContent].filter(Boolean).join(' '),
          page: row.querySelector('.toc-page')?.textContent ?? '',
          position: Number(row.dataset.headingPosition),
        })),
        expected: [...document.querySelectorAll('.ProseMirror h1[data-heading-position]')].map(heading => {
          const rect = heading.getBoundingClientRect();
          return { position: Number(heading.dataset.headingPosition), page: String(Math.floor((rect.top - pageRect.top) / zoom / pitch) + 1) };
        }),
      };
    });
    assert.deepEqual(result.rows.map(row => row.text.replace(/\s+/g, ' ').trim()), [
      '1 第一节', '2 第二节', '显式项', '3 第三节',
    ]);
    const expected = new Map(result.expected.map(item => [item.position, item.page]));
    for (const row of result.rows) {
      if (!expected.has(row.position)) { assert.ok(row.page, 'explicit entry has a page number'); continue; }
      assert.equal(row.page, expected.get(row.position), `page for ${row.text}`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS TOC source-position page mapping');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
