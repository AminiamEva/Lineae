const assert = require('node:assert/strict');
const {build} = require('esbuild');

module.exports = async function checkRawSource(context, url) {
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], failures = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('raw browser page error:',error.message); });
  const check = async (name, run) => {
    try { await run(); console.log('raw browser: PASS ' + name); }
    catch (error) { failures.push(name + ': ' + error.message); console.error('raw browser: FAIL ' + name + ': ' + error.message); }
  };
  try {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(url);
    const fixture = await build({stdin:{contents:"export {DOMParser} from '@tiptap/pm/model';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'rawFixture',write:false});
    await page.addScriptTag({content:fixture.outputFiles[0].text});
    const raw = '\\begin{minipage}{5cm}\r\n\\section{Protected}\n\\begin{future}\r\ncontent\n\\end{future}\r\n\\end{minipage}';
    const source = '\\documentclass{article}\r\n% keep preamble\n\\begin{document}\nBefore.\r\n\n' + raw + '\r\n\nAfter.\n\\end{document}\r\n';
    const open = async () => {
      await page.locator('input[type=file]').setInputFiles({name:'raw-source.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
      await page.locator('.ProseMirror pre[data-raw]').waitFor({state:'attached'});
    };
    const read = async () => {
      await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.rawCopied=text; }; });
      await page.locator('.tex-actions button').nth(2).click();
      return page.evaluate(() => window.rawCopied);
    };
    const edit = () => page.locator('.ProseMirror').evaluate(element => {
      const editor = element.editor;
      let at;
      editor.state.doc.forEach((node,pos) => {if (node.type.name==='paragraph' && node.textContent==='Before.') at=pos+1;});
      assertPosition(at);
      function assertPosition(value) { if (value===undefined) throw new Error('editable paragraph missing'); }
      editor.view.dispatch(editor.state.tr.insertText(' edited',at+6));
    });
    await check('Raw HTML serialization retains mixed newline source', async () => {
      await open();
      const actual = await page.locator('.ProseMirror').evaluate(element => {
        const editor = element.editor, wrapper = document.createElement('div');
        wrapper.innerHTML=editor.getHTML();
        return rawFixture.DOMParser.fromSchema(editor.schema).parse(wrapper).toJSON().content.find(node=>node.type==='raw').attrs.source;
      });
      assert.equal(actual,raw);
    });
    for (const mode of ['body','split']) {
      await check(mode + ' preserves exact source before and after neighbor edits', async () => {
        await open();
        await page.locator('[data-source-mode='+mode+']').click();
        if (mode==='split') assert.equal(await read(),source);
        await edit();
        await page.locator('[data-source-mode=source]').click();
        assert.equal(await read(),source.replace('Before.','Before edited.'));
      });
      await check(mode + ' refuses accidental Raw deletion', async () => {
        await open();
        await page.locator('[data-source-mode='+mode+']').click();
        const remaining = await page.locator('.ProseMirror').evaluate(element => {
          const editor=element.editor;
          let from, to;
          editor.state.doc.forEach((node,pos) => {if(node.type.name==='raw'){from=pos;to=pos+node.nodeSize;}});
          editor.view.dispatch(editor.state.tr.delete(from,to));
          return editor.getJSON().content.some(node=>node.type==='raw');
        });
        assert.equal(remaining,true);
      });
    }
    await check('unclosed environment imports and remains intact after a rich edit', async () => {
      const incomplete=source.replace('\\end{minipage}','');
      await page.locator('input[type=file]').setInputFiles({name:'unclosed.tex',mimeType:'text/plain',buffer:Buffer.from(incomplete)});
      await page.locator('[data-source-mode=split]').click();
      assert.equal(await read(),incomplete);
      await edit();
      assert.equal(await read(),incomplete.replace('Before.','Before edited.'));
    });
    await check('untouched Raw document keeps metadata and bare math source verbatim', async () => {
      const text=source.replace('\\begin{document}', '\\title{Untouched}\n\\begin{document}')
        .replace('After.', '\\begin{cases}1&x>0\\\\0&x=0\\end{cases}');
      await page.locator('input[type=file]').setInputFiles({name:'untouched.tex',mimeType:'text/plain',buffer:Buffer.from(text)});
      await page.locator('[data-source-mode=source]').click();
      assert.equal(await read(),text);
    });
    assert.deepEqual(errors,[]);
    assert.deepEqual(failures,[]);
  } finally { await page.close(); }
};
