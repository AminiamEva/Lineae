const assert = require('node:assert/strict');
const {readFile, mkdtemp, writeFile, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {setIndentOnSave} = require('./workspace-ui-helpers.cjs');

module.exports = async (context, url) => {
  const page = await context.browser().newPage();
  const dir = await mkdtemp(join(tmpdir(),'lineae-paragraph-'));
  try {
    await page.goto(url);
    await setIndentOnSave(page,false);
    for (const [name,first,eol] of [
      ['comment','Before. % keep-note\r\nNext.','\n'],
      ['box','Left \\mbox{fixed span} right.','\r\n'],
      ['raw','\\unknown{keep}','\r\n'],
      ['plain','普通首段。','\n'],
    ]) {
      const target = '重复的末段。';
      const body = [first,target,target].join(eol+' \t'+eol);
      const original = '\\documentclass{article}\r\n\\begin{document}\n'+body+' \t\r\n\\end{document}% tail';
      const last = original.lastIndexOf(target)+target.length;
      const expected = original.slice(0,last)+'Q'+original.slice(last);
      await page.locator('#file').setInputFiles({name:name+'.tex',mimeType:'text/plain',buffer:Buffer.from(original)});
      await page.locator('[data-source-mode=body]').click();
      const paragraphs = page.locator('.ProseMirror p').filter({hasText:target});
      await paragraphs.last().click();await page.keyboard.press('End');await page.keyboard.insertText('Q');
      assert.equal((await paragraphs.last().innerText()).trimEnd(),target+'Q');
      await page.keyboard.press('Control+z');assert.equal((await paragraphs.last().innerText()).trimEnd(),target);
      await page.keyboard.press('Control+y');assert.equal((await paragraphs.last().innerText()).trimEnd(),target+'Q');
      assert.equal((await paragraphs.first().innerText()).trimEnd(),target);
      await page.evaluate(()=>{
        window.paraSaved=null;
        window.showSaveFilePicker=async()=>({name:'saved.tex',createWritable:async()=>{
          let text;
          return {write:async s=>{text=s;},close:async()=>{window.paraSaved=text;}};
        }});
      });
      await page.keyboard.press('Control+s');
      await page.waitForFunction(()=>window.paraSaved!==null);
      const disk=join(dir,name+'.tex');await writeFile(disk,await page.evaluate(()=>window.paraSaved));
      assert.deepEqual(await readFile(disk),Buffer.from(expected),name+' Document save');
      await page.locator('#file').setInputFiles(disk);
      await page.locator('[data-source-mode=split]').click();
      assert.ok(await page.locator('.ProseMirror').first().evaluate(el=>!!el.closest('[inert]')));
      await page.locator('[data-source-mode=source]').click();
      await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.paraCopied=text;};});
      await page.locator('.tex-actions button').nth(2).click();
      assert.equal(await page.evaluate(()=>window.paraCopied),expected,name+' reopened');
    }
    // Undoing removal of the entire last paragraph must restore its original
    // insertion point between the same separators, including trailing spaces.
    const erased='\\documentclass{article}\n\\begin{document}\nFirst. % keep-note\r\n\nLast. \t\r\n\\end{document}';
    await page.locator('#file').setInputFiles({name:'erased.tex',mimeType:'text/plain',buffer:Buffer.from(erased)});
    await page.locator('[data-source-mode=body]').click();
    const last=page.locator('.ProseMirror p').last();
    await last.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Backspace');
    assert.equal((await last.innerText()).trim(),'');
    await page.keyboard.press('Control+z');
    assert.equal((await last.innerText()).trim(),'Last.');
    await page.locator('[data-source-mode=source]').click();
    await page.locator('.tex-actions button').nth(2).click();
    assert.equal(await page.evaluate(()=>window.paraCopied),erased,'undo entire last paragraph');

    const original='\\documentclass{article}\r\n\\begin{document}\nLeft \\mbox{fixed span} right.\r\n\nTarget.\n\\end{document}';
    await page.locator('#file').setInputFiles({name:'pending.tex',mimeType:'text/plain',buffer:Buffer.from(original)});
    await page.locator('[data-source-mode=body]').click();
    const first=page.locator('.ProseMirror p').first();
    await first.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('X');
    assert.equal(await first.innerText(),'Left fixed span right.');
    assert.match(await page.locator('#status').innerText(),/source|源码/i);
    // A follow-up document transaction from a plugin is outside the verified
    // edit. It cannot expand the user's one-character patch into a second edit.
    await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor;
      const Plugin=editor.state.plugins[0].constructor;
      editor.registerPlugin(new Plugin({appendTransaction(transactions,_old,current) {
        if(transactions.some(tr=>tr.docChanged) && current.doc.lastChild.textContent==='Target.Q' &&
            current.doc.firstChild.textContent!=='X')
          return current.tr.insert(0,current.schema.nodes.paragraph.create(null,current.schema.text('X')));
      }}));
    });
    const target=page.locator('.ProseMirror p').last();
    await target.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('Q');
    assert.equal(await first.innerText(),'Left fixed span right.');
    await page.evaluate(()=>{
      window.showSaveFilePicker=async()=>({name:'pending.tex',createWritable:async()=>({
        write:async text=>{window.paraWritten=text;},
        close:async()=>{throw Error('test: disk unavailable');}
      })});
    });
    const download=page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    await download;
    const expected=original.replace('Target.','Target.Q');
    assert.equal(await page.evaluate(()=>window.paraWritten),expected);
    assert.equal(await target.innerText(),'Target.Q');
    await page.evaluate(()=>{
      window.showSaveFilePicker=async()=>({name:'pending-copy.tex',createWritable:async()=>({
        write:async text=>{window.paraPending=text;},
        close:()=>new Promise(resolve=>{window.paraRelease=resolve;})
      })});
    });
    await target.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>typeof window.paraRelease==='function');
    await page.keyboard.insertText('新');
    await page.evaluate(()=>window.paraRelease());
    await page.waitForFunction(()=>document.querySelector('#status').textContent.match(/已保存|Saved/i));
    assert.equal(await page.evaluate(()=>window.paraPending),expected);
    assert.equal(await target.innerText(),'Target.Q新');
    await page.locator('[data-source-mode=source]').click();
    await page.locator('.tex-actions button').nth(2).click();
    assert.equal(await page.evaluate(()=>window.paraCopied),expected.replace('Target.Q','Target.Q新'));
    assert.equal(await page.locator('.tex-dirty').isVisible(),true);
  } finally {
    await page.close();
    await rm(dir,{recursive:true,force:true});
  }
};
