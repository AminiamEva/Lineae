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
(async () => {
  await new Promise(done => server.listen(0,'127.0.0.1',done));
  const browser = await chromium.launch({headless:true,executablePath:process.env.LINEAE_CHROMIUM_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = []; page.on('pageerror',error => errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#project-open').waitFor();
    // Only the native picker is substituted. All handles and disk operations below
    // are Chromium's real origin-private filesystem, not an in-memory adapter.
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      window.testDirectory = await root.getDirectoryHandle('phase1',{create:true});
      const put = async (dir,name,text) => { const h = await dir.getFileHandle(name,{create:true}); const w = await h.createWritable(); await w.write(text); await w.close(); };
      await put(testDirectory,'main.tex','\\documentclass{article}\r\n\\begin{document}\nMain text.\r\n\\end{document}\r\n');
      const section = await testDirectory.getDirectoryHandle('sections',{create:true});
      await put(section,'intro.tex','Child paragraph.\r\n');
      await put(testDirectory,'refs.bib','@book{key, title={中文}}\r\n');
      window.showDirectoryPicker = async () => testDirectory;
    });
    await page.locator('#project-open').click();
    await page.waitForFunction(() => document.querySelector('.tex-filename')?.textContent.includes('main.tex'));
    await page.locator('.tex-indent-setting input').uncheck();
    assert.equal(await page.locator('#project-explorer').isVisible(), false);
    assert.equal(await page.locator('.document-status > :first-child').getAttribute('id'), 'project-toggle');
    await page.locator('#project-toggle').click();
    await page.locator('#project-explorer summary').click();
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
    await page.waitForFunction(async()=> {try{return (await (await (await testDirectory.getFileHandle('main.tex')).getFile()).text()).includes('  Main text.');}catch(error){if(error.name==='NotFoundError')return false;throw error;}});
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
    await page.locator('#project-open').click();
    await page.waitForFunction(() => document.querySelector('.cm-content').textContent.includes('external'));
    assert.equal(await page.locator('#project-explorer').isVisible(), false);
    assert.deepEqual(errors, []);
    // Native IPC contract backed by real Windows files; this does not test Rust
    // compilation or the native dialog itself.
    const diskRoot=await mkdtemp(resolve('test-results/phase1/native-中文 '));
    await mkdir(resolve(diskRoot,'sections'));
    await mkdir(resolve(diskRoot,'destination'));
    await writeFile(resolve(diskRoot,'paper.tex'),'\\documentclass{article}\n\\begin{document}\nPaper.\n\\end{document}\n');
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
    await page.locator('#project-open').click();
    await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('paper.tex'));
    await page.locator('#project-toggle').click();
    await page.locator('#project-explorer summary').filter({hasText:'sections'}).click();
    await page.locator('[data-path="sections/method.tex"]').click();
    await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText('Unsaved 中文');
    page.once('dialog',dialog=>dialog.accept('sections/renamed.tex'));
    await page.getByRole('button',{name:'重命名 method.tex',exact:true}).click();
    await page.locator('[data-path="sections/renamed.tex"]').waitFor();
    assert.match(await code.innerText(),/Unsaved 中文/);
    page.once('dialog',dialog=>dialog.accept('destination/moved.tex'));
    await page.getByRole('button',{name:'移动 renamed.tex',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('destination/moved.tex'));
    await page.locator('#project-save').click();
    await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('Saved'));
    assert.equal(await readFile(resolve(diskRoot,'destination/moved.tex'),'utf8'),'Method.\r\nUnsaved 中文');
    await assert.rejects(readFile(resolve(diskRoot,'sections/method.tex')),{code:'ENOENT'});
    await code.click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' Recovered draft');
    assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('lineae:project-recovery:'))));
    await writeFile(resolve(diskRoot,'destination/moved.tex'),'external after interruption');
    page.once('dialog',dialog=>dialog.accept());
    await page.reload();await page.locator('#project-open').waitFor();
    await page.evaluate(()=>{window.__TAURI_INTERNALS__={invoke:window.nativeInvoke};});
    await page.addScriptTag({content:await readFile('apps/desktop/src-tauri/src/bridge.js','utf8')});
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#project-open').click();
    await page.waitForFunction(()=>document.querySelector('.tex-filename')?.textContent.includes('paper.tex'));
    await page.locator('#project-toggle').click();
    await page.locator('#project-explorer summary').filter({hasText:'destination'}).click();
    await page.locator('[data-path="destination/moved.tex"]').click();
    assert.match(await code.innerText(),/Recovered draft/);
    await page.locator('#project-save').click();
    await page.waitForFunction(()=>document.querySelector('#project-explorer [role=status]').textContent.includes('changed on disk'));
    assert.equal(await readFile(resolve(diskRoot,'destination/moved.tex'),'utf8'),'external after interruption');
    console.log('PASS: draft checkpoint survives fresh page instance, restore confirmation and external-change conflict protection');
    console.log('PASS: native bridge contract + real Windows disk UI rename/move, no-main.tex detection, unsaved draft retention, save at moved path');
    console.log('PASS: native OPFS project lifecycle, hidden tree, toggle placement, drafts, Split, byte-exact mixed EOL save, conflict protection, reopen, four viewport layouts');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
