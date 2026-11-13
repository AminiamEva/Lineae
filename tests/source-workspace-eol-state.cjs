const assert=require('node:assert/strict');
const {build}=require('esbuild');
module.exports=async(context,url)=>{
  const bundle=await build({entryPoints:['apps/web/src/editor/source-workspace.js'],bundle:true,format:'iife',globalName:'workspaceFixture',write:false});
  const page=await context.newPage();
  try {
    await page.route(url,r=>r.fulfill({contentType:'text/html',body:'<main><article>Preview</article></main>'}));
    await page.goto(url); await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(()=>{
      window.workspace=workspaceFixture.createSourceWorkspace({page:document.querySelector('article'),render(){},metadata:()=>({name:'eol.tex',saved:'a\r\nb\n'})});
      workspace.open('a\r\nb\n');
    });
    const content=page.locator('.cm-content');
    const value=()=>page.evaluate(()=>workspace.value);
    assert.equal(await page.locator('.tex-dirty').evaluate(n=>n.hidden),true);
    await content.press('Control+Home'); await content.press('End'); await content.press('Delete');
    assert.equal(await value(),'ab\n');
    await content.press('Enter');
    assert.equal(await value(),'a\nb\n','same visible text uses current metadata');
    assert.equal(await page.locator('.tex-dirty').evaluate(n=>n.hidden),false,'EOL-only change is unsaved');
    await content.press('Control+z'); await content.press('Control+z');
    assert.equal(await value(),'a\r\nb\n');
    assert.equal(await page.locator('.tex-dirty').evaluate(n=>n.hidden),true);
    await content.press('Control+y'); await content.press('Control+y');
    assert.equal(await value(),'a\nb\n');
    await page.evaluate(()=>{workspace.close();workspace.open(workspace.value);});
    assert.equal(await value(),'a\nb\n');
    await page.evaluate(()=>workspace.reset('a\rb\r\n'));
    assert.equal(await value(),'a\rb\r\n','external reset replaces EOL metadata');
    await content.press('Control+End'); await page.keyboard.insertText('中');
    assert.equal(await value(),'a\rb\r\n中');
    await content.press('Control+z'); assert.equal(await value(),'a\rb\r\n');
    await page.evaluate(()=>workspace.destroy());
    console.log('Workspace EOL metadata, dirty state, external reset and history passed');
  } finally {await page.close();}
};
