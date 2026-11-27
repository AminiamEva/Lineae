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
    response.setHeader('Content-Type', { '.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.wasm':'application/wasm','.png':'image/png' }[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});

const sent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut mauris tellus, volutpat at hendrerit ac, vulputate vel metus. Nunc interdum nisl non quam egestas fringilla. Pellentesque tincidunt vulputate massa, nec rutrum risus. Aliquam commodo convallis dui et tincidunt. Etiam eu lectus eget arcu elementum viverra nec tincidunt purus. Nulla nec tincidunt mauris, eget viverra metus. Aliquam luctus consequat commodo.';
const para = (label, count) => `${label} ` + Array.from({ length: count }, () => sent).join(' ');
const before = Array.from({ length: 6 }, (_, index) => para(`Before ${index + 1}.`, 3));
const after = Array.from({ length: 6 }, (_, index) => para(`After ${index + 1}.`, 3));
const wrapFigure = ['\\begin{wrapfigure}{r}{0.420\\textwidth}','\\centering','\\includegraphics[width=0.420\\textwidth]{missing.png}','\\caption{good}','\\end{wrapfigure}'].join('\n');
const tableFloat = ['\\begin{table}[htbp]','\\centering','\\caption{eiuh}','\\begin{tabular}{ll}','\\toprule','well & I guess \\\\','\\midrule','this & is better \\\\','\\bottomrule','\\end{tabular}','\\end{table}'].join('\n');
const source = wrap => ['\\documentclass[a4paper]{article}','\\usepackage[margin=2.2cm]{geometry}','\\usepackage{amsmath}','\\usepackage{graphicx}','\\usepackage{wrapfig}','\\usepackage{fancyhdr}','\\pagestyle{fancy}','\\fancyhf{}','\\fancyfoot[L]{ss}','\\fancyfoot[C]{\\thepage}','\\renewcommand{\\headrulewidth}{0.4pt}','\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\leaders\\hrule height \\headrulewidth\\hfill}}','\\renewcommand{\\footrulewidth}{0pt}','\\usepackage{booktabs}','\\begin{document}','',
  ...before, '',
  ...(wrap ? [wrapFigure, ''] : []),
  ...after, '',
  tableFloat, '',
  ...Array.from({ length: 3 }, (_, index) => para(`Tail ${index + 1}.`, 3)), '', '\\end{document}'].join('\n\n');

const read = page => page.evaluate(() => {
  const table = document.querySelector('.ProseMirror table');
  const pageElement = document.querySelector('.document-page');
  const lastParagraph = [...document.querySelectorAll('.ProseMirror > p')]
    .filter(node => node.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
  const scrollY = document.scrollingElement.scrollTop;
  const pageTop = pageElement.getBoundingClientRect().top;
  const cellTop = table.querySelector('td').getBoundingClientRect().top;
  return {
    // Position inside the page, so an intentional ribbon-panel height change
    // does not count as pagination movement.
    documentCellTop: cellTop - pageTop,
    documentLastParagraphTop: lastParagraph.getBoundingClientRect().top - pageTop,
    pageTop: pageTop + scrollY,
    rules: document.querySelector('[data-lineae-pagination]')?.textContent?.length ?? 0,
    toolbar: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tex-toolbar-bottom')),
    layouts: window.__layoutEvents,
  };
});

async function check(browser, wrap) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'en-US' });
  await page.addInitScript(() => {
    window.__layoutEvents = 0;
    window.addEventListener('lineae-before-layout', () => { window.__layoutEvents += 1; });
  });
  try {
    await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.locator('input[type=file]').setInputFiles({ name: 'table-pagination.tex', mimeType: 'text/plain', buffer: Buffer.from(source(wrap)) });
    await page.waitForFunction(() => document.querySelector('.ProseMirror table'));
    await revealToolbar(page);
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(1600);
    // Let the verification pass settle before measuring (font loading and the
    // profile update can schedule one extra pass).
    const waitStable = async () => {
      let last = -1;
      for (let index = 0; index < 30; index++) {
        const count = await page.evaluate(() => window.__layoutEvents);
        if (count === last) return;
        last = count;
        await page.waitForTimeout(150);
      }
    };
    await waitStable();

    const cell = page.locator('.ProseMirror table td').first();
    await cell.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const baseline = await read(page);
    assert.ok(baseline.documentCellTop > 0, 'table has a measured position');

    const paragraph = page.locator('.ProseMirror > p').nth(10);
    await paragraph.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const beforeClick = await read(page);
    const layoutEventsBefore = beforeClick.layouts;
    await paragraph.click();
    await page.waitForTimeout(800);
    const afterParagraph = await read(page);
    assert.ok(Math.abs(afterParagraph.documentCellTop - beforeClick.documentCellTop) < 3,
      `clicking a paragraph must not move the table (wrap=${wrap})`);
    assert.equal(afterParagraph.layouts, layoutEventsBefore,
      `clicking a paragraph must not repaginate (wrap=${wrap})`);

    await cell.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const beforeTable = await read(page);
    await cell.click();
    await page.waitForTimeout(800);
    const afterTable = await read(page);
    assert.ok(Math.abs(afterTable.documentCellTop - beforeTable.documentCellTop) < 3,
      `clicking the table must not move it (wrap=${wrap})`);
    assert.equal(afterTable.layouts, beforeTable.layouts,
      `clicking the table must not repaginate (wrap=${wrap})`);
    assert.equal(afterTable.rules, beforeTable.rules, 'pagination rules stay stable');
    assert.equal(await page.locator('[data-group=table]').isVisible(), true, 'table tab is available');

    // Hovering the interactive table controls recreates the caption decoration.
    // That used to look like a width change and repaginated the page, which
    // shifted the document while the pointer merely moved over the table.
    await waitStable();
    const beforeHover = await read(page);
    const cellBox = await cell.boundingBox();
    await page.mouse.move(cellBox.x + cellBox.width - 2, cellBox.y + cellBox.height / 2);
    await page.waitForTimeout(450);
    const afterColumnHover = await read(page);
    assert.ok(Math.abs(afterColumnHover.documentCellTop - beforeHover.documentCellTop) < 3,
      `hovering the column control must not move the table (wrap=${wrap})`);
    assert.equal(afterColumnHover.layouts, beforeHover.layouts,
      `hovering the column control must not repaginate (wrap=${wrap})`);

    await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height - 2);
    await page.waitForTimeout(450);
    const afterRowHover = await read(page);
    assert.ok(Math.abs(afterRowHover.documentCellTop - beforeHover.documentCellTop) < 3,
      `hovering the row control must not move the table (wrap=${wrap})`);
    assert.equal(afterRowHover.layouts, beforeHover.layouts,
      `hovering the row control must not repaginate (wrap=${wrap})`);

    const selectedHandle = await page.evaluate(() => {
      const handle = document.querySelector('.table-select-handle');
      if (!handle || handle.hidden) return false;
      handle.click();
      return true;
    });
    if (selectedHandle) {
      await page.waitForTimeout(500);
      const afterHandle = await read(page);
      assert.ok(Math.abs(afterHandle.documentCellTop - beforeHover.documentCellTop) < 3,
        `selecting the table must not move it (wrap=${wrap})`);
      assert.equal(afterHandle.layouts, beforeHover.layouts,
        `selecting the table must not repaginate (wrap=${wrap})`);
    }

    // The ribbon is only as tall as its active panel (no reserved blank band),
    // so manually switching panels may change its height. That must not
    // repaginate the document or move content between pages.
    const pagesBeforePanels = await page.evaluate(() => document.querySelector('.document-page')?.dataset.pageCount);
    await page.locator('.ribbon-tabs [data-group=table]').click();
    await page.waitForTimeout(400);
    const tablePanel = await read(page);
    assert.equal(tablePanel.layouts, afterTable.layouts,
      `switching to the Table panel must not repaginate (wrap=${wrap})`);
    assert.equal(await page.evaluate(() => document.querySelector('.document-page')?.dataset.pageCount), pagesBeforePanels,
      `switching to the Table panel must not change the page count (wrap=${wrap})`);
    await page.locator('.ribbon-tabs [data-group=home]').click();
    await page.waitForTimeout(400);
    const homePanel = await read(page);
    assert.equal(homePanel.layouts, afterTable.layouts,
      `switching back must not repaginate (wrap=${wrap})`);
  } finally {
    await page.close();
  }
}

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    await check(browser, false);
    await check(browser, true);
    console.log('PASS table pagination stays stable across selection');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
