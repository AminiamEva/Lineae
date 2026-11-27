// Step 22: table/tabular vertical margins are CSS-only and distinguish a bare
// tabular, float placement, caption skips and booktabs rule space.
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
\usepackage{booktabs}
\begin{document}
Bare tabular:
\begin{tabular}{ll}
a & b \\
\end{tabular}

中间段落。

\begin{table}[t]
\centering
\caption{Float T}
\begin{tabular}{ll}
a & b \\
\end{tabular}
\end{table}

\begin{table}[t]
\centering
\caption{Float T2}
\begin{tabular}{ll}
c & d \\
\end{tabular}
\end{table}

\begin{table}[h]
\centering
\caption{Float H}
\begin{tabular}{ll}
e & f \\
\end{tabular}
\end{table}

\begin{table}[t]
\centering
\caption{Booktabs}
\begin{tabular}{ll}
\toprule
g & h \\
\bottomrule
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
    await page.locator('input[type=file]').first().setInputFiles({ name: 'table-margins.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelectorAll('.ProseMirror table').length >= 5, { timeout: 30000 });
    await page.waitForTimeout(1200);
    const result = await page.evaluate(() => {
      const px = value => Number.parseFloat(value) || 0;
      const margins = element => {
        const style = getComputedStyle(element);
        return { top: px(style.marginTop), bottom: px(style.marginBottom) };
      };
      const tables = [...document.querySelectorAll('.ProseMirror table')];
      const attrsOf = table => table.pmViewDesc?.node?.attrs ?? table.parentElement?.pmViewDesc?.node?.attrs ?? {};
      const bare = tables.find(table => { const attrs = attrsOf(table); return !attrs.placement && !attrs.caption && !attrs.captionEnabled; });
      const booktabs = tables.find(table => attrsOf(table).booktabs);
      const captions = [...document.querySelectorAll('.ProseMirror > .table-caption-widget')];
      return {
        bareWrapper: bare ? margins(bare.closest('.tableWrapper')) : null,
        bareTable: bare ? margins(bare) : null,
        firstCaption: captions[0] ? margins(captions[0]) : null,
        firstWrapper: captions[0]?.nextElementSibling?.classList.contains('tableWrapper') ? margins(captions[0].nextElementSibling) : null,
        secondCaption: captions[1] ? margins(captions[1]) : null,
        secondWrapper: captions[1]?.nextElementSibling?.classList.contains('tableWrapper') ? margins(captions[1].nextElementSibling) : null,
        lastWrapper: captions.at(-1)?.nextElementSibling?.classList.contains('tableWrapper') ? margins(captions.at(-1).nextElementSibling) : null,
        captionCount: captions.length,
        booktabsTable: booktabs ? margins(booktabs) : null,
      };
    });
    assert.ok(result.bareWrapper, 'bare tabular exists');
    assert.deepEqual(result.bareWrapper, { top: 0, bottom: 0 }, 'bare tabular has no float margin');
    assert.deepEqual(result.bareTable, { top: 0, bottom: 0 }, 'bare table margin stays zero');
    assert.equal(result.captionCount, 4, 'four caption floats are present');
    assert.ok(result.firstCaption.top > 34 && result.firstCaption.top < 46, `float top uses textfloatsep + abovecaptionskip (${result.firstCaption.top})`);
    assert.ok(result.firstWrapper.top < 0.5, 'float wrapper does not add a second top margin');
    assert.ok(result.firstWrapper.bottom > 12 && result.firstWrapper.bottom < 22, `consecutive float bottom uses floatsep (${result.firstWrapper.bottom})`);
    assert.ok(result.lastWrapper.bottom > 20 && result.lastWrapper.bottom < 34, `last float bottom uses textfloatsep (${result.lastWrapper.bottom})`);
    assert.ok(result.secondCaption.top < result.firstCaption.top, `consecutive floats use floatsep (${result.secondCaption.top})`);
    assert.ok(result.secondCaption.top > 24 && result.secondCaption.top < 34, 'floatsep + abovecaptionskip');
    assert.ok(result.firstCaption.bottom < 0.5, 'caption below skip is zero by default');
    assert.ok(result.booktabsTable.top < 0.5 && result.booktabsTable.bottom < 0.5, 'booktabs rule space is not an outer margin');
    assert.deepEqual(errors, []);
    console.log('PASS table vertical margins (CSS only)');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
