const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const assert = require('node:assert/strict');
const root=resolve('apps/web');
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{
    const data=await readFile(path);
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]??'application/octet-stream');
    res.end(data);
  }catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1400}});
    const errors=[];
    page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.message);});
    await page.goto('http://127.0.0.1:'+server.address().port);
    const paper=page.locator('.ProseMirror');
    await paper.click();
    await page.keyboard.type('Hello');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    assert.equal(await paper.locator(':scope > p').count(),2);
    await page.keyboard.type('$');
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    assert.equal(await page.locator('math-field').evaluate(field=>field.value),'');
    await page.keyboard.type('q');
    assert.match(await page.locator('math-field').evaluate(field=>field.value),/q/);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('$$');
    await page.waitForFunction(()=>Boolean(document.querySelector('.math-display')));
    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('.math-display').count(),0);
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:'itemize',exact:true}).click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Tab');
    assert.equal(await paper.locator('ul ul').count(),1);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await paper.locator('ul ul').count(),0);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'▦',exact:true}).click();
    await page.keyboard.type('A');
    await page.keyboard.press('Tab');
    await page.keyboard.type('B');
    const cells=await paper.locator('td').allTextContents();
    assert.ok(cells[0].includes('A') && cells[1].includes('B'),JSON.stringify(cells));
    await page.locator('[data-group=home]').click();
    await page.getByRole('button',{name:'↶',exact:true}).click();
    assert.ok(!(await paper.locator('td').allTextContents())[1].includes('B'));
    await page.getByRole('button',{name:'↷',exact:true}).click();
    assert.ok((await paper.locator('td').allTextContents())[1].includes('B'));
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:'LaTeX',exact:true}).click();
    const source=await page.locator('.source-view').inputValue();
    assert.match(source,/\\begin\{tabular\}/);
    await page.getByRole('button',{name:'LaTeX',exact:true}).click();
    assert.ok(await paper.locator('table').count());
    await paper.locator('p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const caretBounds=await page.evaluate(()=>{
      const selection=window.getSelection();
      const element=selection.focusNode.nodeType===1?selection.focusNode:selection.focusNode.parentElement;
      const bounds=element.getBoundingClientRect();
      return {x:bounds.x,y:bounds.y};
    });
    await page.keyboard.type('\\');
    await page.waitForFunction(()=>!document.querySelector('.command-menu').hidden);
    const completion=page.locator('.command-menu');
    const initialBounds=await completion.boundingBox();
    const initialScroll=await page.evaluate(()=>window.scrollY);
    assert.ok(initialBounds.y>=caretBounds.y && initialBounds.x<caretBounds.x+80,
      'Completion appears below the text entry position: '+JSON.stringify({initialBounds,caretBounds}));
    for(let index=0;index<16;index++) await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>window.scrollY),initialScroll);
    await page.locator('.command-menu input').fill('sqrt');
    assert.deepEqual(await completion.boundingBox(),initialBounds,'Filtering must not move or resize completion');
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    assert.match(await page.locator('math-field').last().evaluate(field=>field.value),/sqrt/);
    await page.keyboard.type('\\');
    await page.waitForFunction(()=>!document.querySelector('.command-menu').hidden);
    const mathBounds=await completion.boundingBox();
    await completion.locator('input').fill('alpha');
    assert.deepEqual(await completion.boundingBox(),mathBounds);
    await page.keyboard.press('Enter');
    assert.match(await page.locator('math-field').last().evaluate(field=>field.value),/alpha/);
    const importSource = async body => {
      await page.locator('input[type=file]').setInputFiles({
        name:'regression.tex',mimeType:'text/plain',
        buffer:Buffer.from('\\documentclass{article}\n\\begin{document}\n\n'+body+'\n\n\\end{document}\n'),
      });
    };
    await importSource('\\section{First}\n\n\\subsection{Child}\n\n\\subsubsection{Detail}\n\n\\section*{Unnumbered}\n\n\\section{Second}');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror h1').length===3);
    assert.deepEqual(await paper.locator('[data-section-number]').evaluateAll(nodes=>nodes.map(node=>node.dataset.sectionNumber)),['1','1.1','1.1.1','2']);
    assert.equal(await paper.locator('h1').nth(1).getAttribute('data-section-number'),null);

    await importSource('Before\n\n\\[x\\]\n\nAfter');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror > .math-display'));
    await paper.locator(':scope > p').last().click();
    await page.keyboard.press('End');
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:'itemize',exact:true}).click();
    assert.deepEqual(await paper.locator(':scope > *').evaluateAll(nodes=>nodes.map(node=>node.tagName)),['P','DIV','UL']);
    assert.equal(await paper.locator('ul').textContent(),'After');
    const toggles=await page.locator('math-field').evaluate(field=>
      [...field.shadowRoot.querySelectorAll('[part="menu-toggle"],[part="virtual-keyboard-toggle"]')]
        .map(toggle=>getComputedStyle(toggle).display));
    assert.ok(toggles.length>=2 && toggles.every(value=>value==='none'));
    assert.equal(await page.locator('.math-drag-handle').getAttribute('draggable'),'true');

    await importSource('\\begin{tabular}{ll}\n & \\\\\n & \\\\\n\\end{tabular}');
    await page.waitForFunction(()=>Boolean(document.querySelector('.ProseMirror table')));
    const box=await paper.locator('table').boundingBox();
    await page.mouse.dblclick(box.x+10,box.y+box.height+36);
    await page.keyboard.type('Below table');
    assert.equal(await paper.locator(':scope > p').last().textContent(),'Below table');
    assert.ok(!(await paper.locator('table').textContent()).includes('Below table'));
    await paper.locator(':scope > p').last().click({button:'right'});
    const context=page.locator('.editor-context-menu');
    assert.equal(await context.isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await context.isVisible(),false);
    await paper.locator('td').first().click({button:'right'});
    assert.equal(await context.locator('[data-command="delete-table"]').isVisible(),true);
    await page.keyboard.press('Escape');
    const beforeZoom=Number(await page.locator('input[type=range]').inputValue());
    await paper.evaluate(element=>element.dispatchEvent(new WheelEvent('wheel',{deltaY:-80,ctrlKey:true,bubbles:true,cancelable:true})));
    const afterZoom=Number(await page.locator('input[type=range]').inputValue());
    assert.ok(afterZoom-beforeZoom>=8 && afterZoom-beforeZoom<=12);
    await page.keyboard.press('Control+0');
    assert.equal(await page.locator('input[type=range]').inputValue(),'100');
    await page.keyboard.press('Control+-');
    assert.equal(await page.locator('input[type=range]').inputValue(),'90');
    await page.keyboard.press('Control+=');
    assert.equal(await page.locator('input[type=range]').inputValue(),'100');

    await importSource('Start $x$ end\n\nDestination');
    const formula=page.locator('math-field');
    await formula.click();
    await formula.evaluate(field=>{field.focus();field.executeCommand('moveToMathfieldEnd');});
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    await page.keyboard.type('sin');
    assert.equal(await formula.evaluate(field=>field.value),'xsin');
    await page.keyboard.type('__');
    assert.match(await formula.evaluate(field=>field.value),/\\_/);
    await page.keyboard.type('a_2');
    assert.match(await formula.evaluate(field=>field.value),/a_\{?2/);
    await formula.evaluate(field=>field.executeCommand('moveToMathfieldEnd'));
    await page.keyboard.type('\\');
    await completion.locator('input').fill('in');
    await page.keyboard.press('Enter');
    assert.match(await formula.evaluate(field=>field.value),/\\in(?!fty|t)/);
    await formula.click({button:'right'});
    await context.locator('[data-command="display-style"]').click();
    assert.match(await formula.evaluate(field=>field.value),/^\\displaystyle/);
    assert.match(await page.locator('.environment-tag').textContent(),/Inline math/);

    await formula.evaluate(field=>{field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();});
    await formula.click();
    await page.keyboard.type('\\');await completion.locator('input').fill('matrix');await page.keyboard.press('Enter');
    assert.ok(!(await formula.evaluate(field=>field.value)).includes('&'));
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:'＋ Row',exact:true}).click();
    assert.match(await formula.evaluate(field=>field.value),/\\\\/);
    await page.getByRole('button',{name:'＋ Column',exact:true}).click();
    assert.match(await formula.evaluate(field=>field.value),/&/);
    const placeholderBoxes=await formula.evaluate(field=>[...field.shadowRoot.querySelectorAll('.ML__cmr')].map(element=>{
      const rect=element.getBoundingClientRect();
      return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    }));
    assert.ok(placeholderBoxes.length>=2,'Matrix exposes placeholder boxes: '+placeholderBoxes.length);
    const caretRanges=[];
    for(const box of placeholderBoxes.slice(0,2)) {
      await page.mouse.click(box.x,box.y);
      caretRanges.push(await formula.evaluate(field=>field.selection.ranges));
    }
    assert.notDeepEqual(caretRanges[0],caretRanges[1],'Each placeholder box receives its own caret: '+JSON.stringify(caretRanges));
    await page.keyboard.type('Q');
    const matrixValue=await formula.evaluate(field=>field.value);
    assert.match(matrixValue,/Q/);
    assert.equal(matrixValue.match(/\\placeholder\{\}/g)?.length??0,1,'Typing replaces the clicked placeholder: '+matrixValue);

    await importSource('First $x$ end\n\nDestination');
    await page.locator('.math-drag-handle').hover();
    await page.locator('.math-drag-handle').dragTo(paper.locator(':scope > p').last(),{targetPosition:{x:40,y:10}});
    assert.equal(await formula.count(),1,'Drag moves rather than duplicates formula');
    assert.equal(await paper.locator(':scope > p').last().locator('math-field').count(),1,'Formula lands in target paragraph');
    await page.keyboard.press('Control+z');
    assert.equal(await paper.locator(':scope > p').first().locator('math-field').count(),1,'Undo restores dragged formula');
    await page.keyboard.press('Control+y');
    assert.equal(await paper.locator(':scope > p').last().locator('math-field').count(),1,'Redo moves formula again');
    await formula.click();
    await formula.evaluate(field=>field.executeCommand('moveToMathfieldEnd'));
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    await page.keyboard.type('^^//');
    const literals=await formula.evaluate(field=>field.value);
    assert.ok(literals.includes('textasciicircum') && literals.includes('/') && !literals.includes('frac'),literals);
    await page.locator('[data-group=home]').click();
    await paper.locator(':scope > p').first().click();
    await page.locator('select[aria-label="fontSize"]').selectOption('18pt');
    assert.equal(await page.locator('select[aria-label="fontSize"]').inputValue(),'18pt');

    const fixtures={
      'text/text-paragraphs.tex':'Same paragraph, new line.',
      'text/text-escaped.tex':'Backslash: \\',
      'text/text-emphasis.tex':'emphasized',
      'text/text-comments.tex':'Visiblejoined.',
      'text/text-unicode.tex':'中文段落：数学论文。',
      'headings/headings-levels.tex':'Detail',
      'headings/headings-starred.tex':'Aside',
      'headings/headings-short-title.tex':'A longer section title',
      'headings/headings-label-ref.tex':'See Section',
      'headings/headings-toc.tex':'More text.',
    };
    for(const [file,expected] of Object.entries(fixtures)) {
      await page.locator('input[type=file]').setInputFiles({
        name:'fixture.tex',mimeType:'text/plain',buffer:await readFile('tests/fixtures/tex-compat/'+file),
      });
      await page.waitForFunction(text=>document.querySelector('.ProseMirror').textContent.includes(text),expected);
      assert.equal(await paper.locator('pre[data-raw]').count(),0,file+' should not fall back to raw');
    }
    await page.locator('input[type=file]').setInputFiles({
      name:'fixture.tex',mimeType:'text/plain',buffer:await readFile('tests/fixtures/tex-compat/headings/headings-levels.tex'),
    });
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3').length===3);
    await page.locator('input[type=file]').setInputFiles({
      name:'fixture.tex',mimeType:'text/plain',buffer:await readFile('tests/fixtures/tex-compat/headings/headings-starred.tex'),
    });
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror h1[data-numbered="false"]').length===1);
    await page.locator('input[type=file]').setInputFiles({
      name:'fixture.tex',mimeType:'text/plain',buffer:await readFile('tests/fixtures/tex-compat/headings/headings-short-title.tex'),
    });
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror h1[data-short-title="Short"]').length===1);
    assert.ok(await paper.locator('.toc-block').count(),'contents block is editable');
    await page.locator('input[type=file]').setInputFiles({
      name:'fixture.tex',mimeType:'text/plain',buffer:await readFile('tests/fixtures/tex-compat/headings/headings-label-ref.tex'),
    });
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror h1[data-label="sec:target"]').length===1);
    assert.equal(await paper.locator('.ref-node').count(),1,'reference is an editable atom');
    assert.equal(await paper.locator('.ref-node').textContent(),'§1');

    assert.deepEqual(errors,[]);
    console.log('Browser regressions passed');
  }finally{
    await browser.close();
    await new Promise(done=>server.close(done));
  }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
