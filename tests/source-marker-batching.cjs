const assert = require('node:assert/strict');

module.exports = async function checkMarkerBatching(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.locator('#file').setInputFiles({
      name: 'marks.tex', mimeType: 'text/plain',
      buffer: Buffer.from('\\begin{document}\nFirst paragraph with spaces.\n\nSecond paragraph.\n\\end{document}'),
    });
    await page.locator('.ProseMirror').getByText('Second paragraph.', {exact: true}).waitFor();
    const group = page.locator('.space-overlay > g:nth-child(2)');
    await group.locator('circle').first().waitFor({state: 'attached'});
    await group.evaluate(marks => {
      const observer = new MutationObserver(() => {});
      observer.observe(marks, {childList: true});
      marks.closest('.document-page').addEventListener('lineae-markers-layout', () => {
        const records = observer.takeRecords();
        observer.disconnect();
        window.markerRedraw = {
          writes: records.length,
          added: records[0]?.addedNodes.length,
          visibleMarks: marks.childElementCount,
        };
      }, {once: true});
      window.dispatchEvent(new Event('lineae-layout'));
    });
    const redraw = await (await page.waitForFunction(() => window.markerRedraw)).jsonValue();
    assert.ok(redraw.visibleMarks > 1);
    assert.equal(redraw.writes, 1, 'A redraw must update the live SVG marker group once');
    assert.equal(redraw.added, redraw.visibleMarks);
  } finally {
    await page.close();
  }
};
