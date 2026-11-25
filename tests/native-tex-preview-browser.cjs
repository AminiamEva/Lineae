const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const installMockNativeTex=require('./native-math/mock-bridge.cjs');
const {revealToolbar}=require('./workspace-ui-helpers.cjs');

const root=resolve('apps/web');
let nativeEvidence;
const server=createServer(async(req,res)=>{
  if(req.url==='/native-acceptance.pdf'&&process.env.LINEAE_NATIVE_PDF){
    try {res.setHeader('Content-Type','application/pdf');res.end(await readFile(process.env.LINEAE_NATIVE_PDF));}
    catch{res.writeHead(404).end();}
    return;
  }
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/native-formula-font'&&nativeEvidence){
    const key=url.searchParams.get('key');
    const font=nativeEvidence.raw.flatMap(page=>Object.values(page.dl.fonts)).find(desc=>
      key===`file:${desc.filename}#${desc.subfont??0}`&&
      /^(?:lmroman10-regular|latinmodern-math)\.otf$/i.test((desc.filename??'').split(/[\\/]/).at(-1)));
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
    await page.evaluate(async()=>{
      const root=await navigator.storage.getDirectory();
      window.luaProjectDirectory=await root.getDirectoryHandle('lua-'+crypto.randomUUID(),{create:true});
      const put=async(dir,name,bytes)=>{
        const file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable();
        await writer.write(bytes);await writer.close();
      };
      await put(luaProjectDirectory,'main.tex','\\documentclass{article}\n\\begin{document}\n\\[\\frac{a}{}\\]\n\\input{chapters/one}\n\\end{document}\n');
      const chapter=await luaProjectDirectory.getDirectoryHandle('chapters',{create:true});
      await put(chapter,'one.tex','Original chapter.\n\\[\\frac{z}{}\\]\n');
      await put(luaProjectDirectory,'image.png',new Uint8Array([0,255,13,10]));
      window.showDirectoryPicker=async()=>luaProjectDirectory;
    });
    page.on('dialog',dialog=>dialog.accept());
    await revealToolbar(page);await page.locator('[data-group=files]').click();
    await page.locator('#project-open').click();
    await page.locator('.project-file[aria-current=true]').waitFor({state:'attached'});
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    const projectOpen=await page.evaluate(()=>nativeProbe.calls.filter(call=>call.command==='native_tex_open').at(-1).args);
    assert.equal(projectOpen.mainFile,'main.tex');
    assert.match(projectOpen.source,/\\input\{chapters\/one\}/,'Compile the actual main source rather than a flattened editor projection');
    assert.ok(projectOpen.files.some(file=>file.path==='chapters/one.tex'));
    assert.deepEqual(projectOpen.files.find(file=>file.path==='image.png').bytes,[0,255,13,10]);
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
    const inlineDoc=Buffer.from('\\documentclass{article}\n\\begin{document}\nAlpha $x$ beta.\n\\end{document}\n');
    await page.locator('input#file').setInputFiles({name:'inline.tex',mimeType:'text/plain',buffer:inlineDoc});
    await page.waitForFunction(()=>document.querySelector('.cm-content')?.textContent.includes('Alpha'));
    await button.click();
    await page.waitForFunction(()=>document.querySelector('#native-tex-preview').dataset.state==='current');
    await page.locator('#native-tex-target').click();
    await panel.getByText('Click prose on the native page',{exact:false}).waitFor();
    await page.locator('#native-tex-edit').click();
    const inlineScale=Number(await page.locator('#native-tex-zoom').inputValue())/100*(96/72)/65781.76;
    await panel.locator('[data-native-page="1"] canvas').click({position:{x:7510000*inlineScale,y:9250000*inlineScale}});
    await page.waitForFunction(()=>document.activeElement?.id==='native-tex-input');
    await page.keyboard.type('Y');
    await page.waitForFunction(()=>nativeProbe.source?.includes('Alpha $x$ Ybeta.'),
      'A prose run beside inline math edits only its own source bytes');
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
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
      await page.evaluate(evidence=>{
        const p=window.nativeProbe,originalLayout=p.layout;
        p.realEvidence=evidence;
        p.layout=()=>({...originalLayout(),pages_changed:evidence.raw,pages_total:evidence.raw.length});
      },nativeEvidence);
      await page.locator('input#file').setInputFiles({name:'observed.tex',mimeType:'text/plain',buffer:input});
      await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\frac{a}{}'));
      await page.locator('#native-tex-toggle').click();
      await page.waitForFunction(()=>['current','error'].includes(document.querySelector('#native-tex-preview').dataset.state));
      const nativeState=await page.locator('#native-tex-preview').evaluate(node=>({
        state:node.dataset.state,renderer:node.dataset.renderer,reason:node.dataset.fallbackReason,
      }));
      assert.equal(nativeState.renderer,'canvas',JSON.stringify(nativeState));
      assert.equal(nativeState.state,'current',JSON.stringify(nativeState));
      await page.locator('#native-tex-target').click();
      await page.getByText('Click the empty numerator or denominator',{exact:false}).waitFor();
      const nativePage=nativeEvidence.observed.find(page=>page.dl.math_owners?.fields.some(field=>
        field.owner===nativeEvidence.targetOwner&&field.role==='den'&&field.empty));
      assert.ok(nativePage,'Real observed layout supplies an empty denominator');
      const field=nativePage.dl.math_owners.fields.find(field=>field.owner===nativeEvidence.targetOwner&&field.role==='den');
      const [x,y]=field.bbox,nativeScale=.75*(96/72)/65781.76;
      await page.locator(`[data-native-page="${nativePage.page}"] canvas`).click({position:{x:x*nativeScale,y:y*nativeScale}});
      await page.waitForFunction(()=>{
        const field=document.activeElement,math=field?._mathfield;
        return field?.tagName==='MATH-FIELD'&&!math?.focusBlurInProgress&&math?.model.at(field.position)?.parentBranch==='below';
      });
      await page.keyboard.type('b');
      await page.waitForFunction(expected=>nativeProbe.source?.replace(/\r\n/g,'\n')===expected,expected.replace(/\r\n/g,'\n'));
      console.log('PASS production Canvas hit using real LuaLaTeX page geometry, recorded fonts and exact source patch');
    }
    console.log('PASS native preview transport/UI: explicit startup, Canvas resources, retained editor/history, sync, export revision and cancellation (not engine evidence)');
  }catch(error){
    let diagnostic='page unavailable';
    try{if(page)diagnostic=await page.evaluate(()=>({
      state:document.querySelector('#native-tex-preview')?.dataset.state,
      fallback:document.querySelector('#native-tex-preview')?.dataset.fallbackReason,
      status:document.querySelector('#native-tex-preview [role=status]')?.textContent,
      targetStatus:document.querySelectorAll('#native-tex-preview [role=status]')[1]?.textContent,
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
