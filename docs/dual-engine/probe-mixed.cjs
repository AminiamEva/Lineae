// Run from the checkout with the .tex path, output directory, and optional graphic.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const {once} = require('node:events');
const {chromium} = require(require.resolve('playwright', {paths:[process.cwd()]}));
const {revealToolbar} = require(path.resolve('tests/workspace-ui-helpers.cjs'));

function measure() {
  const root = document.querySelector('.ProseMirror');
  const pages = Array.from(document.querySelectorAll('.document-sheet'));
  const rects = pages.map(page => page.getBoundingClientRect());
  const zoom = rects[0].width / parseFloat(getComputedStyle(pages[0]).width);
  function locate(rect) {
    const index = Math.max(0, rects.findLastIndex(sheet => sheet.top <= rect.top + 0.01));
    const sheet = rects[index];
    return {page:index + 1, x:(rect.left-sheet.left)/zoom, y:(rect.top-sheet.top)/zoom,
      width:rect.width/zoom, height:rect.height/zoom};
  }
  // A probe outside the editor measures the text Range top to the CSS baseline.
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;left:-9999px;visibility:hidden;white-space:pre;';
  document.body.append(probe);
  const metrics=new Map();
  function ascent(style,ch) {
    const properties=['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','fontFeatureSettings'];
    const key=JSON.stringify([ch,...properties.map(p=>style[p])]);
    if(metrics.has(key))return metrics.get(key);
    for(const property of properties)probe.style[property]=style[property];
    const sample=document.createTextNode(ch), marker=document.createElement('i');
    marker.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';
    probe.replaceChildren(sample,marker);
    const range=document.createRange();
    range.selectNodeContents(sample);
    const value=marker.getBoundingClientRect().top-range.getBoundingClientRect().top;
    metrics.set(key,value);
    return value;
  }
  function origin(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (text.parentElement.closest('.ProseMirror-widget')) continue;
      const i = text.data.search(/[^\s\u200b\u2060\ufeff]/);
      if (i < 0) continue;
      const ch = text.data[i], style = getComputedStyle(text.parentElement);
      const range = document.createRange();
      range.setStart(text, i); range.setEnd(text, i+1);
      const box = locate(range.getBoundingClientRect());
      return {...box,ch,font:style.fontFamily,baseline:box.y+ascent(style,ch)};
    }
    return null;
  }
  try {
    const paragraphs = Array.from(root.querySelectorAll('p')).filter(p=>!p.closest('td,th'));
    const ruleCandidates = Array.from(root.querySelectorAll('*')).filter(el=>{
      const {width,height}=locate(el.getBoundingClientRect());
      return Math.abs(width-20*96/25.4)<1 && Math.abs(height-12*96/25.4)<1;
    }).map(el=>({tag:el.tagName,box:locate(el.getBoundingClientRect()),paint:getComputedStyle(el).backgroundColor}));
    const figure=root.querySelector('figure[data-wrap=true]');
    const image=figure?.querySelector('img');
    const textLines = paragraphs.slice(0,3).map(p=>{
      const lines=new Map(),walk=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);
      while(walk.nextNode()){
        const t=walk.currentNode;
        if(t.parentElement.closest('.ProseMirror-widget'))continue;
        for(let i=0;i<t.length;i++){
          if(!t.data[i].trim())continue;
          const range=document.createRange();range.setStart(t,i);range.setEnd(t,i+1);
          const r=locate(range.getBoundingClientRect()),key=r.page+'/'+r.y;
          const line=lines.get(key) ?? {page:r.page,top:r.y,baseline:r.y+ascent(getComputedStyle(t.parentElement),t.data[i]),left:r.x,right:r.x,text:''};
          line.left=Math.min(line.left,r.x);line.right=Math.max(line.right,r.x+r.width);line.text+=t.data[i];lines.set(key,line);
        }
      }
      return [...lines.values()];
    });
    return {engine:root.dataset.paragraphProfile,zoom,pages:rects.map(r=>({width:r.width/zoom,height:r.height/zoom})),
      first:paragraphs.length?origin(paragraphs[0]):null, textLines, ruleCandidates,
      rows:Array.from(root.querySelectorAll('tr'),row=>({text:row.innerText,box:locate(row.getBoundingClientRect()),origin:origin(row),lastCellOrigin:origin(row.lastElementChild)})),
      wrapBox:figure?locate(figure.getBoundingClientRect()):null, imageBox:image?locate(image.getBoundingClientRect()):null,
      ast:root.editor.getJSON(),html:root.innerHTML};
  } finally { probe.remove(); }
}

async function run(){
  const [input,output,image] = process.argv.slice(2);
  const bytes=await fs.readFile(input), name=path.basename(input);
  await fs.mkdir(output,{recursive:true});
  const port=process.env.LINEAE_AUDIT_PORT || '39948';
  const server=spawn(process.execPath,['scripts/serve.mjs','apps/web',port],{stdio:['ignore','pipe','inherit']});
  let browser;
  try {
    await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([rc])=>{throw Error('Server exit '+rc);})]);
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1.25});
    await page.goto('http://127.0.0.1:'+port);
    await page.locator('#file').setInputFiles({name,mimeType:'text/plain',buffer:bytes});
    await page.waitForFunction(n=>document.querySelector('.tex-filename')?.textContent===n,name);
    const parsed=await page.evaluate(async text=>(await import('/latex/document.mjs')).parseDocument(text),bytes.toString('utf8'));
    await fs.writeFile(path.join(output,'parse.json'),JSON.stringify(parsed,null,2));
    if(image){
      const figure=page.locator('figure[data-wrap=true]');
      const choose=page.waitForEvent('filechooser');
      await figure.getByRole('button',{name:/plot\.png/}).click();
      await (await choose).setFiles({name:'plot.png',mimeType:'image/png',buffer:await fs.readFile(image)});
      await figure.locator('img').waitFor();
    }
    await page.locator('.engine-panel').evaluate(el=>el.open=true);
    for(const engine of ['xelatex','lualatex']){
      await page.locator('#engine-choice').selectOption(engine);
      await page.locator('.ProseMirror[data-paragraph-profile='+engine+']').first().waitFor({state:'attached'});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(700);
      const snapshot=await page.evaluate(measure);
      const cdp=await page.context().newCDPSession(page);
      try {
        await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        const {root}=await cdp.send('DOM.getDocument');
        const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.ProseMirror p'});
        if(nodeId)snapshot.platformFonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
      } finally { await cdp.detach(); }
      await fs.writeFile(path.join(output,engine+'.json'),JSON.stringify(snapshot,null,2));
      await page.screenshot({path:path.join(output,engine+'.png')});
    }
    await revealToolbar(page);
    if(!await page.locator('#download').isVisible())await page.locator('[data-group=files]').click();
    const event=page.waitForEvent('download');await page.locator('#download').click();
    const zip=await fs.readFile(await (await event).path());
    assert.equal(zip.readUInt32LE(0),0x04034b50);
    assert.equal(zip.readUInt16LE(8),0,'Expected stored source');
    const nameEnd=30+zip.readUInt16LE(26);
    assert.equal(zip.toString('utf8',30,nameEnd),name);
    const offset=nameEnd+zip.readUInt16LE(28);
    const exported=zip.subarray(offset,offset+zip.readUInt32LE(22));
    await fs.writeFile(path.join(output,'export.tex'),exported);
    const hash=b=>createHash('sha256').update(b).digest('hex');
    const result={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
      browser:browser.version(),source:hash(bytes),export:hash(exported),equal:bytes.equals(exported)};
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
    assert.ok(result.equal,'Export changed source bytes');
  } finally {await browser?.close();server.kill();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
