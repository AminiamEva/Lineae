const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {createServer} = require('node:http');
const {readFile} = require('node:fs/promises');
const {resolve,extname,sep} = require('node:path');

const root = resolve('apps/web');
const server = createServer(async (req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (pathname === '/priority-probe') {
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><title>Shortcut priority test</title><div id="edit" contenteditable>Editor</div><div id="controls"></div>');
    return;
  }
  const path = resolve(root,'.'+pathname.replace(/\/$/,'/index.html'));
  if (!path.startsWith(root+sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
      '.css':'text/css','.woff2':'font/woff2','.otf':'font/otf'}[extname(path)]??'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});

(async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const browser = await chromium.launch({headless:true,...(process.env.LINEAE_BROWSER_CHANNEL
    ?{channel:process.env.LINEAE_BROWSER_CHANNEL}:{})});
  const base = 'http://127.0.0.1:'+server.address().port;
  const errors = [];
  const probe = async (supported=true,desktop=false)=>{
    const page = await browser.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/priority-probe');
    await page.evaluate(async ({supported,desktop})=>{
      const {installShortcutPriority} = await import('/src/ui/shortcut-priority.mjs');
      const {compileKeybindings} = await import('/src/editor/keybindings.mjs');
      window.compile = compileKeybindings;
      window.probe = {calls:[],fullscreen:null,focused:true,hidden:false,locked:false,
        denyFullscreen:false,denyLock:false,delayLock:false};
      Object.defineProperty(document,'fullscreenEnabled',{configurable:true,get:()=>true});
      Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>probe.fullscreen});
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>probe.hidden});
      document.hasFocus = ()=>probe.focused;
      document.documentElement.requestFullscreen = async ()=>{
        probe.calls.push('fullscreen');
        if (probe.delayFullscreen) await new Promise(done=>{probe.resolveFullscreen=done;});
        if (probe.denyFullscreen) throw new DOMException('Fullscreen denied','NotAllowedError');
        probe.fullscreen = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));
        if (probe.fullscreenBlur) {
          probe.focused=false;
          window.dispatchEvent(new Event('blur'));
        }
      };
      document.exitFullscreen = async ()=>{
        probe.calls.push('exit');
        probe.fullscreen = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
      Object.defineProperty(navigator,'keyboard',{configurable:true,value:supported?{
        lock:async codes=>{
          probe.calls.push({lock:codes});
          if (probe.delayLock) await new Promise(done=>{probe.resolveLock=done;});
          if (probe.denyLock) throw new DOMException('Keyboard lock denied','NotAllowedError');
          probe.locked = true;
        },
        unlock:()=>{probe.calls.push('unlock');probe.locked=false;},
      }:undefined});
      if (desktop) window.__TAURI__={core:{}};
      window.bindings = compile({global:{save:'mod+s'},math:{matrix:'mod+m'}},{isMac:true});
      window.priority = installShortcutPriority({host:document.querySelector('#controls'),before:null,getBindings:()=>bindings});
    },{supported,desktop});
    return page;
  };
  try {
    let page = await probe();
    let button = page.locator('#keyboard-priority');
    await page.locator('#edit').click();
    assert.deepEqual(await page.evaluate(()=>probe.calls),[],'Loading or clicking the editor never starts capture');
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'on');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'edit','Enabling preserves the editing focus');
    assert.deepEqual(await page.evaluate(()=>probe.calls.find(call=>call.lock).lock),['KeyM','KeyS']);
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'off');
    assert.equal(await page.evaluate(()=>probe.fullscreen),null);
    assert.equal(await page.evaluate(()=>probe.locked),false);

    await button.click();
    await page.evaluate(()=>{probe.focused=false;window.dispatchEvent(new Event('blur'));});
    assert.equal(await button.getAttribute('data-state'),'paused');
    assert.equal(await page.evaluate(()=>probe.locked),false);
    await page.evaluate(()=>{probe.focused=true;window.dispatchEvent(new Event('focus'));});
    assert.equal(await button.getAttribute('data-state'),'paused','Returning focus never resumes capture automatically');
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'on');
    await page.evaluate(()=>{probe.hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.evaluate(()=>probe.locked),false,'Hiding the tab releases capture');
    await page.evaluate(()=>{probe.hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await button.getAttribute('data-state'),'paused');
    await button.click();
    await page.evaluate(()=>{
      window.bindings=compile({global:{save:null,open:'alt+o'},math:{matrix:null}});
      priority.refresh();
    });
    assert.equal(await button.getAttribute('data-state'),'paused','Importing bindings releases stale physical codes');
    await button.click();
    assert.deepEqual(await page.evaluate(()=>probe.calls.filter(call=>call.lock).at(-1).lock),['KeyO']);
    await page.evaluate(()=>{window.bindings=compile({global:{save:null}});priority.refresh();});
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'error');
    assert.equal(await page.evaluate(()=>probe.calls.some(call=>call.lock?.length===0)),false,'Never call lock([]), which captures every key');
    assert.equal(await page.evaluate(()=>probe.fullscreen),null);
    await page.close();

    page = await probe();
    button = page.locator('#keyboard-priority');
    await page.evaluate(()=>{probe.denyLock=true;});
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'error');
    assert.equal(await page.locator('#keyboard-priority-message').isVisible(),true,'Failure is shown, not silently swallowed');
    assert.equal(await page.evaluate(()=>probe.fullscreen),null,'A failed lock rolls back fullscreen opened by the controller');
    await page.evaluate(()=>{probe.denyLock=false;probe.denyFullscreen=true;});
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'error');
    await page.evaluate(()=>{
      probe.denyFullscreen=false;
      probe.fullscreen=document.documentElement;
    });
    await button.click();
    await button.click();
    assert.equal(await page.evaluate(()=>probe.fullscreen===document.documentElement),true,'Stopping does not exit fullscreen owned by somebody else');
    await page.evaluate(()=>{probe.fullscreen=document.querySelector('#edit');});
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'error');
    assert.equal(await page.evaluate(()=>probe.fullscreen.id),'edit','Other fullscreen content is not replaced or exited');
    await page.close();

    page = await probe();
    button = page.locator('#keyboard-priority');
    await page.evaluate(()=>{probe.delayLock=true;});
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'starting');
    await page.evaluate(()=>{
      probe.fullscreen=null;
      document.dispatchEvent(new Event('fullscreenchange'));
      probe.resolveLock();
    });
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').getAttribute('aria-busy')==='false');
    assert.equal(await button.getAttribute('data-state'),'off');
    assert.equal(await page.evaluate(()=>probe.locked),false,'Late lock resolution cannot restore capture after fullscreen exit');
    await button.click();
    await page.evaluate(()=>{
      probe.focused=false;
      window.dispatchEvent(new Event('blur'));
      probe.focused=true;
      window.dispatchEvent(new Event('focus'));
      probe.resolveLock();
    });
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').getAttribute('aria-busy')==='false');
    assert.equal(await page.evaluate(()=>probe.locked),true,'Permission UI may temporarily blur the window without canceling approval');
    assert.equal(await button.getAttribute('data-state'),'on');
    await button.click();
    await button.click();
    await page.evaluate(()=>{
      probe.focused=false;
      window.dispatchEvent(new Event('blur'));
      probe.resolveLock();
    });
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').getAttribute('aria-busy')==='false');
    assert.equal(await page.evaluate(()=>probe.locked),false,'An unfocused window cannot retain a pending lock indefinitely');
    await page.evaluate(()=>{probe.focused=true;window.dispatchEvent(new Event('focus'));});
    assert.notEqual(await button.getAttribute('data-state'),'on','Returning after canceled startup never restores capture');
    await button.click();
    await page.evaluate(()=>{priority.destroy();probe.resolveLock();});
    await page.waitForFunction(()=>!probe.locked);
    assert.equal(await button.count(),0,'Destroy removes controls and releases a pending lock');
    await page.close();

    page = await probe();
    button = page.locator('#keyboard-priority');
    await page.evaluate(()=>{probe.delayFullscreen=true;});
    await button.click();
    await page.keyboard.press('Escape');
    await page.evaluate(()=>probe.resolveFullscreen());
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').getAttribute('aria-busy')==='false');
    assert.equal(await page.evaluate(()=>probe.fullscreen),null,'Late fullscreen entry is rolled back after cancellation');
    assert.equal(await page.evaluate(()=>probe.calls.some(call=>call.lock)),false,'A canceled fullscreen request never starts locking keys');
    await page.close();

    page = await probe();
    button = page.locator('#keyboard-priority');
    await page.evaluate(()=>{probe.fullscreenBlur=true;});
    await button.click();
    assert.equal(await button.getAttribute('data-state'),'starting','Fullscreen transition may still be handing focus back to the page');
    await page.evaluate(()=>{probe.focused=true;window.dispatchEvent(new Event('focus'));});
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').dataset.state==='on');
    assert.equal(await page.evaluate(()=>probe.locked),true,'A delayed fullscreen focus handoff does not abort startup');
    await page.close();

    page = await probe();
    button = page.locator('#keyboard-priority');
    await page.evaluate(()=>{probe.delayLock=true;});
    await button.click();
    await page.evaluate(()=>{
      probe.focused=false;
      window.dispatchEvent(new Event('blur'));
      probe.resolveLock();
    });
    await page.waitForFunction(()=>probe.locked);
    assert.equal(await button.getAttribute('data-state'),'starting');
    await page.evaluate(()=>{probe.focused=true;window.dispatchEvent(new Event('focus'));});
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').dataset.state==='on');
    assert.equal(await page.evaluate(()=>probe.locked),true,'Permission resolution before its focus event is tolerated');
    await page.close();

    page = await probe(false);
    button = page.locator('#keyboard-priority');
    assert.equal(await button.isDisabled(),true);
    assert.equal(await button.getAttribute('data-state'),'unsupported');
    assert.equal(await page.evaluate(()=>priority.toggle()),false);
    assert.deepEqual(await page.evaluate(()=>probe.calls),[]);
    await page.close();

    page = await probe(true,true);
    assert.equal(await page.locator('#keyboard-priority').isHidden(),true,'Native desktop does not expose a browser-only fullscreen control');
    assert.equal(await page.evaluate(()=>priority.toggle()),false);
    await page.close();

    // Actual browser APIs, without mocks. CDP key events exercise the app
    // router, not macOS's delivery of physical Command combinations.
    page = await browser.newPage({locale:'en-US',viewport:{width:1440,height:1100}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('input#file').setInputFiles({name:'priority.tex',mimeType:'text/plain',
      buffer:Buffer.from('\\documentclass{article}\n\\begin{document}\n$abc$\n\\end{document}\n')});
    await page.waitForFunction(()=>document.querySelector('math-field')?.value==='abc');
    const field = page.locator('math-field');
    await field.click();
    await field.evaluate(field=>{field.focus();field.position=field.lastOffset;});
    button = page.locator('#keyboard-priority');
    const saved = await page.evaluate(()=>localStorage.getItem('lineae.config'));
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').dataset.state==='on');
    assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'MATH-FIELD');
    assert.equal(await page.evaluate(()=>localStorage.getItem('lineae.config')),saved,'Enabling does not persist a new keymap or auto-start preference');
    await page.keyboard.press('Control+f');
    assert.match(await field.evaluate(field=>field.value),/\\frac/,'The existing math shortcut still routes to MathLive');
    await field.evaluate(field=>{
      field.executeCommand('selectAll');
      window.priorityCopySeen=false;
      field.addEventListener('copy',()=>{window.priorityCopySeen=true;},{once:true});
    });
    await page.keyboard.press('Control+c');
    await page.waitForFunction(()=>window.priorityCopySeen);
    await page.locator('[data-source-mode=source]').click();
    await page.locator('.tex-code .cm-content').click();
    await page.keyboard.press('Control+f');
    await page.locator('.cm-search').waitFor({state:'visible'});
    await page.locator('.cm-search button[name=close]').click();
    await page.locator('#settings-open').click();
    await page.locator('[data-settings-yaml]').evaluate(node=>{node.closest('details').open=true;});
    await page.locator('[data-settings-yaml]').fill('keybindings:\n  global:\n    shortcutPriority: ctrl+alt+k\n');
    await page.locator('#settings-apply').click();
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').dataset.state==='paused');
    await page.locator('#settings-close').click();
    await page.keyboard.press('Control+Alt+k');
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').dataset.state==='on');
    await page.keyboard.press('Control+Alt+k');
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').dataset.state==='off');
    await page.waitForFunction(()=>!document.fullscreenElement);
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#keyboard-priority').dataset.state==='on');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.fullscreenElement);
    assert.equal(await button.getAttribute('data-state'),'off','Escape exits and releases the mode before the source editor consumes it');
    assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);
    assert.deepEqual(errors,[]);
    console.log(`PASS shortcut priority: lifecycle, failures, cancellation, unchanged bindings, YAML toggle, real fullscreen/lock APIs (${browser.version()})`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
