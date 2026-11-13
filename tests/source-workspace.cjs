const assert = require('node:assert/strict');
const { mkdir, writeFile, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');

module.exports = async function checkSourceWorkspace(context, url) {
  await require('./source-workspace-lifecycle.cjs')(context, url);
  const page = await context.newPage();
  try {
    await page.setViewportSize({width:1440,height:900});
    await page.goto(url);
    // Observe the exact workspace value passed to the native clipboard API.
    // The original API still performs the Windows clipboard write.
    await page.evaluate(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async text => {
        await write(text);
        window.clipboardProbe = {source:text, readback:await navigator.clipboard.readText()};
      };
    });
    const sample = [
      '\\documentclass{article}', '\\usepackage{amsmath}',
      '\\newcommand{\\energy}[1]{\\left\\lVert #1\\right\\rVert^{2}}',
      '% A nested expression with Chinese text', '\\begin{document}',
      '\\section{Signal energy}', '窗口内的信号能量。',
      '\\begin{equation}', '  E = \\energy{\\frac{x_{1}}{\\sqrt{1+x_{2}^{2}}}}',
      '\\end{equation}', 'Escapes: \\% \\& \\_ \\# \\$.', '\\end{document}', '',
    ].join('\n');
    await page.locator('input[type=file]').setInputFiles({
      name:'signal-energy.tex',mimeType:'text/plain',buffer:Buffer.from(sample),
    });
    await page.locator('.ProseMirror').getByText('Signal energy').waitFor();
    const panel = page.locator('.tex-workspace');
    const source = page.locator('[data-source-mode=source]');
    const documentMode = page.locator('[data-source-mode=body]');
    const content = panel.locator('.cm-content');
    const button = name => panel.getByRole('button',{name});
    const read = async () => {
      await page.evaluate(() => { window.clipboardProbe = null; });
      await button(/复制源码|Copy source/).click();
      await page.waitForFunction(() => window.clipboardProbe !== null);
      return page.evaluate(() => window.clipboardProbe);
    };
    const sameClipboardText = async expected => {
      const {source, readback} = await read();
      assert.equal(source, expected, 'workspace.value before native clipboard write');
      assert.equal(readback.replace(/\r\n/g,'\n'), expected.replace(/\r\n/g,'\n'),
        'Native clipboard text preserves content across LF/CRLF conversion');
      return source;
    };
    const evidence = async (expected, label) => {
      const {source, readback} = await read();
      await page.locator('[data-group=files]').click();
      const downloading = page.waitForEvent('download');
      await page.locator('#download').click();
      const zip = await readFile(await (await downloading).path());
      let actual;
      for (let offset = 0; zip.readUInt32LE(offset) === 0x04034b50;) {
        assert.equal(zip.readUInt16LE(offset+8), 0, 'Project ZIP uses stored entries');
        const length = zip.readUInt32LE(offset+18);
        const nameLength = zip.readUInt16LE(offset+26);
        const extraLength = zip.readUInt16LE(offset+28);
        const name = zip.subarray(offset+30, offset+30+nameLength).toString('utf8');
        const start = offset+30+nameLength+extraLength;
        if (name === 'signal-energy.tex') actual = zip.subarray(start,start+length);
        offset = start+length;
      }
      assert.ok(actual, 'Downloaded ZIP contains the imported main .tex');
      const directory = join(process.env.LINEAE_EOL_ARTIFACTS || tmpdir(), 'lineae-eol', label);
      await mkdir(directory,{recursive:true});
      const files = {
        'clipboard-source-before.txt': Buffer.from(source,'utf8'),
        'clipboard-source-readback.txt': Buffer.from(readback,'utf8'),
        'browser-actual.zip': zip,
        'browser-actual.tex': actual,
        'browser-expected.tex': Buffer.from(expected,'utf8'),
      };
      // Persist the real download and extracted bytes before any equality assertions.
      for (const [name,bytes] of Object.entries(files)) await writeFile(join(directory,name),bytes);
      const metrics = Object.fromEntries(Object.entries(files).map(([name,bytes]) => {
        const text = bytes.toString('utf8');
        return [name,{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
          crlf:(text.match(/\r\n/g)||[]).length,lf:(text.match(/(?<!\r)\n/g)||[]).length,
          cr:(text.match(/\r(?!\n)/g)||[]).length,tail:bytes.subarray(-16).toString('hex')}];
      }));
      await writeFile(join(directory,'comparison.json'),JSON.stringify(metrics,null,2));
      console.log('EOL evidence',label,JSON.stringify(metrics));
      if (process.env.GITHUB_ACTIONS) {
        console.log('::notice::EOL_EVIDENCE '+JSON.stringify({label,metrics,
          files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,bytes.toString('base64')]))}));
      }
      assert.equal(source,expected,'Unmodified workspace.value retains exact source');
      assert.equal(readback.replace(/\r\n/g,'\n'),expected.replace(/\r\n/g,'\n'),'Clipboard text content');
      assert.deepEqual(actual,Buffer.from(expected,'utf8'),'ZIP source byte fidelity');
    };
    const screenshot = async name => {
      if (!process.env.LINEAE_SCREENSHOTS) return;
      await mkdir(process.env.LINEAE_SCREENSHOTS,{recursive:true});
      await page.screenshot({path:join(process.env.LINEAE_SCREENSHOTS,name+'.png')});
    };
    await source.click();
    await evidence(sample,'initial-lf');
    assert.ok(await panel.locator('.cm-lineNumbers .cm-gutterElement').count() > 1);
    assert.ok(await panel.locator('.cm-activeLine').count());
    const colors = await panel.locator('.cm-line span').evaluateAll(nodes =>
      [...new Set(nodes.map(node => getComputedStyle(node).color))]);
    assert.ok(colors.length >= 2);
    await screenshot('normal');
    await content.click();
    await page.keyboard.press('Control+Home');
    await page.evaluate(() => navigator.clipboard.writeText('% added\n'));
    await page.keyboard.press('Control+v');
    await sameClipboardText('% added\n'+sample);
    await content.focus();
    await page.keyboard.press('Control+z');
    await sameClipboardText(sample);
    await content.focus();
    await page.keyboard.press('Control+y');
    await sameClipboardText('% added\n'+sample);
    await content.focus();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
    await button(/查找与替换|Find and replace/).click();
    const find = panel.locator('.cm-search input[name=search]');
    await find.fill('Signal energy');
    await find.press('Enter');
    await panel.locator('.cm-search input[name=replace]').fill('Signal power');
    await panel.locator('.cm-search button[name=replaceAll]').click();
    await find.press('Escape');
    const draft = '% added\n' + sample.replace('Signal energy','Signal power');
    await sameClipboardText(draft);
    await documentMode.click();
    await source.click();
    await sameClipboardText(draft);
    await button(/展开工作区|Expand workspace/).click();
    const heading = panel.locator('.tex-preview .ProseMirror h1');
    await heading.filter({hasText:'Signal power'}).waitFor();
    const separator = panel.getByRole('separator');
    const rect = await separator.boundingBox();
    await page.mouse.move(rect.x+4,rect.y+40);
    await page.mouse.down();
    await page.mouse.move(rect.x+110,rect.y+40);
    await page.mouse.up();
    assert.ok(Number(await separator.getAttribute('aria-valuenow')) > 45);
    await content.focus();
    await page.keyboard.press('Control+a');
    const edited = draft.replace('E =','P =');
    await page.evaluate(text=>navigator.clipboard.writeText(text),edited);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);
    await screenshot('split');
    const cursor = await panel.locator('.tex-position').innerText();
    await page.setViewportSize({width:1280,height:800});
    assert.ok(await separator.isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await screenshot('expanded-laptop');
    await page.setViewportSize({width:768,height:1024});
    assert.equal(await separator.isVisible(),false);
    await button(/Document preview|文档预览/).waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await screenshot('expanded-tablet');
    await page.setViewportSize({width:390,height:844});
    await screenshot('expanded-mobile');
    await button(/文档预览|Document preview/).click();
    assert.ok(await heading.isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await button(/返回源码|Show source/).click();
    await content.press('Escape');
    await documentMode.click();
    await source.click();
    const actual = await sameClipboardText(edited);
    await evidence(edited,'edited-lf');
    if (process.env.LINEAE_SCREENSHOTS) {
      for (const [label,text] of Object.entries({before:sample,expected:edited,actual})) {
        await writeFile(join(process.env.LINEAE_SCREENSHOTS,label+'.tex'),text);
      }
    }
    assert.equal(actual,edited);
    assert.equal(await panel.locator('.tex-position').innerText(),cursor);
    await content.focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText('\\begin{document}\nunfinished');
    await documentMode.click();
    assert.ok(await panel.isVisible());
    assert.match(await panel.locator('.tex-message').innerText(),/无法识别|Invalid/i);
    await sameClipboardText('\\begin{document}\nunfinished');
  } finally {
    await page.close();
  }
};
