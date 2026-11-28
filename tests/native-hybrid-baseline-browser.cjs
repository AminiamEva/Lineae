const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? {channel:'msedge'} : {});
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>
      main,aside,.document-page,canvas {position:absolute;inset:0;width:600px;height:600px}
      .document-page {translate:var(--native-edit-shift,0 0)}
      p {margin:0;line-height:28px;font:20px/28px serif}
    </style><aside><div data-native-page="1"><canvas></canvas></div></aside>
    <main><div class="document-page"><article contenteditable><h1>1</h1><p>rj</p><p><br></p><p><br></p><p>2</p><p>2</p></article></div></main>`);
    const source = readFileSync('apps/web/src/ui/native-paragraph-overlay.mjs','utf8');
    await page.addScriptTag({content:source.replace('export function','function')});
    const positions = await page.evaluate(() => {
      const editor=document.querySelector('article'), panel=document.querySelector('aside');
      const overlay=nativeParagraphOverlay(editor,panel,panel,()=>false);
      const rows=[...editor.querySelectorAll('p')];
      editor.focus();
      const geometry={paintedLines:(_,text)=>text==='rj'?[{x:.1,baseline:.15}]:
        [{x:.1,baseline:.2},{x:.1,baseline:.25}]};
      return [rows[0],rows.at(-1)].map(row=>{
        document.getSelection().collapse(row.firstChild,0);
        overlay.begin(1);
        overlay.reveal(row);
        overlay.alignPainted(geometry);
        const range=document.createRange();
        range.selectNodeContents(row);
        const rect=range.getBoundingClientRect();
        const ctx=document.createElement('canvas').getContext('2d');
        ctx.font='20px serif';
        return [rect.left,rect.top+ctx.measureText(row.textContent).fontBoundingBoxAscent];
      });
    });
    [[60,90],[60,150]].forEach((point,i)=>point.forEach((v,j)=>assert.ok(Math.abs(positions[i][j]-v)<1,JSON.stringify(positions))));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
