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

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('input[type=file]').setInputFiles({
      name: 'image.tex', mimeType: 'text/plain',
      buffer: Buffer.from('\\documentclass{article}\n\\begin{document}\n\n\\includegraphics[width=0.5\\linewidth]{plot.png}\n\n\\end{document}\n'),
    });
    const imageNode = page.locator('figure.document-image');
    await imageNode.waitFor();
    const chooser = page.waitForEvent('filechooser');
    await imageNode.getByRole('button', { name: /plot\.png/ }).click();
    await (await chooser).setFiles({ name: 'plot.png', mimeType: 'image/png', buffer: PNG });
    await imageNode.locator('img').waitFor({ state: 'visible' });
    await imageNode.click();
    await revealToolbar(page);
    await page.locator('.ribbon-tabs [data-group=image]').click();
    await page.locator('.image-tools').waitFor({ state: 'visible' });

    // Caption-dependent controls follow the Enable caption toggle.
    assert.equal(await page.getByLabel('Enable caption').isChecked(), false);
    assert.equal(await page.getByLabel('Numbered caption').isDisabled(), true, 'numbered caption is disabled');
    assert.equal(await page.getByLabel('Caption position').isDisabled(), true, 'caption position is disabled');
    assert.equal(await page.getByLabel('Label', { exact: true }).isDisabled(), true, 'caption label is disabled');
    await page.getByLabel('Enable caption').check();
    await page.waitForFunction(() => !document.querySelector('.image-tools')?.querySelector('input[aria-label="Caption position"]')?.disabled);
    assert.equal(await page.getByLabel('Numbered caption').isDisabled(), false);
    assert.equal(await page.getByLabel('Caption position').isDisabled(), false);
    assert.equal(await page.getByLabel('Label', { exact: true }).isDisabled(), false);

    // Crop is a single button that enters the interactive crop overlay.
    assert.equal(await page.locator('.image-crop').count(), 0, 'numeric crop fields are gone');
    const beforeCrop = await imageNode.locator('.document-image-frame').evaluate(frame => ({ width: frame.clientWidth, height: frame.clientHeight }));
    await page.locator('.image-tools [data-ribbon-group="image-appearance"] .ribbon-group-toggle').click();
    await page.locator('.ribbon-flyout .image-crop-button').click();
    await page.locator('.image-crop-layer').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.image-crop-mask').count(), 4);
    assert.equal(await page.locator('.image-crop-handle').count(), 8);
    const handle = await page.locator('.image-crop-handle[data-crop-dir="e"]').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x - 24, handle.y + handle.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.locator('.image-crop-apply').click();
    await page.waitForFunction(width => document.querySelector('.document-image-frame')?.clientWidth < width, beforeCrop.width);
    const cropGeometry = await imageNode.locator('.document-image-frame').evaluate(frame => {
      const image = frame.querySelector('img');
      const style = getComputedStyle(frame);
      return { width: frame.clientWidth, height: frame.clientHeight, overflow: style.overflow, position: getComputedStyle(image).position, left: image.style.left, top: image.style.top, clip: image.style.clipPath };
    });
    assert.ok(cropGeometry.width < beforeCrop.width, 'the frame shrinks to the visible cropped width');
    assert.equal(cropGeometry.height, beforeCrop.height, 'a horizontal crop keeps the full height');
    assert.notEqual(cropGeometry.overflow, 'hidden', 'resize handles stay usable outside the frame');
    assert.match(cropGeometry.clip, /^inset\(/, 'cropped pixels stay hidden');
    assert.equal(cropGeometry.position, 'absolute', 'the image keeps its uncropped size inside the frame');
    assert.equal(cropGeometry.left, '0px', 'an east-only crop does not shift the image');
    assert.equal(cropGeometry.top, '0px');
    const attrs = await page.locator('.ProseMirror').evaluate(element => element.editor.getJSON().content.find(node => node.type === 'documentImage').attrs);
    assert.match(attrs.cropRight, /cm$/, 'crop is stored as a LaTeX length');
    assert.ok(Number.parseFloat(attrs.cropRight) > 0, 'dragging the east handle crops from the right');

    // The context menu exposes the same crop action; re-entering restores the full image for editing.
    await imageNode.click({ button: 'right' });
    const menu = page.locator('.editor-context-menu');
    await menu.locator('[data-command="image-crop"]').waitFor();
    await menu.locator('[data-command="image-crop"]').click();
    await page.locator('.image-crop-layer').waitFor({ state: 'visible' });
    await page.waitForFunction(width => document.querySelector('.document-image-frame')?.clientWidth > width, cropGeometry.width);
    await page.keyboard.press('Escape');
    await page.locator('.image-crop-layer').waitFor({ state: 'hidden' });
    await page.waitForFunction(width => document.querySelector('.document-image-frame')?.clientWidth === width, cropGeometry.width);

    // With keep-aspect-ratio on, width, height and scale move together.
    const widthNumber = page.locator('.image-tools .image-line input').nth(0);
    const heightNumber = page.locator('.image-tools .image-line input').nth(1);
    const scale = page.locator('.image-tools input[aria-label="Scale"]');
    assert.equal(await page.getByLabel('Keep aspect ratio').isChecked(), true);
    await widthNumber.fill('0.6');
    await widthNumber.dispatchEvent('input');
    await page.waitForFunction(() => document.querySelectorAll('.image-tools .image-line input')[1]?.value === '0.6');
    assert.equal(await heightNumber.inputValue(), '0.6', 'width drives height through the image aspect ratio');
    assert.ok(Number(await scale.inputValue()) > 100, 'width drives the scale value');
    await heightNumber.fill('0.3');
    await heightNumber.dispatchEvent('input');
    await page.waitForFunction(() => document.querySelectorAll('.image-tools .image-line input')[0]?.value === '0.3');
    assert.equal(await widthNumber.inputValue(), '0.3', 'height drives width');
    await scale.fill('100');
    await scale.dispatchEvent('input');
    await page.waitForFunction(() => document.querySelectorAll('.image-tools .image-line input')[0]?.value === document.querySelectorAll('.image-tools .image-line input')[1]?.value);
    assert.equal(await widthNumber.inputValue(), await heightNumber.inputValue(), 'scale 100% restores the natural size in both dimensions');
    assert.ok(Number(await widthNumber.inputValue()) > 0);

    // Wrap text exposes the \centering control immediately after it.
    const wrapText = page.getByLabel('Wrap text');
    const centerWrap = page.getByLabel('Center in wrap');
    for (const label of ['Center in wrap','Wrap side','Wrap width','Overhang','Wrapped lines']) {
      assert.equal(await page.getByLabel(label,{exact:true}).isDisabled(), true, label+' is disabled until wrap text is enabled');
    }
    await wrapText.check();
    await page.waitForFunction(() => !document.querySelector('.image-tools input[aria-label="Center in wrap"]')?.disabled);
    for (const label of ['Center in wrap','Wrap side','Wrap width','Overhang','Wrapped lines']) {
      assert.equal(await page.getByLabel(label,{exact:true}).isDisabled(), false, label+' is enabled when wrap text is on');
    }
    await centerWrap.check();
    await page.waitForFunction(() => document.querySelector('.document-image')?.dataset.centered === 'true');
    const wrapAttrs = await page.locator('.ProseMirror').evaluate(element => element.editor.getJSON().content.find(node => node.type === 'documentImage').attrs);
    assert.equal(wrapAttrs.wrap, true);
    assert.equal(wrapAttrs.centered, true);
    assert.equal(wrapAttrs.align, 'center');
    const gaps = await imageNode.evaluate(figure => {
      const outer = figure.getBoundingClientRect();
      const frame = figure.querySelector('.document-image-frame').getBoundingClientRect();
      return [frame.left - outer.left, outer.right - frame.right];
    });
    assert.ok(Math.abs(gaps[0] - gaps[1]) < 1.5, `Wrap centering balances the side gaps: ${gaps}`);

    assert.deepEqual(errors, []);
    console.log('PASS image caption, crop and aspect-ratio toolbar');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
