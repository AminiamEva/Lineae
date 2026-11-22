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
const source = [
  '\\documentclass{article}', '\\begin{document}', '', 'Before.', '',
  '\\includegraphics[width=0.3\\linewidth]{a.png}', '',
  '\\includegraphics[width=0.3\\linewidth]{b.png}', '',
  '\\includegraphics[width=0.3\\linewidth]{c.png}', '',
  'After.', '', '\\end{document}', '',
].join('\n');

const documentData = page => page.locator('.ProseMirror').evaluate(element => ({
  selection: element.editor.state.selection.constructor.name,
  from: element.editor.state.selection.from,
  to: element.editor.state.selection.to,
  content: element.editor.getJSON().content.map(node => ({ type: node.type, attrs: node.attrs, children: node.content?.map(child => ({ type: child.type, attrs: child.attrs })) })),
}));

async function attachImages(page) {
  const figures = page.locator('figure.document-image');
  for (const [index, name] of ['a.png', 'b.png', 'c.png'].entries()) {
    const figure = figures.nth(index);
    const chooser = page.waitForEvent('filechooser');
    await figure.getByRole('button', { name: new RegExp(name.replace('.', '\\.')) }).click();
    await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: PNG });
    await figure.locator('img').waitFor({ state: 'visible' });
  }
}

async function dragSelectAll(page) {
  const images = page.locator('figure.document-image img');
  const first = await images.first().boundingBox();
  const last = await images.last().boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + 12);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const editor = document.querySelector('.ProseMirror').editor;
    return editor.state.selection.constructor.name.includes('TextSelection') && !editor.state.selection.empty;
  });
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('input[type=file]').setInputFiles({ name: 'images.tex', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.querySelectorAll('figure.document-image').length === 3);
    await attachImages(page);
    await revealToolbar(page);

    // Dragging from the first image to the last must select all of them.
    await dragSelectAll(page);
    let data = await documentData(page);
    assert.equal(data.selection, '_TextSelection');
    assert.deepEqual(data.content.map(node => node.type), ['paragraph', 'documentImage', 'documentImage', 'documentImage', 'paragraph']);
    assert.equal(data.to - data.from, 3, 'the range covers the three atom images');
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').isVisible(), true, 'Image tab appears for multi-image selection');
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').getAttribute('aria-pressed'), 'true', 'Image tab is active for multi-image selection');
    assert.equal(await page.locator('.image-group-button').innerText(), 'Combine as subfigure');
    assert.equal(await page.locator('.image-group-button').isDisabled(), false);
    assert.equal(await page.evaluate(() => document.querySelector('.image-tools [data-ribbon-group="image-transform"]').classList.contains('is-disabled')), true, 'other image controls are disabled');

    // Right-clicking must not collapse the multi-image range.
    const lastImage = await page.locator('figure.document-image img').last().boundingBox();
    await page.mouse.click(lastImage.x + lastImage.width / 2, lastImage.y + lastImage.height / 2, { button: 'right' });
    await page.waitForTimeout(250);
    const afterRightClick = await documentData(page);
    assert.equal(afterRightClick.selection, '_TextSelection', 'right-click preserves the range selection');
    assert.equal(afterRightClick.from, data.from);
    assert.equal(afterRightClick.to, data.to);
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').getAttribute('aria-pressed'), 'true', 'Image tab stays active after right-click');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // Combine into a subfigure environment.
    await page.evaluate(() => document.querySelector('.image-group-button').click());
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getJSON().content.some(node => node.type === 'subfigures'));
    data = await documentData(page);
    const subfigures = data.content.find(node => node.type === 'subfigures');
    assert.ok(subfigures, 'a subfigures node is created');
    assert.equal(subfigures.children.length, 3);
    assert.equal(data.content.filter(node => node.type === 'documentImage').length, 0, 'images move inside the subfigures node');
    for (const child of subfigures.children) {
      assert.equal(child.attrs.figure, false, 'conflicting figure wrapper is cleared');
      assert.equal(child.attrs.wrap, false, 'conflicting wrap wrapper is cleared');
      assert.equal(child.attrs.figureSource, null, 'raw figure source is cleared');
    }
    assert.equal(await page.locator('.ribbon-tabs [data-group=subfigure]').isVisible(), true, 'Subfigure tab appears');
    assert.equal(await page.locator('.ribbon-tabs [data-group=subfigure]').getAttribute('aria-pressed'), 'true', 'Subfigure tab is active');
    assert.equal(await page.locator('.subfigure-tools').isVisible(), true, 'Subfigure toolbar is shown');
    assert.equal(await page.locator('.subfigure-tools .subfigure-ungroup').isDisabled(), false);

    // The serialized environment has one figure wrapper and three subfigures.
    await page.locator('[data-source-mode="source"]').click();
    await page.locator('.tex-code .cm-content').waitFor();
    const tex = await page.locator('.tex-code .cm-content').innerText();
    assert.equal((tex.match(/\\begin\{figure\}/g) || []).length, 1);
    assert.equal((tex.match(/\\begin\{subfigure\}/g) || []).length, 3);
    assert.equal((tex.match(/\\end\{subfigure\}/g) || []).length, 3);
    await page.locator('[data-source-mode="body"]').click();
    await page.locator('.ProseMirror').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    // Selecting an image inside the subfigure turns the image-toolbar action into Ungroup.
    await page.locator('.document-subfigures img').first().click();
    await page.waitForFunction(() => document.querySelector('.image-group-button')?.textContent?.includes('Ungroup'));
    assert.equal(await page.locator('.image-group-button').innerText(), 'Ungroup');
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').getAttribute('aria-pressed'), 'true', 'Image tab becomes active inside a subfigure');
    await page.evaluate(() => document.querySelector('.image-group-button').click());
    await page.waitForFunction(() => !document.querySelector('.ProseMirror').editor.getJSON().content.some(node => node.type === 'subfigures'));
    data = await documentData(page);
    assert.equal(data.content.filter(node => node.type === 'documentImage').length, 3, 'Ungroup restores the three images');

    // Regroup and use the dedicated Ungroup button on the Subfigure tab.
    await dragSelectAll(page);
    await page.evaluate(() => document.querySelector('.image-group-button').click());
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getJSON().content.some(node => node.type === 'subfigures'));
    assert.equal(await page.locator('.ribbon-tabs [data-group=subfigure]').isVisible(), true);
    await page.evaluate(() => document.querySelector('.subfigure-tools .subfigure-ungroup').click());
    await page.waitForFunction(() => !document.querySelector('.ProseMirror').editor.getJSON().content.some(node => node.type === 'subfigures'));
    data = await documentData(page);
    assert.equal(data.content.filter(node => node.type === 'documentImage').length, 3, 'Subfigure tab Ungroup restores the images');

    // A broader selection that also includes text still opens the Image toolbar.
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.selectAll());
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.state.selection.constructor.name.includes('AllSelection'));
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').isVisible(), true, 'Image tab opens for a selection that includes images and text');
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').getAttribute('aria-pressed'), 'true');

    assert.deepEqual(errors, []);
    console.log('PASS image multi-selection and subfigure grouping');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
