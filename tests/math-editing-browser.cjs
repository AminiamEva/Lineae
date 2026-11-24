const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve('apps/web');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', {
      '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.css': 'text/css', '.woff2': 'font/woff2', '.otf': 'font/otf',
    }[extname(path)] ?? 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1280, height: 1000 } });
    const mod=process.platform==='darwin'?'Meta':'Control';
    if(process.env.LINEAE_TEST_NATIVE_PREVIEW==='1')
      await page.addInitScript(require('./native-math/mock-bridge.cjs'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').setInputFiles({
      name: 'math.tex', mimeType: 'text/plain',
      buffer: Buffer.from('\\documentclass{article}\n\\begin{document}\n\\[x\\]\n\\end{document}\n'),
    });
    await page.waitForFunction(() => document.querySelector('math-field')?.value === 'x');
    const field = page.locator('math-field');
    await field.click();
    if(process.env.LINEAE_TEST_NATIVE_PREVIEW==='1') {
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    }
    const reset = async latex => {
      await field.evaluate((field, latex) => {
        // MathLive's replaceAll leaves empty containers behind in 0.108.
        field._mathfield.model.root.setChildren([], 'body');
        field.position = 0;
        field.value = latex;
        field.focus();
        field.position = 0;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }, latex);
      await page.waitForTimeout(30);
      assert.equal(await field.evaluate(field => field.value.replace(/\s|\\nolimits/g, '')), latex.replace(/\s|\\nolimits/g, ''), 'Reset replaces the previous formula');
    };
    const state = () => field.evaluate(field => ({
      value: field.value, position: field.position, ranges: field.selection.ranges,
    }));
    const normalized = value => value.replace(/\s|\\nolimits/g, '');
    // Removing the middle row must not promote a cell boundary to the array.
    for (const backward of [false, true]) {
      await reset('\\begin{gathered}abc\\\\def\\\\ghi\\end{gathered}');
      await field.evaluate((field, backward) => {
        const model = field._mathfield.model;
        const array = model.root.body.find(atom => atom.type === 'array');
        const cell = array.getCell(1, 0);
        field.position = model.offsetOf(backward ? cell.at(-1) : cell[0]);
      }, backward);
      const key = backward ? 'Backspace' : 'Delete';
      for (let i = 0; i < 3; i++) await page.keyboard.press(key);
      assert.equal(normalized((await state()).value), '\\begin{gathered}abc\\\\\\\\ghi\\end{gathered}', 'Only the middle row content is erased');
      await page.keyboard.press(key);
      assert.equal(normalized((await state()).value), '\\begin{gathered}abc\\\\ghi\\end{gathered}', 'Deleting the empty middle row preserves its neighbors');
      assert.ok((await state()).ranges.every(([from, to]) => from === to), 'A cell boundary never selects the whole multiline array');
      await field.evaluate(field => field.executeCommand('undo'));
      assert.equal(normalized((await state()).value), '\\begin{gathered}abc\\\\\\\\ghi\\end{gathered}', 'Undo restores only the empty row');
      await field.evaluate(field => field.executeCommand('redo'));
      assert.equal(normalized((await state()).value), '\\begin{gathered}abc\\\\ghi\\end{gathered}', 'Redo preserves the neighboring rows');
    }
    for (const backward of [false, true]) {
      const key = backward ? 'Backspace' : 'Delete';
      // A selected alignment row can span several cells without selecting its
      // parent; deleting it must retain all the surrounding rows and formulas.
      await reset('\\sqrt{\\begin{aligned}a&b\\\\c&d\\\\e&f\\end{aligned}}');
      await field.evaluate(field => {
        const model = field._mathfield.model;
        const array = model.atoms.find(atom => atom.type === 'array');
        field.selection = { ranges: [[model.offsetOf(array.getCell(1, 0)[0]),
          model.offsetOf(array.getCell(1, 1).at(-1))]], direction: 'forward' };
      });
      await page.keyboard.press(key);
      assert.equal(normalized((await state()).value), '\\sqrt{\\begin{aligned}a&b\\\\&\\\\e&f\\end{aligned}}', 'Selected middle row does not erase the other alignment cells');
      await page.keyboard.press(key);
      assert.equal(normalized((await state()).value), '\\sqrt{\\begin{aligned}a&b\\\\e&f\\end{aligned}}', 'Removing a nested empty alignment row retains its outer radical');

      for (const row of [0, 1, 2]) {
        const rows = ['abc', 'def', 'ghi'];
        rows[row] = '';
        await reset('\\begin{gathered}' + rows.join('\\\\') + '\\end{gathered}');
        await field.evaluate((field, { row, backward }) => {
          const model = field._mathfield.model;
          const array = model.root.body.find(atom => atom.type === 'array');
          const cell = array.getCell(row, 0);
          field.position = model.offsetOf(backward ? cell.at(-1) : cell[0]);
        }, { row, backward });
        await page.keyboard.press(key);
        assert.equal(normalized((await state()).value),
          '\\begin{gathered}' + rows.filter((_, index) => index !== row).join('\\\\') + '\\end{gathered}',
          `Only the empty row ${row} is removed`);
      }
      await reset('\\begin{gathered}abc\\\\def\\\\ghi\\end{gathered}');
      await field.evaluate((field, backward) => {
        const model = field._mathfield.model;
        const array = model.root.body.find(atom => atom.type === 'array');
        const cell = array.getCell(1, 0);
        field.position = model.offsetOf(backward ? cell[0] : cell.at(-1));
      }, backward);
      await page.keyboard.press(key);
      assert.equal(normalized((await state()).value), '\\begin{gathered}abc\\\\def\\\\ghi\\end{gathered}', 'A populated row boundary does not select or delete its parent array');
      assert.ok((await state()).ranges.every(([from, to]) => from === to), 'Boundary navigation keeps a collapsed caret');

      await reset('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
      await field.evaluate(field => {
        const model = field._mathfield.model;
        const array = model.root.body.find(atom => atom.type === 'array');
        field.selection = { ranges: [[model.offsetOf(array.getCell(1, 0)[0]),
          model.offsetOf(array.getCell(1, 0).at(-1))]], direction: 'forward' };
      });
      await page.keyboard.press(key);
      const matrix = (await state()).value;
      await page.keyboard.press(key);
      assert.equal((await state()).value, matrix, 'An empty matrix cell never deletes the rest of the matrix or its row');
      assert.ok((await state()).ranges.every(([from, to]) => from === to), 'Matrix cell boundaries do not select the matrix');
    }
    const structures = [
      ['\\frac{ab}{cd}', 'genfrac'],
      ['\\frac{}{}', 'genfrac'],
      ['\\sqrt{abc}', 'surd'],
      ['\\sqrt{}', 'surd'],
      ['\\mathord{abc}', 'mord'],
      ['\\mathord{}', 'mord'],
      ['\\left(abc\\right)', 'leftright'],
      ['\\hat{abc}', 'accent'],
      ['\\overbrace{abc}', 'overunder'],
      ['\\boxed{abc}', 'box'],
      ['\\operatorname{foo}', 'mop'],
      ['\\begin{matrix}a&b\\\\c&d\\end{matrix}', 'array'],
      ['\\sum_{i=1}^{n}', 'extensible-symbol'],
    ];
    for (const [latex, type] of structures) {
      // Repeat inside a fraction: a nested deletion must never remove its parent.
      for (const nested of [false, true]) {
        for (const backward of [false, true]) {
          await reset(nested ? `\\frac{z+${latex}+w}{uv}` : `z+${latex}+w`);
          const range = await field.evaluate((field, { type, nested }) => {
            const model = field._mathfield.model;
            for (let end = 0; end <= field.lastOffset; end++) {
              const atom = model.at(end);
              if (atom.type !== type || !atom.hasChildren || (nested && atom.parent === model.root)) continue;
              return [model.offsetOf(atom.leftSibling), end];
            }
            throw new Error('Structure not found: ' + type);
          }, { type, nested });
          await field.evaluate((field, position) => { field.position = position; }, range[backward ? 1 : 0]);
          const before = await state();
          const key = backward ? 'Backspace' : 'Delete';
          await page.keyboard.press(key);
          const selected = await state();
          assert.equal(selected.value, before.value, `${key} first preserves ${latex}`);
          assert.deepEqual(selected.ranges, [range], `${key} selects the entire immediate structure, not its last offset`);
          const selectedLatex = await field.evaluate(field => field.getValue(field.selection));
          if (!latex.endsWith('{}')) assert.ok(selectedLatex.length > 0, 'The selection includes visible content');
          await page.keyboard.press(key);
          const removed = await state();
          assert.equal(normalized(removed.value), nested ? '\\frac{z++w}{uv}' : 'z++w', `${key} removes only ${latex}`);
          assert.equal(removed.position, range[0], 'Caret stays before the removed object');
          if (nested && backward && type === 'box') {
            await field.evaluate(field => field.executeCommand('undo'));
            assert.equal(normalized((await state()).value), normalized(before.value), 'Undo restores the nested structure');
            await field.evaluate(field => field.executeCommand('redo'));
            assert.equal(normalized((await state()).value), normalized(removed.value), 'Redo removes only the same nested structure');
          }
        }
      }
    }

    // Delete only the last letter of a slot, retaining its parent and other slots.
    for (const backward of [false, true]) {
      for (const latex of ['\\frac{a}{b}', '\\sqrt{a}', '\\int\\mathord{a}', '\\mathrm{a}', '\\text{a}']) {
        await reset(latex);
        await field.evaluate((field, backward) => {
          const model = field._mathfield.model;
          for (let end = 1; end <= field.lastOffset; end++) {
            if (model.at(end)?.command === 'a') { field.position = backward ? end : end - 1; return; }
          }
          throw new Error('Letter not found');
        }, backward);
        await page.keyboard.press(backward ? 'Backspace' : 'Delete');
        const expected=/^\\(?:mathrm|text)/.test(latex) ? '' : latex.replace('a}', '}');
        assert.equal(normalized((await state()).value), normalized(expected), 'One letter is removed without deleting its parent');
        await page.waitForFunction(() => !document.querySelector('math-field').shadowRoot
          .querySelector('.ML__content').textContent.includes('a'));
      }
    }
    for (const backward of [false, true]) {
      await reset('z+\\int\\mathord{\\placeholder{}}+w');
      await field.evaluate(field => {
        const model = field._mathfield.model;
        for (let offset = 0; offset <= field.lastOffset; offset++) {
          if (model.at(offset).type === 'placeholder') { field.position = offset; return; }
        }
      });
      const key = backward ? 'Backspace' : 'Delete';
      await page.keyboard.press(key);
      assert.match((await state()).value, /\\int/, 'Empty operator is selected before deletion');
      await page.keyboard.press(key);
      assert.equal(normalized((await state()).value), 'z++w', 'Empty operator leaves no stray body');
    }
    await reset('\\int\\mathord{}w');
    await field.evaluate(field => { field.position = field.lastOffset - 1; });
    await page.keyboard.press('Delete');
    assert.equal(normalized((await state()).value), '\\int\\mathord{}', 'Forward Delete after an empty body only removes the following letter');

    for (const backward of [false, true]) {
      await reset('z+\\int\\mathord{abc123}+w');
      await field.evaluate((field, backward) => {
        const model = field._mathfield.model;
        const group = model.root.body.find(atom => atom.command === '\\mathord');
        field.position = model.offsetOf(backward ? group.body.at(-1) : group.body[0]);
      }, backward);
      for (let count = 1; count <= 6; count++) {
        await page.keyboard.press(backward ? 'Backspace' : 'Delete');
        const remaining = backward ? 'abc123'.slice(0, -count) : 'abc123'.slice(count);
        assert.equal(normalized((await state()).value), `z+\\int\\mathord{${remaining}}+w`, 'Integral body is erased one letter/digit at a time');
      }
      await page.keyboard.press(backward ? 'Backspace' : 'Delete');
      assert.equal(normalized((await state()).value), 'z+\\int\\mathord{}+w', 'Empty body first selects its operator');
      await page.keyboard.press(backward ? 'Backspace' : 'Delete');
      assert.equal(normalized((await state()).value), 'z++w', 'Second press removes the empty operator without touching siblings');
    }
    await reset('\\frac{z+\\boxed{abc}+w}{uv}');
    const undoValue = (await state()).value;
    await page.waitForTimeout(600);
    await field.evaluate(field => {
      const model = field._mathfield.model;
      for (let offset = 0; offset <= field.lastOffset; offset++) {
        if (model.at(offset).type === 'box') { field.position = offset; return; }
      }
    });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(50);
    await page.keyboard.press(mod+'+z');
    assert.equal(normalized((await state()).value), normalized(undoValue), 'Editor undo restores the deleted structure');
    await page.keyboard.press(mod+'+y');
    assert.equal(normalized((await state()).value), '\\frac{z++w}{uv}', 'Editor redo does not widen deletion');

    // Real arrow keys must visit every letter/digit, in both directions.
    for (const latex of [
      '\\int\\mathord{abc123}', '\\frac{ab12}{cd34}', '\\sqrt{ab12}',
      '\\text{abc123}', '\\mathrm{abc123}', '\\operatorname{abc123}', 'x^{ab12}',
    ]) {
      for (const backward of [false, true]) {
        await reset(latex);
        const leafOffsets = await field.evaluate((field, backward) => {
          const model = field._mathfield.model;
          const leaves = [];
          for (let offset = 1; offset <= field.lastOffset; offset++) {
            const atom = model.at(offset);
            if (!atom.hasChildren && /^[a-z0-9]$/.test(atom.command)) leaves.push(offset);
          }
          field.position = backward ? field.lastOffset : 0;
          return { leaves, end: backward ? 0 : field.lastOffset, limit: field.lastOffset + 5 };
        }, backward);
        const visited = new Set([(await state()).position]);
        for (let i = 0; i < leafOffsets.limit; i++) {
          if ((await state()).position === leafOffsets.end) break;
          await page.keyboard.press(backward ? 'ArrowLeft' : 'ArrowRight');
          visited.add((await state()).position);
        }
        for (const offset of leafOffsets.leaves) assert.ok(visited.has(offset), `Arrows must not skip leaf ${offset} in ${latex}, backward=${backward}, visited=${[...visited]}`);
      }
    }

    // Empty-row box shares the following row's glyph baseline, even after zoom.
    for (const zoom of [1, 1.5]) {
      await reset('abc');
      await field.evaluate((field, zoom) => { field.style.zoom = zoom; }, zoom);
      await field.evaluate(field => field.executeCommand('moveToMathfieldEnd'));
      await page.dispatchEvent('math-field', 'lineae-math-newline');
      if (zoom === 1) await page.dispatchEvent('math-field', 'lineae-math-newline');
      await page.waitForFunction(() => document.querySelector('math-field').hasAttribute('data-empty-matrix-cell'));
      const hint = await field.evaluate(field => {
        const caret = field.shadowRoot.querySelector('.ML__caret');
        const box = caret.getBoundingClientRect();
        const style = getComputedStyle(caret, '::after');
        return { center: box.y + (parseFloat(style.top) + parseFloat(style.height) / 2) * Number(field.style.zoom),
          fieldCenter: (field.getBoundingClientRect().left + field.getBoundingClientRect().right) / 2,
          containerCenter: (field.parentElement.getBoundingClientRect().left + field.parentElement.getBoundingClientRect().right) / 2 };
      });
      assert.ok(Math.abs(hint.fieldCenter - hint.containerCenter) < 1, 'Hidden drag handle does not shift display math');
      await page.keyboard.type('x');
      await page.waitForFunction(() => !document.querySelector('math-field').hasAttribute('data-empty-matrix-cell'));
      const glyphCenter = await field.evaluate(field => {
        const glyph = [...field.shadowRoot.querySelectorAll('.ML__mathit')].find(el => el.textContent === 'x');
        const rect = glyph.getBoundingClientRect();
        return (rect.top + rect.bottom) / 2;
      });
      assert.ok(Math.abs(glyphCenter - hint.center) < 3 * zoom, 'Empty-row hint is aligned with the typed glyph');
      assert.match((await state()).value, /\\\\ x\\end/);
    }
    await field.evaluate(field => { field.style.zoom = ''; });

    const toggle = page.locator('#toolbar-collapse');
    const expanded = () => toggle.getAttribute('aria-expanded');
    // Give each view a distinct state, then revisit all three.
    if (await expanded() === 'true') await toggle.click();
    await page.locator('[data-source-mode=source]').click();
    if (await expanded() === 'false') await toggle.click();
    await page.locator('[data-source-mode=split]').click();
    if (await expanded() === 'true') await toggle.click();
    for (const [mode, expected] of [['body', 'false'], ['source', 'true'], ['split', 'false'], ['body', 'false']]) {
      await page.locator(`[data-source-mode=${mode}]`).click();
      await page.waitForTimeout(50);
      assert.equal(await expanded(), expected, `${mode} remembers its own toolbar state`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: exact bidirectional math editing, safe multiline deletion, nested structures, row hints, toolbar view memory');
    if(process.env.LINEAE_TEST_NATIVE_PREVIEW==='1')
      console.log('PASS: existing math interaction suite with native preview enabled (mock transport, not native geometry evidence)');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
