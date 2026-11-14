const {chromium} = require('playwright');
const {createServer} = require('node:http');
const {readFile, mkdir} = require('node:fs/promises');
const {resolve, extname, sep} = require('node:path');
const assert = require('node:assert/strict');

const root = resolve('apps/web');
const evidence = resolve('test-results/file-tree');
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', {'.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'}[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
const original = '\\documentclass{article}\r\n\\begin{document}\nStandalone paragraph.\r\n\\end{document}\r\n';
let passed = 0;
async function fixture(browser) {
  const page = await browser.newPage({viewport:{width:1440, height:900}});
  page.on('dialog', dialog => dialog.accept());
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('#project-open').waitFor();
  await page.locator('input[type=file]').setInputFiles({name:'standalone.tex', mimeType:'text/plain', buffer:Buffer.from(original)});
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('sessions', {create:true});
    for (const [name, text] of [['main.tex','\\documentclass{article}\n\\begin{document}\nProject main.\n\\end{document}\n'], ['child.tex','Child paragraph.\r\n']]) {
      const stream = await (await dir.getFileHandle(name, {create:true})).createWritable();
      await stream.write(text); await stream.close();
    }
    window.showDirectoryPicker = async () => dir;
  });
  return page;
}
async function openProject(page) {
  await page.locator('#project-open').click();
  await page.waitForFunction(() => document.querySelector('.tex-filename')?.textContent === 'main.tex');
  await page.locator('#project-toggle').click();
}
(async () => {
  await mkdir(evidence, {recursive:true});
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({headless:true, executablePath:process.env.LINEAE_CHROMIUM_EXECUTABLE});
  let page;
  try {
    page = await fixture(browser);
    const rich = page.locator('.ProseMirror');
    await rich.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' Body draft');
    const bodyBefore = await rich.innerText();
    const selectionBefore = await rich.evaluate(node => node.editor.state.selection.toJSON());
    await openProject(page);
    await page.locator('#project-close').click();
    await page.screenshot({path:resolve(evidence, 'standalone-body-return.png')});
    assert.equal(await page.locator('[data-source-mode="body"]').getAttribute('aria-pressed'), 'true', 'Closing a project restores the previous Body mode');
    assert.equal(await rich.innerText(), bodyBefore);
    assert.deepEqual(await rich.evaluate(node => node.editor.state.selection.toJSON()), selectionBefore, 'Body selection is retained');
    await rich.focus(); await page.keyboard.press('Control+z');
    assert.doesNotMatch(await rich.innerText(), /Body draft/, 'Standalone rich undo history survives the project session');
    passed++; console.log('PASS: standalone Body draft, mode, selection and undo survive project open/close');
    await page.close();

    page = await fixture(browser);
    await page.locator('[data-source-mode="split"]').click();
    const code = page.locator('.cm-content');
    await code.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('% standalone draft');
    await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
    const positionBefore = await page.locator('.tex-position').innerText();
    const sourceBefore = await code.innerText();
    await openProject(page);
    assert.equal(await page.locator('[data-source-mode="source"]').getAttribute('aria-pressed'), 'true', 'A first project file starts in Raw mode independently of the standalone mode');
    await page.locator('#project-close').click();
    assert.equal(await page.locator('[data-source-mode="split"]').getAttribute('aria-pressed'), 'true', 'Standalone Split mode is restored');
    assert.equal(await code.innerText(), sourceBefore);
    assert.equal(await page.locator('.tex-position').innerText(), positionBefore, 'CodeMirror cursor is restored');
    await code.focus();
    assert.equal(await page.evaluate(() => window.getSelection().toString()), 'ft', 'CodeMirror selection is restored');
    await page.keyboard.press('Control+z');
    assert.doesNotMatch(await code.innerText(), /standalone draft/, 'Standalone CodeMirror undo history is restored');
    passed++; console.log('PASS: standalone Raw/Split draft, selection and undo survive project open/close');

    // Opening synchronously after source input deliberately cancels the pending
    // preview render. Returning must project the current source, not a stale
    // rich document captured before that input.
    await code.click(); await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End');
    await page.keyboard.insertText(' Pending source edit');
    await page.evaluate(() => document.querySelector('#project-open').click());
    await page.waitForFunction(() => document.querySelector('.tex-filename')?.textContent === 'main.tex');
    await page.locator('#project-toggle').click();
    await page.locator('#project-close').click();
    assert.match(await page.locator('.tex-preview .ProseMirror').innerText(), /Pending source edit/, 'Returning to Split renders source edits whose preview was pending at project open');
    passed++; console.log('PASS: pending source projection is current after returning from a project');

    await openProject(page);
    await page.locator('[data-source-mode="split"]').click();
    await page.locator('.tex-indent-setting input').uncheck();
    await code.click(); await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End');
    await page.keyboard.insertText(' Saved source edit');
    await page.evaluate(() => document.querySelector('#project-save').click());
    await page.waitForFunction(() => document.querySelector('#project-explorer [role="status"]').textContent.includes('Saved'));
    await page.waitForFunction(() => document.querySelector('.tex-preview .ProseMirror').textContent.includes('Saved source edit'), null, {timeout:3000});
    passed++; console.log('PASS: saving before the pending preview render preserves source-to-Split synchronization');
    await page.locator('.tex-preview .ProseMirror').click();
    await page.keyboard.press('Control+End'); await page.keyboard.insertText(' Main rich draft');
    await page.waitForFunction(() => document.querySelector('.cm-content').textContent.includes('Main rich draft'));
    await page.evaluate(() => { window.originalCodeMirrorNode = document.querySelector('.cm-editor'); });
    await page.locator('[data-path="child.tex"]').click();
    assert.equal(await page.locator('[data-source-mode="source"]').getAttribute('aria-pressed'), 'true', 'Unvisited files start in Raw, not the preceding file\'s Split mode');
    await code.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' Child own draft');
    await page.locator('[data-path="main.tex"]').click();
    assert.equal(await page.locator('[data-source-mode="split"]').getAttribute('aria-pressed'), 'true');
    assert.match(await code.innerText(), /Main rich draft/);
    assert.doesNotMatch(await code.innerText(), /Child own draft/);
    await page.locator('.tex-preview .ProseMirror').focus(); await page.keyboard.press('Control+z');
    assert.doesNotMatch(await code.innerText(), /Main rich draft/, 'Split undo applies only to the active file');
    await page.locator('[data-path="child.tex"]').click();
    assert.match(await code.innerText(), /Child own draft/);
    await code.focus(); await page.keyboard.press('Control+z');
    assert.doesNotMatch(await code.innerText(), /Child own draft/);
    for (let i = 0; i < 12; i++) await page.locator(`[data-path="${i % 2 ? 'child.tex' : 'main.tex'}"]`).click();
    assert.equal(await page.evaluate(() => window.originalCodeMirrorNode === document.querySelector('.cm-editor')), true, 'File switching reuses the CodeMirror view');
    await page.screenshot({path:resolve(evidence, 'file-sessions-after.png')});
    passed++; console.log('PASS: independent Raw/Split preference, rich undo and drafts across repeated file switching; stable CodeMirror view');
    console.log(`File-tree session E2E: ${passed}/5 scenarios passed`);
  } catch (error) {
    if (page) await page.screenshot({path:resolve(evidence, 'sessions-failure.png')});
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => {console.error(error); process.exitCode = 1; server.close();});
