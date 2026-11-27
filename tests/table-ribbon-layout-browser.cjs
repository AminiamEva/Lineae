// Step 23: the table ribbon groups put content first and the title at the
// bottom, with exactly two control rows and no overflow at 1366px or narrow.
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
\begin{table}[htbp]
\centering
\caption{Ribbon groups}
\begin{tabular}{ll}
\toprule
alpha & beta \\
\midrule
one & two \\
\bottomrule
\end{tabular}
\end{table}
\end{document}`;

async function measure(page) {
  return page.evaluate(() => {
    const uniqueRows = elements => new Set(elements.map(element => Math.round(element.getBoundingClientRect().top))).size;
    const groups = [...document.querySelectorAll('.table-style-group')].map(group => {
      const body = group.querySelector('.table-style-group-body');
      const heading = group.querySelector('.table-style-group-title');
      const grid = group.querySelector('.table-options-grid');
      return {
        label: heading?.textContent ?? '',
        lastChildIsTitle: group.lastElementChild === heading,
        labelledBy: group.getAttribute('aria-labelledby'),
        headingId: heading?.id ?? '',
        titleCentered: heading ? getComputedStyle(heading).textAlign === 'center' : false,
        titleBelowBody: Boolean(body && heading && heading.getBoundingClientRect().top >= body.getBoundingClientRect().top),
        bodyRows: body ? uniqueRows([...body.children]) : 0,
        gridRows: grid ? uniqueRows([...grid.children]) : 0,
        groupOverflow: group.scrollWidth - group.clientWidth,
      };
    });
    const tools = document.querySelector('[data-group=table]');
    return {
      groups,
      toolsOverflow: tools ? tools.scrollWidth - tools.clientWidth : 0,
      bodyTemplateRows: getComputedStyle(document.querySelector('.table-style-group-body')).gridTemplateRows.split(' ').filter(Boolean).length,
    };
  });
}

async function check(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.waitForTimeout(600);
  const result = await measure(page);
  assert.ok(result.groups.length >= 3, 'table ribbon has its style groups');
  for (const group of result.groups) {
    assert.ok(group.lastChildIsTitle, `${group.label}: title is the last child`);
    assert.equal(group.labelledBy, group.headingId, `${group.label}: aria-labelledby points at the title`);
    assert.ok(group.titleCentered, `${group.label}: title is centered`);
    assert.ok(group.titleBelowBody, `${group.label}: title sits below the content`);
    assert.ok(group.bodyRows <= 2, `${group.label}: body has at most two rows (${group.bodyRows})`);
    assert.ok(group.gridRows === 0 || group.gridRows === 2, `${group.label}: options grid has exactly two rows (${group.gridRows})`);
    assert.ok(group.groupOverflow <= 1, `${group.label}: group does not overflow (${group.groupOverflow}px)`);
  }
  assert.equal(result.bodyTemplateRows, 2, 'group body declares two grid rows');
  assert.ok(result.toolsOverflow <= 1, `table tab does not overflow at ${width}px (${result.toolsOverflow}px)`);
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1000 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'ribbon.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror table'), { timeout: 30000 });
    await page.waitForTimeout(900);
    await page.locator('.ProseMirror table td').first().click();
    await page.waitForTimeout(400);
    await page.locator('.ribbon-tabs [data-group=table]').click();
    await page.waitForTimeout(400);
    await check(page, 1366);
    await check(page, 900);
    assert.deepEqual(errors, []);
    console.log('PASS table ribbon two-row layout');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
