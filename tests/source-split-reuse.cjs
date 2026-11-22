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

    const paragraphs=Array.from({length:100},(_,index)=>'Scroll paragraph '+index+'.');
    await page.locator('#file').setInputFiles({
      name:'scroll.tex',mimeType:'text/plain',
      buffer:Buffer.from('\\begin{document}\r\n'+paragraphs.join('\r\n\r\n')+'\r\n\\end{document}'),
    });
    await page.locator('[data-source-mode=split]').click();
    const preview=page.locator('.tex-preview');
    await preview.waitFor();
    await page.locator('.cm-editor').evaluate(element=>element.querySelector('.cm-scroller').scrollTop=1500);
    await page.waitForFunction(()=>document.querySelector('.tex-preview').scrollTop>100);
    await preview.evaluate(element=>element.scrollTop=element.scrollHeight);
    await page.waitForFunction(()=>document.querySelector('.cm-editor').textContent.includes('Scroll paragraph 99.'));
    await page.locator('[data-source-mode=body]').click();
    assert.equal(await paper.locator('p').count(),100);
  } finally {
    await page.close();
  }
};
