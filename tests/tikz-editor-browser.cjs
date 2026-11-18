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
    await page.getByRole('button', { name: /TikZ/ }).click();
    await page.waitForTimeout(900);

    const symbols = page.locator('.tikz-tree .tikz-sym');
    assert.equal(await symbols.count(), 410, 'Basic + 402 library symbols are listed');
    assert.equal(await page.locator('.tikz-zoom-slider').inputValue(), '100', 'default zoom is 100% of one textwidth');

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

    // Missing artwork fallback: American voltage source shows +/- and exposes
    // both polarity points as snap points.
    await place('Sources and generators', 'Voltage source (american)', .70, .70);
    assert.equal(await page.locator('.tikz-layer-items circle').count(), 7, 'voltage source has START/END, +/- snap points and two adjustment handles');
    const voltageBox = await page.locator('.tikz-layer-items > [data-uid]').last().boundingBox();
    await page.locator('.tikz-tools button[data-tool=eraser]').click();
    await page.mouse.click(voltageBox.x + voltageBox.width / 2, voltageBox.y + voltageBox.height / 2);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.tikz-layer-items > [data-uid]').count(), 6, 'eraser removes only the voltage source');

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
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.tikz-code-preview-svg').count(), 1, 'inserted CircuiTikZ has an incremental SVG preview');
    const tikz = await page.locator('.ProseMirror pre code').innerText();
    assert.doesNotMatch(tikz, /\\resizebox\{/);
    assert.match(tikz, /\\node\[npn, bodydiode\]/);
    assert.match(tikz, /\\node\[transformer, cute\]/);
    assert.match(tikz, /\\draw .* to\[vco, box\]/);
    assert.deepEqual(errors, [], 'TikZ editor has no page errors');
    console.log('TikZ editor browser regressions passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
