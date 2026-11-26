const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const installMockNativeTex=require('./native-math/mock-bridge.cjs');
const {revealToolbar}=require('./workspace-ui-helpers.cjs');

const projectMain='\\documentclass{article}\n\\begin{document}\n\\[\\frac{a}{}\\]\n\nBefore chapter.\n\n\\input{chapters/one}\n\nAfter chapter.\n\\end{document}\n';
const projectMainWithImage=projectMain.replace('\\begin{document}','\\usepackage{graphicx}\n\\begin{document}')
  .replace('\\end{document}','\\begin{figure}[ht]\n\\centering\n\\includegraphics[width=18pt]{plot.png}\n\\end{figure}\n\\end{document}');
const projectChapter='Original chapter.\n\n\\[\\frac{z}{}\\]\n';
async function stubImagePicker(page){
  await page.evaluate(()=>{
    const click=HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click=function(){
      if(this.type==='file'&&this.accept.includes('image/png'))return;
      return click.call(this);
    };
  });
}
async function openMockProject(page,raster=false,main=raster?projectMainWithImage:projectMain,child=projectChapter) {
  const name=await page.evaluate(async({main,child,raster})=>{
    const root=await navigator.storage.getDirectory();
    const folder=await root.getDirectoryHandle('lua-'+crypto.randomUUID(),{create:true});
    const put=async(dir,name,bytes)=>{
      const file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable();
      await writer.write(bytes);await writer.close();
    };
    await put(folder,'main.tex',main);
    const chapter=await folder.getDirectoryHandle('chapters',{create:true});
    await put(chapter,'one.tex',child);
    if(raster){
      await put(folder,'image.png',new Uint8Array([0,255,13,10]));
      const canvas=document.createElement('canvas');
      canvas.width=canvas.height=1;
      const context=canvas.getContext('2d');
      context.fillStyle='#f00';context.fillRect(0,0,1,1);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      await put(folder,'plot.png',new Uint8Array(await blob.arrayBuffer()));
      nativeProbe.raster=true;
    }
    window.showDirectoryPicker=async()=>folder;
    return folder.name;
  },{main,child,raster});
  if(!page.listenerCount('dialog'))page.on('dialog',dialog=>dialog.accept());
  await revealToolbar(page);await page.locator('[data-group=files]').click();
  await page.locator('#project-open').click();
  await page.locator('#project-explorer').getByText(name,{exact:true}).waitFor();
  await page.locator('.project-file[aria-current=true]').waitFor({state:'attached'});
}

const root=resolve('apps/web');
let nativeEvidence;
const server=createServer(async(req,res)=>{
  const pdfPath=req.url==='/native-acceptance.pdf'?process.env.LINEAE_NATIVE_PDF:
    req.url==='/native-degraded.pdf'?process.env.LINEAE_NATIVE_DEGRADED_PDF:null;
  if(pdfPath){
    try {res.setHeader('Content-Type','application/pdf');res.end(await readFile(pdfPath));}
    catch{res.writeHead(404).end();}
    return;
  }
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/native-formula-font'&&nativeEvidence){
    const key=url.searchParams.get('key');
    const font=nativeEvidence.raw.flatMap(page=>Object.values(page.dl.fonts)).find(desc=>
      key===`file:${desc.filename}#${desc.subfont??0}`&&
      /^(?:lmroman(?:5|7|8|10)-regular|lmroman12-bold|latinmodern-math|fandolsong-regular)\.otf$/i.test((desc.filename??'').split(/[\\/]/).at(-1)));
    if(!font)return res.writeHead(404).end();
    try {res.end(await readFile(font.filename));}catch{res.writeHead(404).end();}
    return;
  }
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+sep))return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
      '.css':'text/css','.otf':'font/otf','.woff2':'font/woff2'})[extname(path)]??'application/octet-stream');
    res.end(await readFile(path));
  }catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const browser=await chromium.launch({headless:true});
  let page;
  const errors=[];
  try {
    page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
    await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    const mod=process.platform==='darwin'?'Meta':'Control';
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(installMockNativeTex);

    if(process.env.LINEAE_NATIVE_ONLY==='1'){
      const desktopPage=await browser.newPage({locale:'en-US'});
      try{
        await desktopPage.addInitScript(installMockNativeTex);
        await desktopPage.addInitScript(()=>{window.__LINEAE_DESKTOP_ENGINE_TOGGLE__=true;});
        await desktopPage.goto('http://127.0.0.1:'+server.address().port+'/');
        const engine=desktopPage.locator('#native-tex-toggle');
        const preview=desktopPage.locator('#native-tex-preview');
        await preview.locator('[data-native-page="1"] canvas').waitFor();
        assert.equal(await engine.textContent(),'LuaLaTeX');
        assert.equal(await desktopPage.locator('body').evaluate(body=>body.classList.contains('native-tex-primary-open')),true);
        const source=await desktopPage.evaluate(()=>nativeProbe.source);
        await engine.click();
        await preview.waitFor({state:'hidden'});
        assert.equal(await engine.textContent(),'XeLaTeX');
        await engine.click();
        await preview.locator('[data-native-page="1"] canvas').waitFor();
        assert.equal(await desktopPage.evaluate(()=>nativeProbe.source),source);
        assert.equal(await desktopPage.evaluate(()=>localStorage.getItem('lineae.native-document-workspace')),'1');
      }finally{
        await desktopPage.close();
      }
    }

    if(process.env.LINEAE_NATIVE_ONLY==='1'){
      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const mixedSource='\\documentclass{article}\n\\begin{document}\nAlpha beta.\n\n\\[\n\\frac{a}{b}\n\\]\n\nOmega.\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'mixed.tex',mimeType:'text/plain',
        buffer:Buffer.from(mixedSource)});
      await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('Alpha beta.'));
      assert.equal(await page.locator('.document-sheets').count(),0);
      assert.equal(await page.evaluate(()=>customElements.get('math-field')),undefined);
      assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource')
        .some(entry=>entry.name.includes('/vendor/mathlive/'))),false);
      const panel=page.locator('#native-tex-preview');
      await page.locator('#native-tex-toggle').click();
      await panel.locator('[data-native-page="1"] canvas').waitFor();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      assert.equal(await panel.evaluate(async node=>{
        const before=nativeProbe.ruleRects.length;
        node.dispatchEvent(new Event('scroll'));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return nativeProbe.ruleRects.length-before;
      }),0,'Scrolling an unchanged visible native page does not repaint its glyphs');
      await page.locator('#native-tex-target').click();
      await page.locator('#native-tex-edit').click();
      const canvas=panel.locator('[data-native-page="1"] canvas');
      const scale=Number(await page.locator('#native-tex-zoom').inputValue())/100*(96/72)/65781.76;
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
      const observations=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
      await page.evaluate(()=>{nativeProbe.holdUpdate=true;});
      await page.keyboard.type('XYZ');
      await page.waitForFunction(()=>typeof nativeProbe.releaseUpdate==='function');
      await page.evaluate(()=>nativeProbe.releaseUpdate());
      await page.waitForFunction(count=>nativeProbe.source?.includes('XYZAlpha beta.') &&
        nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count+1,observations);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.keyboard.press('End');
      await page.keyboard.press(mod+'+e');
      await page.keyboard.press('e');
      await page.waitForFunction(()=>document.querySelector('.environment-tag')?.textContent.startsWith('Display math'));
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.waitForFunction(()=>document.querySelector('.environment-tag')?.textContent===
        'Display math › Fraction › Denominator');
      await page.keyboard.type('c');
      await page.waitForFunction(()=>nativeProbe.source?.includes('\\frac{a}{cb}'),null,{timeout:5000})
        .catch(async error=>{
          console.error('Native-only edit failed',await panel.getByRole('status').allTextContents(),
            await page.evaluate(()=>({source:nativeProbe.source,focus:document.activeElement?.id})));
          throw error;
        });
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(()=>nativeProbe.source?.includes('\\frac{a}{b}'));
      await page.keyboard.press(mod+'+Shift+z');
      await page.waitForFunction(()=>nativeProbe.source?.includes('\\frac{a}{cb}'));
      const expected=mixedSource.replace('Alpha beta.','XYZAlpha beta.').replace('\\frac{a}{b}','\\frac{a}{cb}');
      assert.equal(await page.evaluate(()=>nativeProbe.source),expected,'Both native edits preserve every other source byte');
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.keyboard.press(mod+'+e');
      await page.keyboard.press('t');
      await page.waitForFunction(source=>nativeProbe.source===source,expected.replace('\\frac','\\displaystyle \\frac'));
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.keyboard.press(mod+'+e');
      await page.keyboard.press('t');
      await page.waitForFunction(source=>nativeProbe.source===source,expected);
      assert.deepEqual(errors,[]);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.keyboard.press(mod+'+j');
      await page.keyboard.type('Z');
      await page.waitForFunction(source=>nativeProbe.source===source,expected.replace('\\frac{a}{cb}','\\frac{a}{cb}Z'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,expected);
      await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
        call.args.sourceRevision===nativeProbe.revision));
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
      await page.keyboard.press('Backslash');
      const nativePalette=page.getByRole('dialog',{name:'LaTeX completion',exact:true});
      await nativePalette.waitFor();
      await panel.dispatchEvent('scroll');
      await nativePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('sqrt');
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>nativeProbe.source?.includes('\\sqrt{}'));
      const rootObservations=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,expected);
      await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,rootObservations);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.evaluate(()=>navigator.clipboard.writeText('\\alpha'));
      await page.keyboard.press(mod+'+v');
      await page.waitForFunction(source=>nativeProbe.source===source,expected.replace('}{cb}','}{\\alpha cb}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,expected);
      await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
        call.args.sourceRevision===nativeProbe.revision));
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.keyboard.insertText('^');
      await page.keyboard.insertText('^');
      await page.waitForFunction(source=>nativeProbe.source===source,expected.replace('}{cb}','}{\\text{ˆ}cb}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,expected);
      await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
        call.args.sourceRevision===nativeProbe.revision));
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.keyboard.press(mod+'+l');
      await page.locator('.native-delimiter-ghost').waitFor();
      await page.keyboard.press('(');
      await page.keyboard.press(')');
      await page.waitForFunction(source=>nativeProbe.source===source,expected.replace('}{cb}','}{\\left(\\right)cb}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,expected);
      await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
        call.args.sourceRevision===nativeProbe.revision));
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>nativeProbe.source?.includes('\\begin{gathered}')&&nativeProbe.source.includes('\\usepackage{amsmath}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,expected);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6510000*scale,y:6950000*scale}});
      await page.keyboard.type('$');
      await panel.getByText('Type another $ to close the display formula',{exact:true}).waitFor();
      await page.keyboard.type('$');
      await page.keyboard.type('X');
      const afterLeaving=expected.replace('Omega.','XOmega.');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Alt+1');
      await page.waitForFunction(source=>nativeProbe.source===source,
        afterLeaving.replace('XYZAlpha beta.','\\section{XYZAlpha beta.}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Shift+7');
      await page.waitForFunction(source=>nativeProbe.source===source,
        afterLeaving.replace('XYZAlpha beta.','\\begin{enumerate}\n\\item XYZAlpha beta.\n\\end{enumerate}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await revealToolbar(page);await page.locator('[data-group=home]').click();
      const justify=page.locator('.floating-toolbar').getByRole('button',{name:'Justify',exact:true});
      if(!await justify.isVisible())await page.locator('[data-ribbon-group=paragraph] .ribbon-group-toggle').click();
      await justify.click();
      const justified=afterLeaving.replace('XYZAlpha beta.','{\\justifying XYZAlpha beta.\\par}')
        .replace('\\begin{document}','\\usepackage{ragged2e}\n\\begin{document}');
      await page.waitForFunction(source=>nativeProbe.source===source,justified);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+b');
      await page.keyboard.type('T');
      const boldSource=afterLeaving.replace('XYZAlpha','\\textbf{T}XYZAlpha');
      await page.waitForFunction(source=>nativeProbe.source===source,boldSource);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6670000*scale,y:9250000*scale}});
      const painter=page.getByRole('button',{name:'Format Painter',exact:false});
      if(!await painter.isVisible())await page.locator('[data-ribbon-group=clipboard] .ribbon-group-toggle').click();
      await painter.click();
      await canvas.click({position:{x:6750000*scale,y:9250000*scale}});
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForFunction(source=>nativeProbe.source===source,boldSource.replace('\\textbf{T}X','\\textbf{TX}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,boldSource);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('b');
      await page.keyboard.type('B');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving.replace('XYZAlpha','\\fbox{B}XYZAlpha'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      const strike=page.locator('.floating-toolbar').getByRole('button',{name:'Strikethrough',exact:true});
      if(!await strike.isVisible())await page.locator('[data-ribbon-group=font] .ribbon-group-toggle').click();
      await strike.click();
      await page.keyboard.type('D');
      const struck=afterLeaving.replace('XYZAlpha','\\sout{D}XYZAlpha')
        .replace('\\begin{document}','\\usepackage{ulem}\n\\begin{document}');
      await page.waitForFunction(source=>nativeProbe.source===source,struck);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+6');
      await page.keyboard.type('2');
      await page.waitForFunction(source=>nativeProbe.source===source,
        afterLeaving.replace('XYZAlpha','\\textsuperscript{2}XYZAlpha'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('r');
      const rightAligned=afterLeaving.replace('XYZAlpha beta.','{\\raggedleft XYZAlpha beta.\\par}');
      await page.waitForFunction(source=>nativeProbe.source===source,rightAligned);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.type('T');
      await page.waitForFunction(source=>nativeProbe.source===source,rightAligned.replace('XYZAlpha','TXYZAlpha'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,rightAligned);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('Tail.');
      await page.waitForFunction(source=>nativeProbe.source===source,rightAligned.replace('\\par}','\\par}\n\nTail.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,rightAligned);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Shift+6');
      await page.waitForFunction(original=>{
        const source=nativeProbe.source;
        const table=/\\begin\{tabular\}\{\|l\|l\|\}[\s\S]*?\\end\{tabular\}\r?\n\r?\n/.exec(source);
        return Boolean(table)&&source.slice(0,table.index)+source.slice(table.index+table[0].length)===original;
      },afterLeaving);
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input'&&
        document.querySelector('.environment-tag')?.textContent.endsWith('Row 1, column 1'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Alt+f');
      await panel.getByText('Type a display formula',{exact:true}).waitFor();
      await page.keyboard.insertText('\\frac{n}{}');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving.replace('XYZAlpha',
        '\\begin{equation}\\frac{n}{}\\end{equation}\n\nXYZAlpha'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Shift+f');
      await panel.getByText('Type an inline formula',{exact:true}).waitFor();
      await page.keyboard.insertText('\\frac{n}{}');
      await page.waitForFunction(source=>nativeProbe.source===source,afterLeaving.replace('XYZAlpha','$\\frac{n}{}$XYZAlpha'));
      await page.locator('#native-tex-close').click();
      const markedSource='\\documentclass{article}\n\\begin{document}\nBefore \\textit{\\textbf{Bold prose. $x$}} after.\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'marked.tex',mimeType:'text/plain',buffer:Buffer.from(markedSource)});
      await page.waitForFunction(()=>document.querySelector('.ProseMirror strong')?.textContent.trim()==='Bold prose.');
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:7750000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,markedSource.replace('Bold prose.','XBold prose.'));
      assert.equal((await page.locator('.ProseMirror strong').textContent()).trim(),'XBold prose.');
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Shift+f');
      await panel.getByText('Type an inline formula',{exact:true}).waitFor();
      await page.keyboard.insertText('z');
      const addedInline=markedSource.replace('Before ','$z$Before ').replace('Bold prose.','XBold prose.');
      await page.waitForFunction(expected=>nativeProbe.source===expected,addedInline);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,markedSource.replace('Bold prose.','XBold prose.'));
      await page.locator('#native-tex-close').click();
      const noteTailSource='\\documentclass{article}\n\\begin{document}\nAlpha\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'terminal-note.tex',mimeType:'text/plain',buffer:Buffer.from(noteTailSource)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:7450000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await page.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('footnote');
      await page.keyboard.press('Enter');
      await page.locator('.editor-dialog input').fill('Yield 50%');
      await page.locator('.editor-dialog button[type=submit]').click();
      const terminalNote=noteTailSource.replace('Alpha','Alpha\\footnote{Yield 50\\%}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,terminalNote);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,terminalNote.replace('Yield 50\\%}','Yield 50\\%}X'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,terminalNote);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,noteTailSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await page.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('lipsum');
      await page.keyboard.press('Enter');
      await page.locator('.editor-dialog input').fill('2');
      await page.locator('.editor-dialog button[type=submit]').click();
      const generatedText=noteTailSource.replace('Alpha','\\lipsum[2]Alpha')
        .replace('\\begin{document}','\\usepackage{lipsum}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,generatedText);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,noteTailSource);
      await page.locator('#native-tex-close').click();
      const styledSource='\\documentclass{article}\n\\usepackage{xcolor}\n\\begin{document}\n'+
        'Before {\\sffamily {\\fontsize{16}{20}\\selectfont \\colorbox[HTML]{EEEEEE}{\\textcolor[HTML]{FF0000}{Styled}}}} after.\n'+
        '\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'styled.tex',mimeType:'text/plain',buffer:Buffer.from(styledSource)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:8050000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,styledSource.replace('Styled','StXyled'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,styledSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      const styledBounds=await canvas.boundingBox();
      await page.mouse.move(styledBounds.x+8050000*scale,styledBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(styledBounds.x+9250000*scale,styledBounds.y+9250000*scale,{steps:8});
      await page.mouse.up();
      await page.keyboard.insertText('Z');
      const crossedStyle=styledSource.replace('Styled}}}} after.','StZ}}}}ter.');
      await page.waitForFunction(expected=>nativeProbe.source===expected,crossedStyle);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,styledSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.mouse.move(styledBounds.x+7750000*scale,styledBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(styledBounds.x+8050000*scale,styledBounds.y+9250000*scale,{steps:8});
      await page.mouse.up();
      await page.locator('[data-format-attribute=fontSize]').evaluate(control=>{
        control.value='18pt';control.dispatchEvent(new Event('change',{bubbles:true}));
      });
      const resizedWithinStyle=styledSource.replace('Styled','{\\fontsize{18}{22}\\selectfont St}yled')
        .replace('\\documentclass','\\RequirePackage{fix-cm}\n\\documentclass');
      await page.waitForFunction(expected=>nativeProbe.source===expected,resizedWithinStyle);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,styledSource);
      await page.locator('#native-tex-close').click();
      const noteSource='\\documentclass{article}\n\\begin{document}\nBefore\\footnote{Comment.} after.\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'footnote.tex',mimeType:'text/plain',buffer:Buffer.from(noteSource)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:7750000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,noteSource.replace('after.','Xafter.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,noteSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      const noteBounds=await canvas.boundingBox();
      await page.mouse.move(noteBounds.x+7150000*scale,noteBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(noteBounds.x+8150000*scale,noteBounds.y+9250000*scale,{steps:7});
      await page.mouse.up();
      await page.keyboard.type('T');
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        noteSource.replace('Before\\footnote{Comment.} after.','BefTter.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,noteSource);
      await page.locator('#native-tex-close').click();
      const mixedParagraph='\\documentclass{article}\n\\begin{document}\nBefore $x$ Next.\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'mixed-paragraph-break.tex',mimeType:'text/plain',buffer:Buffer.from(mixedParagraph)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:8150000*scale,y:9250000*scale}});
      await page.keyboard.press('Enter');
      const splitMixed=mixedParagraph.replace('Next.','Ne\n\nxt.');
      await page.waitForFunction(expected=>nativeProbe.source===expected,splitMixed);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Backspace');
      await page.waitForFunction(expected=>nativeProbe.source===expected,mixedParagraph);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,splitMixed);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,mixedParagraph);
      await page.locator('#native-tex-close').click();
      const tableSource='\\documentclass{article}\n\\begin{document}\n\\begin{tabular}{ll}\nOne  & Two \\\\\nThree & \n\\end{tabular}\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'table.tex',mimeType:'text/plain',buffer:Buffer.from(tableSource)});
      await page.waitForFunction(()=>document.querySelector('.ProseMirror td')?.textContent==='One');
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*scale,y:9250000*scale}});
      await revealToolbar(page);await page.locator('[data-group=table]').click();
      await page.locator('input[aria-label="Row stretch"]').evaluate(control=>{
        control.value='1.5';control.dispatchEvent(new Event('change',{bubbles:true}));
      });
      const stretchedTable=tableSource.replace('\\begin{tabular}','{\\renewcommand{\\arraystretch}{1.5}\n\\begin{tabular}')
        .replace('\\end{tabular}','\\end{tabular}\n}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,stretchedTable);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('.table-style-group select[aria-label="Font size"]').evaluate(control=>{
        control.value='small';control.dispatchEvent(new Event('change',{bubbles:true}));
      });
      const smallTable=stretchedTable.replace('{\\renewcommand','{\\small {\\renewcommand').replace('\\end{tabular}\n}','\\end{tabular}\n}}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,smallTable);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press(mod+'+e');await page.keyboard.press('Shift+r');
      await page.waitForFunction(expected=>nativeProbe.source===expected,smallTable.replace('\nThree','\n & \\\\\nThree'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,smallTable);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,smallTable.replace('One','XOne'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,smallTable);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,stretchedTable);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tableSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tableSource.replace('One','XOne'));
      const tableObservations=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tableSource);
      await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,tableObservations);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*scale,y:9250000*scale}});
      for(let index=0;index<3;index++)await page.keyboard.press('Tab');
      await page.keyboard.type('Z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tableSource.replace('Three & ','Three & Z'));
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.type('Q');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tableSource.replace('Three & ','QThree & Z'));
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('Shift+r');
      await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror table tr').length===3);
      const plainEdited=tableSource.replace('Three & ','QThree & Z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,plainEdited.replace('\nQThree','\n & \\\\\nQThree'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,plainEdited);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await revealToolbar(page);await page.locator('[data-group=table]').click();
      const cellBounds=await canvas.boundingBox();
      await page.mouse.move(cellBounds.x+6550000*scale,cellBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(cellBounds.x+7150000*scale,cellBounds.y+9250000*scale,{steps:8});
      await page.mouse.up();
      await page.locator('button[data-source-action=merge]').click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,plainEdited.replace('One  & Two','\\multicolumn{2}{l}{One Two}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,plainEdited);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.mouse.move(cellBounds.x+6550000*scale,cellBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(cellBounds.x+7750000*scale,cellBounds.y+9250000*scale,{steps:8});
      await page.mouse.up();
      await page.locator('button[data-source-action=merge]').click();
      const verticalTable=plainEdited.replace('One','\\multirow{2}{*}{One QThree}').replace('QThree &',' &')
        .replace('\\begin{document}','\\usepackage{multirow}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,verticalTable);
      await page.waitForFunction(()=>document.querySelector('.ProseMirror td')?.rowSpan===2);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,plainEdited);
      await page.keyboard.press(mod+'+y');
      await page.waitForFunction(expected=>nativeProbe.source===expected,verticalTable);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('Shift+r');
      const resizedSpan=verticalTable.replace('\\multirow{2}','\\multirow{3}')
        .replace('\n & Z','\n & \\\\\n & Z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,resizedSpan);
      await page.waitForFunction(()=>document.querySelector('.ProseMirror td')?.rowSpan===3);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,verticalTable);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('Shift+c');
      const spanWithNewColumn=verticalTable.replace('{tabular}{ll}','{tabular}{lll}')
        .replace('One QThree}  & Two','One QThree} &   & Two').replace('\n & Z','\n  & & Z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,spanWithNewColumn);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,verticalTable);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.getByRole('button',{name:'－ Row',exact:true}).click();
      const movedSpan=verticalTable.replace('\\multirow{2}{*}{One QThree}  & Two \\\\\n & Z',
        ' \\multirow{1}{*}{One QThree}& Z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,movedSpan);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,verticalTable);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.locator('button[data-source-action=split]').click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        verticalTable.replace('\\multirow{2}{*}{One QThree}','One QThree'));
      await page.locator('#native-tex-close').click();
      const tableWithMath=tableSource.replace('\\begin{document}','\\usepackage{tabularx}\n\\begin{document}')
        .replace('\\begin{tabular}{ll}','\\begin{tabularx}{\\textwidth}{lX}')
        .replace('\\end{tabular}','\\end{tabularx}').replace('Two','\\textbf{Value} $\\frac{a}{}$ unit');
      await page.locator('input#file').setInputFiles({name:'mixed-table.tex',mimeType:'text/plain',buffer:Buffer.from(tableWithMath)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6500000*scale,y:7000000*scale}});
      await page.keyboard.type('b');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tableWithMath.replace('\\frac{a}{}','\\frac{a}{b}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tableWithMath);
      await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
        call.args.sourceRevision===nativeProbe.revision));
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7150000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      const editedTable=tableWithMath.replace('Value','XValue');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedTable);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7150000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('Shift+r');
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        editedTable.replace('\nThree','\n & \\\\\nThree'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedTable);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7150000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('Shift+c');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedTable.replace('{lX}','{lXl}')
        .replace(' unit ',' unit &  ').replace('Three & ','Three & &  '));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedTable);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7150000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('x');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedTable.replace(/^One[^\n]*\n/m,''));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedTable);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7150000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('y');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedTable.replace('{lX}','{l}')
        .replace(/&[^\n]* unit/,'').replace('Three & ','Three  '));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedTable);
      await page.locator('#native-tex-close').click();
      const tabularray=tableSource.replace('\\begin{tabular}{ll}','\\begin{tblr}{colspec={ll},rows={m}}')
        .replace('\\end{tabular}','\\end{tblr}');
      await page.locator('input#file').setInputFiles({name:'tabularray.tex',mimeType:'text/plain',buffer:Buffer.from(tabularray)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('Shift+r');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tabularray.replace('\nThree','\n & \\\\\nThree'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tabularray);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('Shift+c');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tabularray.replace('colspec={ll}','colspec={lll}')
        .replace('One  & Two','One &   & Two').replace('Three & ','Three &  & '));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,tabularray);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await revealToolbar(page);await page.locator('[data-group=table]').click();
      const tblrBounds=await canvas.boundingBox();
      await page.mouse.move(tblrBounds.x+6550000*scale,tblrBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(tblrBounds.x+7750000*scale,tblrBounds.y+9250000*scale,{steps:8});
      await page.mouse.up();
      await page.locator('button[data-source-action=merge]').click();
      const mergedTblr=tabularray.replace('One','\\SetCell[r=2]{l} One Three').replace('Three &',' &');
      await page.waitForFunction(expected=>nativeProbe.source===expected,mergedTblr);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.locator('button[data-source-action=split]').click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,mergedTblr.replace('r=2','r=1'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,mergedTblr);
      await page.locator('#native-tex-close').click();
      const spanTabularx=tableSource.replace('\\begin{tabular}{ll}','\\begin{tabularx}{\\linewidth}{lX}')
        .replace('\\end{tabular}','\\end{tabularx}').replace('\\begin{document}','\\usepackage{tabularx}\n\\begin{document}');
      await page.locator('input#file').setInputFiles({name:'tabularx-spans.tex',mimeType:'text/plain',buffer:Buffer.from(spanTabularx)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await revealToolbar(page);await page.locator('[data-group=table]').click();
      const spanBounds=await canvas.boundingBox();
      await page.mouse.move(spanBounds.x+6550000*scale,spanBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(spanBounds.x+7750000*scale,spanBounds.y+9250000*scale,{steps:8});
      await page.mouse.up();
      await page.locator('button[data-source-action=merge]').click();
      const mergedTabularx=spanTabularx.replace('One','\\multirow{2}{*}{One Three}').replace('Three &',' &')
        .replace('\\begin{document}','\\usepackage{multirow}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,mergedTabularx);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.locator('button[data-source-action=split]').click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,mergedTabularx.replace('\\multirow{2}{*}{One Three}','One Three'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,mergedTabularx);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,spanTabularx);
      await page.locator('#native-tex-close').click();
      const combinedSource=spanTabularx.replace('One  & Two','\\multicolumn{2}{c}{\\multirow{2}{*}{One}}')
        .replace('Three &',' &').replace('\\usepackage{tabularx}','\\usepackage{tabularx,multirow}');
      await page.locator('input#file').setInputFiles({name:'tabularx-combined-span.tex',mimeType:'text/plain',buffer:Buffer.from(combinedSource)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await revealToolbar(page);await page.locator('[data-group=table]').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.locator('button[data-source-action=split]').click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        combinedSource.replace('\\multicolumn{2}{c}{\\multirow{2}{*}{One}}','\\multicolumn{1}{c}{One} & '));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,combinedSource);
      await page.locator('#native-tex-close').click();
      const spanning=tableSource.replace('One  & Two','\\multicolumn{2}{c}{Title}');
      await page.locator('input#file').setInputFiles({name:'spanning.tex',mimeType:'text/plain',buffer:Buffer.from(spanning)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await revealToolbar(page);await page.locator('[data-group=table]').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.locator('button[data-source-action=split]').click();
      const separated=spanning.replace('\\multicolumn{2}{c}{Title}','\\multicolumn{1}{c}{Title} & ');
      await page.waitForFunction(expected=>nativeProbe.source===expected,separated);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await revealToolbar(page);
      await page.getByRole('button',{name:'Delete table',exact:true}).click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        separated.replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/,''));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,separated);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,spanning);
      await page.locator('#native-tex-close').click();
      const matrixSource='\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n'+
        '\\[\\begin{bmatrix}a&\\\\&d\\end{bmatrix}\\]\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'matrix.tex',mimeType:'text/plain',buffer:Buffer.from(matrixSource)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6500000*scale,y:7000000*scale}});
      await page.keyboard.press(mod+'+e');await page.keyboard.press('c');
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        matrixSource.replace('a&\\\\&d','a&&\\\\&d&'));
      await page.locator('#native-tex-close').click();
      const headingSource='\\documentclass{article}\n\\begin{document}\n\\section[Short]{Long title}\\label{section:test}\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'heading.tex',mimeType:'text/plain',buffer:Buffer.from(headingSource)});
      await page.waitForFunction(()=>document.querySelector('.ProseMirror h1')?.textContent==='Long title');
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*scale,y:9250000*scale}});
      const headingObservations=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,headingSource.replace('Long title','XLong title'));
      const typedHeading=headingSource.replace('Long title','XLong title');
      await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,headingObservations);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*scale,y:9250000*scale}});
      await page.locator('#native-tex-input').evaluate(input=>{
        input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));
      });
      assert.equal(await page.evaluate(()=>nativeProbe.source),typedHeading);
      const beforeComposition=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
      await page.locator('#native-tex-input').evaluate(input=>{
        nativeProbe.compositionEvents=[];
        for(const type of ['compositionstart','compositionend','input','keydown'])
          input.addEventListener(type,event=>nativeProbe.compositionEvents.push({
            type:event.type,data:event.data,inputType:event.inputType,composing:event.isComposing,value:input.value,
          }),true);
        input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        input.value='文';
        input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'文',isComposing:true}));
        input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'文'}));
        input.value='文';
        input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromComposition',data:'文'}));
        input.value='文';
        input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'文'}));
      });
      const composedHeading=typedHeading.replace('XLong title','文XLong title');
      await page.waitForFunction(expected=>nativeProbe.source===expected,composedHeading);
      await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,beforeComposition);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      const compositionResult=await page.evaluate(()=>({source:nativeProbe.source,events:nativeProbe.compositionEvents}));
      assert.equal(compositionResult.source,composedHeading,JSON.stringify(compositionResult.events));
      await canvas.click({position:{x:6655000*scale,y:9250000*scale}});
      await page.keyboard.type('%');
      const escapedHeading=composedHeading.replace('文X','文\\%X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,escapedHeading,{timeout:6000}).catch(async error=>{
        console.error('Native heading percent input',await panel.getByRole('status').allTextContents(),
          await page.evaluate(()=>({source:nativeProbe.source,heading:document.querySelector('.ProseMirror h1')?.textContent,
            focus:document.activeElement?.id,sources:nativeProbe.calls.filter(call=>call.command==='native_tex_update')
              .slice(-5).map(call=>call.args.source)})));
        throw error;
      });
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Backspace');
      await page.waitForFunction(expected=>nativeProbe.source===expected,composedHeading);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('Body text.');
      const afterHeading=composedHeading.replace('\\label{section:test}','\\label{section:test}\n\nBody text.');
      await page.waitForFunction(expected=>nativeProbe.source===expected,afterHeading);
      assert.equal(await page.locator('.ProseMirror p').textContent(),'Body text.');
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,composedHeading);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await page.keyboard.press(mod+'+b');
      await page.waitForFunction(()=>document.querySelector('.ProseMirror h1 strong')?.textContent==='文XLong title');
      await page.locator('#native-tex-close').click();
      const book=['\\documentclass{book}','\\title{Sample}','\\author{Author}','\\date{\\today}',
        '\\begin{document}','\\frontmatter','\\maketitle','\\mainmatter','\\chapter{Opening}',
        'Main text.','','\\backmatter','\\chapter{Notes}','Back text.','\\end{document}',''].join('\r\n');
      await page.locator('input#file').setInputFiles({name:'book.tex',mimeType:'text/plain',buffer:Buffer.from(book)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const backTextGlyph='OpeningMaintext.Notes'.length;
      await canvas.click({position:{x:(6550000+200000*backTextGlyph)*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,book.replace('Back text.','XBack text.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,book);
      await page.locator('#native-tex-close').click();
      const proofSource='\\documentclass{article}\r\n\\usepackage{amsthm}\r\n\\begin{document}\r\n'+
        '\\begin{proof}[Reason]\r\n  One step.\r\n\\end{proof}\r\n\\end{document}\r\n';
      await page.locator('input#file').setInputFiles({name:'proof.tex',mimeType:'text/plain',buffer:Buffer.from(proofSource)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,proofSource.replace('One step.','XOne step.'));
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      const splitProof=proofSource.replace('One step.','X\r\n\r\nOne step.');
      await page.waitForFunction(expected=>nativeProbe.source===expected,splitProof);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Backspace');
      await page.waitForFunction(expected=>nativeProbe.source===expected,proofSource.replace('One step.','XOne step.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,splitProof);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Shift+j');
      await panel.getByText('Type after the environment',{exact:true}).waitFor();
      await page.keyboard.type('Outside proof.');
      const continuedProof=splitProof.replace('\\end{proof}\r\n','\\end{proof}\r\n\r\nOutside proof.\r\n');
      await page.waitForFunction(expected=>nativeProbe.source===expected,continuedProof);
      await page.locator('#native-tex-close').click();
      for(const [name,prefix] of [['abstract','\\small '],['quote','']]){
        const source=`\\documentclass{article}\r\n\\begin{document}\r\n\\begin{${name}}\r\n`+
          `${prefix}AlphaBeta.\r\n\\end{${name}}\r\n\\end{document}\r\n`;
        await page.locator('input#file').setInputFiles({name:name+'.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
        await page.locator('#native-tex-toggle').click();
        await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
        await page.locator('#native-tex-target').click();
        await panel.getByText('Click text on the native page',{exact:false}).waitFor();
        await page.locator('#native-tex-edit').click();
        await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
        await page.keyboard.press('Enter');
        const split=source.replace('AlphaBeta','Alpha\r\n\r\nBeta');
        await page.waitForFunction(expected=>nativeProbe.source===expected,split);
        await panel.getByText('Click text on the native page',{exact:false}).waitFor();
        await page.keyboard.press('Backspace');
        await page.waitForFunction(expected=>nativeProbe.source===expected,source);
        await page.keyboard.press(mod+'+z');
        await page.waitForFunction(expected=>nativeProbe.source===expected,split);
        await page.locator('#native-tex-close').click();
      }
      const mixedProof=proofSource.replace('One step.','\\emph{Step} $\\frac{a}{}$ here.');
      await page.locator('input#file').setInputFiles({name:'mixed-proof.tex',mimeType:'text/plain',buffer:Buffer.from(mixedProof)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      const editedProof=mixedProof.replace('Step','XStep');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedProof);
      await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
        call.args.sourceRevision===nativeProbe.revision));
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Shift+End');
      await page.keyboard.press(mod+'+c');
      await page.waitForFunction(async()=>{
        const [item]=await navigator.clipboard.read();
        if(!item?.types.includes('text/html'))return false;
        const html=await(await item.getType('text/html')).text();
        return new DOMParser().parseFromString(html,'text/html').querySelector('em')?.textContent==='XStep';
      });
      await canvas.click({position:{x:6500000*scale,y:7000000*scale}});
      await page.keyboard.type('b');
      await page.waitForFunction(expected=>nativeProbe.source===expected,editedProof.replace('\\frac{a}{}','\\frac{a}{b}'));
      await page.locator('#native-tex-close').click();
      const brokenProse='\\documentclass{article}\r\n\\begin{document}\r\nAlpha\\newline\r\nBeta\\\\[2pt]\r\nGamma\r\n\\end{document}\r\n';
      await page.locator('input#file').setInputFiles({name:'prose-breaks.tex',mimeType:'text/plain',buffer:Buffer.from(brokenProse)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,brokenProse.replace('Beta','XBeta'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,brokenProse);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
      await page.evaluate(()=>navigator.clipboard.writeText('One\nTwo'));
      await page.keyboard.press(mod+'+v');
      const pasted=brokenProse.replace('Beta','One\\\\\r\nTwoBeta');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pasted);
      assert.equal(await page.locator('.ProseMirror p br').count(),3);
      await page.locator('#native-tex-close').click();
      const acrossMathBody='Alpha\n\n\\[x+y\\]\n\nBeta';
      const acrossMath='\\documentclass{article}\n\\begin{document}\n'+acrossMathBody+'\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'range-with-math.tex',mimeType:'text/plain',buffer:Buffer.from(acrossMath)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+a');
      await page.keyboard.insertText('Replaced');
      await page.waitForFunction(expected=>nativeProbe.source===expected,acrossMath.replace(acrossMathBody,'Replaced'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,acrossMath);
      await page.locator('#native-tex-close').click();
      const pagedProse='\\documentclass{article}\n\\begin{document}\nAlpha\n\nBeta\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'native-page-break.tex',mimeType:'text/plain',buffer:Buffer.from(pagedProse)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const prosePalette=page.getByRole('dialog',{name:'LaTeX completion',exact:true});
      for(const [command,latex,node] of [
        ['appendix','\\appendix','[data-appendix-start]'],
        ['hrule','\\hrule','hr'],
        ['tableofcontents','\\tableofcontents','[data-toc-view]'],
      ]){
        await panel.getByText('Click text on the native page',{exact:false}).waitFor();
        await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
        await page.keyboard.press('Backslash');
        await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill(command);
        await page.keyboard.press('Enter');
        await page.waitForFunction(expected=>nativeProbe.source===expected,pagedProse.replace('Beta',latex+'\n\nBeta'));
        assert.equal(await page.locator('.ProseMirror').locator(node).count(),1);
        await page.keyboard.press(mod+'+z');
        await page.waitForFunction(expected=>nativeProbe.source===expected,pagedProse);
      }
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('multicols*');
      await page.keyboard.press('Enter');
      const wrappedColumns=pagedProse.replace('Alpha','\\begin{multicols*}{2}\nAlpha\n\n\\end{multicols*}')
        .replace('\\begin{document}','\\usepackage{multicol}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,wrappedColumns);
      assert.equal(await page.locator('.ProseMirror [data-multicol-starred]').count(),1);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pagedProse);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('newpage');
      await page.keyboard.press('Enter');
      const pageBreakSource=pagedProse.replace('Beta','\\newpage\n\nBeta');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pageBreakSource);
      assert.equal(await page.locator('.ProseMirror [data-page-break]').count(),1);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('section');
      await page.keyboard.press('Enter');
      const numberedHeading=pageBreakSource.replace('Alpha','\\section{Alpha}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,numberedHeading);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Alt+t');
      await page.waitForFunction(expected=>nativeProbe.source===expected,numberedHeading.replace('\\section{','\\section*{'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,numberedHeading);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pageBreakSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('proof');
      await page.keyboard.press('Enter');
      const wrappedProof=pageBreakSource.replace('Alpha','\\begin{proof}\nAlpha\n\\end{proof}')
        .replace('\\begin{document}','\\usepackage{amsthm}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,wrappedProof);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pageBreakSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('description');
      await page.keyboard.press('Enter');
      await page.locator('.editor-dialog input').fill('Name 50%');
      await page.locator('.editor-dialog button[type=submit]').click();
      const described=pageBreakSource.replace('Alpha','\\begin{description}\n\\item[Name 50\\%] Alpha\n\\end{description}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,described);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pageBreakSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('title');
      await page.keyboard.press('Enter');
      await page.locator('.editor-dialog input').fill('Yield 50%');
      await page.locator('.editor-dialog button[type=submit]').click();
      await page.waitForFunction(()=>nativeProbe.source?.includes('\\title{Yield 50\\%}')&&nativeProbe.source.includes('\\maketitle'));
      await page.locator('#native-tex-close').click();
      const splitListSource=pagedProse.replace('Alpha\n\nBeta','\\begin{itemize}\n  \\item AlphaBeta.\n\\end{itemize}').replaceAll('\n','\r\n');
      await page.locator('input#file').setInputFiles({name:'native-list.tex',mimeType:'text/plain',buffer:Buffer.from(splitListSource)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:7450000*scale,y:9250000*scale}});
      await page.keyboard.press('Enter');
      const splitList=splitListSource.replace('AlphaBeta','Alpha\r\n  \\item Beta');
      await page.waitForFunction(expected=>nativeProbe.source===expected,splitList);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Backspace');
      await page.waitForFunction(expected=>nativeProbe.source===expected,splitListSource);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,splitList);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,splitListSource);
      await page.locator('#native-tex-close').click();
      const markerList=pagedProse.replace('Alpha\n\nBeta','\\begin{enumerate}\n\\item Alpha.\n\\end{enumerate}');
      await page.locator('input#file').setInputFiles({name:'native-list-marker.tex',mimeType:'text/plain',buffer:Buffer.from(markerList)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Alt+t');
      const changedMarker=markerList.replace('\\begin{enumerate}','\\begin{enumerate}[label=(\\arabic*)]')
        .replace('\\begin{document}','\\usepackage{enumitem}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,changedMarker);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,markerList);
      await page.locator('#native-tex-close').click();
      const nativeColumns=pagedProse.replace('Alpha\n\nBeta',
        '\\begin{multicols*}{2}\nAlphaBeta.\n\nGamma.\n\\end{multicols*}')
        .replace('\\begin{document}','\\usepackage{multicol}\n\\begin{document}');
      await page.locator('input#file').setInputFiles({name:'native-columns.tex',mimeType:'text/plain',buffer:Buffer.from(nativeColumns)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:7450000*scale,y:9250000*scale}});
      await page.keyboard.press('Enter');
      await page.waitForFunction(expected=>nativeProbe.source===expected,nativeColumns.replace('AlphaBeta.','Alpha\n\nBeta.'));
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Backspace');
      await page.waitForFunction(expected=>nativeProbe.source===expected,nativeColumns);
      await page.locator('#native-tex-close').click();
      const bookSource=pagedProse.replace('{article}','{book}');
      await page.locator('input#file').setInputFiles({name:'native-book.tex',mimeType:'text/plain',buffer:Buffer.from(bookSource)});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      for(const matter of ['front','main','back']){
        await panel.getByText('Click text on the native page',{exact:false}).waitFor();
        await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
        await page.keyboard.press('Backslash');
        await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill(matter+'matter');
        await page.keyboard.press('Enter');
        await page.waitForFunction(expected=>nativeProbe.source===expected,bookSource.replace('Beta','\\'+matter+'matter\n\nBeta'));
        assert.equal(await page.locator(`.ProseMirror [data-matter-start="${matter}"]`).count(),1);
        await page.keyboard.press(mod+'+z');
        await page.waitForFunction(expected=>nativeProbe.source===expected,bookSource);
      }
      await page.locator('#native-tex-close').click();
      const literalProse='\\documentclass{article}\n\\begin{document}\n\\textasciicircum{}Alpha\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'literal-prose.tex',mimeType:'text/plain',buffer:Buffer.from(literalProse)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6650000*scale,y:9250000*scale}});
      await page.keyboard.insertText('~');
      const escapedProse=literalProse.replace('Alpha','\\textasciitilde{}Alpha');
      await page.waitForFunction(expected=>nativeProbe.source===expected,escapedProse);
      await page.keyboard.press('Backspace');
      await page.waitForFunction(expected=>nativeProbe.source===expected,literalProse);
      await page.locator('#native-tex-close').click();
      const numbered='\\documentclass{article}\n\\begin{document}\n\\begin{equation}\n'+
        '\\label{eq:keep}\n\\frac{a}{}\n\\end{equation}\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'numbered-equation.tex',mimeType:'text/plain',buffer:Buffer.from(numbered)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6500000*scale,y:7000000*scale}});
      await page.keyboard.type('b');
      await page.waitForFunction(expected=>nativeProbe.source===expected,numbered.replace('\\frac{a}{}','\\frac{a}{b}'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,numbered);
      await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
        call.args.sourceRevision===nativeProbe.revision));
      await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      await canvas.click({position:{x:6500000*scale,y:7000000*scale}});
      await page.keyboard.press('Backslash');
      await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('label');
      await page.keyboard.press('Enter');
      const labelInput=page.locator('.editor-dialog input');
      assert.equal(await labelInput.inputValue(),'eq:keep');
      await labelInput.fill('eq:changed');
      await page.locator('.editor-dialog button[type=submit]').click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,numbered.replace('eq:keep','eq:changed'));
      await page.locator('#native-tex-close').click();
      const listSource='\\documentclass{article}\n\\begin{document}\n\\begin{enumerate}\n\\item One item.\n'+
        '\\begin{itemize}\n\\item Nested.\n\\end{itemize}\n\\item Last.\n\\end{enumerate}\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'list.tex',mimeType:'text/plain',buffer:Buffer.from(listSource)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:8150000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,listSource.replace('Nested.','XNested.'));
      await page.locator('#native-tex-close').click();
      const drawing='\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}';
      const pdfSource='\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n'+drawing+
        '\n\n\\[\\frac{a}{}\\]\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'pdf.tex',mimeType:'text/plain',buffer:Buffer.from(pdfSource)});
      await page.evaluate(()=>{nativeProbe.semanticPdf=true;nativeProbe.registeredPdf=true;});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>{
        const readable=document.querySelector('#native-tex-preview');
        return readable.dataset.state==='current'&&readable.dataset.renderer==='pdf';
      });
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await panel.locator('[data-pdf-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
      await page.keyboard.type('m');
      const withFormula=pdfSource.replace('\\frac{a}{}','\\frac{a}{m}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,withFormula);
      await panel.getByRole('button',{name:'Edit TikZ',exact:true}).click();
      const drawingCode=page.locator('.tikz-studio-code');
      assert.equal(await drawingCode.inputValue(),drawing);
      await drawingCode.fill(drawing.replace('(1,1)','(2,1)'));
      await page.locator('.tikz-studio-insert').click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,withFormula.replace('(1,1)','(2,1)'));
      await page.locator('#native-tex-close').click();
      await page.evaluate(()=>{nativeProbe.semanticPdf=false;nativeProbe.registeredPdf=false;});
      await openMockProject(page);
      await page.evaluate(()=>{nativeProbe.targetInclude=true;nativeProbe.includeMainText=true;});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const childChanged=expected=>page.waitForFunction(({main,child})=>
        nativeProbe.calls.some(call=>call.command==='native_tex_update'&&call.args.source===main&&
          call.args.files?.some(file=>file.path==='chapters/one.tex'&&
            new TextDecoder().decode(new Uint8Array(file.bytes))===child)),{main:projectMain,child:expected});
      await canvas.click({position:{x:6500000*scale,y:7000000*scale}});
      const childObservations=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
      await page.keyboard.type('q');
      const childWithMath=projectChapter.replace('\\frac{z}{}','\\frac{z}{q}');
      await childChanged(childWithMath);
      await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,childObservations);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      const beforeExitFile=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
      await page.keyboard.type('X');
      await childChanged('X'+childWithMath);
      await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,beforeExitFile);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.keyboard.press(mod+'+Alt+j');
      const beforeCrossFile=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
      await page.keyboard.type('Y');
      await page.waitForFunction(expected=>nativeProbe.source===expected,projectMain.replace('After chapter.','YAfter chapter.'));
      await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,beforeCrossFile);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      const bounds=await canvas.boundingBox();
      const count='XOriginal chapter.Before chapter.YAfter chapter.'.replace(/\s/g,'').length;
      await page.mouse.move(bounds.x+6550000*scale,bounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(bounds.x+(6500000+count*200000-50000)*scale,bounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.press(mod+'+c');
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),
        'XOriginal chapter.\n\n\\[\\frac{z}{q}\\]\n\nYAfter chapter.');
      const beforeGlyph='XOriginal chapter.Before'.replace(/\s/g,'').length;
      await page.mouse.move(bounds.x+(6500000+beforeGlyph*200000-50000)*scale,bounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(bounds.x+6655000*scale,bounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.insertText(' started.');
      const editedMain=projectMain.replace('Before chapter.','Before started.').replace('After chapter.','YAfter chapter.');
      const projectDrafts=(main,child)=>page.waitForFunction(({main,child})=>{
        const latest=nativeProbe.calls.findLast(call=>call.command==='native_tex_update');
        return latest?.args.source===main&&latest.args.files?.some(file=>file.path==='chapters/one.tex'&&
          new TextDecoder().decode(new Uint8Array(file.bytes))===child);
      },{main,child});
      await projectDrafts(editedMain,childWithMath);
      await page.keyboard.press(mod+'+z');
      await projectDrafts(projectMain.replace('After chapter.','YAfter chapter.'),'X'+childWithMath);
      await page.keyboard.press(mod+'+Shift+z');
      await projectDrafts(editedMain,childWithMath);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7280000*scale,y:9250000*scale}});
      await page.keyboard.press('Enter');
      const splitChild=childWithMath.replace('Original','Orig\n\ninal');
      await projectDrafts(editedMain,splitChild);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7320000*scale,y:9250000*scale}});
      await page.keyboard.press('Backspace');
      await projectDrafts(editedMain,childWithMath);
      await page.keyboard.press(mod+'+z');
      await projectDrafts(editedMain,splitChild);
      await page.keyboard.press(mod+'+z');
      await projectDrafts(editedMain,childWithMath);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      const replacementBounds=await canvas.boundingBox();
      const replacementEnd='Original chapter.Before started.YAf'.replace(/\s/g,'').length;
      await page.mouse.move(replacementBounds.x+6550000*scale,replacementBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(replacementBounds.x+(6500000+replacementEnd*200000-50000)*scale,
        replacementBounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.press(mod+'+c');
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Original chapter.\n\n\\[\\frac{z}{q}\\]\n\nYAf');
      await page.keyboard.insertText('Replacement.');
      const replacedMain=editedMain.replace('YAfter chapter.','ter chapter.');
      const replacedChild='Replacement.\n\n\n';
      await projectDrafts(replacedMain,replacedChild);
      await page.keyboard.press(mod+'+z');
      await projectDrafts(editedMain,childWithMath);
      await page.keyboard.press(mod+'+Shift+z');
      await projectDrafts(replacedMain,replacedChild);
      await page.keyboard.press(mod+'+z');
      await projectDrafts(editedMain,childWithMath);
      assert.deepEqual(errors,[]);

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const mixedProject=projectMain.replace('\\[\\frac{a}{}\\]\n\n','').replace('Before chapter.','Before $z$ end.');
      const markedChild='\\textbf{XYZ} child.\n';
      await openMockProject(page,false,mixedProject,markedChild);
      await page.evaluate(()=>{nativeProbe.targetInclude=true;nativeProbe.includeMainText=true;});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const mixedBounds=await canvas.boundingBox();
      const rootBefore='XYZchild.Before'.length;
      await page.mouse.move(mixedBounds.x+(6500000+rootBefore*200000-50000)*scale,mixedBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(mixedBounds.x+6850000*scale,mixedBounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.insertText(' updated.');
      await projectDrafts(mixedProject.replace('Before $z$ end.','Before updated.'),'\\textbf{Z} child.\n');
      await page.keyboard.press(mod+'+z');
      await projectDrafts(mixedProject,markedChild);

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const projectTable='\\begin{tabular}{ll}\nA & B \\\\\nC & D\n\\end{tabular}';
      const childWithTable='Child.\n\n'+projectTable+'\n';
      const tableProject=projectMain.replace('\\[\\frac{a}{}\\]\n\n','');
      await openMockProject(page,false,tableProject,childWithTable);
      await page.evaluate(()=>{nativeProbe.targetInclude=true;nativeProbe.includeMainText=true;});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const tableBounds=await canvas.boundingBox();
      const tableRangeEnd='Child.ABCDBeforechapter.Af'.length;
      await page.mouse.move(tableBounds.x+6550000*scale,tableBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(tableBounds.x+(6500000+tableRangeEnd*200000-50000)*scale,
        tableBounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.press(mod+'+c');
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Child.\n\n'+projectTable+'\n\nAf');
      await page.keyboard.insertText('Updated.');
      const tableRemoved=tableProject.replace('After chapter.','ter chapter.');
      await projectDrafts(tableRemoved,'Updated.\n\n\n');
      await page.keyboard.press(mod+'+z');
      await projectDrafts(tableProject,childWithTable);

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const mixedPaint='\\documentclass{article}\n\\begin{document}\n\\textbf{Seed}.\n\nA$x$B.\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'painter.tex',mimeType:'text/plain',buffer:Buffer.from(mixedPaint)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText(/Click (?:text|prose) on the native page/).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6670000*scale,y:9250000*scale}});
      await revealToolbar(page);await page.locator('[data-group=home]').click();
      if(!await painter.isVisible())await page.locator('[data-ribbon-group=clipboard] .ribbon-group-toggle').click();
      await painter.click();
      const paintBounds=await canvas.boundingBox();
      await page.mouse.move(paintBounds.x+7550000*scale,paintBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(paintBounds.x+7850000*scale,paintBounds.y+9250000*scale,{steps:8});
      await page.mouse.up();
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        mixedPaint.replace('A$x$B.','\\textbf{A}$x$\\textbf{B}.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,mixedPaint);

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const containerProject=mixedProject.replace('Before $z$ end.',
        '\\begin{center}\nBefore section.\n\\end{center}').replace('\\begin{document}',
        '\\usepackage{amsthm}\n\\begin{document}');
      const proofChild='\\begin{proof}\nStartChild.\n\\end{proof}\n';
      await openMockProject(page,false,containerProject,proofChild);
      await page.evaluate(()=>{nativeProbe.targetInclude=true;nativeProbe.includeMainText=true;});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const containerBounds=await canvas.boundingBox();
      await page.mouse.move(containerBounds.x+9850000*scale,containerBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(containerBounds.x+7450000*scale,containerBounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.insertText(' updated.');
      const updatedParent=containerProject.replace('Before section.','Before updated.');
      const updatedProof=proofChild.replace('StartChild.','Child.');
      await projectDrafts(updatedParent,updatedProof);
      await page.keyboard.press(mod+'+z');
      await projectDrafts(containerProject,proofChild);
      await page.keyboard.press(mod+'+Shift+z');
      await projectDrafts(updatedParent,updatedProof);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await revealToolbar(page);await page.locator('[data-group=reference]').click();
      await page.locator('.floating-toolbar').getByRole('button',{name:'Outline',exact:true}).click();
      await page.locator('#document-outline [data-outline-file="chapters/one.tex"]').click();
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
      await page.keyboard.type('X');
      await projectDrafts(updatedParent,updatedProof.replace('Child.','XChild.'));

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const nestedChild='\\begin{itemize}\n\\item Outer item.\n\\begin{enumerate}\n\\item StartChild.\n\\end{enumerate}\n\\end{itemize}\n';
      await openMockProject(page,false,containerProject,nestedChild);
      await page.evaluate(()=>{nativeProbe.targetInclude=true;nativeProbe.includeMainText=true;});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText(/Click (?:text|prose) on the native page/).waitFor();
      await page.locator('#native-tex-edit').click();
      const nestedBounds=await canvas.boundingBox();
      const xAfter=text=>nestedBounds.x+(6450000+text.replace(/\s/g,'').length*200000)*scale;
      await page.mouse.move(xAfter('Outer item.Start'),nestedBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(xAfter('Outer item.StartChild.Before section.After ch'),nestedBounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.insertText(' updated.');
      const editedNestedChild=nestedChild.replace('StartChild.','Start updated.');
      await projectDrafts(containerProject.replace('After chapter.','apter.'),editedNestedChild);
      await page.keyboard.press(mod+'+z');
      await projectDrafts(containerProject,nestedChild);

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const headingProject=mixedProject.replace('Before $z$ end.','Before suffix.');
      const headingChild='\\section*{StartChild.}\n';
      await openMockProject(page,false,headingProject,headingChild);
      await page.evaluate(()=>{nativeProbe.targetInclude=true;nativeProbe.includeMainText=true;});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const headingBounds=await canvas.boundingBox();
      await page.mouse.move(headingBounds.x+9850000*scale,headingBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(headingBounds.x+7450000*scale,headingBounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.insertText(' 50%');
      await projectDrafts(headingProject.replace('Before suffix.','Before 50\\%'),headingChild.replace('StartChild.','Child.'));
      await page.keyboard.press(mod+'+z');
      await projectDrafts(headingProject,headingChild);

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const repeatedProject='\\documentclass{article}\n\\begin{document}\nBefore.\n\n\\input{chapters/one}\n\n'+
        'Between.\n\n\\input{chapters/one}\n\nAfter.\n\\end{document}\n';
      const repeatedChild='Child.\n\n\\[\\frac{x}{}\\]\n';
      await openMockProject(page,false,repeatedProject,repeatedChild);
      await page.evaluate(()=>{nativeProbe.targetInclude=true;nativeProbe.repeatedInput=true;});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:20250000*scale}});
      await page.keyboard.type('X');
      await projectDrafts(repeatedProject,repeatedChild.replace('Child.','XChild.'));
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      assert.ok(Number.parseFloat(await panel.locator('.native-tex-caret').evaluate(caret=>caret.style.top))>18000000*scale);
      await canvas.click({position:{x:6500000*scale,y:22000000*scale}});
      await page.keyboard.type('q');
      const repeatedEdited=repeatedChild.replace('Child.','XChild.').replace('}{','}{q');
      await projectDrafts(repeatedProject,repeatedEdited);
      await page.keyboard.press(mod+'+z');
      await projectDrafts(repeatedProject,repeatedChild.replace('Child.','XChild.'));
      await page.keyboard.press(mod+'+z');
      await projectDrafts(repeatedProject,repeatedChild);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.evaluate(()=>document.dispatchEvent(new CustomEvent('lineae-toggle-project-file',{
        detail:{path:'chapters/one.tex'},
      })));
      await page.waitForFunction(()=>document.querySelectorAll('.native-tex-fold-mask[data-fold-path="chapters/one.tex"]').length===2);
      await panel.locator('.native-tex-fold-mask').last().click();
      await panel.locator('.native-tex-fold-mask').first().waitFor({state:'detached'});
      await canvas.click({position:{x:6550000*scale,y:20250000*scale}});
      await page.keyboard.press(mod+'+Alt+j');
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,repeatedProject.replace('After.','XAfter.'));

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const pictureSource='\\documentclass{article}\n\\begin{document}\nProject text.\n\\end{document}\n';
      await openMockProject(page,false,pictureSource);
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await stubImagePicker(page);
      await page.keyboard.press('Backslash');
      await page.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('includegraphics');
      await page.keyboard.press('Enter');
      const picture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=','base64');
      await page.locator('input[type=file][accept*="image/png"]').setInputFiles({name:'added.png',mimeType:'image/png',buffer:picture});
      const insertedPicture=pictureSource.replace('Project text.','\\includegraphics{added.png}\n\nProject text.')
        .replace('\\begin{document}','\\usepackage{graphicx}\n\\begin{document}');
      await page.waitForFunction(({source,bytes})=>nativeProbe.calls.some(call=>{
        const file=call.args?.files?.find(file=>file.path==='added.png');
        return call.args?.source===source&&file?.bytes.length===bytes.length&&file.bytes.every((byte,index)=>byte===bytes[index]);
      }),{source:insertedPicture,bytes:[...picture]});
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pictureSource);
      await page.keyboard.press(mod+'+Shift+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,insertedPicture);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pictureSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await revealToolbar(page);await page.locator('[data-group=insert]').click();
      await page.getByRole('button',{name:'Subfigure',exact:true}).click();
      const subfigureNames=['panel-a.png','panel-b.png'];
      await page.locator('input[type=file][multiple][accept*="image/png"]').setInputFiles(
        subfigureNames.map(name=>({name,mimeType:'image/png',buffer:picture})));
      await page.waitForFunction(({names,bytes})=>nativeProbe.calls.some(call=>{
        const source=call.args?.source;
        return source?.includes('\\usepackage{subcaption}')&&source.match(/\\begin\{subfigure\}/g)?.length===2&&
          names.every(name=>source.includes(`{${name}}`)&&call.args.files?.some(file=>file.path===name&&
            file.bytes.length===bytes.length&&file.bytes.every((byte,index)=>byte===bytes[index])));
      }),{names:subfigureNames,bytes:[...picture]});
      const groupedPictures=await page.evaluate(()=>nativeProbe.source);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pictureSource);
      await page.keyboard.press(mod+'+Shift+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,groupedPictures);

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      await openMockProject(page,true);
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:3500000*scale,y:3500000*scale}});
      await revealToolbar(page);
      await stubImagePicker(page);
      await page.getByRole('button',{name:'Replace image',exact:true}).click();
      await page.locator('input[type=file][accept*="image/png"]').setInputFiles(
        {name:'replacement.png',mimeType:'image/png',buffer:picture});
      const replacedPicture=projectMainWithImage.replace('{plot.png}','{replacement.png}');
      await page.waitForFunction(({source,bytes})=>nativeProbe.calls.some(call=>{
        const file=call.args?.files?.find(file=>file.path==='replacement.png');
        return call.args?.source===source&&file?.bytes.length===bytes.length&&file.bytes.every((byte,index)=>byte===bytes[index]);
      }),{source:replacedPicture,bytes:[...picture]});
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,projectMainWithImage);

      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-workspace=1',{waitUntil:'networkidle'});
      const workspaceSource='\\documentclass{article}\n\\begin{document}\nNative document.\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'workspace.tex',mimeType:'text/plain',buffer:Buffer.from(workspaceSource)});
      await page.evaluate(()=>{nativeProbe.collection=true;});
      await page.locator('#native-tex-toggle').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      assert.equal(await panel.getAttribute('data-editing'),'true');
      assert.equal(await panel.getAttribute('data-renderer'),'canvas');
      assert.equal(await page.locator('#native-tex-edit').isVisible(),false);
      assert.equal(await page.locator('#editor').isVisible(),false);
      const setNativePageZoom=value=>page.locator('footer.document-status input[type=range]').evaluate((input,value)=>{
        input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));
      },value);
      await setNativePageZoom(100);
      const at100=(await canvas.boundingBox()).width;
      await setNativePageZoom(75);
      await page.waitForFunction(width=>Math.abs(document.querySelector('[data-native-page="1"] canvas')
        .getBoundingClientRect().width-width*.75)<2,at100);
      assert.equal(await page.locator('#native-tex-zoom').isVisible(),false);
      const pagePresentation=page.locator('.pagination-toggle');
      assert.equal(await pagePresentation.getAttribute('data-mode'),'pages');
      await pagePresentation.click();
      assert.equal(await panel.getAttribute('data-page-presentation'),'flow');
      assert.equal(await panel.locator('.native-tex-page').evaluate(node=>getComputedStyle(node).marginTop),'0px');
      assert.ok(Math.abs((await canvas.boundingBox()).width-at100*.75)<2);
      await pagePresentation.click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+a');
      await revealToolbar(page);
      await page.locator('[data-group=home]').click();
      await page.locator('[data-format-attribute=fontSize]').selectOption('16pt');
      const resized='\\RequirePackage{fix-cm}\n'+workspaceSource.replace('Native document.','{\\fontsize{16}{20}\\selectfont Native document.}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,resized);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,workspaceSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await revealToolbar(page);
      await page.locator('.floating-toolbar .color-control').click();
      const red=page.locator('.color-swatch[data-color=red]');
      const hex=(await red.getAttribute('data-hex')).slice(1);
      await red.click();
      await page.keyboard.type('X');
      const colored=workspaceSource.replace('Native document.',`\\textcolor[HTML]{${hex}}{X}Native document.`)
        .replace('\\begin{document}','\\usepackage{xcolor}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,colored);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,workspaceSource);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.evaluate(()=>navigator.clipboard.write([new ClipboardItem({
        'text/plain':new Blob(['Bold'],{type:'text/plain'}),
        'text/html':new Blob(['<strong>Bold</strong>'],{type:'text/html'}),
      })]));
      await page.keyboard.press(mod+'+v');
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        workspaceSource.replace('Native document.','\\textbf{Bold}Native document.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,workspaceSource);
      await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
        call.args.sourceRevision===nativeProbe.revision));
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,workspaceSource.replace('Native document.','XNative document.'));
      const openedSessions=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_open').length);
      await page.locator('[data-source-mode=source]').click();
      await panel.waitFor({state:'hidden'});
      const beforeHiddenEdit=await page.evaluate(()=>nativeProbe.ruleRects.length);
      await page.locator('.cm-content .cm-line').filter({hasText:'XNative document.'}).click();
      await page.keyboard.press('Home');
      await page.keyboard.insertText('H');
      await page.waitForFunction(expected=>nativeProbe.source===expected&&
        document.querySelector('#native-tex-preview').dataset.state==='current',workspaceSource.replace('Native document.','HXNative document.'));
      assert.equal(await page.evaluate(()=>nativeProbe.ruleRects.length),beforeHiddenEdit);
      await page.locator('[data-source-mode=split]').click();
      await page.locator('.tex-preview > #native-tex-preview[data-editing=false] canvas').waitFor();
      assert.equal(await page.locator('.tex-preview > .document-page').isVisible(),false);
      assert.equal(await page.locator('#native-tex-input').isVisible(),false);
      await page.locator('.cm-content .cm-line').filter({hasText:'HXNative document.'}).click();
      await page.keyboard.press('Home');
      await page.keyboard.insertText('S');
      await page.waitForFunction(expected=>nativeProbe.source===expected,workspaceSource.replace('Native document.','SHXNative document.'));
      await page.locator('[data-source-mode=body]').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      assert.equal(await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_open').length),openedSessions);
      assert.equal(await page.evaluate(()=>customElements.get('math-field')),undefined);
      const bodyText='SHXNative document.';
      const beforeListing=workspaceSource.replace('Native document.',bodyText);
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await revealToolbar(page);
      await page.locator('[data-group=insert]').click();
      await page.locator('.floating-toolbar button[data-source-action="TikZ"]').evaluate(button=>button.click());
      const nativeDrawing='\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}';
      await page.locator('.tikz-studio-libraries').fill('\\usetikzlibrary{arrows.meta}');
      await page.locator('.tikz-studio-code').fill(nativeDrawing);
      await page.locator('.tikz-studio-insert').click();
      const insertedDrawing=beforeListing.replace(bodyText,nativeDrawing+'\n\n'+bodyText)
        .replace('\\begin{document}','\\usepackage{tikz}\n\\usetikzlibrary{arrows.meta}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,insertedDrawing);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,beforeListing);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await page.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('lstlisting');
      await page.keyboard.press('Enter');
      await page.locator('.editor-dialog input').fill('Python');
      await page.locator('.editor-dialog').getByRole('button',{name:'OK',exact:true}).click();
      const emptyListing='\\begin{lstlisting}[language=Python]\n\n\\end{lstlisting}';
      const listingSource=beforeListing.replace(bodyText,emptyListing+'\n\n'+bodyText)
        .replace('\\begin{document}','\\usepackage{listings}\n\\begin{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,listingSource);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,beforeListing);
      await page.keyboard.press(mod+'+Shift+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,listingSource);
      await page.getByRole('button',{name:'Edit code block',exact:true}).click();
      const codeDialog=page.locator('.editor-dialog');
      await codeDialog.getByRole('textbox',{name:'Code block',exact:true}).fill('if True:\n    print("50%")');
      await codeDialog.getByRole('button',{name:'OK',exact:true}).click();
      const listingEdited=listingSource.replace('[language=Python]\n\n','[language=Python]\nif True:\n    print("50%")\n');
      await page.waitForFunction(expected=>nativeProbe.source===expected,listingEdited);
      assert.equal(await page.locator('.cm-content').isVisible(),false);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,listingSource);
      await page.keyboard.press(mod+'+Shift+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,listingEdited);
      const rawBlock='\\custom{Original}';
      const sourceWithRaw=workspaceSource.replace('\\begin{document}',
        '\\newcommand{\\custom}[1]{#1}\n\\begin{document}').replace('Native document.',`Before.\n\n\\newpage\n\n${rawBlock}\n\nAfter.`);
      await page.locator('input#file').setInputFiles({name:'custom-block.tex',mimeType:'text/plain',buffer:Buffer.from(sourceWithRaw)});
      const sourceBlocks=page.getByRole('combobox',{name:'LaTeX source block',exact:true});
      await sourceBlocks.selectOption({label:'custom-block.tex · \\newpage'});
      await page.getByRole('button',{name:'Edit LaTeX command',exact:true}).click();
      await page.locator('.editor-dialog input').fill('\\clearpage');
      await page.locator('.editor-dialog').getByRole('button',{name:'OK',exact:true}).click();
      const changedDirective=sourceWithRaw.replace('\\newpage','\\clearpage');
      await page.waitForFunction(expected=>nativeProbe.source===expected,changedDirective);
      assert.equal(await page.locator('.cm-content').isVisible(),false);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,sourceWithRaw);
      await page.keyboard.press(mod+'+Shift+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,changedDirective);
      await sourceBlocks.selectOption({label:'custom-block.tex · '+rawBlock});
      await page.getByRole('button',{name:'Edit source block',exact:true}).click();
      await page.locator('.cm-content').waitFor();
      await page.keyboard.insertText('\\custom{Updated}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,changedDirective.replace(rawBlock,'\\custom{Updated}'));
      await page.locator('[data-source-mode=body]').click();
      const blank='\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n';
      await page.locator('input#file').setInputFiles({name:'empty-workspace.tex',mimeType:'text/plain',buffer:Buffer.from(blank)});
      await page.getByRole('button',{name:'Start typing',exact:true}).click();
      await page.keyboard.type('$$');
      await panel.getByText('Type a display formula',{exact:true}).waitFor();
      await page.keyboard.insertText('\\frac{a}{}');
      const initialFormula=blank.replace('\\begin{document}\n','\\begin{document}\n\\[\\frac{a}{}\\]\n');
      await page.waitForFunction(expected=>nativeProbe.source===expected,initialFormula);
      await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      await page.keyboard.type('$$');
      await panel.getByText('Type text after the formula',{exact:true}).waitFor();
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,initialFormula.replace('\\]','\\]\n\nX'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,initialFormula);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,blank);
      await page.getByRole('button',{name:'Start typing',exact:true}).click();
      await page.keyboard.press(mod+'+e');
      await page.keyboard.press('Shift+c');
      const casesSource=blank.replace('\\begin{document}\n',
        '\\usepackage{amsmath}\n\\begin{document}\n\\[\\begin{cases}&\\\\&\\end{cases}\\]\n');
      await page.waitForFunction(expected=>nativeProbe.source===expected&&
        document.querySelector('.environment-tag')?.textContent.endsWith('Row 1, column 1'),casesSource);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,blank);
      await page.getByRole('button',{name:'Start typing',exact:true}).click();
      await page.locator('button[data-group="math"]').click();
      await page.getByRole('button',{name:'align*',exact:true}).click();
      const alignStarSource=blank.replace('\\begin{document}\n',
        '\\usepackage{amsmath}\n\\begin{document}\n\\begin{align*}&\\\\&\\end{align*}\n');
      await page.waitForFunction(expected=>nativeProbe.source===expected,alignStarSource);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,blank);
      await page.getByRole('button',{name:'Start typing',exact:true}).click();
      await page.keyboard.press('Backslash');
      await page.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('frac');
      await page.keyboard.press('Enter');
      const inlineFraction=blank.replace('\\begin{document}\n','\\begin{document}\n$\\frac{}{}$\n');
      await page.waitForFunction(expected=>nativeProbe.source===expected,inlineFraction);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,blank);
      await page.getByRole('button',{name:'Start typing',exact:true}).click();
      await page.keyboard.press(mod+'+Shift+6');
      await page.waitForFunction(original=>nativeProbe.source!==original&&nativeProbe.source
        ?.replace(/\\begin\{tabular\}\{\|l\|l\|\}[\s\S]*?\\end\{tabular\}\n/,'')===original&&
        document.querySelector('.environment-tag')?.textContent.endsWith('Row 1, column 1'),blank);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,blank);
      await page.getByRole('button',{name:'Start typing',exact:true}).click();
      await page.keyboard.type('AlphaBeta');
      await page.waitForFunction(()=>nativeProbe.source.includes('AlphaBeta')&&
        nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&call.args.sourceRevision===nativeProbe.revision));
      assert.equal(await page.evaluate(()=>document.querySelectorAll('.ProseMirror p').length),1);
      const beforeBreak=await page.evaluate(()=>nativeProbe.source);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('End');
      await page.keyboard.press('Tab');
      await page.waitForFunction(expected=>nativeProbe.source===expected,beforeBreak.replace('AlphaBeta','AlphaBeta    '));
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Shift+Tab');
      await page.waitForFunction(expected=>nativeProbe.source===expected,beforeBreak);
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'native-tex-input');
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Home');
      for(let index=0;index<5;index++)await page.keyboard.press('ArrowRight');
      const softBreak=beforeBreak.replace('AlphaBeta','Alpha\\\\\nBeta');
      await page.keyboard.press(mod+'+Enter');
      await page.waitForFunction(expected=>nativeProbe.source===expected,softBreak);
      assert.equal(await page.locator('.ProseMirror p br').count(),1);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,beforeBreak);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Home');
      for(let index=0;index<5;index++)await page.keyboard.press('ArrowRight');
      const split=beforeBreak.replace('AlphaBeta','Alpha\n\nBeta');
      await page.keyboard.press('Enter');
      await page.waitForFunction(expected=>nativeProbe.source.replace(/\r\n/g,'\n')===expected,split.replace(/\r\n/g,'\n'));
      assert.deepEqual(await page.locator('.ProseMirror p').allTextContents(),['Alpha','Beta']);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,beforeBreak);
      await page.keyboard.press(mod+'+Shift+z');
      await page.waitForFunction(expected=>nativeProbe.source.replace(/\r\n/g,'\n')===expected,split.replace(/\r\n/g,'\n'));
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
      await page.keyboard.press('Backspace');
      await page.waitForFunction(expected=>nativeProbe.source===expected,beforeBreak);
      assert.deepEqual(await page.locator('.ProseMirror p').allTextContents(),['AlphaBeta']);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source.replace(/\r\n/g,'\n')===expected,split.replace(/\r\n/g,'\n'));
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+a');
      await page.keyboard.press(mod+'+c');
      await page.waitForFunction(async()=>await navigator.clipboard.readText()==='Alpha\n\nBeta');
      await canvas.click({position:{x:7720000*scale,y:9250000*scale}});
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,beforeBreak.replace('AlphaBeta','AlphXeta'));
      assert.deepEqual(await page.locator('.ProseMirror p').allTextContents(),['AlphXeta']);
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,split);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
      await page.evaluate(()=>{nativeProbe.releaseUpdate=null;nativeProbe.holdUpdate=true;});
      await page.keyboard.insertText('Y');
      await page.waitForFunction(()=>typeof nativeProbe.releaseUpdate==='function');
      await page.keyboard.insertText('$');
      await page.keyboard.insertText('x');
      await page.evaluate(()=>nativeProbe.releaseUpdate());
      await page.waitForFunction(expected=>nativeProbe.source===expected,split.replace('Beta','Y$x$Beta'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,split.replace('Beta','YBeta'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,split);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:7520000*scale,y:9250000*scale}});
      await page.keyboard.insertText('$');
      await page.keyboard.insertText('$');
      await page.keyboard.insertText('x');
      await page.waitForFunction(expected=>nativeProbe.source===expected,split.replace('Beta','\\[x\\]\n\nBeta'));
      const unsorted=blank.replace('\n\n\\end{document}','\nZed.\n\n\nAlpha.\n\\end{document}');
      await page.locator('input#file').setInputFiles({name:'sort.tex',mimeType:'text/plain',buffer:Buffer.from(unsorted)});
      await page.waitForFunction(expected=>nativeProbe.source===expected,unsorted);
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+a');
      await revealToolbar(page);await page.locator('[data-group=home]').click();
      const sort=page.getByRole('button',{name:'Sort',exact:true});
      if(!await sort.isVisible())await page.locator('[data-ribbon-group=paragraph] .ribbon-group-toggle').click();
      await sort.click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,unsorted.replace('Zed.\n\n\nAlpha.','Alpha.\n\n\nZed.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,unsorted);
      const leadingFormula=blank.replace('\n\n\\end{document}',
        '\n\\[\\frac{a}{b}\\]\n\nAfter.\n\\end{document}');
      await page.locator('input#file').setInputFiles({name:'leading-formula.tex',mimeType:'text/plain',buffer:Buffer.from(leadingFormula)});
      await page.waitForFunction(expected=>nativeProbe.source===expected,leadingFormula);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('End');
      await page.keyboard.press('Shift+PageUp');
      await page.keyboard.press(mod+'+c');
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'\\[\\frac{a}{b}\\]\n\nAfter.');
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Shift+PageUp');
      await page.keyboard.press('Delete');
      await page.waitForFunction(expected=>nativeProbe.source===expected,leadingFormula.replace('\\[\\frac{a}{b}\\]\n\n',''));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,leadingFormula);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+a');
      await page.keyboard.press(mod+'+c');
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'\\[\\frac{a}{b}\\]\n\nAfter.');
      await page.keyboard.insertText('Replaced.');
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        leadingFormula.replace('\\[\\frac{a}{b}\\]\n\nAfter.','Replaced.'));
      await page.keyboard.press(mod+'+z');
      await page.waitForFunction(expected=>nativeProbe.source===expected,leadingFormula);
      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      const singleProject=workspaceSource.replace('Native document.','Native document.\n\n\\[\\frac{a}{}\\]');
      const independent=workspaceSource.replace('Native document.','Independent file.');
      await openMockProject(page,false,singleProject,independent);
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press('Backslash');
      await prosePalette.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('input');
      await prosePalette.getByRole('option',{name:'\\input',exact:true}).waitFor();
      await page.keyboard.press('Escape');
      await page.keyboard.type('X');
      const projectWithText=singleProject.replace('Native document.','XNative document.');
      await page.waitForFunction(expected=>nativeProbe.source===expected,projectWithText);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6500000*scale,y:7000000*scale}});
      await page.keyboard.type('q');
      const verifiedMain=projectWithText.replace('}{','}{q');
      await page.waitForFunction(expected=>nativeProbe.source===expected,verifiedMain);
      const folder=page.locator('summary[data-path="chapters"]');
      if(!await page.locator('.project-file[data-path="chapters/one.tex"]').isVisible())await folder.click();
      await page.locator('.project-file[data-path="chapters/one.tex"]').click();
      await page.waitForFunction(expected=>nativeProbe.source===expected,independent);
      assert.equal(await page.evaluate(()=>nativeProbe.mainFile),'chapters/one.tex');
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(({active,main})=>{
        const update=nativeProbe.calls.findLast(call=>call.command==='native_tex_update');
        const entry=nativeProbe.calls.findLast(call=>call.command==='native_tex_update'&&call.args.mainFile==='chapters/one.tex');
        return update?.args.source===active&&entry?.args.files?.some(file=>file.path==='main.tex'&&
          new TextDecoder().decode(new Uint8Array(file.bytes))===main);
      },{active:independent.replace('Independent','XIndependent'),main:verifiedMain});
      await page.locator('#native-tex-close').click();
      const fragment='Detached notes.';
      await openMockProject(page,false,singleProject,fragment);
      if(!await page.locator('.project-file[data-path="chapters/one.tex"]').isVisible())await folder.click();
      await page.locator('.project-file[data-path="chapters/one.tex"]').click();
      await page.locator('#native-tex-toggle').click();
      const stagedFragment=workspaceSource.replace('Native document.',fragment);
      await page.waitForFunction(expected=>nativeProbe.source===expected,stagedFragment);
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.type('X');
      await page.waitForFunction(expected=>nativeProbe.source===expected,stagedFragment.replace(fragment,'X'+fragment));
      assert.deepEqual(await page.locator('.ProseMirror p').allTextContents(),['X'+fragment]);
      await page.locator('#native-tex-close').click();
      const endingWithInput=projectMain.replace('After chapter.\n','');
      await openMockProject(page,false,endingWithInput);
      await page.evaluate(()=>{nativeProbe.targetInclude=true;nativeProbe.includeMainText=true;});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await canvas.click({position:{x:6550000*scale,y:9250000*scale}});
      await page.keyboard.press(mod+'+Alt+j');
      await panel.getByText('Continue editing main.tex',{exact:true}).waitFor();
      await page.evaluate(()=>{nativeProbe.releaseUpdate=null;nativeProbe.holdUpdate=true;});
      await page.keyboard.type('P');
      await page.waitForFunction(()=>typeof nativeProbe.releaseUpdate==='function');
      await page.keyboard.type('arent ');
      await page.evaluate(()=>nativeProbe.releaseUpdate());
      const pendingSpace=endingWithInput.replace('\\end{document}','Parent \n\\end{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,pendingSpace);
      await page.keyboard.type('continuation.');
      const continued=endingWithInput.replace('\\end{document}','Parent continuation.\n\\end{document}');
      await page.waitForFunction(expected=>nativeProbe.source===expected,continued);
      await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
      await page.keyboard.press('Home');
      for(let index=0;index<7;index++)await page.keyboard.press('ArrowRight');
      await page.evaluate(()=>{nativeProbe.releaseUpdate=null;nativeProbe.holdUpdate=true;});
      await page.keyboard.type('X');
      await page.waitForFunction(()=>typeof nativeProbe.releaseUpdate==='function');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Y');
      await page.evaluate(()=>nativeProbe.releaseUpdate());
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        continued.replace('Parent continuation.','Parent X\n\nYcontinuation.'));
      await page.locator('#native-tex-close').click();
      const foldSource='\\documentclass{article}\n\\begin{document}\nBefore.\n\n\\input{chapters/one}\n\nAfter.\n\\end{document}\n';
      await openMockProject(page,false,foldSource,'Start.\n\nEnd.\n');
      await page.evaluate(()=>{nativeProbe.foldProject=true;nativeProbe.targetInclude=false;});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await page.evaluate(()=>document.dispatchEvent(new CustomEvent('lineae-toggle-project-file',{
        detail:{path:'chapters/one.tex'},
      })));
      await panel.locator('.native-tex-pages[data-skipped-pages="2"]').waitFor();
      assert.equal(await panel.locator('[data-native-page="2"]').isHidden(),true);
      assert.deepEqual(await panel.locator('.native-tex-fold-mask').evaluateAll(nodes=>nodes.map(node=>node.dataset.originalPage)),['1','3']);
      await panel.locator('.native-tex-fold-mask').first().click();
      await panel.locator('[data-native-page="2"]').waitFor();
      assert.equal(await panel.locator('.native-tex-fold-mask').count(),0);
      assert.equal(await page.evaluate(()=>nativeProbe.source),foldSource);
      await page.locator('#native-tex-close').click();
      const inlineInclude=foldSource.replace('Before.\n\n\\input{chapters/one}\n\nAfter.','Before \\input{chapters/one} After.');
      await openMockProject(page,false,inlineInclude,'Child');
      await page.evaluate(()=>{nativeProbe.foldProject='inline';});
      await page.locator('#native-tex-toggle').click();
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      await page.evaluate(()=>document.dispatchEvent(new CustomEvent('lineae-toggle-project-file',{
        detail:{path:'chapters/one.tex'},
      })));
      const inlineMask=panel.locator('.native-tex-fold-inline');
      await inlineMask.waitFor();
      assert.equal(await panel.locator('.native-tex-fold-mask').count(),1);
      assert.ok(await inlineMask.evaluate(mask=>mask.offsetWidth<mask.parentElement.offsetWidth/10));
      await inlineMask.click();
      await inlineMask.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>nativeProbe.source),inlineInclude);
      const inlineBounds=await canvas.boundingBox();
      await page.mouse.move(inlineBounds.x+6850000*scale,inlineBounds.y+9250000*scale);
      await page.mouse.down();
      await page.mouse.move(inlineBounds.x+9750000*scale,inlineBounds.y+9250000*scale,{steps:12});
      await page.mouse.up();
      await page.keyboard.insertText('Z');
      await projectDrafts(inlineInclude.replace('Before','BeZ').replace('After','ter'),'');
      await page.keyboard.press(mod+'+z');
      await projectDrafts(inlineInclude,'Child');
      await page.locator('#native-tex-close').click();
      await page.locator('#settings-open').click();
      await page.locator('[data-native-workspace-preference]').check();
      await page.locator('#settings-apply').click();
      assert.equal(await page.locator('#settings-panel').isVisible(),true);
      await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'Native document',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>customElements.get('math-field')),undefined);
      assert.equal(await page.locator('.document-sheets').count(),0);
      assert.deepEqual(errors,[]);
      console.log('PASS native mixed editing with MathLive and JS pagination disabled');
      return;
    }
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    await page.locator('input#file').setInputFiles({name:'native.tex',mimeType:'text/plain',
      buffer:Buffer.from('\\documentclass{article}\n\\begin{document}\nBefore $abc$ after.\n\\end{document}\n')});
    const field=page.locator('math-field');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value==='abc');
    await field.click();
    await field.evaluate(field=>{field.dataset.testIdentity='original';field.position=field.lastOffset;});
    const before=await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON());
    assert.deepEqual(await page.evaluate(()=>nativeProbe.calls),[],'No startup compiler execution or implicit document trust');
    const button=page.locator('#native-tex-toggle'),panel=page.locator('#native-tex-preview');
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'MATH-FIELD','Preview does not steal the editing focus');
    assert.deepEqual(await page.locator('.ProseMirror').evaluate(el=>el.editor.getJSON()),before,'Opening preview never rewrites source or editor state');
    assert.equal(await field.getAttribute('data-test-identity'),'original','Native preview does not replace the existing editable surface');
    assert.equal(await panel.locator('canvas').count(),1);
    assert.ok(await panel.locator('canvas').evaluate(canvas=>canvas.width>1),'Actual Canvas painting completes before current state');
    assert.ok(await page.evaluate(()=>nativeProbe.ruleRects.some(rect=>rect.w===3000000 && rect.h===6554)),
      'Thin rules retain native TeX geometry instead of being widened to a device-pixel minimum');
    await field.dispatchEvent('compositionstart',{bubbles:true,composed:true});
    assert.equal(await panel.getAttribute('data-state'),'stale','A MathLive preedit temporarily disables native hits');
    assert.equal(await page.locator('#native-tex-export').isDisabled(),true);
    await field.dispatchEvent('compositionend',{bubbles:true,composed:true});
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    assert.equal(await page.evaluate(()=>nativeProbe.revision),1,'Canceled composition does not create a native revision');
    await page.evaluate(()=>{nativeProbe.warmNext=true;});
    await page.keyboard.type('d');
    await page.waitForFunction(()=>nativeProbe.source?.includes('abcd'));
    await panel.locator('[data-warm-revision="2"]').waitFor();
    assert.equal(await page.locator('#native-tex-export').isDisabled(),true,'A provisional repaint does not authorize export or targeting');
    await page.evaluate(()=>nativeProbe.finishWarm());
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    assert.equal(await panel.locator('[data-warm-revision]').count(),0);
    await page.keyboard.press(mod+'+z');
    await page.waitForFunction(()=>document.querySelector('math-field').value==='abc');
    await page.waitForFunction(()=>!nativeProbe.source?.includes('abcd'));
    await page.keyboard.press(mod+'+y');
    await page.waitForFunction(()=>document.querySelector('math-field').value==='abcd');
    await page.waitForFunction(()=>nativeProbe.source?.includes('abcd') &&
      document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-zoom').selectOption('150');
    await page.locator('#native-tex-export').click();
    assert.ok(await page.evaluate(()=>nativeProbe.calls.some(call=>call.command==='native_tex_export' &&
      call.args.sourceRevision===nativeProbe.revision)),'Export names the exact confirmed source revision');
    await page.locator('#native-tex-close').click();
    assert.equal(await panel.isHidden(),true);
    assert.equal(await field.getAttribute('data-test-identity'),'original');
    await page.evaluate(()=>{nativeProbe.failFont=true;nativeProbe.registeredPdf=true;});
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current' &&
      document.querySelector('#native-tex-preview').dataset.renderer==='pdf');
    assert.equal(await panel.locator('[data-pdf-page] canvas').count(),1,'Unsupported direct font rendering uses an actual PDF page, not a generic-font substitute');
    assert.equal(await page.locator('#native-tex-target').isDisabled(),true,'A PDF with unmatched page dimensions provides visual output only');
    assert.ok(await page.evaluate(()=>nativeProbe.calls.some(call=>call.command==='native_tex_pdf')&&
      !nativeProbe.calls.some(call=>call.command==='native_tex_render_pdf')),
    'A registered current-layout PDF avoids an extra clean build');
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>{nativeProbe.failPdf=true;nativeProbe.registeredPdf=false;});
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='error');
    assert.equal(await page.locator('#native-tex-export').isDisabled(),true,'Missing resources cannot be presented as exact rendering');
    assert.equal(await panel.locator('canvas').count(),0,'No generic font fallback is painted');
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>{nativeProbe.failFont=false;nativeProbe.failPdf=false;nativeProbe.delayOpen=true;});
    await button.click();
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>nativeProbe.resolveOpen());
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_close' && call.args.sessionId===String(nativeProbe.session)));
    assert.equal(await panel.isHidden(),true,'A late native open cannot reopen a closed preview');
    assert.equal(await field.evaluate(field=>field.value),'abcd','Preview failures and cancellation preserve edits');
    await page.evaluate(()=>{nativeProbe.delayOpen=false;});
    const input=await readFile('tests/native-math/fixtures/empty-denominator.tex');
    const expected=await readFile('tests/native-math/fixtures/filled-denominator.tex','utf8');
    await page.locator('input#file').setInputFiles({name:'denominator.tex',mimeType:'text/plain',buffer:input});
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\frac'));
    await field.click();
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.evaluate(()=>{nativeProbe.mismatchObservedDrawing=true;});
    await page.locator('#native-tex-target').click();
    await panel.getByText('Projected geometry differs', {exact:false}).waitFor();
    await page.evaluate(()=>{nativeProbe.mismatchObservedDrawing=false;});
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
    const scale=Number(await page.locator('#native-tex-zoom').inputValue())/100*(96/72)/65781.76;
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6560000*scale,y:6250000*scale}});
    await page.waitForFunction(()=>{
      const field=document.activeElement, math=field?._mathfield;
      const atom=math?.model.at(field.position);
      return field?.tagName==='MATH-FIELD'&&!math?.focusBlurInProgress&&atom?.type==='first'&&atom.parentBranch==='above';
    });
    await panel.locator('.native-tex-caret').waitFor();
    const markerLeft=await panel.locator('.native-tex-caret').evaluate(node=>parseFloat(node.style.left));
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(left=>{
      const marker=document.querySelector('.native-tex-caret');
      return marker&&parseFloat(marker.style.left)>left;
    },markerLeft);
    await page.keyboard.press('Shift+ArrowLeft');
    await panel.locator('.native-tex-selection').waitFor();
    const selectionLeft=await panel.locator('.native-tex-selection').evaluate(node=>parseFloat(node.style.left));
    await page.locator('#native-tex-zoom').selectOption('125');
    await page.waitForFunction(left=>{
      const marker=document.querySelector('.native-tex-selection');
      return marker&&parseFloat(marker.style.left)<left;
    },selectionLeft);
    await page.locator('#native-tex-zoom').selectOption('150');
    await page.waitForFunction(left=>{
      const marker=document.querySelector('.native-tex-selection');
      return marker&&parseFloat(marker.style.left)===left;
    },selectionLeft);
    const canvas=panel.locator('[data-native-page="1"] canvas');
    const box=await canvas.boundingBox();
    await page.mouse.move(box.x+6560000*scale,box.y+6250000*scale);
    await page.mouse.down();
    await page.mouse.move(box.x+6740000*scale,box.y+6250000*scale,{steps:3});
    await panel.locator('.native-tex-selection').waitFor();
    await page.mouse.up();
    await page.waitForFunction(()=>{
      const range=document.activeElement?.selection?.ranges?.[0];
      return range?.[1]-range?.[0]===1;
    });
    assert.equal(await field.evaluate(field=>field.getValue(field.selection.ranges[0])),'a',
      'Dragging over one native glyph selects the same formula content');
    await page.evaluate(()=>navigator.clipboard.writeText('SENTINEL'));
    await page.keyboard.press(mod+'+c');
    await page.waitForFunction(async()=> (await navigator.clipboard.readText()).includes('a'));
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
    await page.waitForFunction(()=>{
      const field=document.activeElement,math=field?._mathfield;
      return field?.tagName==='MATH-FIELD'&&!math?.focusBlurInProgress&&math?.model.at(field.position)?.parentBranch==='below';
    });
    await page.keyboard.type('b');
    await page.waitForFunction(()=>nativeProbe.revision>1);
    assert.equal(await page.evaluate(()=>nativeProbe.source.replace(/\r\n/g,'\n')),expected.replace(/\r\n/g,'\n'),
      'Filling the denominator changes exactly one source letter');
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_observe_formula'&&
      call.args.sourceRevision>1),'Retarget geometry automatically after typing');
    await page.keyboard.press(mod+'+z');
    await page.waitForFunction(original=>nativeProbe.source?.replace(/\r\n/g,'\n')===original,input.toString().replace(/\r\n/g,'\n'));
    assert.equal(await field.evaluate(field=>field._mathfield.model.at(field.position)?.parentBranch),'below',
      'Undo returns the caret to the original empty denominator');
    await page.keyboard.press(mod+'+y');
    await page.waitForFunction(expected=>nativeProbe.source?.replace(/\r\n/g,'\n')===expected,expected.replace(/\r\n/g,'\n'));
    assert.equal(await field.evaluate(field=>field._mathfield.model.at(field.position)?.parentBranch),'below',
      'Redo restores the caret to the edited denominator');
    await page.locator('#native-tex-close').click();
    const nested=input.toString().replace('\\[\n\\frac{a}{}','\\[z\\]\n\n\\[\n\\frac{\\frac{7}{}}{c}')
      .replace('\\[\r\n\\frac{a}{}','\\[z\\]\r\n\r\n\\[\r\n\\frac{\\frac{7}{}}{c}');
    await page.locator('input#file').setInputFiles({name:'nested.tex',mimeType:'text/plain',buffer:Buffer.from(nested)});
    await page.waitForFunction(()=>[...document.querySelectorAll('math-field')].some(field=>field.value.includes('\\frac{\\frac')));
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
    await page.waitForFunction(()=>{
      const field=document.activeElement,math=field?._mathfield;
      const atom=math?.model.at(field.position);
      return field?.tagName==='MATH-FIELD'&&!math.focusBlurInProgress&&atom?.parentBranch==='below'&&
        atom.parent?.type==='genfrac'&&atom.parent.parent?.type==='genfrac';
    });
    await page.keyboard.type('b');
    await page.waitForFunction(()=>[...document.querySelectorAll('math-field')].some(field=>field.value.includes('\\frac{\\frac{7}{b}}{c}')));
    assert.equal((await field.first().evaluate(field=>field.value)).trim(),'z','Editing the second display never changes the first');
    await page.locator('#native-tex-close').click();
    const inline=input.toString().replace(/\\\[\r?\n\\frac\{a\}\{\}\r?\n\\\]/,'Inline $\\frac{a}{}$ here.');
    await page.locator('input#file').setInputFiles({name:'inline.tex',mimeType:'text/plain',buffer:Buffer.from(inline)});
    await page.locator('.math-inline math-field').waitFor();
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
    await page.waitForFunction(()=>{
      const field=document.activeElement,math=field?._mathfield;
      return field?.closest('.math-inline')&&!math?.focusBlurInProgress&&math?.model.at(field.position)?.parentBranch==='below';
    });
    await page.keyboard.type('b');
    await page.waitForFunction(()=>nativeProbe.source?.includes('Inline $\\frac{a}{b}$ here.'));
    await page.locator('#native-tex-close').click();
    const scripts=input.toString().replace('\\frac{a}{}','x^{}');
    await page.locator('input#file').setInputFiles({name:'script.tex',mimeType:'text/plain',buffer:Buffer.from(scripts)});
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('x^{}'));
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
    await page.waitForFunction(()=>{
      const field=document.activeElement,math=field?._mathfield;
      return field?.tagName==='MATH-FIELD'&&!math?.focusBlurInProgress&&
        math?.model.at(field.position)?.parentBranch==='superscript';
    });
    await page.keyboard.type('2');
    await page.waitForFunction(()=>/x\^(?:2|\{2\})/.test(nativeProbe.source));
    await page.locator('#native-tex-close').click();
    for(const environment of ['pmatrix','aligned']){
      const open=`\\begin{${environment}}`,close=`\\end{${environment}}`;
      const matrix=input.toString().replace('\\frac{a}{}',`${open}a & \\\\ & d${close}`);
      await page.locator('input#file').setInputFiles({name:environment+'.tex',mimeType:'text/plain',buffer:Buffer.from(matrix)});
      await page.waitForFunction(open=>document.querySelector('math-field')?.value.includes(open),open);
      await button.click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
      await page.waitForFunction(()=>{
        const field=document.activeElement,math=field?._mathfield;
        const cell=math?.model.at(field.position)?.parentBranch;
        return field?.tagName==='MATH-FIELD'&&!math?.focusBlurInProgress&&Array.isArray(cell)&&cell[0]===0&&cell[1]===1;
      });
      await page.keyboard.type('b');
      await page.waitForFunction(expected=>nativeProbe.source?.replace(/\s/g,'').includes(expected),`${open}a&b\\\\&d${close}`);
      await page.locator('#native-tex-close').click();
    }
    const boxed=input.toString().replace('\\frac{a}{}','\\boxed{\\frac{a}{}}');
    await page.locator('input#file').setInputFiles({name:'boxed.tex',mimeType:'text/plain',buffer:Buffer.from(boxed)});
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\boxed'));
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
    await page.waitForFunction(()=>{
      const field=document.activeElement,math=field?._mathfield;
      return field?.tagName==='MATH-FIELD'&&!math?.focusBlurInProgress&&
        math?.model.at(field.position)?.parentBranch==='below';
    });
    await page.keyboard.type('b');
    await page.waitForFunction(()=>nativeProbe.source?.includes('\\boxed{\\frac{a}{b}}'));
    await page.locator('#native-tex-close').click();
    await openMockProject(page,true);
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    const projectOpen=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_open').at(-1).args);
    assert.equal(await panel.getAttribute('data-renderer'),'canvas');
    assert.deepEqual(await panel.locator('[data-native-page="1"] canvas').evaluate(canvas=>{
      const x=Math.round(canvas.width*3500000/39000000);
      const y=Math.round(canvas.height*3500000/55000000);
      return [...canvas.getContext('2d').getImageData(x,y,1,1).data];
    }),[255,0,0,255]);
    assert.equal(projectOpen.mainFile,'main.tex');
    assert.match(projectOpen.source,/\\input\{chapters\/one\}/,'Compile the actual main source rather than a flattened editor projection');
    assert.ok(projectOpen.files.some(file=>file.path==='chapters/one.tex'));
    assert.deepEqual(projectOpen.files.find(file=>file.path==='image.png').bytes,[0,255,13,10]);
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:3500000*scale,y:3500000*scale}});
    await revealToolbar(page);
    const imageTools=page.locator('.image-tools');
    await imageTools.waitFor();
    const width=page.getByRole('spinbutton',{name:'Width',exact:true});
    if(!await width.isVisible())await imageTools.locator('[data-ribbon-group=image-transform] .ribbon-group-toggle').click();
    await width.fill('24');
    await page.waitForFunction(expected=>nativeProbe.source===expected,projectMainWithImage.replace('18pt','24pt'));
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>{
      const editor=document.querySelector('.ProseMirror').editor;
      let textPosition;
      editor.state.doc.descendants((node,position)=>{if(node.isText)textPosition??=position;});
      editor.commands.setTextSelection(textPosition);
      nativeProbe.semanticPdf=true;nativeProbe.registeredPdf=true;
      nativeProbe.transformedRaster=true;
    });
    await imageTools.waitFor({state:'hidden'});
    await button.click();
    await page.waitForFunction(()=>{
      const state=document.querySelector('#native-tex-preview').dataset;
      return state.state==='current'&&state.renderer==='pdf';
    });
    await panel.locator('[data-pdf-page="1"] canvas').click({position:{x:4500000*scale,y:3500000*scale}});
    await revealToolbar(page);
    await imageTools.waitFor();
    if(!await width.isVisible())await imageTools.locator('[data-ribbon-group=image-transform] .ribbon-group-toggle').click();
    await width.fill('28');
    await page.waitForFunction(expected=>nativeProbe.source===expected,projectMainWithImage.replace('18pt','28pt'));
    await page.locator('#native-tex-close').click();
    await page.evaluate(()=>{nativeProbe.semanticPdf=false;nativeProbe.registeredPdf=false;nativeProbe.transformedRaster=false;});
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
    await page.waitForFunction(()=>{
      const field=document.activeElement,math=field?._mathfield;
      return field?.tagName==='MATH-FIELD'&&field.value.includes('\\frac{a}{}')&&!math?.focusBlurInProgress&&
        math?.model.at(field.position)?.parentBranch==='below';
    });
    await page.keyboard.type('b');
    await page.waitForFunction(()=>nativeProbe.source?.includes('\\frac{a}{b}'));
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.evaluate(()=>{nativeProbe.targetInclude=true;});
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
    await page.locator('#native-tex-edit').click();
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*scale,y:7000000*scale}});
    await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
    const projectObservations=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
    await page.keyboard.type('q');
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_update' &&
      call.args.source.includes('\\frac{a}{b}') &&
      call.args.files?.some(file=>file.path==='chapters/one.tex' &&
        new TextDecoder().decode(new Uint8Array(file.bytes))==='Original chapter.\n\n\\[\\frac{z}{q}\\]\n')));
    await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,projectObservations);
    await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*scale,y:9250000*scale}});
    await page.keyboard.type('X');
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_update' &&
      call.args.source.includes('\\frac{a}{b}') &&
      call.args.files?.some(file=>file.path==='chapters/one.tex' &&
        new TextDecoder().decode(new Uint8Array(file.bytes))==='XOriginal chapter.\n\n\\[\\frac{z}{q}\\]\n')));
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'native-tex-input');
    await page.locator('#native-tex-edit').click();
    await page.evaluate(()=>{nativeProbe.targetInclude=false;});
    const previousId=await page.evaluate(()=>String(nativeProbe.session));
    if(!await page.locator('#project-explorer').isVisible())await page.locator('#project-toggle').click();
    const folder=page.locator('#project-explorer summary').filter({hasText:/^chapters$/});
    if(!await folder.evaluate(node=>node.parentElement.open))await folder.click();
    await page.locator('[data-path="chapters/one.tex"]').click();
    await page.locator('[data-source-mode=source]').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press(mod+'+End');
    await page.keyboard.type('j');
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_update'&&
      call.args.source.includes('\\frac{a}{b}')&&call.args.files?.some(file=>file.path==='chapters/one.tex'&&
        new TextDecoder().decode(new Uint8Array(file.bytes)).endsWith('j'))));
    await page.keyboard.press(mod+'+a');
    await page.evaluate(()=>{nativeProbe.restartNext=true;});
    await page.keyboard.type('Changed chapter.\n');
    await page.waitForFunction(()=>nativeProbe.calls.some(call=>call.command==='native_tex_update' &&
      call.args.files?.some(file=>file.path==='chapters/one.tex' &&
        new TextDecoder().decode(new Uint8Array(file.bytes))==='Changed chapter.\n')));
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    assert.notEqual(await page.evaluate(()=>String(nativeProbe.session)),previousId,'Dependency changes may replace the native session without resetting editor history');
    await page.evaluate(()=>{nativeProbe.raster=false;});
    assert.match(await page.locator('.cm-content').textContent(),/Changed chapter\./);
    // Native editing surface: the native page receives keys, caret, selection and
    // IME; ProseMirror remains the document and history authority.
    await page.reload({waitUntil:'networkidle'});
    await page.locator('input#file').setInputFiles({name:'denominator.tex',mimeType:'text/plain',buffer:input});
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\frac'));
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
    await page.locator('#native-tex-edit').click();
    assert.equal(await panel.getAttribute('data-editing'),'true');
    const editScale=Number(await page.locator('#native-tex-zoom').inputValue())/100*(96/72)/65781.76;
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*editScale,y:7000000*editScale}});
    await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
    await panel.locator('.native-tex-caret').waitFor();
    const pollsBefore=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_poll').length);
    await page.keyboard.type('b');
    await page.waitForFunction(()=>nativeProbe.source?.includes('\\frac{a}{b}'));
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\frac{a}{b}'));
    assert.equal(await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_poll').length),pollsBefore,
      'Native editing consumes pushed events instead of polling');
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.latencySamples);
    const timings=JSON.parse(await panel.getAttribute('data-latency-segments'));
    assert.deepEqual(JSON.parse(await panel.getAttribute('data-latency-routes')),{fast:1});
    for(const stage of ['transaction','geometry','repaint','total'])
      assert.ok(timings[stage].p50>=0&&timings[stage].p99>=timings[stage].p95&&timings[stage].p95>=timings[stage].p50);
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.waitForTimeout(700);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('c');
    await page.waitForFunction(()=>nativeProbe.source?.includes('\\frac{a}{cb}'),
      'The native caret stepped left within the denominator before the second character');
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'native-tex-input',
      'The native page keeps the IME-capable input focused');
    await page.keyboard.press(mod+'+z');
    await page.waitForFunction(()=>nativeProbe.source?.includes('\\frac{a}{b}'));
    assert.equal(await page.evaluate(()=>document.querySelectorAll('math-field').length),1,
      'The existing formula editor remains available as the migration fallback');
    await page.locator('#native-tex-close').click();
    // Prose slice: plain paragraphs are tagged per grapheme and edited through
    // the same transaction path as formulas.
    const prose=Buffer.from('\\documentclass{article}\n\\begin{document}\nAlpha beta.\n\n\\[\n\\frac{a}{b}\n\\]\n\\end{document}\n');
    await page.locator('input#file').setInputFiles({name:'prose.tex',mimeType:'text/plain',buffer:prose});
    await page.waitForFunction(()=>document.querySelector('.cm-content')?.textContent.includes('Alpha beta.'));
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
    assert.equal(await page.locator('#native-tex-edit').isEnabled(),true,'Native input is available for prose');
    await page.locator('#native-tex-edit').click();
    const proseScale=Number(await page.locator('#native-tex-zoom').inputValue())/100*(96/72)/65781.76;
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6550000*proseScale,y:9250000*proseScale}});
    await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
    await page.waitForFunction(()=>nativeProbe.source?.includes('Alpha beta.'));
    await page.keyboard.type('X');
    await page.waitForFunction(()=>nativeProbe.source?.includes('XAlpha beta.'),
      'Typing at a prose grapheme boundary writes the exact source offset');
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    const observesBefore=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
    await page.keyboard.press(mod+'+z');
    await page.waitForFunction(()=>nativeProbe.source?.includes('Alpha beta.')&&!nativeProbe.source?.includes('XAlpha beta.'));
    await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,observesBefore);
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6510000*proseScale,y:6950000*proseScale}});
    await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
    await page.keyboard.type('c');
    await page.waitForFunction(()=>nativeProbe.source?.includes('\\frac{a}{cb}'),
      'A mixed document keeps formula editing on the same native page');
    await page.locator('#native-tex-close').click();
    // Inline math splits the paragraph into native text runs. Editing a run
    // must not rewrite the math node's source.
    const inlineFormula='$\\frac{a}{}$';
    const inlineDoc=Buffer.from(`\\documentclass{article}\n\\begin{document}\nAlpha ${inlineFormula} beta.\n\\end{document}\n`);
    await page.locator('input#file').setInputFiles({name:'inline.tex',mimeType:'text/plain',buffer:inlineDoc});
    await page.waitForFunction(()=>document.querySelector('.cm-content')?.textContent.includes('Alpha'));
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
    await page.locator('#native-tex-edit').click();
    const inlineScale=Number(await page.locator('#native-tex-zoom').inputValue())/100*(96/72)/65781.76;
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:6500000*inlineScale,y:7000000*inlineScale}});
    await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
    await page.keyboard.press(mod+'+Shift+j');
    await page.locator('footer.document-status').getByText('Text',{exact:true}).waitFor();
    const inlineObservations=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length);
    const inputAnchor=await page.locator('#native-tex-input').evaluate(input=>{
      const anchor=()=>[input.style.left,input.style.top];
      const before=anchor();
      input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
      input.value='z';
      input.dispatchEvent(new InputEvent('input',{data:'z',inputType:'insertCompositionText',isComposing:true,bubbles:true}));
      input.value='zh';
      input.dispatchEvent(new InputEvent('input',{data:'zh',inputType:'insertCompositionText',isComposing:true,bubbles:true}));
      const after=anchor();
      const visible=getComputedStyle(input).color!=='rgba(0, 0, 0, 0)';
      input.dispatchEvent(new CompositionEvent('compositionend',{data:'',bubbles:true}));
      return {before,after,wrap:input.wrap,scroll:input.scrollLeft,visible,ended:input.dataset.composing===undefined};
    });
    assert.ok(inputAnchor.before.every(value=>value.endsWith('px')));
    assert.deepEqual(inputAnchor.after,inputAnchor.before,'The IME anchor stays at the same prose boundary during preedit after inline math');
    assert.equal(inputAnchor.wrap,'off');
    assert.equal(inputAnchor.scroll,0);
    assert.ok(inputAnchor.visible&&inputAnchor.ended);
    assert.equal(await page.evaluate(()=>nativeProbe.source),inlineDoc.toString());
    await page.keyboard.type('Y');
    await page.waitForFunction(expected=>nativeProbe.source===expected,inlineDoc.toString().replace('beta.','Ybeta.'));
    await page.waitForFunction(count=>nativeProbe.calls.filter(call=>call.command==='native_tex_observe_formula').length>count,inlineObservations);
    await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:7510000*inlineScale,y:9250000*inlineScale}});
    await page.keyboard.press('Shift+ArrowLeft');
    const copied=await page.locator('#native-tex-input').evaluate(input=>{
      const clipboardData=new DataTransfer();
      input.dispatchEvent(new ClipboardEvent('copy',{clipboardData,bubbles:true,cancelable:true}));
      return clipboardData.getData('text/plain');
    });
    assert.equal(copied,` ${inlineFormula} `);
    await page.keyboard.press('Delete');
    const withoutInline=inlineDoc.toString().replace(`Alpha ${inlineFormula} beta.`,'AlphaYbeta.');
    await page.waitForFunction(expected=>nativeProbe.source===expected,withoutInline);
    await page.keyboard.press(mod+'+z');
    await page.waitForFunction(expected=>nativeProbe.source===expected,inlineDoc.toString().replace('beta.','Ybeta.'));
    await page.locator('#native-tex-close').click();
    assert.deepEqual(errors,[]);
    if(process.env.LINEAE_NATIVE_PDF){
      await page.close();
      page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
      await page.addInitScript(installMockNativeTex);
      await page.addInitScript(()=>{
        nativeProbe.failFont=true;
        const invoke=window.__TAURI__.core.invoke;
        window.__TAURI__.core.invoke=async(command,args)=>{
          if(command==='native_tex_render_pdf')return [...new Uint8Array(
            await(await fetch('/native-acceptance.pdf')).arrayBuffer())];
          return invoke(command,args);
        };
      });
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
      await page.locator('input#file').setInputFiles({name:'preview.tex',mimeType:'text/plain',buffer:input});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current'&&
        document.querySelector('#native-tex-preview').dataset.renderer==='pdf');
      assert.ok(await page.locator('[data-pdf-page="1"] canvas').evaluate(canvas=>canvas.width>1));
      const text=await page.evaluate(async()=>{
        const api=await import('/vendor/pdfjs/legacy/build/pdf.mjs');
        api.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/legacy/build/pdf.worker.mjs';
        const task=api.getDocument({data:new Uint8Array(await(await fetch('/native-acceptance.pdf')).arrayBuffer()),
          isEvalSupported:false,useSystemFonts:false});
        const doc=await task.promise,words=[];
        for(let number=1;number<=doc.numPages;number++)
          words.push(...(await(await doc.getPage(number)).getTextContent()).items.map(item=>item.str??''));
        await task.destroy();return words.join(' ');
      });
      assert.match(text,/42/,'Actual LuaLaTeX PDF includes executed Lua output');
      assert.match(text,/TikZ/,'Actual drawing document reached the PDF renderer');
      console.log('PASS real LuaLaTeX-generated PDF rendered with the bundled PDF.js worker');
    }
    if(process.env.LINEAE_NATIVE_PAGE){
      nativeEvidence=JSON.parse(await readFile(process.env.LINEAE_NATIVE_PAGE,'utf8'));
      await page.close();
      page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
      await page.addInitScript(installMockNativeTex);
      await page.route('**/vendor/mathlive/**',route=>route.abort());
      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      assert.equal(await page.locator('.document-sheets').count(),0);
      assert.equal(await page.evaluate(()=>Boolean(customElements.get('math-field'))),false);
      await page.evaluate(evidence=>{
        const p=window.nativeProbe,originalLayout=p.layout;
        p.realEvidence=evidence;
        p.layout=()=>({...originalLayout(),pages_changed:evidence.raw,pages_total:evidence.raw.length});
      },nativeEvidence);
      await page.locator('input#file').setInputFiles({name:'observed.tex',mimeType:'text/plain',buffer:input});
      await page.waitForFunction(()=>document.querySelector('.math-display')?.dataset.latex.includes('\\frac{a}{}'));
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>['current','error'].includes(document.querySelector('#native-tex-preview').dataset.state));
      const nativeState=await page.locator('#native-tex-preview').evaluate(node=>({
        state:node.dataset.state,renderer:node.dataset.renderer,reason:node.dataset.fallbackReason,
      }));
      assert.equal(nativeState.renderer,'canvas',JSON.stringify(nativeState));
      assert.equal(nativeState.state,'current',JSON.stringify(nativeState));
      await page.locator('#native-tex-target').click();
      await page.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const nativePage=nativeEvidence.observed.find(page=>page.dl.math_owners?.fields.some(field=>
        field.owner===nativeEvidence.targetOwner&&field.role==='den'&&field.empty));
      assert.ok(nativePage,'Real observed layout supplies an empty denominator');
      const field=nativePage.dl.math_owners.fields.find(field=>field.owner===nativeEvidence.targetOwner&&field.role==='den');
      const [x,y]=field.bbox,nativeScale=.75*(96/72)/65781.76;
      await page.locator(`[data-native-page="${nativePage.page}"] canvas`).click({position:{x:x*nativeScale,y:y*nativeScale}});
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
      await page.keyboard.type('b');
      await page.waitForFunction(expected=>nativeProbe.source?.replace(/\r\n/g,'\n')===expected,expected.replace(/\r\n/g,'\n'));
      console.log('PASS production Canvas hit using real LuaLaTeX page geometry, recorded fonts and exact source patch');
    }
    if(process.env.LINEAE_NATIVE_TEXT_PAGE){
      const evidence=nativeEvidence=JSON.parse(await readFile(process.env.LINEAE_NATIVE_TEXT_PAGE,'utf8'));
      await page.close();
      page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
      await page.addInitScript(installMockNativeTex);
      await page.route('**/vendor/mathlive/**',route=>route.abort());
      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      assert.equal(await page.locator('.document-sheets').count(),0);
      assert.equal(await page.evaluate(()=>Boolean(customElements.get('math-field'))),false);
      await page.evaluate(evidence=>{
        const p=window.nativeProbe,originalLayout=p.layout;
        p.realEvidence=evidence;
        p.layout=()=>({...originalLayout(),pages_changed:evidence.raw,pages_total:evidence.raw.length});
      },evidence);
      await page.locator('input#file').setInputFiles({name:'prose-evidence.tex',mimeType:'text/plain',
        buffer:Buffer.from(evidence.source)});
      await page.waitForFunction(()=>document.querySelector('.cm-content')?.textContent.includes('Alpha beta.'));
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await page.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const nativePage=evidence.observed.find(page=>page.dl.math_owners?.glyphs?.some(glyph=>glyph.owner===12));
      const glyph=nativePage.dl.math_owners.glyphs.find(glyph=>glyph.owner===12);
      const nativeScale=.75*(96/72)/65781.76;
      await page.locator(`[data-native-page="${nativePage.page}"] canvas`).click({position:{
        x:(glyph.bbox[0]+(glyph.bbox[2]-glyph.bbox[0])*.1)*nativeScale,
        y:((glyph.bbox[1]+glyph.bbox[3])/2)*nativeScale,
      }});
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
      await page.locator('#native-tex-input').evaluate(input=>{
        input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        input.value='j';
        input.dispatchEvent(new InputEvent('input',{data:'j',inputType:'insertCompositionText',isComposing:true,bubbles:true}));
        input.dispatchEvent(new CompositionEvent('compositionend',{data:'键',bubbles:true}));
        input.dispatchEvent(new InputEvent('input',{data:'键',inputType:'insertFromComposition',bubbles:true}));
      });
      await page.waitForFunction(expected=>nativeProbe.source===expected,evidence.source.replace('汉字','键汉字'));
      console.log('PASS real LuaLaTeX CJK glyph hit and exact source patch after composition');
    }
    if(process.env.LINEAE_NATIVE_REPEATED_INPUT_PAGE){
      const evidence=nativeEvidence=JSON.parse(await readFile(process.env.LINEAE_NATIVE_REPEATED_INPUT_PAGE,'utf8'));
      const nativeScale=.75*(96/72)/65781.76;
      for(const kind of ['glyph','denominator']){
        await page.close();
        page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
        await page.addInitScript(installMockNativeTex);
        await page.route('**/vendor/mathlive/**',route=>route.abort());
        await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
        await page.evaluate(recorded=>{
          const p=window.nativeProbe,originalLayout=p.layout;
          p.realEvidence=recorded;
          p.layout=()=>({...originalLayout(),pages_changed:recorded.raw,pages_total:recorded.raw.length});
        },evidence);
        await openMockProject(page,false,evidence.source,evidence.child);
        await page.locator('#native-tex-toggle').click();
        await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
        await page.locator('#native-tex-target').click();
        await page.getByText('Click prose on the native page',{exact:false}).waitFor();
        await page.locator('#native-tex-edit').click();
        const matches=new Map();
        const entries=kind==='glyph'?'glyphs':'fields';
        for(const {page:number,dl} of evidence.observed){
          for(const entry of dl.math_owners?.[entries]??[]){
            if(entry.owner!==evidence[kind]||entries==='fields'&&(!entry.empty||entry.role!=='den'))continue;
            matches.set(JSON.stringify([number,entry.bbox]),{number,bbox:entry.bbox});
          }
        }
        assert.equal(matches.size,2);
        const {number,bbox:[left,top,right,bottom]}=[...matches.values()].at(-1);
        await page.locator(`[data-native-page="${number}"] canvas`).click({position:{
          x:(left+.2*(right-left))*nativeScale,y:((top+bottom)/2)*nativeScale,
        }});
        await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
        await page.keyboard.type(kind==='glyph'?'X':'q');
        const child=kind==='glyph'?evidence.child.replace('Child.','XChild.'):evidence.child.replace('}{','}{q');
        await page.waitForFunction(({source,child})=>{
          const update=nativeProbe.calls.findLast(call=>call.command==='native_tex_update');
          return update?.args.source===source&&update.args.files?.some(file=>file.path==='chapters/one.tex'&&
            new TextDecoder().decode(new Uint8Array(file.bytes))===child);
        },{source:evidence.source,child});
      }
      console.log('PASS native edits at the second real LuaLaTeX expansion update one shared source file');
    }
    if(process.env.LINEAE_NATIVE_REFERENCE_PAGE){
      const evidence=nativeEvidence=JSON.parse(await readFile(process.env.LINEAE_NATIVE_REFERENCE_PAGE,'utf8'));
      await page.close();
      page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
      await page.addInitScript(installMockNativeTex);
      await page.route('**/vendor/mathlive/**',route=>route.abort());
      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      await page.evaluate(evidence=>{
        const p=window.nativeProbe,originalLayout=p.layout;
        p.realEvidence=evidence;
        p.layout=()=>({...originalLayout(),pages_changed:evidence.raw,pages_total:evidence.raw.length});
      },evidence);
      await page.locator('input#file').setInputFiles({name:'reference-evidence.tex',mimeType:'text/plain',buffer:Buffer.from(evidence.source)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
      await page.locator('#native-tex-target').click();
      await page.getByText('Click text on the native page',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const nativePage=evidence.observed.find(page=>page.dl.math_owners?.glyphs?.some(glyph=>glyph.owner===evidence.targetOwner));
      const {bbox}=nativePage.dl.math_owners.glyphs.find(glyph=>glyph.owner===evidence.targetOwner);
      const scale=.75*(96/72)/65781.76;
      await page.locator(`[data-native-page="${nativePage.page}"] canvas`).click({
        position:{x:(bbox[0]+bbox[2])/2*scale,y:(bbox[1]+bbox[3])/2*scale},modifiers:[mod],
      });
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
      await page.keyboard.type('A');
      await page.waitForFunction(expected=>nativeProbe.source===expected,evidence.source.replace('Reference target','AReference target'));
      console.log('PASS cross-reference navigation and precise source edit using real LuaLaTeX glyph bounds');
    }
    if(process.env.LINEAE_NATIVE_DEGRADED_PAGE){
      const evidence=JSON.parse(await readFile(process.env.LINEAE_NATIVE_DEGRADED_PAGE,'utf8'));
      await page.close();
      page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
      await page.addInitScript(installMockNativeTex);
      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-workspace=1',{waitUntil:'networkidle'});
      await page.evaluate(evidence=>{
        const p=window.nativeProbe,base=p.layout;
        p.realEvidence=evidence;p.registeredPdf=true;
        p.layout=()=>({...base(),pages_changed:evidence.raw,pages_total:evidence.raw.length});
        const invoke=window.__TAURI__.core.invoke;
        window.__TAURI__.core.invoke=async(command,args)=>{
          if(command==='native_tex_pdf')return [...new Uint8Array(
            await(await fetch('/native-degraded.pdf')).arrayBuffer())];
          return invoke(command,args);
        };
      },evidence);
      await page.locator('input#file').setInputFiles({name:'degraded.tex',mimeType:'text/plain',
        buffer:Buffer.from(evidence.source)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>{
        const panel=document.querySelector('#native-tex-preview');
        return panel.dataset.state==='current'&&panel.dataset.renderer==='pdf';
      });
      await page.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      const nativePage=evidence.observed.find(page=>page.dl.math_owners?.fields.some(field=>
        field.owner===evidence.targetOwner&&field.role==='den'&&field.empty));
      const target=nativePage.dl.math_owners.fields.find(field=>field.owner===evidence.targetOwner&&field.role==='den');
      const zoom=Number(await page.locator('footer.document-status input[type=range]').inputValue());
      const [x,y]=target.bbox,nativeScale=zoom/100*(96/72)/65781.76;
      const drawingPage=evidence.measuredObserved.find(page=>page.dl.math_owners?.fields.some(field=>
        field.owner===evidence.drawingCorners.top));
      const corners=drawingPage.dl.math_owners.fields;
      const top=corners.find(field=>field.owner===evidence.drawingCorners.top).bbox;
      const bottom=corners.find(field=>field.owner===evidence.drawingCorners.bottom).bbox;
      await page.locator(`[data-pdf-page="${drawingPage.page}"] canvas`).click({position:{
        x:(top[0]+bottom[0])/2*nativeScale,y:(top[1]+bottom[1])/2*nativeScale,
      }});
      const drawingSource=await page.locator('.tikz-studio-code').inputValue();
      assert.match(drawingSource,/^\\resizebox\{\.6\\linewidth\}\{!\}/);
      assert.match(drawingSource,/\\draw \(0,0\) -- \(2,1\)/);
      await page.locator('.tikz-studio-close').click();
      await page.locator(`[data-pdf-page="${nativePage.page}"] canvas`).click({position:{x:x*nativeScale,y:y*nativeScale}});
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
      await page.keyboard.type('b');
      await page.waitForFunction(expected=>nativeProbe.source===expected,evidence.source.replace('\\frac{a}{}','\\frac{a}{b}'));
      console.log('PASS semantic edit on an actual registered LuaLaTeX PDF with TikZ');
    }
    for(const [record,filename,numerator] of [
      [process.env.LINEAE_NATIVE_ALIGNMENT_PAGE,'numbered-alignment.tex','d'],
      [process.env.LINEAE_NATIVE_TYPE_ONE_PAGE,'classic-font.tex','a'],
    ]){
      if(!record)continue;
      nativeEvidence=JSON.parse(await readFile(record,'utf8'));
      await page.close();
      page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
      await page.addInitScript(installMockNativeTex);
      await page.route('**/vendor/mathlive/**',route=>route.abort());
      await page.goto('http://127.0.0.1:'+server.address().port+'/?native-only-acceptance=1',{waitUntil:'networkidle'});
      await page.evaluate(evidence=>{
        const p=window.nativeProbe,originalLayout=p.layout;
        p.realEvidence=evidence;
        p.layout=()=>({...originalLayout(),pages_changed:evidence.raw,pages_total:evidence.raw.length});
      },nativeEvidence);
      await page.locator('input#file').setInputFiles({name:filename,mimeType:'text/plain',
        buffer:Buffer.from(nativeEvidence.source)});
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>{
        const state=document.querySelector('#native-tex-preview').dataset;
        return state.state==='current'&&state.renderer==='canvas';
      });
      await page.locator('#native-tex-target').click();
      await page.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      await page.locator('#native-tex-edit').click();
      const scale=.75*(96/72)/65781.76;
      if(nativeEvidence.labelOwner){
        const labelPage=nativeEvidence.observed.find(page=>page.dl.math_owners?.fields.some(field=>
          field.owner===nativeEvidence.labelOwner&&field.role==='den'&&field.empty));
        assert.ok(labelPage,'Real geometry exposes the labelled numbered row');
        const [labelX,labelY]=labelPage.dl.math_owners.fields.find(field=>
          field.owner===nativeEvidence.labelOwner&&field.role==='den').bbox;
        await page.locator(`[data-native-page="${labelPage.page}"] canvas`).click({position:{x:labelX*scale,y:labelY*scale}});
        await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
        await page.keyboard.press('Backslash');
        await page.getByRole('textbox',{name:'LaTeX command',exact:true}).fill('label');
        await page.keyboard.press('Enter');
        const labelInput=page.locator('.editor-dialog input');
        assert.equal(await labelInput.inputValue(),'eq:alignment');
        await labelInput.fill('eq:updated');
        await labelInput.press('Enter');
        await page.waitForFunction(expected=>nativeProbe.source===expected,nativeEvidence.source.replace('eq:alignment','eq:updated'));
        await page.keyboard.press(mod+'+z');
        await page.waitForFunction(expected=>nativeProbe.source===expected,nativeEvidence.source);
        await page.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      }else assert.equal(await page.evaluate(()=>nativeProbe.calls.some(call=>call.command==='native_tex_type_one_font')),true);
      const nativePage=nativeEvidence.observed.find(page=>page.dl.math_owners?.fields.some(field=>
        field.owner===nativeEvidence.targetOwner&&field.role==='den'&&field.empty));
      const field=nativePage.dl.math_owners.fields.find(field=>field.owner===nativeEvidence.targetOwner&&field.role==='den');
      const [x,y]=field.bbox;
      await page.locator(`[data-native-page="${nativePage.page}"] canvas`).click({position:{x:x*scale,y:y*scale}});
      await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
      await page.keyboard.type('e');
      await page.waitForFunction(expected=>nativeProbe.source===expected,
        nativeEvidence.source.replace(`\\frac{${numerator}}{}`,`\\frac{${numerator}}{e}`));
      console.log(`PASS real LuaLaTeX geometry, original fonts and source writeback for ${filename}`);
    }
    await page.close();
    page=await browser.newPage({locale:'en-US',viewport:{width:1600,height:1100}});
    await page.addInitScript(installMockNativeTex);
    await page.route('**/vendor/mathlive/**',route=>route.abort());
    const base='http://127.0.0.1:'+server.address().port+'/';
    await page.goto(base+'?native-workspace=1',{waitUntil:'networkidle'});
    const outlined='\\documentclass{article}\n\\begin{document}\n\\section{Repeat}\\label{sec:first}\n\n'+
      'First paragraph. See \\ref{sec:first}.\n\n'+
      '\\section{Repeat}\n\nSecond paragraph.\n\\end{document}\n';
    await page.locator('input#file').setInputFiles({name:'outlined.tex',mimeType:'text/plain',buffer:Buffer.from(outlined)});
    await page.locator('#native-tex-toggle').click();
    await page.getByText('Click text on the native page',{exact:false}).waitFor();
    await revealToolbar(page);
    await page.locator('[data-group=reference]').click();
    await page.locator('.floating-toolbar').getByRole('button',{name:'Outline',exact:true}).click();
    await page.locator('#document-outline [data-heading-position]').last().click();
    await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
    await page.keyboard.type('X');
    const outlinedEdit=outlined.replace('Repeat}\n\nSecond','XRepeat}\n\nSecond');
    await page.waitForFunction(expected=>nativeProbe.source===expected,outlinedEdit);
    await page.getByText('Click text on the native page',{exact:false}).waitFor();
    await page.keyboard.press(mod+'+e');await page.keyboard.press('f');
    const search=page.getByRole('searchbox',{name:'Find in document'});
    await search.fill('Repeat');
    await search.press('Enter');
    await page.locator('.document-find output').filter({hasText:'2 / 2'}).waitFor();
    await search.press('Escape');
    await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
    await page.keyboard.insertText('Next');
    const layoutSource=outlinedEdit.replace('XRepeat','XNext');
    await page.waitForFunction(expected=>nativeProbe.source===expected,layoutSource);
    await revealToolbar(page);await page.locator('[data-group=layout]').click();
    const margin=page.getByRole('combobox',{name:'Margin preset'});
    if(!await margin.isVisible())await page.locator('[data-ribbon-group=layout-page-setup] .ribbon-group-toggle').click();
    await margin.selectOption('narrow');
    const narrow=layoutSource.replace('\\begin{document}','\\usepackage[letterpaper,margin=1.27cm]{geometry}\n\\begin{document}');
    await page.waitForFunction(expected=>nativeProbe.source===expected,narrow);
    await page.getByText('Click text on the native page',{exact:false}).waitFor();
    const layoutScale=Number(await page.locator('.document-status input[type=range]').inputValue())/100*(96/72)/65781.76;
    await page.locator('[data-native-page="1"] canvas').click({position:{x:6550000*layoutScale,y:9250000*layoutScale}});
    await page.keyboard.press(mod+'+z');
    await page.waitForFunction(expected=>nativeProbe.source===expected,layoutSource);
    await page.keyboard.press(mod+'+Shift+z');
    await page.waitForFunction(expected=>nativeProbe.source===expected,narrow);
    await page.getByText('Click text on the native page',{exact:false}).waitFor();
    const referencePoint=await page.locator('[data-native-page="1"] canvas').evaluate(canvas=>{
      const call=nativeProbe.calls.findLast(call=>call.command==='native_tex_observe_formula');
      const tags=[...call.args.projection.matchAll(/\\attribute65000=(\d+) (.)/gsu)];
      const index=tags.findIndex(tag=>call.args.projection.startsWith('\\ref{sec:first}',tag.index+tag[0].length-1));
      const {dl}=nativeProbe.layout().pages_changed[0],bounds=canvas.getBoundingClientRect();
      if(index<0)return null;
      return {x:(6600000+index*200000)*bounds.width/dl.page_width,y:9250000*bounds.height/dl.page_height};
    });
    assert.ok(referencePoint,'The current observation tags the reference on the page');
    await page.locator('[data-native-page="1"] canvas').click({position:referencePoint,modifiers:[mod]});
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'native-tex-input',
      'The modifier-click focuses the reference target');
    await page.keyboard.type('Y');
    await page.waitForFunction(expected=>nativeProbe.source===expected,narrow.replace('Repeat}\\label','YRepeat}\\label'));

    await page.goto(base+'?native-workspace=1',{waitUntil:'networkidle'});
    const projectLayout='\\documentclass{article}\n\\begin{document}\nBefore.\n\n'+
      '\\input{chapters/one}\n\nAfter.\n\\end{document}\n';
    const layoutChild='Child keeps its bytes.\n';
    await openMockProject(page,false,projectLayout,layoutChild);
    await page.locator('#native-tex-toggle').click();
    await page.getByText('Click text on the native page',{exact:false}).waitFor();
    await revealToolbar(page);await page.locator('[data-group=layout]').click();
    const columns=page.getByRole('combobox',{name:'Global columns'});
    if(!await columns.isVisible())await page.locator('[data-ribbon-group=layout-page-setup] .ribbon-group-toggle').click();
    await columns.selectOption('2');
    const twoColumns=projectLayout.replace('\\documentclass{article}','\\documentclass[twocolumn]{article}');
    const verifyLayout=expected=>page.waitForFunction(({expected,child})=>{
      if(nativeProbe.source!==expected)return false;
      const layouts=nativeProbe.calls.filter(({command})=>['native_tex_open','native_tex_update'].includes(command));
      const staged=layouts.findLast(call=>call.args.files!==undefined)?.args.files;
      return layouts.at(-1)?.args.source===expected&&staged?.some(file=>file.path==='chapters/one.tex'&&
        new TextDecoder().decode(new Uint8Array(file.bytes))===child);
    },{expected,child:layoutChild});
    await verifyLayout(twoColumns);
    await margin.selectOption('narrow');
    const projectNarrow=twoColumns.replace('\\begin{document}','\\usepackage[letterpaper,margin=1.27cm]{geometry}\n\\begin{document}');
    await verifyLayout(projectNarrow);
    await page.getByText('Click text on the native page',{exact:false}).waitFor();
    const projectScale=Number(await page.locator('.document-status input[type=range]').inputValue())/100*(96/72)/65781.76;
    await page.locator('[data-native-page="1"] canvas').click({position:{x:6550000*projectScale,y:9250000*projectScale}});
    await page.keyboard.press(mod+'+z');
    await verifyLayout(twoColumns);
    assert.notEqual(await margin.inputValue(),'narrow');
    await page.keyboard.press(mod+'+z');
    await verifyLayout(projectLayout);
    assert.equal(await columns.inputValue(),'1');
    await page.keyboard.press(mod+'+Shift+z');
    await verifyLayout(twoColumns);
    assert.equal(await columns.inputValue(),'2');

    const {readPageFurniture,writePageFurniture}=await import('../apps/web/latex/page-furniture.mjs');
    const {parseDocument}=await import('../apps/web/latex/document.mjs');
    const {start:basePreamble}=parseDocument(twoColumns),body=twoColumns.slice(basePreamble.length);
    const furniture=readPageFurniture(basePreamble);
    furniture.enabled=true;
    const enabledPreamble=writePageFurniture(basePreamble,furniture);
    await revealToolbar(page);await page.locator('[data-group=headerFooter]').click();
    await page.getByRole('switch',{name:'Enable header/footer'}).click();
    await verifyLayout(enabledPreamble+body);
    const header=page.locator('.hf-cell input[data-region=header][data-slot=left][data-parity=odd]');
    await header.fill('Native Header');
    furniture.header.left.odd=furniture.header.left.even='Native Header';
    await verifyLayout(writePageFurniture(enabledPreamble,furniture)+body);
    await page.locator('[data-group=home]').click();
    await page.getByText('Click text on the native page',{exact:false}).waitFor();
    await page.locator('[data-native-page="1"] canvas').click({position:{x:6550000*projectScale,y:9250000*projectScale}});
    await page.keyboard.press(mod+'+z');
    await verifyLayout(enabledPreamble+body);
    await page.keyboard.press(mod+'+z');
    await verifyLayout(twoColumns);

    await page.goto(base+'?native-only-acceptance=1',{waitUntil:'networkidle'});
    const duplicateImages='\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n'+
      '\\includegraphics[width=18pt]{plot.png}\n\n\\includegraphics[width=25pt]{plot.png}\n\\end{document}\n';
    await openMockProject(page,true,duplicateImages,'');
    await page.evaluate(()=>{nativeProbe.duplicateRaster=true;});
    await page.locator('#native-tex-toggle').click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await page.getByText('Click a verified drawing to edit it.',{exact:true}).waitFor();
    const imageScale=.75*(96/72)/65781.76;
    await page.locator('[data-native-page="1"] canvas').click({position:{x:3500000*imageScale,y:7000000*imageScale}});
    await revealToolbar(page);
    const imageRibbon=page.locator('.image-tools');
    await imageRibbon.waitFor();
    const imageWidth=page.getByRole('spinbutton',{name:'Width',exact:true});
    if(!await imageWidth.isVisible())await imageRibbon.locator('[data-ribbon-group=image-transform] .ribbon-group-toggle').click();
    assert.equal(await imageWidth.inputValue(),'25');
    await imageWidth.fill('28');
    await page.waitForFunction(expected=>nativeProbe.source===expected,duplicateImages.replace('25pt','28pt'));
    console.log('PASS native preview transport/UI: explicit startup, Canvas resources, retained editor/history, sync, export revision and cancellation (not engine evidence)');
  }catch(error){
    let diagnostic='page unavailable';
    try{if(page)diagnostic=await page.evaluate(()=>({
      state:document.querySelector('#native-tex-preview')?.dataset.state,
      fallback:document.querySelector('#native-tex-preview')?.dataset.fallbackReason,
      status:document.querySelector('#native-tex-preview [role=status]')?.textContent,
      targetStatus:document.querySelectorAll('#native-tex-preview [role=status]')[1]?.textContent,
      editorStatus:document.querySelector('#status')?.textContent,
      sourceStatus:document.querySelector('.tex-message')?.textContent,
      docTitle:document.querySelector('.doc-title')?.textContent,
      source:window.nativeProbe?.source?.slice(0,1600),
      value:document.querySelector('math-field')?.value,
      focus:document.activeElement?.tagName,
      cursor:document.activeElement?._mathfield?.model.at(document.activeElement.position)?.parentBranch,
      calls:window.nativeProbe?.calls.slice(-6).map(call=>({command:call.command,key:call.args?.key})),
    }));}catch{/* the page may have navigated or closed */}
    console.error('Native preview UI diagnostic:',diagnostic);
    console.error('Page errors:',errors);
    throw error;
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
