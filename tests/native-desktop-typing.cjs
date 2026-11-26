const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');

async function verify(){
  const tex=resolve('.native-tex/texlive');
  const rtex=resolve('.native-tex/rtex/rtex-0.0.8-x86_64-pc-windows-msvc');
  const endpoint='http://127.0.0.1:19223';
  const app=spawn(resolve('apps/desktop/src-tauri/target/debug/lineae.exe'),[],{
    windowsHide:true,stdio:'inherit',env:{...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=19223',
      LINEAE_RTEX_PATH:resolve(rtex,'bin/rtex.exe'),RTEX_TEXDIR:resolve(rtex,'share/rtex/tex'),
      RTEX_TEXLIVE_BIN:resolve(tex,'bin/windows'),TEXMFVAR:resolve(tex,'texmf-var'),
      TEXMFCONFIG:resolve(tex,'texmf-config'),TEXMFHOME:resolve(tex,'texmf-home')}
  });
  let browser;
  try{
    for(let i=0;i<120&&!browser;i++){
      await delay(500);
      if(app.exitCode!==null)throw Error('Desktop exited before WebView2 attached');
      browser=await chromium.connectOverCDP(endpoint,{timeout:1000}).catch(()=>null);
    }
    if(!browser)throw Error('WebView2 did not open');
    const context=browser.contexts()[0];
    const page=context.pages()[0]??await context.waitForEvent('page');
    page.setDefaultTimeout(90000);
    const panel=page.locator('#native-tex-preview[data-state=current]');
    await panel.locator('canvas').first().click({position:{x:155,y:175}});
    await page.keyboard.type('First paragraph!',{delay:10});
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(' 正文');
    const expected='First paragraph 正文';
    await page.waitForFunction(value=>document.querySelector('.document-page .ProseMirror')?.textContent===value,expected);
    await panel.waitFor();
    await page.locator('[data-source-mode=source]').click();
    await page.waitForFunction(value=>document.querySelector('.cm-content')?.textContent.includes(value),expected);
  }finally{
    await browser?.close();
    app.kill();
  }
}
verify().catch(error=>{console.error(error);process.exitCode=1;});
