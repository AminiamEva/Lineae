const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright');
const {openXeReference} = require('../../tests/xe-reference-page.cjs');
const { revealToolbar } = require('../../tests/workspace-ui-helpers.cjs');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exportedTex(page,name) {
  await revealToolbar(page);
  if (!await page.locator('#download').isVisible()) await page.locator('[data-group=files]').click();
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const zip = await readFile(await (await pending).path());
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'Expected a ZIP local header');
  assert.equal(zip.readUInt16LE(8), 0, 'Expected a stored ZIP entry');
  const filenameLength = zip.readUInt16LE(26);
  assert.equal(zip.toString('utf8', 30, 30 + filenameLength), name + '.tex');
  const start = 30 + filenameLength + zip.readUInt16LE(28);
  const exported = zip.subarray(start, start + zip.readUInt32LE(22));
  return exported;
}

async function main() {
  const output = resolve(process.argv[2]);
  await mkdir(output, { recursive: true });
  const server = spawn(process.execPath, ['scripts/serve.mjs', 'apps/web', process.env.LINEAE_AUDIT_PORT ?? '38759'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    const [announcement] = await once(server.stdout, 'data');
    const url = String(announcement).match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
    assert.ok(url, String(announcement));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    const assets = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      const filename = new URL(response.url()).pathname;
      if (/\.(otf|woff2)$/.test(filename)) assets.push({ filename, status: response.status() });
    });
    await openXeReference(page,url);
    const cases = [];
    for (const name of ['xelatex-reference', 'xecjk-reference']) {
      const fixture = JSON.parse(await readFile(`tests/fixtures/paragraph-layout/${name}.json`, 'utf8'));
      const lines = fixture.cases[0].source.split('\n');
      const begin = lines.indexOf('\\begin{document}');
      assert.ok(begin >= 0);
      lines.splice(begin, 0, '% 保留注释与换行', '\\newcommand{\\auditmarker}[1]{#1}');
      const bytes = Buffer.from(lines.map((line, index) => line + (index === lines.length - 1 ? '' : index % 2 ? '\n' : '\r\n')).join(''));
      const inputDir = join(output, 'input');
      await mkdir(inputDir,{recursive:true});
      const file = join(inputDir,name+'.tex');
      await writeFile(file,bytes);
      await page.locator('input[type=file]').setInputFiles(file);
      const paragraph = page.locator('.ProseMirror p[data-tex-paragraph]').first();
      await paragraph.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const geometry = () => paragraph.evaluate(node => {
        const editor = node.closest('.ProseMirror').editor;
        const style = getComputedStyle(node);
        return {
          ast: editor.getJSON(),
          width: node.clientWidth,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          visualBreaks: node.querySelectorAll('.tex-paragraph-break').length,
          discretionaryHyphens: node.querySelectorAll('.tex-discretionary-hyphen').length,
          fonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => ({
            family: font.family, style: font.style, weight: font.weight,
          })),
        };
      });
      const before = await geometry();
      await page.locator('[data-source-mode=source]').click();
      await page.locator('[data-source-mode=body]').click();
      await paragraph.waitFor();
      const after = await geometry();
      const modes = [];
      for (const mode of ['body','source','split','body']) {
        await page.locator('[data-source-mode='+mode+']').click();
        assert.equal(await page.locator('[data-source-mode='+mode+']').getAttribute('aria-pressed'),'true');
        const dirty = await page.locator('.tex-dirty').evaluate(node => !node.hidden);
        const exported = await exportedTex(page,name);
        const filename = name+'-'+modes.length+'-'+mode+'.tex';
        await writeFile(join(output,filename),exported);
        modes.push({mode,dirty,filename,bytesEqual:bytes.equals(exported),sha256:sha256(exported)});
      }
      const openings = [];
      for (const mode of ['body','source','split']) {
        await page.locator('[data-source-mode='+mode+']').click();
        const alias = name+'-open-'+mode;
        const input = join(inputDir,alias+'.tex');
        await writeFile(input,bytes);
        await page.locator('input[type=file]').setInputFiles(input);
        await page.waitForFunction(expected => document.querySelector('.tex-filename')?.textContent === expected,alias+'.tex');
        const activeMode = await page.locator('[data-source-mode][aria-pressed=true]').first().getAttribute('data-source-mode');
        const dirty = await page.locator('.tex-dirty').evaluate(node => !node.hidden);
        const exported = await exportedTex(page,alias);
        await writeFile(join(output,alias+'-export.tex'),exported);
        openings.push({openedFrom:mode,activeMode,dirty,bytesEqual:bytes.equals(exported),sha256:sha256(exported)});
      }
      await page.locator('[data-source-mode=body]').click();
      const exported = await readFile(join(output,modes.at(-1).filename));
      await writeFile(join(output, name + '-input.tex'), bytes);
      await writeFile(join(output, name + '-export.tex'), exported);
      const { ast: beforeAst, ...beforeGeometry } = before;
      const { ast: afterAst, ...afterGeometry } = after;
      cases.push({
        name, modes, openings, before: beforeGeometry, after: afterGeometry,
        beforeSha256: sha256(bytes), afterSha256: sha256(exported),
        bytesEqual: bytes.equals(exported), astEqual: JSON.stringify(beforeAst) === JSON.stringify(afterAst),
      });
    }
    const result = { chromium: browser.version(), cases, assets, errors };
    await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    assert.deepEqual(errors, []);
    assert.ok(cases.every(sample => [...sample.modes,...sample.openings].every(m=>m.bytesEqual && !m.dirty) && sample.bytesEqual && sample.astEqual && sample.after.visualBreaks > 0));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
