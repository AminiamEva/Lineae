// Real Chromium editor + real OS fixtures. The adapter boundary is substituted;
// operation gates deliberately exercise in-flight edits, not timing sleeps.
const {chromium} = require('playwright');
const {createServer} = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve('test-results/file-tree');
const web = path.resolve('apps/web');
const server = createServer(async(req,res) => {
  const target = path.resolve(web, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')));
  if (!target.startsWith(web + path.sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', {'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'}[path.extname(target)] || 'application/octet-stream'); res.end(await fs.readFile(target)); }
  catch { res.writeHead(404).end(); }
});
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const root = await fs.mkdtemp(path.join(output,'FileTree-Test 中文 '));
  for(const dir of ['sections/deep','chapters','figures','empty-folder','第一章','图片 资源']) await fs.mkdir(path.join(root,dir),{recursive:true});
  const fixtures = {'main.tex':'\\documentclass{article}\r\n\\begin{document}\nMain text.\r\n\\end{document}\r\n','sections/introduction.tex':'Introduction.\n','sections/method.tex':'Method.\r\n','sections/experiment.tex':'Experiment.\n','sections/deep/nested.tex':'Nested.\n','chapters/appendix.tex':'Appendix.\n','references.bib':'@book{key,title={中文}}\r\n','主文件.tex':'Chinese main.\n','第一章/研究方法.tex':'研究方法。\r\n','图片 资源/实验图片.png':'image bytes','figures/figure1.png':'image bytes','figures/figure2.pdf':'%PDF-test'};
  for(const [name,text] of Object.entries(fixtures)) await fs.writeFile(path.join(root,name),text);
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const browser=await chromium.launch({headless:true,executablePath:process.env.LINEAE_CHROMIUM_EXECUTABLE});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[],results=[];page.on('pageerror',error=>errors.push(error.message));
  let gate,release,gateOperation='move',entered;
  const local=name=>{const target=path.resolve(root,name);assert.ok(target.startsWith(root+path.sep));return target;};
  await page.exposeFunction('diskOperation',async(op,a,b,bytes)=>{
    if(op===gateOperation && gate){const waiting=gate;gate=null;entered?.();await waiting;}
    if(op==='list'){
      const entries=[];
      async function visit(prefix=''){for(const entry of await fs.readdir(path.join(root,prefix),{withFileTypes:true})){const name=prefix?prefix+'/'+entry.name:entry.name;entries.push({path:name,kind:entry.isDirectory()?'directory':'file'});if(entry.isDirectory())await visit(name);}}
      await visit();return entries;
    }
    if(op==='read')return Array.from(await fs.readFile(local(a)));
    if(op==='write'){await fs.writeFile(local(a),Buffer.from(bytes));return;}
    if(op==='create'){await fs.writeFile(local(a),Buffer.from(bytes),{flag:'wx'});return;}
    if(op==='mkdir'){await fs.mkdir(local(a));return;}
    if(op==='remove'){await fs.unlink(local(a));return;}
    if(op==='move'){await assert.rejects(fs.stat(local(b)),{code:'ENOENT'});await fs.rename(local(a),local(b));return;}
    throw Error(op);
  });
  await page.addInitScript(()=>{window.lineaeProject={async open(){return {name:'FileTree-Test 中文',root:'file-tree-test',
    list:()=>window.diskOperation('list'),read:async p=>new Uint8Array(await window.diskOperation('read',p)),
    write:(p,bytes)=>window.diskOperation('write',p,null,Array.from(bytes)),create:(p,bytes)=>window.diskOperation('create',p,null,Array.from(bytes)),
    mkdir:p=>window.diskOperation('mkdir',p),remove:p=>window.diskOperation('remove',p),move:(a,b)=>window.diskOperation('move',a,b)};}};});
  try {
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#project-open').click();
    await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('main.tex'));
    await page.locator('.tex-indent-setting input').uncheck();
    const code=page.locator('.cm-content');
    async function check(name,action){
      let timeout;
      try {
        await Promise.race([action(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Scenario exceeded 30 seconds')),30000);})]);
        results.push({name,passed:true});console.log('PASS '+name);
      } catch(error) {
        results.push({name,passed:false,error:error.message});console.error('FAIL '+name+': '+error.message);
        await page.screenshot({path:path.join(output,'failure-'+results.length+'.png')});
        await fs.writeFile(path.join(output,'browser-failure.json'),JSON.stringify({root,results,errors},null,2));
        throw error;
      } finally {clearTimeout(timeout);}
    }
    await check('hidden tree, leftmost toggle, rapid toggles, empty directory',async()=>{
      assert.equal(await page.locator('#project-explorer').isVisible(),false);
      assert.equal(await page.locator('.document-status > :first-child').getAttribute('id'),'project-toggle');
      await page.evaluate(()=>{for(let n=0;n<21;n++)document.querySelector('#project-toggle').click();});
      assert.equal(await page.locator('#project-explorer').isVisible(),true);
      assert.equal(await page.locator('#project-toggle').getAttribute('aria-expanded'),'true');
      await page.locator('#project-explorer summary').filter({hasText:'empty-folder'}).waitFor();
    });
    const sections=page.locator('#project-explorer summary').filter({hasText:/sections$/});
    await sections.click();
    await check('typing retains tree nodes, expansion and CodeMirror instance',async()=>{
      await page.evaluate(()=>{window.treeSummary=document.querySelector('#project-explorer summary');window.codeDOM=document.querySelector('.cm-editor');});
      await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText('% draft');
      assert.equal(await page.evaluate(()=>window.treeSummary.isConnected),true,'tree summary was replaced on edit');
      assert.equal(await page.evaluate(()=>window.codeDOM===document.querySelector('.cm-editor')),true);
      assert.equal(await sections.evaluate(node=>node.parentElement.open),true);
    });
    await check('reopening same file preserves focused tree button',async()=>{
      const current=page.locator('[data-path="main.tex"]');await current.click();
      assert.equal(await current.evaluate(node=>node===document.activeElement),true);
    });
    await check('typing during native move preserves current draft and undo',async()=>{
      await page.locator('[data-path="sections/method.tex"]').click();
      await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' before move');
      gate=new Promise(done=>release=done);
      page.once('dialog',dialog=>dialog.accept('chapters/renamed.tex'));
      await page.getByRole('button',{name:'移动 method.tex',exact:true}).click();
      await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' during move');
      release();
      await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('chapters/renamed.tex'));
      assert.match(await code.innerText(),/before move during move/);
      await page.locator('#project-save').click();
      await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
      assert.match(await fs.readFile(local('chapters/renamed.tex'),'utf8'),/before move during move/);
      await assert.rejects(fs.stat(local('sections/method.tex')),{code:'ENOENT'});
      await page.screenshot({path:path.join(output,'move-draft-after.png')});
    });
    await check('nested expansion survives directory move and dirty Chinese file saves at new path',async()=>{
      await page.locator('#project-explorer summary').filter({hasText:'第一章'}).click();
      await page.locator('[data-path="第一章/研究方法.tex"]').click();
      await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' 中文草稿');
      const directory=page.locator('#project-explorer details').filter({has:page.locator('summary').filter({hasText:/^第一章$/})});
      page.once('dialog',dialog=>dialog.accept('chapters/中文 章节'));
      await directory.getByRole('button',{name:'移动目录',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('chapters/中文 章节/研究方法.tex'));
      await page.locator('#project-explorer summary').filter({hasText:/^chapters$/}).click();
      assert.equal(await page.locator('#project-explorer summary').filter({hasText:/^中文 章节$/}).evaluate(node=>node.parentElement.open),true);
      assert.match(await code.innerText(),/中文草稿/);
      await page.locator('#project-save').click();
      await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
      assert.equal(await fs.readFile(local('chapters/中文 章节/研究方法.tex'),'utf8'),'研究方法。\r\n 中文草稿');
    });
    await check('refresh reconciles external changes and preserves missing active draft',async()=>{
      await page.locator('[data-path="main.tex"]').click();
      await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' retained');
      await fs.rename(local('main.tex'),local('external-main.tex'));
      await fs.writeFile(local('added externally.tex'),'External file.\n');
      await page.locator('#project-refresh').click();
      await page.locator('[data-path="added externally.tex"]').waitFor();
      assert.match(await page.locator('[data-path="main.tex"]').getAttribute('title'),/Missing/);
      assert.match(await code.innerText(),/retained/);
      await page.locator('#project-save').click();
      await page.waitForFunction(()=>/missing on disk|ENOENT/.test(document.querySelector('#project-explorer [role=status]').textContent));
      await assert.rejects(fs.stat(local('main.tex')),{code:'ENOENT'});
      await fs.rename(local('external-main.tex'),local('main.tex'));
      await page.locator('#project-refresh').click();
      await page.waitForFunction(()=>!document.querySelector('[data-path="main.tex"]').title.includes('Missing'));
      await page.locator('[data-path="added externally.tex"]').click();
      await fs.writeFile(local('added externally.tex'),'Updated outside.\r\n');
      await page.locator('#project-refresh').click();
      await page.waitForFunction(()=>document.querySelector('.cm-content').textContent.includes('Updated outside.'));
    });
    await check('typing during reload is retained with explicit conflict',async()=>{
      gateOperation='read';gate=new Promise(done=>release=done);
      const started=new Promise(done=>entered=done);
      await page.locator('#project-reload').click();await started;
      await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' while reloading');
      release();entered=null;
      await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Draft changed'));
      assert.match(await code.innerText(),/while reloading/);
      assert.equal(await fs.readFile(local('added externally.tex'),'utf8'),'Updated outside.\r\n');
      gateOperation='move';
    });
    await check('collisions and invalid paths leave editor and disk unchanged',async()=>{
      for(const destination of ['main.tex','../escaped.tex','chapters\\bad.tex','CON.tex']){
        page.once('dialog',dialog=>dialog.accept(destination));
        await page.getByRole('button',{name:'重命名 added externally.tex',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.length>0);
        assert.match(await code.innerText(),/while reloading/);
        assert.equal(await fs.readFile(local('added externally.tex'),'utf8'),'Updated outside.\r\n');
      }
    });
    await check('delete confirmation, in-flight typing retention, and normal active-file deletion',async()=>{
      page.once('dialog',dialog=>dialog.accept('delete-test.tex'));
      await page.locator('#project-create').click();
      await page.locator('[data-path="delete-test.tex"]').click();
      await code.click();await page.keyboard.insertText('draft to delete');
      page.once('dialog',dialog=>dialog.dismiss());await page.locator('#project-delete').click();
      assert.equal(await fs.readFile(local('delete-test.tex'),'utf8'),'');
      gateOperation='remove';gate=new Promise(done=>release=done);
      const started=new Promise(done=>entered=done);
      page.once('dialog',dialog=>dialog.accept());await page.locator('#project-delete').click();await started;
      await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' typed during delete');
      release();entered=null;gateOperation='move';
      await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('new edits retained'));
      assert.match(await code.innerText(),/typed during delete/);
      assert.match(await page.locator('[data-path="delete-test.tex"]').getAttribute('title'),/Missing/);
      await assert.rejects(fs.stat(local('delete-test.tex')),{code:'ENOENT'});
      page.once('dialog',dialog=>dialog.accept('normal-delete.tex'));
      await page.locator('#project-create').click();await page.locator('[data-path="normal-delete.tex"]').click();
      page.once('dialog',dialog=>dialog.accept());await page.locator('#project-delete').click();
      await page.waitForFunction(()=>!document.querySelector('[data-path="normal-delete.tex"]'));
      assert.equal(await page.locator('[data-path="main.tex"]').getAttribute('aria-current'),'true');
    });
    await check('long names and large tree stay within sidebar, scroll and preserve editor',async()=>{
      const longName='very-long-file-name-'.repeat(8)+'.tex';
      await fs.writeFile(local(longName),'Long name.');
      for(let n=0;n<200;n++)await fs.writeFile(local('empty-folder/file-'+n+'.tex'),'File '+n);
      const start=Date.now();await page.locator('#project-refresh').click();
      await page.locator('[data-path="'+longName+'"]').waitFor();
      console.log('INFO refresh 200 added files '+(Date.now()-start)+'ms');
      assert.equal(await page.locator('#project-explorer').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'sidebar content overflows horizontally');
      const folder=page.locator('#project-explorer summary').filter({hasText:/^empty-folder$/});
      await folder.focus();await page.keyboard.press('Space');
      assert.equal(await folder.evaluate(node=>node.parentElement.open),true);
      await page.locator('[data-path="empty-folder/file-199.tex"]').scrollIntoViewIfNeeded();
      await page.locator('#project-toggle').click();
      await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' hidden edit');
      await page.locator('#project-toggle').click();
      assert.equal(await folder.evaluate(node=>node.parentElement.open),true);
      assert.match(await code.innerText(),/hidden edit/);
    });
    await check('cancelled and empty directory opens retain the current project and draft',async()=>{
      const current=await code.innerText();
      await page.evaluate(()=>{window.normalProjectOpen=window.lineaeProject.open;window.lineaeProject.open=async()=>{throw new DOMException('Cancelled','AbortError');};});
      page.once('dialog',dialog=>dialog.accept());await page.locator('#project-open').click();
      await page.waitForFunction(()=>document.querySelector('#project-explorer').getAttribute('aria-busy')==='false');
      assert.equal(await code.innerText(),current);
      await page.evaluate(()=>{window.lineaeProject.open=async()=>({name:'Empty',root:'empty-project',list:async()=>[]});});
      page.once('dialog',dialog=>dialog.accept());await page.locator('#project-open').click();
      await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('No TeX'));
      assert.equal(await code.innerText(),current);
      await page.evaluate(()=>window.lineaeProject.open=window.normalProjectOpen);
    });
    await page.evaluate(async()=>{await Promise.all(document.querySelector('.tex-workspace').getAnimations().map(animation=>animation.finished));});
    await page.screenshot({path:path.join(output,process.env.FILE_TREE_BASELINE?'before.png':'after.png')});
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,process.env.FILE_TREE_BASELINE?'baseline.json':'browser-results.json'),JSON.stringify({root,results,errors},null,2));
    if(results.some(result=>!result.passed))process.exitCode=1;
    console.log(`${results.filter(r=>r.passed).length}/${results.length} File Tree browser scenarios passed`);
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
