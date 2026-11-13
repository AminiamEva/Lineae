const assert = require('node:assert/strict');
const {readFile, writeFile, mkdir} = require('node:fs/promises');
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const {createHash} = require('node:crypto');

module.exports = async function checkMixedEol(context, url) {
  const fixture = require('./fixtures/source-workspace-mixed-eol.json');
  const original = Buffer.from(fixture.original.base64,'base64');
  const expected = Buffer.from(fixture.expected.base64,'base64');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(original),fixture.original.sha256);
  assert.equal(sha(expected),fixture.expected.sha256);
  const page = await context.newPage();
  try {
    await page.setViewportSize({width:1440,height:900});
    await page.goto(url);
    await page.locator('input[type=file]').setInputFiles({name:'original.tex',mimeType:'text/plain',buffer:original});
    await page.locator('.ProseMirror').getByText('Signal energy').waitFor();
    const panel = page.locator('.tex-workspace');
    const content = panel.locator('.cm-content');
    const source = page.locator('[data-source-mode=source]');
    const body = page.locator('[data-source-mode=body]');
    const expand = panel.locator('.tex-actions button[aria-expanded]');
    const directory = join(process.env.LINEAE_EOL_ARTIFACTS || tmpdir(),'lineae-mixed-eol');
    await mkdir(directory,{recursive:true});
    const download = async name => {
      await page.locator('[data-group=files]').click();
      const pending = page.waitForEvent('download');
      await page.locator('#download').click();
      const zip = await readFile(await (await pending).path());
      await writeFile(join(directory,name+'.zip'),zip);
      assert.equal(zip.readUInt32LE(0),0x04034b50);
      assert.equal(zip.readUInt16LE(8),0,'ZIP entry uses stored bytes');
      const start = 30+zip.readUInt16LE(26)+zip.readUInt16LE(28);
      assert.equal(zip.subarray(30,30+zip.readUInt16LE(26)).toString('utf8'),'original.tex');
      return {zip,tex:zip.subarray(start,start+zip.readUInt32LE(22))};
    };
    const change = async (needle,replacement) => {
      await panel.getByRole('button',{name:/查找与替换|Find and replace/}).click();
      const find = panel.locator('input[name=search]');
      await find.fill(needle);
      await panel.locator('input[name=replace]').fill(replacement);
      await panel.locator('button[name=replaceAll]').click();
      await find.press('Escape');
    };
    await source.click();
    const before = await download('before-edit');
    assert.deepEqual(before.tex,original,'Unedited mixed source ZIP is byte-identical');
    await change('Signal energy','Signal power');
    await change('E =','P =');
    const commentLine = content.locator('.cm-line').filter({hasText:/^% Nested braces, custom command/});
    assert.equal(await commentLine.count(),1,'Original comment line is uniquely identified');
    await commentLine.click({position:{x:2,y:5}});
    await content.press('Home');
    await page.keyboard.insertText('% 第四阶段：源码完整性');
    await page.keyboard.press('Enter');
    await body.click();
    await source.click();
    await expand.click();
    const divider = panel.getByRole('separator');
    const box = await divider.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+20);
    await page.mouse.down();
    await page.mouse.move(box.x+100,box.y+20);
    await page.mouse.up();
    assert.ok(Number(await divider.getAttribute('aria-valuenow'))>45);
    await change('Escapes:','Special characters:');
    await expand.click();
    await body.click();
    await source.click();
    const actual = await download('browser-actual');
    // Save the exact exported bytes before comparison, including a failed export.
    await writeFile(join(directory,'browser-actual.tex'),actual.tex);
    await writeFile(join(directory,'browser-original.tex'),original);
    await writeFile(join(directory,'browser-expected.tex'),expected);
    const files = {'browser-original.tex':original,'browser-expected.tex':expected,
      'browser-actual.tex':actual.tex,'browser-actual.zip':actual.zip};
    const metrics = Object.fromEntries(Object.entries(files).map(([name,b]) => {
      const text = b.toString('utf8');
      return [name,{bytes:b.length,sha256:sha(b),lf:(text.match(/(?<!\r)\n/g)||[]).length,
        crlf:(text.match(/\r\n/g)||[]).length,cr:(text.match(/\r(?!\n)/g)||[]).length,
        tail:b.subarray(-16).toString('hex')}];
    }));
    const comparison = {metrics,equal:actual.tex.equals(expected),
      firstDifference:expected.findIndex((byte,index)=>actual.tex[index]!==byte)};
    await writeFile(join(directory,'browser-comparison.json'),JSON.stringify(comparison,null,2));
    console.log('::notice::MIXED_EOL_EVIDENCE '+JSON.stringify({...comparison,
      files:Object.fromEntries(Object.entries(files).map(([name,b])=>[name,b.toString('base64')]))}));
    assert.deepEqual(actual.tex,expected,'Edited mixed source ZIP must retain the final CRLF');
    console.log('Mixed EOL browser export passed');
  } finally {
    await page.close();
  }
};
