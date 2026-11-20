const assert = require('node:assert/strict');

module.exports = async function checkSplitReuse(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url);
    const source = '\\begin{document}\r\nOriginal paragraph.\n\\end{document}% end';
    await page.locator('#file').setInputFiles({
      name: 'reuse.tex', mimeType: 'text/plain', buffer: Buffer.from(source),
    });
    const paper = page.locator('.ProseMirror');
    await paper.getByText('Original paragraph.', {exact: true}).waitFor();
    await paper.evaluate(element => {
      window.documentChanges = 0;
      element.editor.on('transaction', ({transaction}) => {
        if (transaction.docChanged) window.documentChanges++;
      });
    });
    await page.locator('[data-source-mode=split]').click();
    assert.equal(await page.evaluate(() => window.documentChanges), 0,
      'Opening the current preview must not replace the imported document');
    await page.locator('.cm-line').filter({hasText: 'Original paragraph.'}).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' Edited.');
    await paper.getByText('Original paragraph. Edited.', {exact: true}).waitFor();
    assert.ok(await page.evaluate(() => window.documentChanges > 0));
  } finally {
    await page.close();
  }
};
