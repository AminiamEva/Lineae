// Step 8: Chinese article heading styles and first-paragraph indent.
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

const doc = (preamble, body) => `${preamble}\n\\usepackage[margin=22mm]{geometry}\n\\begin{document}\n${body}\n\\end{document}\n`;
const CTEX_BODY = '\\part{部分}\n\\section{一节}\n第一节正文。\n\\subsection{二节}\n\\subsubsection{三节}\n';
const ENGLISH_BODY = '\\part{Part}\n\\section{Section}\nEnglish body.\n\\subsection{Sub}\n';

async function load(page, source) {
  await page.locator('input[type=file]').first().setInputFiles({ name: 'heading.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
  await page.waitForFunction(() => document.querySelector('.ProseMirror h1'), { timeout: 30000 });
  await page.waitForTimeout(1200);
}
async function read(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3')];
    const find = command => all.find(element => element.dataset.headingCommand === command);
    const info = element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        style: element.dataset.headingStyle ?? null,
        number: element.dataset.sectionNumber ?? null,
        afterIndent: element.dataset.afterIndent ?? null,
        position: element.dataset.headingPosition ?? null,
        align: style.textAlign,
        weight: style.fontWeight,
        size: style.fontSize,
      };
    };
    const section = find('section');
    const paragraph = section?.nextElementSibling;
    return {
      part: info(find('part')),
      section: info(section),
      subsection: info(find('subsection')),
      paragraphIndent: paragraph ? getComputedStyle(paragraph).textIndent : null,
      paragraphData: paragraph ? { indent: paragraph.dataset.indent ?? null, explicit: paragraph.dataset.explicitIndent ?? null } : null,
    };
  });
}
const px = value => Number.parseFloat(String(value || '0'));

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    await load(page, doc('\\documentclass[UTF8,scheme=chinese]{ctexart}', CTEX_BODY));
    const ctex = await read(page);
    assert.equal(ctex.part?.style, 'true');
    assert.equal(ctex.part?.align, 'center');
    assert.ok(ctex.part?.number?.includes('部分'), 'part uses the Chinese label');
    assert.equal(ctex.section?.style, 'true');
    assert.equal(ctex.section?.align, 'center');
    assert.equal(ctex.section?.weight, '700');
    assert.equal(ctex.section?.number, '1');
    assert.ok(ctex.section?.position, 'heading position is exposed');
    assert.equal(ctex.subsection?.style, 'true');
    assert.notEqual(ctex.subsection?.align, 'center');
    assert.ok(px(ctex.paragraphIndent) > 0, 'first paragraph after a Chinese section is indented');
    assert.equal(ctex.paragraphData?.indent, 'true');

    await load(page, doc('\\documentclass[UTF8,scheme=chinese]{ctexart}\n\\ctexset{section/afterindent=false}', CTEX_BODY));
    const noIndent = await read(page);
    assert.equal(noIndent.section?.afterIndent, 'false');
    assert.equal(px(noIndent.paragraphIndent), 0, 'afterindent=false removes the first-paragraph indent');

    await load(page, doc('\\documentclass{article}', ENGLISH_BODY));
    const english = await read(page);
    assert.equal(english.section?.style, null, 'plain English headings keep the standard CSS');
    assert.notEqual(english.section?.align, 'center');

    assert.deepEqual(errors, []);
    console.log('PASS Chinese article heading styles');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
