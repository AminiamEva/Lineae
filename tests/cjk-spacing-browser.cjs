// Step 16: body, headings, lists, quotes and table cells all use the token
// glue; the old cjk-latin/math-cjk decoration margins are gone.
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

const source = String.raw`\documentclass{article}
\usepackage[margin=22mm]{geometry}
\usepackage[UTF8]{ctex}
\begin{document}
\section{中文ABC中文}
中文ABC中文。

中文 $x$ 中文。

中文\textbf{ABC}中文。

\begin{itemize}
\item 列表中文ABC中文。
\end{itemize}

\begin{quote}
引用中文ABC中文。
\end{quote}

\begin{table}[h]
\centering
\caption{表格ABC标题}
\begin{tabular}{ll}
中文ABC & 第二 \\
\end{tabular}
\end{table}
\end{document}`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'cjk-spacing.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror p[data-tex-paragraph], .ProseMirror h1[data-tex-paragraph]'), { timeout: 30000 });
    await page.waitForTimeout(1400);
    const result = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3')];
      const byText = text => blocks.find(block => block.textContent.replace(/\s+/g, '') === text) ?? null;
      const interchar = block => block ? block.querySelectorAll('.tex-interchar-glue').length : -1;
      const wordGlue = block => block ? block.querySelectorAll('.tex-word-glue').length : -1;
      const body = byText('中文ABC中文。');
      const math = blocks.find(block => block.querySelector('.math-inline, .math-display, math-field')) ?? null;
      const bold = byText('中文ABC中文。'.replace('ABC', 'ABC'));
      const heading = document.querySelector('.ProseMirror h1[data-tex-paragraph]');
      const listParagraph = [...document.querySelectorAll('.ProseMirror li p')].find(block => block.textContent.includes('列表'));
      const quoteParagraph = [...document.querySelectorAll('.ProseMirror blockquote p')].find(block => block.textContent.includes('引用'));
      const cellParagraph = [...document.querySelectorAll('.ProseMirror td p')].find(block => block.textContent.includes('中文ABC'));
      return {
        cjkLatin: document.querySelectorAll('.cjk-latin').length,
        mathCjk: document.querySelectorAll('.math-cjk-before, .math-cjk-after').length,
        bodyLaidOut: Boolean(body?.hasAttribute('data-tex-paragraph')),
        bodyInterchar: interchar(body),
        headingLaidOut: Boolean(heading?.hasAttribute('data-tex-paragraph')),
        headingInterchar: interchar(heading),
        boldInterchar: interchar([...blocks].find(block => block.querySelector('strong') && block.textContent.includes('中文'))),
        mathHasWordGlue: wordGlue(math),
        listLaidOut: Boolean(listParagraph?.hasAttribute('data-tex-paragraph')),
        quoteLaidOut: Boolean(quoteParagraph?.hasAttribute('data-tex-paragraph')),
        cellLaidOut: Boolean(cellParagraph?.hasAttribute('data-tex-paragraph')),
        paragraphCount: document.querySelectorAll('.ProseMirror p[data-tex-paragraph]').length,
      };
    });
    assert.equal(result.cjkLatin, 0, 'no legacy cjk-latin decoration');
    assert.equal(result.mathCjk, 0, 'no legacy math-cjk margin classes');
    assert.ok(result.bodyLaidOut, 'body uses token layout');
    assert.equal(result.bodyInterchar, 2, 'Chinese/Latin boundary has exactly one glue per side');
    assert.ok(result.headingLaidOut, 'heading uses token layout');
    assert.equal(result.headingInterchar, 2, 'heading has exactly one glue per side');
    assert.equal(result.boldInterchar, 2, 'bold boundary has exactly one glue per side');
    assert.ok(result.mathHasWordGlue > 0, 'math boundary spacing comes from token glue');
    assert.ok(result.listLaidOut, 'list paragraph uses token layout');
    assert.ok(result.quoteLaidOut, 'quote paragraph uses token layout');
    assert.ok(result.cellLaidOut, 'table cell paragraph uses token layout');
    assert.deepEqual(errors, []);
    console.log('PASS CJK spacing unified across paragraph paths');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
