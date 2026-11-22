const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const root=resolve('apps/web');
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
      '.css':'text/css','.otf':'font/otf','.woff2':'font/woff2'})[extname(path)]??'application/octet-stream');
    res.end(await readFile(path));
  }catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const browser=await chromium.launch({headless:true});
  try{
    for(const mac of [false,true]){
      const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1100},
        permissions:['clipboard-read','clipboard-write']});
      await context.addInitScript(isMac=>{
        Object.defineProperty(navigator,'platform',{get:()=>isMac?'Unknown':'Win32'});
        if(isMac)Object.defineProperty(navigator,'userAgent',{get:()=>'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'});
      },mac);
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://127.0.0.1:'+server.address().port);
      const paper=page.locator('.ProseMirror'),mod=mac?'Meta':'Control';
      assert.equal(await page.locator('header .brand img').count(),1);
      assert.equal(await page.locator('header .brand img').getAttribute('src'),'./assets/brand/lineae-logo.png');
      await paper.click();
      const chord=async key=>{await page.keyboard.press(mod+'+e');await page.keyboard.press(key);};
      const load=async body=>{
        await page.locator('input#file').setInputFiles({name:'shortcuts.tex',mimeType:'text/plain',
          buffer:Buffer.from('\\documentclass{article}\n\\begin{document}\n\n'+body+'\n\n\\end{document}\n')});
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        if(await page.locator('[data-source-mode=body]').getAttribute('aria-pressed')!=='true')
          await page.locator('[data-source-mode=body]').click();
      };
      const mathReady=async()=>{
        const field=paper.locator('math-field').first();await field.click();
        await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD'&&
          !document.activeElement._mathfield?.focusBlurInProgress);
        return field;
      };
      const importYaml=async text=>{
        await page.locator('#settings-open').click();
        await page.locator('[data-settings-yaml]').evaluate(node=>{node.closest('details').open=true;});
        await page.locator('[data-settings-yaml]').fill(text);
        await page.locator('#settings-apply').click();
        await page.waitForFunction(()=>localStorage.getItem('lineae.config')?.includes('alt+f9'));
        await page.locator('#settings-close').click();
      };
      await load('Alpha');
      await paper.click();await page.keyboard.press('End');await page.keyboard.type('$');
      await page.waitForFunction(()=>Boolean(document.querySelector('.math-inline math-field')));
      assert.equal(await paper.locator('math-field').count(),1,'$ input remains enabled');
      await load('Alpha');await paper.click();await page.keyboard.press('End');
      if(mac)await page.keyboard.press('Control+e');
      await page.keyboard.press(mac?'Shift+f':mod+'+f');
      await paper.locator('.math-display math-field').waitFor();
      if(mac){
        await load('Alpha');await paper.click();await page.keyboard.press('End');
        await page.keyboard.press('Meta+Alt+f');
        await paper.locator('.math-display math-field').waitFor();
      }
      await load('Alpha');await paper.click();await page.keyboard.press('End');
      await page.keyboard.press(mod+'+Shift+f');
      await paper.locator('.math-inline math-field').waitFor();
      let field=await mathReady();
      await page.keyboard.press(mod+'+m');
      await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\begin{pmatrix}'));
      await load('$x$');field=await mathReady();await field.evaluate(node=>{node.position=node.lastOffset;});
      let downloads=0;page.on('download',()=>downloads++);
      await page.keyboard.press(mod+'+Shift+s');
      await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\sum'));
      assert.equal(downloads,0,'Math summation wins over global Save As');
      await load('Alpha');await paper.click();
      await page.keyboard.press(mod+'+Shift+6');
      await paper.locator('table').waitFor();
      await paper.locator('td').first().click();
      const beforeRows=await paper.locator('tr').count();
      await chord('Shift+r');
      assert.equal(await paper.locator('tr').count(),beforeRows+1);
      await chord('x');
      assert.equal(await paper.locator('tr').count(),beforeRows);
      await paper.locator('td').first().click();await chord('r');
      assert.equal(await paper.locator('td').first().getAttribute('data-align'),'right','Table cells reuse paragraph alignment shortcuts');
      await load('Alpha');await paper.click();
      if(mac){await page.keyboard.press('Control+e');await page.keyboard.press('2');}
      else await chord('2');
      await page.locator('.tex-code .cm-content').waitFor({state:'visible'});
      await page.locator('.tex-code .cm-content').click();
      if(mac){await page.keyboard.press('Control+e');await page.keyboard.press('f');}
      else await page.keyboard.press(mod+'+f');
      await page.locator('.cm-search').waitFor({state:'visible'});
      await page.keyboard.press('Escape');
      const overrides=`keybindings:
  editor:
    dollar: null
  source:
    find: alt+f9
    replace: alt+h
    indent: alt+i
    outdent: null
    undo: alt+z
    redo: alt+y
    complete: alt+space
  math:
    palette: alt+b
    nextSlot: alt+n
    previousSlot: alt+p
    enterLine: alt+enter
    eraseObject: alt+d
  system:
    selectAll: alt+a
    copy: alt+c
    cut: alt+x
    paste: alt+v
`;
      await importYaml(overrides);
      const code=page.locator('.tex-code .cm-content');await code.click();
      await page.keyboard.press(mod+'+f');
      assert.equal(await page.locator('.cm-search').count(),0,'Disabled original source shortcut does not fall through');
      await page.keyboard.press('Alt+F9');await page.locator('.cm-search').waitFor();
      await page.keyboard.press('Escape');await code.click();await page.keyboard.press('Alt+a');
      await page.keyboard.insertText('x');const beforeTab=await code.innerText();
      await page.keyboard.press('Tab');assert.equal(await code.innerText(),beforeTab,'Remapped Tab does not retain native indentation');
      await page.keyboard.press('Alt+i');assert.match(await code.innerText(),/^ {4}x/);
      await page.keyboard.press('Alt+a');await page.keyboard.press('Alt+c');
      await page.waitForFunction(async()=>/x/.test(await navigator.clipboard.readText()));
      await page.keyboard.press('End');await page.keyboard.press('Alt+v');
      await page.waitForFunction(()=>document.querySelector('.cm-content').textContent.match(/x/g)?.length===2);
      await load('Alpha');await paper.click();await page.keyboard.press('End');await page.keyboard.type('$');
      assert.equal(await paper.locator('math-field').count(),0,'YAML null disables $ input rule');
      assert.match(await paper.textContent(),/Alpha\$/);
      await load('$\\frac{\\placeholder{}}{\\placeholder{}}$');field=await mathReady();
      await field.evaluate(node=>{
        const model=node._mathfield.model;
        for(let i=0;i<=node.lastOffset;i++)if(model.at(i)?.type==='placeholder'){
          node.selection={ranges:[[i-1,i]]};break;
        }
      });
      const selection=await field.evaluate(node=>node.selection.ranges);
      await page.keyboard.press('Tab');
      assert.deepEqual(await field.evaluate(node=>node.selection.ranges),selection,'Native MathLive Tab is suppressed after remapping');
      await page.keyboard.press('Alt+n');
      assert.notDeepEqual(await field.evaluate(node=>node.selection.ranges),selection);
      await page.keyboard.press('Alt+p');
      assert.deepEqual(await field.evaluate(node=>node.selection.ranges),selection);
      await load('$x$');field=await mathReady();await page.keyboard.press('Backslash');
      assert.equal(await page.locator('.command-menu').isVisible(),false,'Old palette key is not retained');
      await page.keyboard.press('Alt+b');
      await page.locator('.command-menu').waitFor({state:'visible'});
      await page.keyboard.press('Escape');
      await load('$\\int\\mathord{\\placeholder{}}$');field=await mathReady();
      await field.evaluate(node=>{
        const model=node._mathfield.model;
        for(let i=0;i<=node.lastOffset;i++)if(model.at(i)?.command==='\\int'){node.position=i;break;}
      });
      await page.keyboard.press('Alt+d');
      assert.ok(await field.evaluate(node=>node.selection.ranges.some(([a,b])=>a!==b)));
      await page.keyboard.press('Alt+d');
      assert.equal(await field.evaluate(node=>node.value),'','Remapped structural deletion keeps two-press behavior');
      await load('\\[x\\]');field=await mathReady();await field.evaluate(node=>{node.position=node.lastOffset;});
      await page.keyboard.press('Alt+Enter');
      await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\begin{gathered}'));
      assert.deepEqual(errors,[]);
      console.log((mac?'macOS':'Windows')+' shortcuts passed: defaults, scopes, source YAML, clipboard aliases, math native remapping and null.');
      await context.close();
    }
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
