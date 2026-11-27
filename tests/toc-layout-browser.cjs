// Step 12: TOC layout follows standard-class indent/numwidth/leader rules and
// keeps part/chapter/article-section entries out of the dotted-entry branch.
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

const longTitle = Array.from({ length: 6 }, () => '长标题悬掛縮排测试').join('');

const articleSource = [
  '\\documentclass{article}',
  '\\usepackage[margin=22mm]{geometry}',
  '\\begin{document}',
  '\\tableofcontents',
  '\\section{第一节}',
  '短段落。',
  '\\subsection{短小节}',
  '短段落。',
  `\\subsection{${longTitle}}`,
  '短段落。',
  '\\subsubsection{三级小节}',
  '短段落。',
  '\\end{document}',
].join('\n\n');

const bookSource = [
  '\\documentclass{book}',
  '\\usepackage[margin=22mm]{geometry}',
  '\\begin{document}',
  '\\tableofcontents',
  '\\part{第一部分}',
  '\\chapter{第一章测试}',
  '正文。',
  '\\section{小节标题}',
  '正文。',
  '\\end{document}',
].join('\n\n');

async function readToc(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-toc-view] .toc-entry')].map(row => {
      const number = row.querySelector('.toc-number');
      const text = row.querySelector('.toc-entry-text');
      const leader = row.querySelector('.toc-leader');
      const pageNumber = row.querySelector('.toc-page');
      const rowRect = row.getBoundingClientRect();
      const style = getComputedStyle(row);
      const leaderStyle = leader ? getComputedStyle(leader) : null;
      const pageRect = pageNumber.getBoundingClientRect();
      const textRect = text.getBoundingClientRect();
      const numberRect = number.getBoundingClientRect();
      const lineHeight = Number.parseFloat(style.lineHeight) || textRect.height;
      return {
        command: row.dataset.tocCommand,
        depth: Number(row.dataset.tocDepth),
        special: row.dataset.tocSpecial === 'true',
        bold: Number(style.fontWeight) >= 700,
        indent: row.style.getPropertyValue('--toc-indent'),
        numwidth: row.style.getPropertyValue('--toc-numwidth'),
        paddingRight: Number.parseFloat(style.paddingRight),
        leaderDisplay: leaderStyle?.display ?? 'none',
        leaderWidth: leader ? leader.getBoundingClientRect().width : 0,
        text: text.textContent,
        lines: Math.round(textRect.height / (lineHeight || textRect.height)) || 1,
        textHeight: textRect.height,
        textLeft: textRect.left,
        numberRight: numberRect.right,
        pageRight: pageRect.right,
        pageBottom: pageRect.bottom,
        rowRight: rowRect.right,
        rowBottom: rowRect.bottom,
        overflow: row.scrollWidth - row.clientWidth,
      };
    });
    return {
      chapters: document.querySelector('[data-toc-view]')?.dataset.tocChapters,
      rows,
    };
  });
}

async function run(browser, source, name) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelector('[data-toc-view] .toc-entry'), { timeout: 30000 });
    await page.waitForTimeout(1600);
    const result = await readToc(page);
    assert.deepEqual(errors, [], `${name} page errors`);
    for (const row of result.rows) {
      assert.ok(row.overflow <= 1, `${row.command} overflows horizontally by ${row.overflow}px`);
      assert.ok(Math.abs(row.pageRight - (row.rowRight - row.paddingRight)) < 2.5, `${row.command} page number not right-aligned (${row.pageRight} vs ${row.rowRight - row.paddingRight})`);
      assert.ok(row.textLeft >= row.numberRight - 0.5, `${row.command} title overlaps number box`);
    }
    return result;
  } finally { await page.close(); }
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const article = await run(browser, articleSource, 'article.tex');
    assert.equal(article.chapters, 'false');
    const section = article.rows.find(row => row.command === 'section');
    const subsection = article.rows.find(row => row.command === 'subsection' && row.text.includes('短小节'));
    const wrapped = article.rows.find(row => row.command === 'subsection' && row.text.startsWith('长标题'));
    const subsubsection = article.rows.find(row => row.command === 'subsubsection');
    assert.ok(section && subsection && wrapped && subsubsection, 'article TOC has all levels');
    assert.deepEqual([section.indent, section.numwidth, section.special], ['0em', '1.5em', true], 'article section special');
    assert.ok(section.leaderDisplay === 'none', 'article section has no dotted leader');
    assert.ok(section.bold, 'article section is bold');
    assert.deepEqual([subsection.indent, subsection.numwidth, subsection.special], ['1.5em', '2.3em', false], 'article subsection params');
    assert.ok(subsection.leaderDisplay !== 'none' && subsection.leaderWidth > 0, 'article subsection has dotted leader');
    assert.ok(!subsection.bold, 'article subsection is not bold');
    assert.deepEqual([subsubsection.indent, subsubsection.numwidth], ['3.8em', '3.2em'], 'article subsubsection params');
    assert.ok(wrapped.lines > 1, 'long subsection title wraps');
    assert.ok(Math.abs(wrapped.pageBottom - wrapped.rowBottom) < 3, 'page number sits on the last line of a wrapped entry');

    const book = await run(browser, bookSource, 'book.tex');
    assert.equal(book.chapters, 'true');
    const part = book.rows.find(row => row.command === 'part');
    const chapter = book.rows.find(row => row.command === 'chapter');
    const bookSection = book.rows.find(row => row.command === 'section');
    assert.ok(part && chapter && bookSection, 'book TOC has part/chapter/section');
    assert.equal(part.special, true, 'part is special');
    assert.ok(part.leaderDisplay === 'none' && part.bold, 'part is bold without dotted leader');
    assert.deepEqual([chapter.indent, chapter.numwidth, chapter.special], ['1em', '1.5em', true], 'book chapter params');
    assert.ok(chapter.leaderDisplay === 'none' && chapter.bold, 'book chapter is bold without dotted leader');
    assert.deepEqual([bookSection.indent, bookSection.numwidth, bookSection.special], ['1.5em', '2.3em', false], 'book section params');
    assert.ok(bookSection.leaderDisplay !== 'none' && bookSection.leaderWidth > 0, 'book section has dotted leader');

    console.log('PASS TOC standard layout (article + book)');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
