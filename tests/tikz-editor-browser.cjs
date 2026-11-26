const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve('apps/web');
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
  const path = resolve(root, '.' + pathname);
  if (!path.startsWith(root + sep)) return response.writeHead(403).end();
  try {
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('.ribbon-tabs [data-group=insert]').click();
    await page.getByRole('button', { name: 'CircuiTikZ', exact: true }).click();
    await page.waitForTimeout(900);

    const symbols = page.locator('.tikz-tree .tikz-sym');
    assert.equal(await symbols.count(), 410, 'Basic + 402 library symbols are listed');
    assert.equal(await page.locator('.tikz-zoom-slider').inputValue(), '100', 'default zoom is 100% of one textwidth');
    assert.equal(await page.locator('.tikz-layer-grid circle').count(), 0, 'canvas uses a line grid, not a dot grid');
    assert.ok(await page.locator('.tikz-layer-grid path').count() >= 2, 'minor and major grid lines are rendered');
    assert.equal(await page.locator('.tikz-canvas-wrap').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)', 'editor canvas has a white background');

    assert.match(await page.locator('.tikz-property-panel').innerText(), /Environment Variable Presets/);
    const canvas = page.locator('.tikz-canvas');
    const box = await canvas.boundingBox();
    const place = async (group, name, x, y) => {
      const details = page.locator('.tikz-tree details').filter({ hasText: group });
      if (!await details.evaluate(element => element.open)) await details.locator('summary').click();
      await details.getByRole('button', { name, exact: true }).click();
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await page.waitForTimeout(250);
    };

    // Node: NPN has B/C/E; bodydiode adds two body pins.
    await place('Transistors', 'NPN', .35, .30);
    assert.equal(await page.locator('.tikz-layer-items circle').count(), 3, 'NPN exposes B/C/E');
    const panelText = await page.locator('.tikz-property-panel').innerText();
    for (const heading of ['Manipulation', 'Ordering', 'Options', 'Text', 'Stroke', 'Fill', 'Component style', 'Info']) {
      assert.ok(panelText.includes(heading), 'property panel includes ' + heading);
    }
    const bodydiode = page.locator('.tikz-options input[type=checkbox]').nth(2);
    await bodydiode.check();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.tikz-layer-items circle').count(), 5, 'bodydiode variant exposes five pins');

    // Node style: Transformer opens the american variant and switches to cute.
    await place('Inductors', 'Transformer', .55, .30);
    assert.equal(await page.locator('.tikz-layer-items circle').count(), 8, 'Transformer variant pins A1/A2/B1/B2 and dots');
    const style = page.locator('.tikz-options select').first();
    assert.equal(await style.inputValue(), 'american');
    await style.selectOption('cute');
    await page.waitForTimeout(250);
    assert.equal(await style.inputValue(), 'cute');
    assert.equal(await page.locator('.tikz-layer-items circle').count(), 8);

    // Path: VCO default endpoints, then box variant adds four side pins.
    await place('Block diagram', 'VCO', .35, .60);
    assert.equal(await page.locator('.tikz-layer-items circle[fill="#ffb020"]').count(), 2, 'path has two adjustment endpoints');
    assert.equal(await page.locator('.tikz-layer-items circle').count(), 2, 'VCO default has only START/END');
    await page.locator('.tikz-options input[type=checkbox]').check();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.tikz-layer-items circle').count(), 6, 'VCO box adds four side pins');

    // Basic adjustment points: rectangle has four corners; open has two ends.
    await place('Basic', 'Rectangle', .70, .20);
    assert.equal(await page.locator('.tikz-layer-items circle[fill="#ffb020"]').count(), 4, 'rectangle exposes four corners');
    await place('Basic', 'Open', .70, .40);
    assert.equal(await page.locator('.tikz-layer-items circle[fill="#ffb020"]').count(), 2, 'open exposes both ends');

    // Path: resistor endpoints produce leads when dragged apart.
    await place('Resistive bipoles', 'Resistor (american)', .55, .60);
    const endpoints = page.locator('.tikz-layer-items circle[fill="#ffb020"]');
    assert.equal(await endpoints.count(), 2);
    const right = await endpoints.nth(1).boundingBox();
    await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2);
    await page.mouse.down();
    await page.mouse.move(right.x + 100, right.y + right.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.tikz-layer-items > [data-uid]').last().locator('line').count(), 2, 'path endpoints are connected to the natural symbol with two leads');
    assert.equal(await page.locator('.tikz-layer-items > [data-uid]').last().locator('line').first().getAttribute('stroke-width'), '1', 'path leads use the hairline wire width');

    // Capacitor label: text, side and distance are editable and exported.
    await place('Capacitive and dynamic bipoles', 'Capacitor', .78, .52);
    const setField = async (name, value) => {
      await page.evaluate(([name, value]) => {
        const label = [...document.querySelectorAll('.tikz-property-panel label')]
          .find(node => node.querySelector('span')?.textContent === name);
        const control = label?.querySelector('input,select,textarea');
        if (!control) return;
        control.value = value;
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }, [name, value]);
      await page.waitForTimeout(120);
    };
    await setField('Label', 'C_1');
    await setField('Label orientation', 'below');
    await setField('Label distance (cm)', '0.25');
    await page.waitForTimeout(150);
    assert.ok(await page.locator('.tikz-layer-items foreignObject').count() > 0, 'label math renders on the canvas');
    await page.evaluate(() => document.fonts.ready);
    const labelFonts = await page.evaluate(() => {
      const math = document.querySelector('.tikz-layer-items foreignObject math');
      return { family: math ? getComputedStyle(math).fontFamily : '', loaded: document.fonts.check('16px "Latin Modern Math"') };
    });
    assert.match(labelFonts.family, /Latin Modern Math/, 'label math uses Latin Modern Math');
    assert.ok(labelFonts.loaded, 'Latin Modern Math is loaded');

    // Instruments must keep the artwork fill so their letter glyphs stay visible.
    await place('Instruments', 'Ampere meter', .25, .72);
    const meter = page.locator('.tikz-layer-items > [data-uid]').last();
    assert.equal(await meter.locator('use').first().getAttribute('href'), '#path_ammeter', 'meter renders the real symbol artwork');
    assert.equal(await meter.locator('use').first().getAttribute('fill'), null, 'meter artwork is not stripped of its fill');

    // American voltage source uses the real artwork (plus/minus signs) instead of a fallback.
    await place('Sources and generators', 'Voltage source (american)', .25, .82);
    const source = page.locator('.tikz-layer-items > [data-uid]').last();
    assert.equal(await source.locator('use').first().getAttribute('href'), '#path_american-voltage-source', 'american voltage source renders the real artwork');
    assert.equal(await source.locator('use').first().getAttribute('fill'), null, 'voltage source artwork keeps its sign fill');
    assert.equal(await source.locator('circle').count(), 0, 'no fallback circle is drawn for the voltage source');


    // Multi-selection exposes the Designer selection form.
    const firstItem = await page.locator('.tikz-layer-items > [data-uid]').nth(0).boundingBox();
    await page.keyboard.down('Shift');
    await page.mouse.click(firstItem.x + firstItem.width / 2, firstItem.y + firstItem.height / 2);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(250);
    assert.match(await page.locator('.tikz-selection-info').innerText(), /2 selected/);
    const multiPanel = await page.locator('.tikz-property-panel').innerText();
    for (const heading of ['Align', 'Distribute', 'Shared properties']) assert.ok(multiPanel.includes(heading));
    const itemsBeforeGroup = await page.locator('.tikz-layer-items > [data-uid]').count();
    await page.getByRole('button', { name: 'Group', exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.tikz-layer-items > [data-uid]').count(), itemsBeforeGroup - 1, 'grouping replaces selected components with one group');
    await page.getByRole('button', { name: 'Ungroup', exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.tikz-layer-items > [data-uid]').count(), itemsBeforeGroup, 'ungrouping restores components');

    // Pan tool changes the canvas transform rather than moving a component.
    const beforePan = await page.locator('.tikz-layer-items').getAttribute('transform');
    await page.locator('.tikz-tools button[data-tool=pan]').click();
    await page.mouse.move(box.x + 400, box.y + 500);
    await page.mouse.down();
    await page.mouse.move(box.x + 460, box.y + 540, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert.notEqual(await page.locator('.tikz-layer-items').getAttribute('transform'), beforePan, 'pan changes the view transform');

    await page.locator('.tikz-finish').click();
    await page.locator('.document-image-tikz svg').waitFor({ state: 'visible', timeout: 120000 });
    assert.equal(await page.locator('.document-image-tikz svg').count(), 1, 'inserted CircuiTikZ has a complete TeX-rendered preview');
    assert.ok(await page.locator('.document-image-tikz.natural-size').count() > 0, 'TikZ preview uses its intrinsic size instead of stretching to the text width');
    const tikz = await page.locator('.ProseMirror').evaluate(element => element.editor.getJSON().content.find(node => node.type === 'documentImage')?.attrs?.tikzSource ?? '');
    assert.equal(await page.locator('.ProseMirror').evaluate(element => element.editor.getJSON().content.find(node => node.type === 'documentImage')?.attrs?.tikzEditor), 'circuit', 'CircuiTikZ uses the circuit editor');
    assert.doesNotMatch(tikz, /\\resizebox\{/);
    assert.match(tikz, /\\node\[npn, bodydiode\]/);
    assert.match(tikz, /\\node\[transformer, cute\]/);
    assert.match(tikz, /\\draw .* to\[vco, box\]/);
    assert.match(tikz, /to\[capacitor, l_=\{\$C_1\$\}, label distance=0\.25cm\]/, 'capacitor label side and distance are exported');
    await page.locator('.document-image-tikz').dblclick();
    await page.locator('.tikz-window').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('.tikz-layer-items > [data-uid]').length > 0);
    assert.ok(await page.locator('.tikz-layer-items > [data-uid]').count() > 0, 'double-click opens the CircuiTikZ editor with the current drawing');
    const origin = await page.evaluate(() => {
      const layer = document.querySelector('.tikz-layer-items');
      const canvas = document.querySelector('.tikz-canvas').getBoundingClientRect();
      const match = /translate\(([\d.]+),([\d.]+)\)/.exec(layer.getAttribute('transform') || '');
      return match ? { x: Number(match[1]), y: Number(match[2]), w: canvas.width, h: canvas.height } : null;
    });
    assert.ok(origin && Math.abs(origin.x - origin.w / 2) < 2 && Math.abs(origin.y - origin.h / 2) < 2, 'editor centers the world origin');
    await page.locator('.tikz-exit').click();
    assert.deepEqual(errors, [], 'TikZ editor has no page errors');
    console.log('TikZ editor browser regressions passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
