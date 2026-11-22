const { revealToolbar } = require('./workspace-ui-helpers.cjs');
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
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=', 'base64');
const sentence = 'The quick brown fox jumps over the lazy dog while the typesetter balances lines around the floating figure. ';
const paragraph = sentence.repeat(26);
const source = (side, lines, overhang) => `\\documentclass{article}\\usepackage{wrapfig}\\usepackage{graphicx}\n\\begin{document}\n\\begin{wrapfigure}${lines}{${side}}${overhang}{0.2\\linewidth}\n\\includegraphics[width=\\linewidth]{plot.png}\n\\end{wrapfigure}\n${paragraph}\n\\end{document}\n`;

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await revealToolbar(page);
    for (const { side, lines, overhang } of [
      { side: 'r', lines: '[12]', overhang: '' },
      { side: 'l', lines: '[12]', overhang: '' },
      { side: 'r', lines: '', overhang: '' },
      { side: 'r', lines: '[12]', overhang: '[10pt]' },
    ]) {
      const label = `${side}-${lines ? 'explicit' : 'computed'}-${overhang ? 'overhang' : 'plain'}`;
      await page.locator('input[type=file]').setInputFiles({ name: `wrap-${label}.tex`, mimeType: 'text/plain', buffer: Buffer.from(source(side, lines, overhang)) });
      const figure = page.locator('figure.document-image[data-wrap="true"]');
      await figure.waitFor();
      const chooser = page.waitForEvent('filechooser');
      await figure.getByRole('button', { name: /plot\.png/ }).click();
      await (await chooser).setFiles({ name: 'plot.png', mimeType: 'image/png', buffer: PNG });
      await figure.locator('img').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('.ProseMirror p')?.hasAttribute('data-tex-paragraph'));
      await page.waitForTimeout(500);
      const data = await page.evaluate(side => {
        const p = document.querySelector('.ProseMirror p');
        const figure = document.querySelector('figure.document-image[data-wrap="true"]');
        const style = getComputedStyle(p);
        const lineHeight = parseFloat(style.lineHeight);
        const page = document.querySelector('.document-page');
        const intextsepText = getComputedStyle(page).getPropertyValue('--image-intextsep') || '12pt';
        const intextsep = /^([\d.]+)(pt|cm|mm|in)$/.exec(intextsepText.trim());
        const intextsepPx = intextsep ? Number(intextsep[1]) * { pt: 4 / 3, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[intextsep[2]] : 16;
        const lines = new Map();
        let previous = null;
        const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) {
          const text = walk.currentNode;
          if (text.parentElement.closest('.ProseMirror-widget')) continue;
          for (let index = 0; index < text.length; index++) {
            const range = document.createRange();
            range.setStart(text, index);
            range.setEnd(text, index + 1);
            const rect = range.getBoundingClientRect();
            if (/\s/.test(text.data[index])) { if (previous !== null) lines.get(previous).text += text.data[index]; continue; }
            if (!rect.width && !rect.height) continue;
            const key = Math.round(rect.top * 10) / 10;
            previous = key;
            if (!lines.has(key)) lines.set(key, { text: '', x: rect.left, right: rect.right, y: rect.top });
            const line = lines.get(key);
            line.text += text.data[index];
            line.right = Math.max(line.right, rect.right);
          }
        }
        const figureRect = figure.getBoundingClientRect();
        const figureStyle = getComputedStyle(figure);
        const overhangText = (figure.dataset.wrapOverhang || '').trim();
        const overhangMatch = /^([\d.]+)(pt|cm|mm|in)$/.exec(overhangText);
        const overhangPx = overhangMatch ? Number(overhangMatch[1]) * { pt: 4 / 3, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[overhangMatch[2]] : 0;
        return {
          n: Number(figure.dataset.wrapLines),
          start: Number(figure.dataset.wrapStart || 0),
          side: figure.dataset.wrapSide,
          lineHeight,
          intextsep: intextsepPx,
          overhang: overhangPx,
          figure: {
            left: figureRect.left,
            right: figureRect.right,
            top: figureRect.top,
            bottom: figureRect.bottom,
            height: figure.offsetHeight,
            marginTop: parseFloat(figureStyle.marginBlockStart) || 0,
            marginBottom: parseFloat(figureStyle.marginBlockEnd) || 0,
            columnsep: side === 'l' ? parseFloat(figureStyle.marginInlineEnd) || 0 : parseFloat(figureStyle.marginInlineStart) || 0,
          },
          lines: [...lines.values()].filter(line => line.text.trim()).map(line => ({ text: line.text.trim(), x: line.x, right: line.right, y: line.y })),
        };
      }, side);
      console.log('WRAP ' + label + ' ' + JSON.stringify({ n: data.n, start: data.start, lineHeight: data.lineHeight, lines: data.lines.length, figure: data.figure, overhang: data.overhang }));
      assert.ok(data.n >= 1, 'The kernel publishes the wrap line count');
      assert.ok(data.lines.length > data.start + data.n, 'The paragraph has lines after the wrap');
      if (data.start) {
        const before = data.lines[data.start - 1];
        if (side === 'r') assert.ok(before.right > data.figure.left, 'The line above the float uses the full width');
        else assert.ok(before.x < data.figure.right, 'The line above the float uses the full width');
      }
      for (let index = data.start; index < data.start + data.n; index++) {
        const line = data.lines[index];
        if (side === 'r') {
          const target = data.figure.left - data.figure.columnsep + data.overhang;
          assert.ok(line.right <= target + 1.5, `${label} right wrap narrows line ${index}: ${line.right} vs ${target}`);
        } else {
          const target = data.figure.right + data.figure.columnsep - data.overhang;
          assert.ok(line.x >= target - 1.5, `${label} left wrap narrows line ${index}: ${line.x} vs ${target}`);
        }
      }
      if (data.overhang) {
        if (side === 'r') {
          const limit = data.figure.left - data.figure.columnsep + data.overhang - 3;
          assert.ok(data.lines.slice(data.start, data.start + data.n).some(line => line.right >= limit), `${label} overhang widens the text area`);
        } else {
          const limit = data.figure.right + data.figure.columnsep - data.overhang + 3;
          assert.ok(data.lines.slice(data.start, data.start + data.n).some(line => line.x <= limit), `${label} overhang widens the text area`);
        }
      }
      const after = data.lines[data.start + data.n];
      if (side === 'r') assert.ok(after.right > data.figure.left, 'The first line after the wrap uses the full width');
      else assert.ok(after.x < data.figure.right, 'The first line after the wrap uses the full width');
      assert.ok(Math.abs(data.figure.marginTop - (data.intextsep + data.lineHeight / 2)) < .6, `Float keeps its top gap: ${data.figure.marginTop} vs ${data.intextsep + data.lineHeight / 2}`);
      const outerHeight = data.figure.height + data.figure.marginTop + data.figure.marginBottom;
      assert.ok(Math.abs(outerHeight - data.n * data.lineHeight) < 1, `Float covers a whole number of lines: ${outerHeight} vs ${data.n * data.lineHeight}`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS wrapfigure line count, narrowing and float anchoring');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
