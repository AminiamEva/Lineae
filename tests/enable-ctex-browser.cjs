// Step 3: the Enable ctex footer control.
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

const ENGLISH = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nEnglish only.\n\\end{document}\n';
const CHINESE = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n中文正文。\n\\end{document}\n';

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const button = page.locator('#enable-ctex');
    assert.equal(await button.count(), 1, 'Enable ctex button exists');
    assert.equal(await button.getAttribute('aria-label'), 'Enable ctex');
    assert.equal(await button.getAttribute('aria-pressed'), 'true', 'default document enables ctex');

    const order = await page.evaluate(() => {
      const priority = document.querySelector('#keyboard-priority');
      const message = document.querySelector('#keyboard-priority-message');
      const ctex = document.querySelector('#enable-ctex');
      const modes = document.querySelector('.tex-modes');
      const position = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { priorityBeforeMessage: position(priority, message), messageBeforeCtex: position(message, ctex), ctexBeforeModes: position(ctex, modes) };
    });
    assert.deepEqual(order, { priorityBeforeMessage: true, messageBeforeCtex: true, ctexBeforeModes: true });

    await page.locator('[data-source-mode=source]').click();
    await page.locator('.cm-content').waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
    const sourceText = () => page.evaluate(() => [...document.querySelectorAll('.cm-line')].map(line => line.textContent).join('\n'));
    const replaceSource = async text => {
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.insertText(text);
      await page.waitForTimeout(600);
    };
    assert.match(await sourceText(), /\\usepackage\[UTF8\]\{ctex\}/, 'default source declares ctex');

    await replaceSource(ENGLISH);
    assert.equal(await button.getAttribute('aria-pressed'), 'false', 'plain source turns the button off');

    await button.click();
    await page.waitForTimeout(500);
    assert.equal(await button.getAttribute('aria-pressed'), 'true', 'clicking enables ctex');
    assert.match(await sourceText(), /\\usepackage\[UTF8\]\{ctex\}/, 'enabling inserts one declaration');
    assert.equal(((await sourceText()).match(/\\usepackage\[UTF8\]\{ctex\}/g) || []).length, 1, 'declaration is not duplicated');

    await replaceSource(CHINESE);
    assert.equal(await button.getAttribute('aria-pressed'), 'false', 'source without ctex is off even with Han');
    await button.click();
    await page.waitForTimeout(500);
    assert.equal(await button.getAttribute('aria-pressed'), 'true', 'Han text can still enable ctex');
    await button.click();
    await page.waitForTimeout(300);
    assert.equal(await button.getAttribute('aria-pressed'), 'true', 'disabling with Han present is a no-op');
    assert.match(await sourceText(), /\\usepackage\[UTF8\]\{ctex\}/, 'Han guard leaves the declaration intact');

    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(500);
    const afterUndo = await button.getAttribute('aria-pressed');
    await page.keyboard.press('Control+Y');
    await page.waitForTimeout(500);
    const afterRedo = await button.getAttribute('aria-pressed');
    assert.equal(afterUndo, 'false', 'undo restores the earlier ctex state');
    assert.equal(afterRedo, 'true', 'redo restores the enabled state');

    assert.deepEqual(errors, []);
    console.log('PASS Enable ctex control');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
