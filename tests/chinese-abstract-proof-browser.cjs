// Step 10: profile-driven abstract/proof names.
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

const make = (preamble, extra = '') => `${preamble}
\\usepackage{amsthm}
\\usepackage[margin=22mm]{geometry}
${extra}
\\begin{document}

\\begin{abstract}
摘要内容。
\\end{abstract}

\\begin{proof}
证明内容。
\\end{proof}

\\end{document}
`;
async function load(page, source) {
  await page.locator('input[type=file]').first().setInputFiles({ name: 'abstract.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
  await page.waitForFunction(() => document.querySelector('.ProseMirror blockquote[data-latex-environment="abstract"]'), { timeout: 30000 });
  await page.waitForTimeout(1000);
}
async function read(page) {
  return page.evaluate(() => {
    const abstract = document.querySelector('.ProseMirror blockquote[data-latex-environment="abstract"]');
    const proof = document.querySelector('.ProseMirror section[data-theorem="proof"]');
    return {
      abstractName: abstract?.dataset.abstractName ?? null,
      abstractBefore: abstract ? getComputedStyle(abstract, '::before').content : null,
      proofName: proof?.dataset.theoremHeading ?? null,
      proofBefore: proof ? getComputedStyle(proof, '::before').content : null,
    };
  });
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    await load(page, make('\\documentclass[UTF8,scheme=chinese]{ctexart}'));
    const ctex = await read(page);
    assert.equal(ctex.abstractName, '摘要');
    assert.ok(ctex.abstractBefore.includes('摘要'), 'abstract title renders the profile name');
    assert.equal(ctex.proofName, '证明.');
    assert.ok(ctex.proofBefore.includes('证明'), 'proof name renders the profile name');

    await load(page, make('\\documentclass[UTF8,scheme=chinese]{ctexart}', '\\renewcommand{\\abstractname}{概要}\\renewcommand{\\proofname}{证明X}'));
    const custom = await read(page);
    assert.equal(custom.abstractName, '概要');
    assert.equal(custom.proofName, '证明X.');

    await load(page, make('\\documentclass{article}'));
    const english = await read(page);
    assert.equal(english.abstractName, 'Abstract');
    assert.equal(english.proofName, 'Proof.');
    assert.ok(english.abstractBefore.includes('Abstract'));
    assert.ok(english.proofBefore.includes('Proof'));

    assert.deepEqual(errors, []);
    console.log('PASS Chinese abstract and proof names');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
