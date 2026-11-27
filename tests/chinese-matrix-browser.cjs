// Step 25 matrix: punctuation styles, document classes and schemes all import
// without errors, keep token layout and expose TOC/math/punctuation.
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

const body = String.raw`中文与 English mixed 排版测试，包含“引号”和《书名》，还有长破折号——以及省略号……以及数学 $x+y$ 结尾。`;
const article = style => String.raw`\documentclass{ctexart}
\usepackage[margin=22mm]{geometry}
\ctexset{punct=${style}}
\begin{document}
\tableofcontents
\section{第一节}
${body}
\subsection{小节}
${body}
\section{第二节}
${body}
\end{document}`;
const plainScheme = String.raw`\documentclass[UTF8]{ctexart}
\usepackage[margin=22mm]{geometry}
\ctexset{scheme=plain}
\begin{document}
\section{Plain scheme}
${body}
\end{document}`;
const chapters = (cls, ctex) => String.raw`\documentclass${ctex ? '[UTF8]' : ''}{${cls}}
\usepackage[margin=22mm]{geometry}
\begin{document}
\tableofcontents
\part{第一部分}
\chapter{第一章}
\section{小节}
${body}
\end{document}`;

async function run(browser, url, source, name, check) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror p[data-tex-paragraph], .ProseMirror h1'), { timeout: 30000 });
    await page.waitForTimeout(900);
    const result = await page.evaluate(() => ({
      pageCount: Number(document.querySelector('.document-page')?.dataset.pageCount ?? 0),
      laidOut: document.querySelectorAll('.ProseMirror [data-tex-paragraph]').length,
      punctuation: document.querySelectorAll('.tex-cjk-punctuation').length,
      tocEntries: document.querySelectorAll('[data-toc-view] .toc-entry').length,
      math: document.querySelectorAll('.ProseMirror .math-inline, .ProseMirror math-field').length,
      chapterLabel: document.querySelector('.ProseMirror h1')?.textContent?.trim() ?? '',
      overflow: document.querySelector('.document-page')?.scrollWidth - document.querySelector('.document-page')?.clientWidth,
    }));
    assert.deepEqual(errors, [], `${name} page errors`);
    assert.ok(result.pageCount > 0, `${name}: page count`);
    assert.ok(result.laidOut > 0, `${name}: token layout`);
    assert.ok(result.overflow <= 1, `${name}: no horizontal overflow`);
    check(result, name);
    return result;
  } finally { await page.close(); }
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const style of ['quanjiao', 'banjiao', 'kaiming', 'hangmobanjiao', 'plain', 'CCT']) {
      await run(browser, url, article(style), `matrix-${style}.tex`, (result, name) => {
        assert.ok(result.punctuation > 0, `${name}: punctuation tokens`);
        assert.ok(result.tocEntries >= 2, `${name}: TOC entries`);
        assert.ok(result.math > 0, `${name}: math node preserved`);
      });
    }
    await run(browser, url, plainScheme, 'matrix-plain-scheme.tex', result => {
      assert.ok(result.laidOut > 0, 'plain scheme still uses token layout');
    });
    await run(browser, url, chapters('book', false), 'matrix-book.tex', (result, name) => {
      assert.ok(result.tocEntries >= 2, `${name}: book TOC`);
      assert.ok(result.chapterLabel.length > 0, `${name}: chapter heading present`);
    });
    await run(browser, url, chapters('report', false), 'matrix-report.tex', result => assert.ok(result.tocEntries >= 2, 'report TOC'));
    await run(browser, url, chapters('ctexbook', true), 'matrix-ctexbook.tex', (result, name) => {
      assert.ok(result.tocEntries >= 2, `${name}: ctexbook TOC`);
      assert.ok(result.chapterLabel.length > 0, `${name}: chapter heading present`);
    });
    await run(browser, url, chapters('ctexrep', true), 'matrix-ctexrep.tex', result => assert.ok(result.tocEntries >= 2, 'ctexrep TOC'));
    console.log('PASS Chinese combination matrix (styles x classes x schemes)');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
