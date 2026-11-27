// Step 9: ctexbook/ctexrep chapter/part labels and standard book+ctex contrast.
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
const CTEXBOOK = String.raw`\documentclass[UTF8,scheme=chinese]{ctexbook}
\usepackage[margin=22mm]{geometry}
\begin{document}
\frontmatter
\chapter{前言}
\mainmatter
\part{部分}
\chapter{章}
章正文。
\section{节}
\end{document}`;
const BOOK = String.raw`\documentclass{book}
\usepackage[UTF8]{ctex}
\usepackage[margin=22mm]{geometry}
\begin{document}
\chapter{章}
章正文。
\end{document}`;

async function load(page, source) {
  await page.locator('input[type=file]').first().setInputFiles({ name: 'book.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
  await page.waitForFunction(() => document.querySelector('.ProseMirror h1'), { timeout: 30000 });
  await page.waitForTimeout(1200);
}
async function read(page) {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll('.ProseMirror h1,.ProseMirror h2')];
    const describe = element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const before = getComputedStyle(element, '::before');
      return {
        style: element.dataset.headingStyle ?? null,
        chapterLabel: element.dataset.chapterLabel ?? null,
        sectionNumber: element.dataset.sectionNumber ?? null,
        matter: element.dataset.matter ?? null,
        align: style.textAlign,
        beforeDisplay: before.display,
        weight: style.fontWeight,
        size: style.fontSize,
      };
    };
    const chapter = headings.find(element => element.dataset.headingCommand === 'chapter' && element.dataset.chapterLabel);
    const front = headings.find(element => element.dataset.headingCommand === 'chapter' && !element.dataset.chapterLabel);
    return {
      chapter: describe(chapter),
      front: describe(front),
      part: describe(headings.find(element => element.dataset.headingCommand === 'part')),
      section: describe(headings.find(element => element.dataset.headingCommand === 'section')),
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

    await load(page, CTEXBOOK);
    const ctex = await read(page);
    assert.equal(ctex.chapter?.style, 'true');
    assert.equal(ctex.chapter?.align, 'center');
    assert.equal(ctex.chapter?.chapterLabel, '第一章');
    assert.equal(ctex.chapter?.sectionNumber, '1');
    assert.equal(ctex.chapter?.beforeDisplay, 'inline', 'ctexbook puts the chapter label on the title line');
    assert.ok(Number.parseFloat(ctex.chapter?.size) > 20, 'ctexbook chapter uses the huge size');
    assert.equal(ctex.front?.matter, 'front');
    assert.equal(ctex.front?.chapterLabel, null, 'front matter chapter is unnumbered');
    assert.equal(ctex.part?.sectionNumber, '第一部分');
    assert.equal(ctex.part?.align, 'center');
    assert.equal(ctex.section?.style, 'true');
    assert.equal(ctex.section?.align, 'left');

    await load(page, BOOK);
    const book = await read(page);
    assert.equal(book.chapter?.style, null, 'standard book + ctex keeps the standard chapter block');
    assert.equal(book.chapter?.chapterLabel, 'Chapter 1');
    assert.equal(book.chapter?.beforeDisplay, 'block');

    assert.deepEqual(errors, []);
    console.log('PASS Chinese book/report chapter and part labels');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
