const {chromium} = require('playwright');
const {createServer} = require('node:http');
const {readFile, mkdir, mkdtemp, writeFile, readdir, rename, stat} = require('node:fs/promises');
const {resolve, extname} = require('node:path');
const assert = require('node:assert/strict');
const root = resolve('apps/web');
const server = createServer(async(req,res) => {
  const path = resolve(root, '.' + new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if (!path.startsWith(root + require('node:path').sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', {'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
async function showFilePanel(page) {
  await page.locator('[data-group=files]').click();
  await page.locator('#project-open').waitFor();
}
async function clickOpenProject(page) {
  await showFilePanel(page);
  await page.locator('#project-open').click();
}
(async () => {
  await new Promise(done => server.listen(0,'127.0.0.1',done));
  const browser = await chromium.launch({headless:true,executablePath:process.env.LINEAE_CHROMIUM_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = []; page.on('pageerror',error => errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await showFilePanel(page);
    // Only the native picker is substituted. All handles and disk operations below
    // are Chromium's real origin-private filesystem, not an in-memory adapter.
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      window.newProjectDirectory = await root.getDirectoryHandle('new-'+crypto.randomUUID(),{create:true});
      window.testDirectory = await root.getDirectoryHandle('phase1',{create:true});
      const put = async (dir,name,text) => { const h = await dir.getFileHandle(name,{create:true}); const w = await h.createWritable(); await w.write(text); await w.close(); };
      await put(testDirectory,'main.tex','\\documentclass{article}\r\n\\begin{document}\nMain text.\r\n\\end{document}\r\n');
      const section = await testDirectory.getDirectoryHandle('sections',{create:true});
      await put(section,'intro.tex','Child paragraph.\r\n');
      await put(testDirectory,'refs.bib','@book{key, title={中文}}\r\n');
      window.projectPickerTarget = newProjectDirectory;
      window.showDirectoryPicker = async () => projectPickerTarget;
    });
    assert.equal(await page.locator('#project-new').isVisible(),true,'File panel offers New project when no project is open');
    await page.locator('#project-toggle').click();
    const emptyLayout=await page.evaluate(()=>{
      const tree=document.querySelector('.project-tree').getBoundingClientRect();
      const button=document.querySelector('#project-new-empty').getBoundingClientRect();
      return {visible:button.width>0,centered:Math.abs(button.left+button.width/2-(tree.left+tree.width/2))<1
        && Math.abs(button.top+button.height/2-(tree.top+tree.height/2))<1};
    });
    assert.deepEqual(emptyLayout,{visible:true,centered:true},'Empty file tree centers a New project button');
    await page.locator('#project-toggle').click();
    await page.locator('#project-new').click();
    await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent==='main.tex');
    assert.match(await page.evaluate(async()=>(await (await newProjectDirectory.getFileHandle('main.tex')).getFile()).text()),/\\documentclass\{article\}[\s\S]*\\begin\{document\}/);
    assert.equal(await page.locator('#project-new').isHidden(),true,'New project is hidden while a project is open');
    await page.locator('#project-toggle').click();
    const treeBox=await page.locator('.project-tree').boundingBox();
    await page.locator('.project-tree').click({button:'right',position:{x:treeBox.width/2,y:treeBox.height-8}});
    const contextMenu=page.locator('#project-context-menu');
    await contextMenu.waitFor();
    assert.equal(await contextMenu.getByRole('menuitem',{name:/^(新建文件|New file)$/}).count(),1);
    assert.equal(await contextMenu.getByRole('menuitem',{name:/^(新建目录|New folder)$/}).count(),1);
    page.once('dialog',dialog=>dialog.accept('context.tex'));
    await contextMenu.getByRole('menuitem',{name:/^(新建文件|New file)$/}).click();
    await page.locator('[data-path="context.tex"]').waitFor();
    await page.locator('[data-path="context.tex"]').click({button:'right'});
    assert.equal(await contextMenu.getByRole('menuitem',{name:/^(设为主文档|Set as main document)$/}).count(),1);
    assert.equal(await contextMenu.getByRole('menuitem',{name:/^(重新加载|Reload)$/}).count(),1);
    assert.equal(await contextMenu.getByRole('menuitem',{name:/^(删除|Delete)$/}).count(),1);
    await page.keyboard.press('Escape');
    await page.locator('.project-tree').click({button:'right',position:{x:treeBox.width/2,y:treeBox.height-8}});
    page.once('dialog',dialog=>dialog.accept('trash'));
    await contextMenu.getByRole('menuitem',{name:/^(新建目录|New folder)$/}).click();
    const trash=page.locator('#project-explorer summary').filter({hasText:/^trash$/});await trash.waitFor();
    await trash.click({button:'right'});page.once('dialog',dialog=>dialog.accept('trash/inside.tex'));
    await contextMenu.getByRole('menuitem',{name:/^(新建文件|New file)$/}).click();
    await page.locator('[data-path="trash/inside.tex"]').waitFor();
    await trash.click({button:'right'});page.once('dialog',dialog=>dialog.accept());
    await contextMenu.getByRole('menuitem',{name:/^(删除目录|Delete folder)$/}).click();
    await page.waitForFunction(()=>![...document.querySelectorAll('#project-explorer summary')].some(node=>node.textContent==='trash'));
    assert.equal(await page.evaluate(async()=>{try{await newProjectDirectory.getDirectoryHandle('trash');return true;}catch{return false;}}),false);
    await page.locator('#project-close').click();
    await page.evaluate(()=>window.projectPickerTarget=window.testDirectory);
    await showFilePanel(page);
    await page.locator('#project-toggle').click();
    await page.locator('#project-new-empty').click();
    await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('empty folder'));
    assert.equal(await page.locator('#project-new').isVisible(),true,'Rejected creation keeps the no-project actions available');
    await page.locator('#project-toggle').click();
    await clickOpenProject(page);
    await page.waitForFunction(() => document.querySelector('.tex-filename')?.textContent.includes('main.tex'));
    await page.locator('.tex-indent-setting input').uncheck();
    assert.equal(await page.locator('#project-explorer').isVisible(), false);
    assert.equal(await page.locator('.document-status > :first-child').getAttribute('id'), 'project-toggle');
    await page.locator('[data-source-mode="body"]').click();
    assert.equal(await page.locator('.tex-workspace').isHidden(),true,'Project TeX files can use Document mode');
    const documentEditor=page.locator('.document-page .ProseMirror');
    await documentEditor.locator('p').last().click();await page.keyboard.press('End');await page.keyboard.insertText(' Body draft');
    await page.locator('#project-toggle').click();
    const joinedChrome = await page.evaluate(() => {
      const panel = document.querySelector('#project-explorer').getBoundingClientRect();
      const brand = document.querySelector('header .brand').getBoundingClientRect();
      const topmost = document.elementFromPoint(brand.left + brand.width / 2, brand.top + brand.height / 2);
      return {
        panelTop: panel.top,
        brandContained: brand.left >= panel.left && brand.right <= panel.right,
        brandOnTop: Boolean(topmost?.closest('.brand')),
      };
    });
    assert.deepEqual(joinedChrome,{panelTop:0,brandContained:true,brandOnTop:true},'File tree and wordmark form one continuous left rail');
    const sections=page.locator('#project-explorer summary').filter({hasText:/^sections$/});
    if(!await sections.evaluate(node=>node.parentElement.open))await sections.click();
    await page.locator('[data-path="sections/intro.tex"]').click();
    assert.match(await documentEditor.innerText(),/Child paragraph/);
    assert.equal(await page.locator('.tex-workspace').isHidden(),true,'Document mode persists while switching project files');
    await page.locator('[data-path="main.tex"]').click();
    assert.match(await documentEditor.innerText(),/Body draft/);
    await documentEditor.click();await page.keyboard.press('Control+z');assert.doesNotMatch(await documentEditor.innerText(),/Body draft/);
    await page.keyboard.press('Control+y');assert.match(await documentEditor.innerText(),/Body draft/);
    await page.keyboard.press('Control+z');
    await page.locator('[data-source-mode="source"]').click();
    const code = page.locator('.cm-content');
    await code.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('% 草稿');
    await page.locator('[data-path="sections/intro.tex"]').click();
    assert.match(await code.innerText(), /Child paragraph/);
    await page.locator('[data-source-mode="split"]').click();
    await page.locator('.tex-preview .ProseMirror').getByText('Child paragraph.').waitFor();
    const rich = page.locator('.tex-preview .ProseMirror');
    await rich.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' Rich edit');
    await page.waitForFunction(() => document.querySelector('.cm-content').textContent.includes('Rich edit'));
    await code.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('Child draft');
    await page.locator('[data-path="main.tex"]').click();
    assert.match(await code.innerText(), /草稿/);
    await page.locator('#project-save').click();
    await page.waitForFunction(() => document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
    const disk = await page.evaluate(async () => (await (await testDirectory.getFileHandle('main.tex')).getFile()).text());
    assert.equal(disk, '\\documentclass{article}\r\n\\begin{document}\nMain text.\r\n\\end{document}\r\n% 草稿');
    await page.locator('.tex-indent-setting input').check();
    await page.locator('#project-save').click();
    // Wait for the save transaction to close its writable stream before taking
    // an OPFS File snapshot. Polling disk contents during commit can invalidate
    // that snapshot on Windows Chromium and produce NotReadableError.
    await page.waitForFunction(() => document.querySelector('#project-explorer').getAttribute('aria-busy')==='false'
      && document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
    assert.equal(await page.evaluate(async()=> (await (await testDirectory.getFileHandle('main.tex')).getFile()).text()),disk.replace('Main text.','  Main text.'));
    await page.locator('.tex-indent-setting input').uncheck();
    await page.evaluate(async () => { const w = await (await testDirectory.getFileHandle('main.tex')).createWritable(); await w.write('external'); await w.close(); });
    await code.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' conflict draft');
    await page.locator('#project-save').click();
    await page.waitForFunction(() => document.querySelector('#project-explorer [role=status]').textContent.includes('changed on disk'));
    assert.equal(await page.evaluate(async () => (await (await testDirectory.getFileHandle('main.tex')).getFile()).text()), 'external');
    await page.locator('[data-path="sections/intro.tex"]').click();
    assert.match(await code.innerText(), /Child draft/);
    await page.locator('#project-save').click();
    await mkdir('test-results/phase1',{recursive:true});
    await page.screenshot({path:'test-results/phase1/split-desktop.png'});
    for (const width of [900,600,390]) {
      await page.setViewportSize({width,height:800});
      await page.screenshot({path:`test-results/phase1/split-${width}.png`});
      const boxes = await page.evaluate(() => ({tree:document.querySelector('#project-explorer').getBoundingClientRect().right, editor:document.querySelector('.tex-workspace').getBoundingClientRect().left}));
      assert.ok(boxes.editor >= boxes.tree);
    }
    await page.setViewportSize({width:1440,height:900});
    await page.locator('#project-toggle').click();
    assert.equal(await page.locator('#project-explorer').isVisible(), false);
    await page.locator('#project-toggle').click();
    page.once('dialog',dialog => dialog.accept('new.tex'));
    await page.locator('#project-create').click();
    await page.locator('[data-path="new.tex"]').waitFor();
    await page.locator('[data-path="new.tex"]').click();
    page.once('dialog',dialog => dialog.dismiss());
    await page.locator('#project-delete').click();
    assert.equal(await page.locator('[data-path="new.tex"]').count(),1);
    page.once('dialog',dialog => dialog.accept());
    await page.locator('#project-delete').click();
    await page.waitForFunction(() => !document.querySelector('[data-path="new.tex"]'));
    assert.equal(await page.evaluate(async () => {try {await testDirectory.getFileHandle('new.tex');return true;}catch{return false;}}),false);
    await page.locator('[data-path="refs.bib"]').click();
    assert.match(await code.innerText(), /@book/);
    await code.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('% bib edit');
    await page.locator('#project-save').click();
    await page.waitForFunction(() => document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
    assert.match(await page.evaluate(async () => (await (await testDirectory.getFileHandle('refs.bib')).getFile()).text()), /bib edit/);
    page.once('dialog',dialog => dialog.accept());
    await page.locator('#project-close').click();
    await clickOpenProject(page);
    await page.waitForFunction(() => document.querySelector('.cm-content').textContent.includes('external'));
    assert.equal(await page.locator('#project-explorer').isVisible(), false);
    assert.deepEqual(errors, []);
    // Native IPC contract backed by real Windows files; this does not test Rust
    // compilation or the native dialog itself.
    const diskRoot=await mkdtemp(resolve('test-results/phase1/native-中文 '));
    await mkdir(resolve(diskRoot,'sections'));
    await mkdir(resolve(diskRoot,'destination'));
    await writeFile(resolve(diskRoot,'paper.tex'),'\\documentclass{article}\n\\begin{document}\nPaper.\\input{sections/method}\n\\end{document}\n');
    await writeFile(resolve(diskRoot,'sections/method.tex'),'Method.\r\n');
    await page.exposeFunction('nativeInvoke',async(command,args={})=>{
      if(command==='open_project')return diskRoot;
      assert.equal(command,'project_operation');assert.equal(args.root,diskRoot);
      const target=path=>{const result=resolve(diskRoot,path);assert.ok(result.startsWith(diskRoot+require('node:path').sep));return result;};
      if(args.operation==='checkpoint'){await writeFile(target('.lineae-state-'+args.target+'.json'),Uint8Array.from(args.bytes));return {};}
      if(args.operation==='load_state'){
        let state={files:{},drafts:[]};const versions=[];
        for(const name of (await readdir(diskRoot)).filter(name=>name.startsWith('.lineae-state-'))){const raw=await readFile(target(name));state=JSON.parse(raw);if(state.drafts.length)versions.push({id:name.slice(14,-5),drafts:state.drafts,expected:Array.from(raw)});}
        state.drafts=[];state.recoveryVersions=versions;return {bytes:Array.from(Buffer.from(JSON.stringify(state)))};
      }
      if(args.operation==='ack_checkpoint'){const path=target('.lineae-state-'+args.target+'.json');assert.deepEqual(Array.from(await readFile(path)),args.expected);await rename(path,target('.lineae-archive-'+args.target+'.json'));return {};}
      if(args.operation==='list'){
        const entries=[];
        async function visit(path=''){for(const entry of await readdir(resolve(diskRoot,path),{withFileTypes:true})){if(entry.name.startsWith('.lineae-'))continue;const name=path?path+'/'+entry.name:entry.name;entries.push({path:name,kind:entry.isDirectory()?'directory':'file'});if(entry.isDirectory())await visit(name);}}
        await visit();return {entries,bytes:[]};
      }
      if(args.operation==='read')return {bytes:Array.from(await readFile(target(args.path)))};
      if(args.operation==='write'){await writeFile(target(args.path),Uint8Array.from(args.bytes));return {};}
      if(args.operation==='move'){
        await assert.rejects(stat(target(args.target)),{code:'ENOENT'});
        await rename(target(args.path),target(args.target));return {};
      }
      throw new Error('Unexpected operation '+args.operation);
    });
    await page.evaluate(()=>{window.__TAURI_INTERNALS__={invoke:window.nativeInvoke};});
    await page.addScriptTag({content:await readFile('apps/desktop/src-tauri/src/bridge.js','utf8')});
    await clickOpenProject(page);
    await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('paper.tex'));
    await page.locator('#project-toggle').click();
    await page.locator('#project-explorer summary').filter({hasText:'sections'}).click();
    await page.locator('[data-path="sections/method.tex"]').click();
    await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText('Unsaved 中文');
    page.once('dialog',dialog=>dialog.accept('sections/renamed.tex'));
    await page.locator('[data-path="sections/method.tex"]').click({button:'right'});
    await contextMenu.getByRole('menuitem',{name:/^(重命名|Rename)$/}).click();
    await page.locator('[data-path="sections/renamed.tex"]').waitFor();
    assert.match(await code.innerText(),/Unsaved 中文/);
    page.once('dialog',dialog=>dialog.accept('destination/moved.tex'));
    await page.locator('[data-path="sections/renamed.tex"]').click({button:'right'});
    await contextMenu.getByRole('menuitem',{name:/^(移动|Move)$/}).click();
    await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('destination/moved.tex'));
    await page.locator('#project-save').click();
    await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
    assert.equal(await readFile(resolve(diskRoot,'destination/moved.tex'),'utf8'),'Method.\r\nUnsaved 中文');
    await page.locator('[data-path="paper.tex"]').click();
    assert.match(await code.innerText(),/\\input\{destination\/moved\}/);
    await page.locator('#project-save').click();
    await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
    assert.match(await readFile(resolve(diskRoot,'paper.tex'),'utf8'),/\\input\{destination\/moved\}/);
    await assert.rejects(readFile(resolve(diskRoot,'sections/method.tex')),{code:'ENOENT'});
    const destination=page.locator('#project-explorer summary').filter({hasText:/^destination$/});
    if(!await destination.evaluate(node=>node.parentElement.open))await destination.click();
    page.once('dialog',dialog=>dialog.accept('destination/final.tex'));
    await page.locator('[data-path="destination/moved.tex"]').click({button:'right'});
    await contextMenu.getByRole('menuitem',{name:/^(移动|Move)$/}).click();
    await page.locator('[data-path="destination/final.tex"]').waitFor();
    assert.match(await code.innerText(),/\\input\{destination\/final\}/,'Active source session receives path rewrites');
    await page.keyboard.press('Control+z');assert.match(await code.innerText(),/\\input\{destination\/moved\}/);
    await page.keyboard.press('Control+y');assert.match(await code.innerText(),/\\input\{destination\/final\}/);
    await page.locator('#project-save').click();
    await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
    assert.match(await readFile(resolve(diskRoot,'paper.tex'),'utf8'),/\\input\{destination\/final\}/);
    await page.locator('[data-path="destination/final.tex"]').click();
    await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' Recovered draft');
    assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('lineae:project-recovery:'))));
    await writeFile(resolve(diskRoot,'destination/final.tex'),'external after interruption');
    page.once('dialog',dialog=>dialog.accept());
    await page.reload();await showFilePanel(page);
    await page.evaluate(()=>{window.__TAURI_INTERNALS__={invoke:window.nativeInvoke};});
    await page.addScriptTag({content:await readFile('apps/desktop/src-tauri/src/bridge.js','utf8')});
    page.once('dialog',dialog=>dialog.accept());
    await clickOpenProject(page);
    await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('paper.tex'));
    await page.locator('#project-toggle').click();
    await page.locator('#project-explorer summary').filter({hasText:'destination'}).click();
    await page.locator('[data-path="destination/final.tex"]').click();
    assert.match(await code.innerText(),/Recovered draft/);
    await page.locator('#project-save').click();
    await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('changed on disk'));
    assert.equal(await readFile(resolve(diskRoot,'destination/final.tex'),'utf8'),'external after interruption');
    console.log('PASS: draft checkpoint survives fresh page instance, restore confirmation and external-change conflict protection');
    console.log('PASS: native bridge contract + real Windows disk UI rename/move, no-main.tex detection, unsaved draft retention, save at moved path');
    console.log('PASS: native OPFS project lifecycle, hidden tree, toggle placement, drafts, Split, byte-exact mixed EOL save, conflict protection, reopen, four viewport layouts');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
