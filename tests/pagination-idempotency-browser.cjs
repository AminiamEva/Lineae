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

const paragraph = index => `Paragraph ${String(index + 1).padStart(3, '0')}. The quick brown fox jumps over the lazy dog while the typesetter chooses line endings across several pages.`;
const paragraphs = Array.from({ length: 48 }, (_, index) => paragraph(index)).join('\n\n');
const main = `\\documentclass[a4paper]{article}\\usepackage[margin=2.2cm]{geometry}\\usepackage{indentfirst}\n\\begin{document}\n\\section{Stable layout}\n\n${paragraphs}\n\n\\input{child}\n\nAfter the child.\n\\end{document}\n`;
const child = `\\section{Child section}\n\n${paragraphs.slice(0, 900)}\n`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(async ({ main, child }) => {
      const root = await navigator.storage.getDirectory();
      window.folder = await root.getDirectoryHandle('stability', { create: true });
      const put = async (name, text) => {
        const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
        await writable.write(text);
        await writable.close();
      };
      await put('main.tex', main);
      await put('child.tex', child);
      window.showDirectoryPicker = async () => folder;
    }, { main, child });
    await revealToolbar(page);
    await page.locator('[data-group=files]').click();
    await page.locator('#project-open').click();
    await page.locator('[data-file-path="child.tex"] h1').waitFor();

    const snapshot = () => page.evaluate(() => {
      const pageElement = document.querySelector('.document-page');
      const pageRect = pageElement.getBoundingClientRect();
      const zoom = pageRect.width / pageElement.offsetWidth || 1;
      return {
        pageCount: Number(pageElement.dataset.pageCount),
        editorWidth: document.querySelector('.ProseMirror')?.clientWidth,
        regions: [...document.querySelectorAll('[data-project-region]')].map(region => {
          const rect = region.getBoundingClientRect();
          return [region.dataset.filePath, Math.round((rect.top - pageRect.top) / zoom), Math.round(rect.height / zoom)];
        }),
      };
    });
    const stable = async () => {
      let previous = '';
      let same = 0;
      for (let attempt = 0; attempt < 60; attempt++) {
        const current = JSON.stringify(await snapshot());
        same = current === previous ? same + 1 : 1;
        previous = current;
        if (same >= 3) return JSON.parse(current);
        await page.waitForTimeout(150);
      }
      throw new Error('Pagination did not stabilize');
    };

    const baseline = await stable();
    assert.ok(baseline.pageCount >= 2, 'The fixture spans multiple pages');

    await page.locator('[data-source-mode=split]').click();
    await page.waitForTimeout(800);
    await page.locator('[data-source-mode=body]').click();
    const afterFirstSwitch = await stable();
    assert.equal(afterFirstSwitch.pageCount, baseline.pageCount, 'Split round-trip keeps the page count');
    assert.deepEqual(afterFirstSwitch.regions, baseline.regions, 'Split round-trip keeps file boundaries in place');

    await page.locator('[data-source-mode=split]').click();
    await page.waitForTimeout(800);
    await page.locator('[data-source-mode=body]').click();
    const afterSecondSwitch = await stable();
    assert.equal(afterSecondSwitch.pageCount, baseline.pageCount, 'Repeated split round-trips stay stable');
    assert.deepEqual(afterSecondSwitch.regions, baseline.regions);

    await page.locator('.document-status input[type=range]').evaluate(node => { node.value = 150; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    await page.locator('.document-status input[type=range]').evaluate(node => { node.value = 100; node.dispatchEvent(new Event('input', { bubbles: true })); });
    const afterZoom = await stable();
    assert.equal(afterZoom.pageCount, baseline.pageCount, 'Returning to 100% zoom restores the same pagination');
    assert.deepEqual(afterZoom.regions, baseline.regions);

    assert.deepEqual(errors, []);
    console.log('PASS pagination idempotency across split and zoom changes');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
