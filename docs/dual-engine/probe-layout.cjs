const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { revealToolbar } = require('../../tests/workspace-ui-helpers.cjs');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
    await page.goto(url);
    const cases = [];
    for (const name of ['xelatex-reference', 'xecjk-reference']) {
      const fixture = JSON.parse(await readFile(`tests/fixtures/paragraph-layout/${name}.json`, 'utf8'));
      const lines = fixture.cases[0].source.split('\n');
      const begin = lines.indexOf('\\begin{document}');
      assert.ok(begin >= 0);
      lines.splice(begin, 0, '% 保留注释与换行', '\\newcommand{\\auditmarker}[1]{#1}');
      const bytes = Buffer.from(lines.map((line, index) => line + (index === lines.length - 1 ? '' : index % 2 ? '\n' : '\r\n')).join(''));
      await page.locator('input[type=file]').setInputFiles({ name: name + '.tex', mimeType: 'text/plain', buffer: bytes });
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
      await revealToolbar(page);
      await page.locator('[data-group=files]').click();
      const pending = page.waitForEvent('download');
      await page.locator('#download').click();
      const zip = await readFile(await (await pending).path());
      assert.equal(zip.readUInt32LE(0), 0x04034b50, 'Expected a ZIP local header');
      assert.equal(zip.readUInt16LE(8), 0, 'Expected a stored ZIP entry');
      const filenameLength = zip.readUInt16LE(26);
      assert.equal(zip.toString('utf8', 30, 30 + filenameLength), name + '.tex');
      const start = 30 + filenameLength + zip.readUInt16LE(28);
      const exported = zip.subarray(start, start + zip.readUInt32LE(22));
      await writeFile(join(output, name + '-input.tex'), bytes);
      await writeFile(join(output, name + '-export.tex'), exported);
      const { ast: beforeAst, ...beforeGeometry } = before;
      const { ast: afterAst, ...afterGeometry } = after;
      cases.push({
        name, before: beforeGeometry, after: afterGeometry,
        beforeSha256: sha256(bytes), afterSha256: sha256(exported),
        bytesEqual: bytes.equals(exported), astEqual: JSON.stringify(beforeAst) === JSON.stringify(afterAst),
      });
    }
    const result = { chromium: browser.version(), cases, assets, errors };
    await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    assert.deepEqual(errors, []);
    assert.ok(cases.every(sample => sample.bytesEqual && sample.astEqual && sample.after.visualBreaks > 0));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
