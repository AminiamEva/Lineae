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
const pageSource = (title, date) => `\\documentclass{article}\n\\title{${title}}\n\\author{Author}\n${date === null ? '' : '\\date{' + date + '}\n'}\\begin{document}\n\\maketitle\n\nBody.\n\n\\end{document}\n`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForTimeout(600);
    const date = page.locator('#document-meta .doc-date');
    const load = async (name, title, value) => {
      await page.locator('input[type=file]').setInputFiles({ name: name + '.tex', mimeType: 'text/plain', buffer: Buffer.from(pageSource(title, value)) });
      await page.waitForFunction(expected => document.querySelector('#document-meta .doc-title')?.textContent === expected, title);
      await page.waitForTimeout(300);
      return { text: (await date.textContent()).trim(), visible: await date.isVisible() };
    };

    const today = await load('today', 'Today', '\\today');
    assert.equal(today.visible, true, '\\today date is displayed');
    assert.ok(today.text.length > 0 && !today.text.includes('\\today'), '\\today is resolved');

    const literal = await load('literal', 'Literal', '2026.11.22');
    assert.equal(literal.visible, true, 'literal date is displayed');
    assert.equal(literal.text, '2026.11.22', 'literal date is preserved');

    const automatic = await load('automatic', 'Automatic', null);
    assert.equal(automatic.visible, true, 'a title without \\date shows the default date');
    assert.ok(automatic.text.length > 0, 'default date is not empty');

    const suppressed = await load('suppressed', 'Suppressed', '');
    assert.equal(suppressed.visible, false, '\\date{} suppresses the date');

    assert.deepEqual(errors, []);
    console.log('PASS title date metadata');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
