// Step 1 browser baseline. Records current behaviour for Chinese import, the
// save round trip, pasting Chinese, and the table add-row caption/ribbon state.
// It deliberately records known differences instead of fixing them.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile, writeFile } = require('node:fs/promises');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve, extname, sep, join } = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');

const root = resolve('apps/web');
const expected = resolve('tests/fixtures/chinese/expected');
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) return response.writeHead(403).end();
  try {
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});

const ARTICLE = String.raw`\documentclass[a4paper,10pt]{article}
\usepackage[margin=22mm]{geometry}
\usepackage[UTF8]{ctex}
\begin{document}
\section{中文标题}
中文粘贴与导入测试段落。第二句包含 Latin words 与数字 123。
\end{document}`;
const TABLE = String.raw`\documentclass[a4paper,10pt]{article}
\usepackage[margin=22mm]{geometry}
\usepackage[UTF8]{ctex}
\usepackage{booktabs}
\begin{document}
\begin{table}[htbp]
\centering
\caption{中文表标题}
\begin{tabular}{ll}
\toprule
甲 & 乙 \\
\midrule
一 & 二 \\
三 & 四 \\
\bottomrule
\end{tabular}
\end{table}
\end{document}`;

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

async function upload(page, name, source) {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(source) });
  await page.waitForFunction(() => (document.querySelector('.ProseMirror')?.textContent || '').includes('中文'), { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function measure(page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const pageEl = document.querySelector('.document-page');
    const prose = document.querySelector('.ProseMirror');
    const style = pageEl ? getComputedStyle(pageEl) : null;
    return {
      text: (prose?.textContent || '').slice(0, 600),
      pageCount: pageEl?.dataset.pageCount ?? null,
      ctexEnabled: pageEl?.dataset.ctexEnabled ?? null,
      ctexScheme: pageEl?.dataset.ctexScheme ?? null,
      captionLanguage: pageEl?.dataset.captionLanguage ?? null,
      texFont: style?.getPropertyValue('--tex-font-family').trim() || '',
      cjkFont: style?.getPropertyValue('--tex-cjk-font-family').trim() || '',
      pageWidth: pageEl ? Math.round(pageEl.getBoundingClientRect().width) : null,
      latinRoman: document.fonts.check('16px "Latin Modern Roman"'),
      fandol: document.fonts.check('16px "FandolSong"'),
    };
  });
}

async function saveTex(page) {
  const dialogs = [];
  const onDialog = async dialog => { dialogs.push(dialog.message()); await dialog.accept(); };
  page.on('dialog', onDialog);
  const downloadPromise = page.waitForEvent('download', { timeout: 12000 }).catch(() => null);
  const fileTab = page.locator('.ribbon-tabs [data-group=files]');
  if (await fileTab.count()) { await fileTab.click(); await page.waitForTimeout(300); }
  await page.locator('#download').click();
  const download = await downloadPromise;
  const status = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
  page.off('dialog', onDialog);
  if (!download) return { error: 'no download', status, dialogs };
  const zipPath = await download.path();
  const buffer = readFileSync(zipPath);
  const entry = unzipFirstTex(buffer);
  return {
    suggested: download.suggestedFilename(),
    bytes: buffer.length,
    status,
    dialogs,
    texEntry: entry?.name ?? null,
    tex: entry?.content ?? null,
    hasChinese: Boolean(entry?.content && entry.content.includes('中文')),
    hasCtex: Boolean(entry?.content && /\\usepackage(?:\[[^\]]*\])?\{[^}]*ctex/.test(entry.content)),
  };
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  const report = { generatedBy: 'tests/chinese-browser-baseline.cjs', imported: null, saved: null, pasted: null, table: null, projectSave: 'deferred to step 4 (save-chain tests)', errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'zh-CN' });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // Import + measure.
    await upload(page, 'chinese-article.tex', ARTICLE);
    report.imported = await measure(page);

    // Save round trip of the untouched import.
    try { report.saved = await saveTex(page); }
    catch (error) { report.saved = { error: String(error && error.message || error) }; }

    // Paste Chinese into a fresh document.
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('.ProseMirror').click();
    await page.keyboard.insertText('中文粘贴测试，第二句与 Latin。');
    await page.waitForTimeout(1200);
    report.pasted = await measure(page);

    // Table: caption DOM identity across a real "+" row insertion and the tab state.
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await upload(page, 'chinese-table.tex', TABLE);
    await page.waitForFunction(() => document.querySelector('.ProseMirror table'));
    await page.waitForTimeout(800);
    const table = await page.evaluate(() => {
      const caption = document.querySelector('.table-caption-widget');
      if (caption) caption.dataset.lineaeProbe = 'baseline';
      const cell = document.querySelector('.ProseMirror table td');
      cell?.scrollIntoView({ block: 'center' });
      return { hadCaption: Boolean(caption), captionText: caption?.textContent ?? '' };
    });
    const cellBox = await page.locator('.ProseMirror table td').last().boundingBox();
    if (cellBox) {
      await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height - 2);
      await page.waitForTimeout(250);
      const insert = await page.evaluate(() => {
        const button = document.querySelector('.table-insert-row');
        if (!button || button.hidden) return null;
        const rect = button.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      if (insert) await page.mouse.click(insert.x, insert.y);
      await page.waitForTimeout(1200);
    }
    await page.locator('.ProseMirror table td').first().click();
    await page.waitForTimeout(700);
    report.table = await page.evaluate(() => {
      const marked = document.querySelector('[data-lineae-probe="baseline"]');
      const captions = [...document.querySelectorAll('.table-caption-widget')];
      return {
        captionSame: Boolean(marked),
        captionCount: captions.length,
        captionTexts: captions.map(caption => caption.textContent),
        tableTabVisible: Boolean(document.querySelector('.ribbon-tabs [data-group=table]') && !document.querySelector('.ribbon-tabs [data-group=table]').hidden),
        ribbonPage: document.querySelector('.ribbon')?.dataset.ribbonPage ?? null,
      };
    });

    writeFileSync(join(expected, 'browser-baseline.json'), JSON.stringify(report, null, 1) + '\n', 'utf8');
    assert.deepEqual(report.errors, []);
    assert.ok(report.imported?.text.includes('中文'), 'imported document keeps Chinese text');
    assert.ok(report.imported?.pageCount, 'imported document has a page count');
    assert.ok(report.pasted?.text.includes('中文粘贴'), 'pasted Chinese text is present');
    assert.ok(report.table?.captionCount >= 0, 'table baseline recorded');
    console.log('PASS Chinese browser baseline');
    console.log(JSON.stringify({ imported: report.imported, saved: report.saved && { hasChinese: report.saved.hasChinese, hasCtex: report.saved.hasCtex, bytes: report.saved.bytes }, table: report.table }, null, 1));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
