// Step 4: the save-time ctex notice and injection.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const zlib = require('node:zlib');
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

const NOTICE = '检测到您输入了中文，在保存时为您自动加入ctex声明';
const CHINESE_NO_CTEX = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n中文正文。\n\\end{document}\n';
const ENGLISH = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nEnglish only.\n\\end{document}\n';
const CHINESE_CTEX = '\\documentclass{article}\n\\usepackage[UTF8]{ctex}\n\\begin{document}\n中文正文。\n\\end{document}\n';

function unzipFirstTex(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    if (name.endsWith('.tex')) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const localNameLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const data = buffer.slice(start, start + compSize);
      return { name, content: method === 0 ? data.toString('utf8') : zlib.inflateRawSync(data).toString('utf8') };
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function openFiles(page) {
  await page.locator('.ribbon-tabs [data-group=files]').click();
  await page.waitForTimeout(200);
}
async function replaceSource(page, text) {
  await page.locator('[data-source-mode=source]').click();
  await page.locator('.cm-content').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(text);
  await page.waitForTimeout(500);
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const downloadText = async ({ expectNotice }) => {
      await openFiles(page);
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('#download').click();
      let dialog = '';
      if (expectNotice) {
        await page.locator('.editor-dialog').waitFor({ state: 'visible' });
        dialog = await page.locator('.editor-dialog').innerText();
        await page.locator('.editor-dialog button[type=submit]').click();
      } else {
        await page.waitForTimeout(600);
      }
      const download = await downloadPromise;
      const entry = unzipFirstTex(readFileSync(await download.path()));
      return { dialog, text: entry?.content ?? '' };
    };

    // English source: no notice, no ctex.
    await replaceSource(page, ENGLISH);
    const english = await downloadText({ expectNotice: false });
    assert.ok(!english.text.includes('ctex'), 'plain English save does not add ctex');

    // Chinese without ctex: notice + injection.
    await replaceSource(page, CHINESE_NO_CTEX);
    const chinese = await downloadText({ expectNotice: true });
    assert.ok(chinese.dialog.includes(NOTICE), 'the exact notice is shown');
    assert.match(chinese.text, /\\usepackage\[UTF8\]\{ctex\}/, 'saved source receives ctex');
    assert.ok(chinese.text.includes('中文正文'), 'saved source keeps the Chinese body');

    // The second save must not show the notice again.
    const second = await downloadText({ expectNotice: false });
    assert.match(second.text, /\\usepackage\[UTF8\]\{ctex\}/);

    // Existing ctex: no notice.
    await replaceSource(page, CHINESE_CTEX);
    const existing = await downloadText({ expectNotice: false });
    assert.equal((existing.text.match(/\\usepackage(?:\[[^\]]*\])?\{ctex\}/g) || []).length, 1, 'existing declaration is not duplicated');

    // Untouched import without ctex.
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'chinese.tex', mimeType: 'text/plain', buffer: Buffer.from(CHINESE_NO_CTEX) });
    await page.waitForFunction(() => (document.querySelector('.ProseMirror')?.textContent || '').includes('中文'), { timeout: 30000 });
    await page.waitForTimeout(800);
    const imported = await downloadText({ expectNotice: true });
    assert.ok(imported.dialog.includes(NOTICE));
    assert.match(imported.text, /\\usepackage\[UTF8\]\{ctex\}/, 'untouched import is saved with ctex');

    assert.deepEqual(errors, []);
    console.log('PASS ctex save chain');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
