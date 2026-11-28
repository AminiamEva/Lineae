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
    // Selecting the whole group shows the Image (Figure) tab with per-image and
    // wrap controls disabled; the group is edited as a single figure float.
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.state.selection.constructor.name.includes('NodeSelection'));
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').isVisible(), true, 'Image tab appears for the subfigure group');
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').getAttribute('aria-pressed'), 'true', 'Image tab is active for the subfigure group');
    assert.equal(await page.locator('.ribbon-tabs [data-group=subfigure]').isVisible(), false, 'Subfigure tab is hidden for the group');
    assert.equal(await page.locator('.image-group-button').innerText(), 'Ungroup');
    assert.equal(await page.locator('.image-group-button').isDisabled(), false);
    assert.equal(await page.evaluate(() => document.querySelector('.image-tools [data-ribbon-group="image-transform"]').classList.contains('is-disabled')), true, 'per-image controls are disabled for a group');
    assert.equal(await page.getByLabel('Wrap text').isDisabled(), true, 'wrap is disabled for a group');
    for (const child of subfigures.children) {
      assert.equal(child.attrs.width, '0.3\\linewidth', 'grouping inherits each image width');
      assert.equal(child.attrs.pos, 'c', 'subfigures default to centered vertical alignment');
    }
    assert.equal(await page.locator('.image-tools').getByLabel('Alignment',{exact:true}).inputValue(), 'center', 'figure alignment defaults to center');
    const subLabels=page.locator('.document-subfigures .document-image .document-caption-label');
    assert.ok((await subLabels.first().textContent()).includes('(a)'), 'subfigure label shows its letter');
    assert.equal(await subLabels.first().evaluate(element=>getComputedStyle(element,'::before').content), 'none', 'subfigure caption omits the figure number');

    // The main caption is edited on canvas, mirroring the child-figure caption editor.
    await page.getByLabel('Enable caption').check();
    const mainCaption=page.locator('.document-subfigures-caption .document-caption-text');
    await mainCaption.waitFor({ state:'visible' });
    await mainCaption.click();
    await mainCaption.type('uohut');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    data = await documentData(page);
    assert.equal(data.content.find(node => node.type === 'subfigures').attrs.caption, 'uohut', 'main caption is edited on canvas');
    const mainLabelBefore=await page.locator('.document-subfigures-caption .document-caption-label').evaluate(element=>getComputedStyle(element,'::before').content);
    assert.ok(mainLabelBefore.includes('Figure 1'), 'main caption label is numbered');

    // The serialized environment has one figure wrapper and three subfigures.
    await page.locator('[data-source-mode="source"]').click();
    await page.locator('.tex-code .cm-content').waitFor();
    const tex = await page.locator('.tex-code .cm-content').innerText();
    assert.equal((tex.match(/\\begin\{figure\}/g) || []).length, 1);
    assert.equal((tex.match(/\\begin\{subfigure\}/g) || []).length, 3);
    assert.equal((tex.match(/\\end\{subfigure\}/g) || []).length, 3);
    assert.ok(tex.includes('\\begin{subfigure}{0.3\\linewidth}'), 'subfigure keeps the inherited width');
    assert.ok(tex.includes('\\includegraphics[width=\\linewidth]'), 'subfigure graphics fill the box width');
    assert.ok(tex.includes('\\end{subfigure}\\quad'), 'the default subfigure gap is quad');
    assert.ok(tex.includes('\\caption{uohut}'), 'the main caption is serialized');
    await page.locator('[data-source-mode="body"]').click();
    await page.locator('.ProseMirror').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    // Selecting one image inside the group opens the Subfigure tab with that
    // subfigure's own width and vertical alignment.
    await page.locator('.document-subfigures img').first().click();
    await page.waitForFunction(() => document.querySelector('.subfigure-tools')?.offsetParent !== null);
    assert.equal(await page.locator('.ribbon-tabs [data-group=subfigure]').isVisible(), true, 'Subfigure tab appears for a single subfigure');
    assert.equal(await page.locator('.ribbon-tabs [data-group=subfigure]').getAttribute('aria-pressed'), 'true', 'Subfigure tab is active for a single subfigure');
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').isVisible(), false, 'Image tab is hidden for a single subfigure');
    assert.equal(await page.locator('.subfigure-tools .subfigure-ungroup').isDisabled(), false);

    await page.getByLabel('Vertical alignment').selectOption('t');
    await page.getByLabel('Subfigure width').fill('0.4\\textwidth');
    await page.getByLabel('Subfigure width').press('Enter');
    await page.waitForTimeout(250);
    data = await documentData(page);
    const adjusted = data.content.find(node => node.type === 'subfigures');
    assert.equal(adjusted.children[0].attrs.pos, 't', 'vertical alignment is stored on the subfigure');
    assert.equal(adjusted.children[0].attrs.width, '0.4\\textwidth', 'width is stored on the subfigure');
    const firstSubfigure=page.locator('.document-subfigures .document-image').first();
    assert.equal(await firstSubfigure.getAttribute('data-subfigure-pos'), 't');
    assert.equal(await firstSubfigure.evaluate(element=>getComputedStyle(element).alignSelf), 'flex-start', 'top alignment uses flex-start');

    await page.locator('[data-source-mode="source"]').click();
    await page.locator('.tex-code .cm-content').waitFor();
    const adjustedTex = await page.locator('.tex-code .cm-content').innerText();
    assert.ok(adjustedTex.includes('\\begin{subfigure}[t]{0.4\\textwidth}'), 'pos and width are serialized');
    await page.locator('[data-source-mode="body"]').click();
    await page.locator('.ProseMirror').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    // Clicking the group handle selects the whole figure and returns to the Image tab.
    await page.locator('.subfigures-select-handle').click();
    await page.waitForFunction(() => {
      const selection = document.querySelector('.ProseMirror').editor.state.selection;
      return selection.constructor.name.includes('NodeSelection') && selection.node?.type?.name === 'subfigures';
    });
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').getAttribute('aria-pressed'), 'true', 'clicking the group selects the whole figure');
    assert.equal(await page.locator('.ribbon-tabs [data-group=subfigure]').isVisible(), false);

    // Ungroup from the Subfigure tab.
    await page.locator('.document-subfigures img').first().click();
    await page.waitForFunction(() => document.querySelector('.subfigure-tools')?.offsetParent !== null);
    await page.evaluate(() => document.querySelector('.subfigure-tools .subfigure-ungroup').click());
    await page.waitForFunction(() => !document.querySelector('.ProseMirror').editor.getJSON().content.some(node => node.type === 'subfigures'));
    data = await documentData(page);
    assert.equal(data.content.filter(node => node.type === 'documentImage').length, 3, 'Ungroup restores the three images');
    assert.ok(data.content.filter(node => node.type === 'documentImage').every(node => node.attrs.width === '0.4\\textwidth' || node.attrs.width === '0.3\\linewidth'), 'split images keep their width');

    // Regroup and ungroup through the Image tab, which is shown for the group.
    await dragSelectAll(page);
    await page.evaluate(() => document.querySelector('.image-group-button').click());
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getJSON().content.some(node => node.type === 'subfigures'));
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').getAttribute('aria-pressed'), 'true', 'Image tab stays active for the newer group');
    await page.evaluate(() => document.querySelector('.image-group-button').click());
    await page.waitForFunction(() => !document.querySelector('.ProseMirror').editor.getJSON().content.some(node => node.type === 'subfigures'));
    data = await documentData(page);
    assert.equal(data.content.filter(node => node.type === 'documentImage').length, 3, 'Image tab Ungroup restores the images');

    // A broader selection that also includes text still opens the Image toolbar.
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.selectAll());
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.state.selection.constructor.name.includes('AllSelection'));
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').isVisible(), true, 'Image tab opens for a selection that includes images and text');
    assert.equal(await page.locator('.ribbon-tabs [data-group=image]').getAttribute('aria-pressed'), 'true');

    // The Subfigure group's Insert figure button appends another subfigure.
    await dragSelectAll(page);
    await page.evaluate(() => document.querySelector('.image-group-button').click());
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getJSON().content.some(node => node.type === 'subfigures'));
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.image-insert-figure').click();
    await (await chooser).setFiles({ name: 'd.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForFunction(() => (document.querySelector('.ProseMirror').editor.getJSON().content.find(node => node.type === 'subfigures')?.content?.length ?? 0) === 4);

    assert.deepEqual(errors, []);
    console.log('PASS image multi-selection and subfigure grouping');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
