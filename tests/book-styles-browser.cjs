const {openXeReference}=require('./xe-reference-page.cjs');
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

const book = `\\documentclass[12pt,openany]{book}
\\begin{document}
\\part{First Part}
\\chapter{Opening}
\\section{Background}
\\subsection{Details}

A body paragraph to restyle.
\\end{document}
`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openXeReference(page,'http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('input[type=file]').setInputFiles({ name: 'book.tex', mimeType: 'text/plain', buffer: Buffer.from(book) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent.includes('First Part'));
    await page.waitForTimeout(800);

    const keys = await page.locator('.style-card').evaluateAll(nodes => nodes.map(node => node.dataset.style));
    assert.deepEqual(keys, ['normal', 'part', 'chapter', 'section', 'subsection'], 'book styles include part/chapter');
    assert.equal(await page.locator('.ProseMirror h1[data-heading-command="part"]').count(), 1, 'imported \\part renders as a part heading');
    assert.equal(await page.locator('.ProseMirror h1[data-heading-command="chapter"]').count(), 1, 'imported \\chapter keeps its command');

    await revealToolbar(page);
    await page.locator('[data-group=home]').click();
    await page.locator('.ProseMirror p').filter({ hasText: 'A body paragraph' }).first().click();
    await page.evaluate(() => document.querySelector('.style-card[data-style="part"]').click());
    await page.waitForFunction(() => document.querySelectorAll('.ProseMirror h1[data-heading-command="part"]').length === 2);
    assert.equal(await page.locator('.ProseMirror h1[data-heading-command="part"]').last().textContent(), 'A body paragraph to restyle.', 'Part style applies to the caret paragraph');
    assert.deepEqual(errors, []);
    console.log('PASS book style gallery adapts to the environment');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
