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
    const browserContext=await browser.newContext({viewport:{width:1280,height:1400},permissions:['clipboard-read','clipboard-write']});
    const page=await browserContext.newPage();
    const errors=[];
    page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.message);});
    await page.goto('http://127.0.0.1:'+server.address().port);
    const paper=page.locator('.ProseMirror');
    await paper.click();
    assert.equal(await paper.evaluate(element=>getComputedStyle(element).animationName),'none',
      'The editor leaves caret blinking to the browser and system');
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
    await page.waitForFunction(()=>{
      const fields=document.querySelectorAll('math-field');
      return fields[fields.length-1]?.value.includes('sqrt');
    });
    assert.match(await page.locator('math-field').last().evaluate(field=>field.value),/sqrt/);
    await page.locator('math-field').last().focus();
    await page.keyboard.type('\\');
    await page.waitForFunction(()=>!document.querySelector('.command-menu').hidden);
    const mathBounds=await completion.boundingBox();
    await completion.locator('input').fill('alpha');
    assert.deepEqual(await completion.boundingBox(),mathBounds);
    await completion.locator('input').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>{
      const fields=document.querySelectorAll('math-field');
      return fields[fields.length-1]?.value.includes('alpha');
    });
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
    const pageGeometry=()=>page.locator('.document-page').evaluate(sheet=>({
      width:sheet.getBoundingClientRect().width,
      height:sheet.getBoundingClientRect().height,
      bodyWidth:sheet.querySelector('#editor').getBoundingClientRect().width,
      titleWidth:sheet.querySelector('#document-meta').getBoundingClientRect().width,
    }));
    const zoomedGeometry=await pageGeometry();
    await page.keyboard.press('Control+0');
    assert.equal(Number(await page.locator('input[type=range]').inputValue()),afterZoom,'Ctrl+0 does not control document zoom');
    await page.locator('input[type=range]').fill('100');
    const naturalGeometry=await pageGeometry();
    for(const dimension of Object.keys(naturalGeometry)) {
      assert.ok(Math.abs(zoomedGeometry[dimension]/naturalGeometry[dimension]-afterZoom/100)<0.01,dimension+' must scale with the paper');
    }
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
    await formula.focus();
    await page.keyboard.type('\\');
    await completion.locator('input').fill('in');
    await completion.locator('input').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\in'));
    assert.match(await formula.evaluate(field=>field.value),/\\in(?!fty|t)/);
    await formula.click({button:'right'});
    await context.locator('[data-command="display-style"]').click();
    assert.match(await formula.evaluate(field=>field.value),/^\\displaystyle/);
    assert.match(await page.locator('.environment-tag').textContent(),/Inline math/);

    await formula.evaluate(field=>{field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();});
    await formula.click();
    await page.keyboard.type('\\');await completion.locator('input').fill('matrix');await completion.locator('input').focus();await page.keyboard.press('Enter');
    assert.ok(!(await formula.evaluate(field=>field.value)).includes('&'));
    const initialPlaceholders=(await formula.evaluate(field=>field.value)).match(/\\placeholder\{\}/g)?.length??0;
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:'＋ Row',exact:true}).click();
    assert.match(await formula.evaluate(field=>field.value),/\\\\/);
    const rowPlaceholders=(await formula.evaluate(field=>field.value)).match(/\\placeholder\{\}/g)?.length??0;
    assert.ok(rowPlaceholders>initialPlaceholders,'Adding a row adds placeholder boxes: '+rowPlaceholders);
    await page.getByRole('button',{name:'＋ Column',exact:true}).click();
    assert.match(await formula.evaluate(field=>field.value),/&/);
    const columnPlaceholders=(await formula.evaluate(field=>field.value)).match(/\\placeholder\{\}/g)?.length??0;
    assert.ok(columnPlaceholders>rowPlaceholders,'Adding a column adds placeholder boxes: '+columnPlaceholders);
    await page.waitForFunction(expected=>document.querySelector('math-field')?.shadowRoot.querySelectorAll('.ML__cmr').length===expected,columnPlaceholders);
    const placeholderBoxes=await formula.evaluate(field=>[...field.shadowRoot.querySelectorAll('.ML__cmr')].map(element=>{
      const rect=element.getBoundingClientRect();
      return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    }));
    assert.ok(placeholderBoxes.length>=2,'Matrix exposes placeholder boxes: '+placeholderBoxes.length);
    assert.equal(placeholderBoxes.length,columnPlaceholders,'Every matrix placeholder has a visible box');
    const caretRanges=[];
    for(const box of placeholderBoxes.slice(0,2)) {
      await page.mouse.click(box.x,box.y);
      caretRanges.push(await formula.evaluate(field=>field.selection.ranges));
    }
    assert.notDeepEqual(caretRanges[0],caretRanges[1],'Each placeholder box receives its own caret: '+JSON.stringify(caretRanges));
    await page.keyboard.type('Q');
    const matrixValue=await formula.evaluate(field=>field.value);
    assert.match(matrixValue,/Q/);
    assert.equal(matrixValue.match(/\\placeholder\{\}/g)?.length??0,columnPlaceholders-1,'Typing replaces the clicked placeholder: '+matrixValue);
    const beforeRowChord=matrixValue;
    await formula.click();
    await page.keyboard.press('Control+e');
    await page.keyboard.press('r');
    const afterRowChord=await formula.evaluate(field=>field.value);
    assert.ok(afterRowChord.split(/\\\\/).length>beforeRowChord.split(/\\\\/).length,'Ctrl+E R adds a matrix row');
    await page.keyboard.press('Control+e');
    await page.keyboard.press('c');
    const afterColumnChord=await formula.evaluate(field=>field.value);
    assert.ok((afterColumnChord.match(/&/g)??[]).length>(afterRowChord.match(/&/g)??[]).length,'Ctrl+E C adds a matrix column');

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
    await paper.locator(':scope > p').first().click({clickCount:3,position:{x:4,y:8}});
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
    assert.equal(await paper.locator('.ref-node').textContent(),'1');
    await page.locator('input[type=file]').setInputFiles({
      name:'align.tex',mimeType:'text/plain',
      buffer:Buffer.from('\\documentclass{article}\n\\begin{document}\n\\begin{align}\n\\mathbf{x} &= 1 \\\\\n\\end{align}\n\\end{document}\n'),
    });
    await page.waitForFunction(()=>Boolean(document.querySelector('.ProseMirror .math-display')));
    assert.equal(await paper.locator('pre[data-raw]').count(),0,'align environment should parse');
    const alignField=page.locator('.ProseMirror math-field').last();
    assert.match(await alignField.evaluate(field=>field.value),/\\begin\{align\}/);
    assert.match(await alignField.evaluate(field=>field.value),/\\mathbf\{x\}/);

    const moreFixtures={
      'lists/lists-itemize.tex':'Plum',
      'lists/lists-enumerate.tex':'Gamma',
      'lists/lists-nested.tex':'Inner B',
      'lists/lists-description.tex':'Outputs.',
      'lists/lists-paragraphs.tex':'Second paragraph in the same item.',
      'tables/tables-basic.tex':'3',
      'tables/tables-alignment.tex':'Longer left',
      'tables/tables-multicolumn.tex':'Combined',
      'tables/tables-booktabs.tex':'Value',
      'tables/tables-paragraph-cell.tex':'Short text.',
    };
    for(const [file,expected] of Object.entries(moreFixtures)) {
      await page.locator('input[type=file]').setInputFiles({
        name:'fixture.tex',mimeType:'text/plain',buffer:await readFile('tests/fixtures/tex-compat/'+file),
      });
      await page.waitForFunction(text=>document.querySelector('.ProseMirror').textContent.includes(text),expected);
      assert.equal(await paper.locator('pre[data-raw]').count(),0,file+' should not fall back to raw');
    }
    const loadFixture=async file=>page.locator('input[type=file]').setInputFiles({
      name:'fixture.tex',mimeType:'text/plain',buffer:await readFile('tests/fixtures/tex-compat/'+file),
    });
    await loadFixture('lists/lists-nested.tex');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror ol ul').length===1);
    await loadFixture('lists/lists-description.tex');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror dd[data-term="Domain"]').length===1);
    await loadFixture('tables/tables-multicolumn.tex');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror td[colspan="2"]').length===1);
    await loadFixture('tables/tables-booktabs.tex');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror table[data-booktabs="true"]').length===1);
    await loadFixture('tables/tables-paragraph-cell.tex');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror table')?.getAttribute('data-columns')==='p{3cm}l');
    await loadFixture('lists/lists-paragraphs.tex');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror li p').length===2);

    await loadFixture('lists/lists-enumerate.tex');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror ol li').length===3);
    await page.locator('.ProseMirror ol li').first().click();
    await page.locator('[data-group=format]').click();
    await page.getByRole('button',{name:'a.',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.ProseMirror ol')?.getAttribute('data-label-style')==='lower-alpha');
    await page.getByRole('button',{name:'甲',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.ProseMirror ol')?.getAttribute('data-label-style')==='cjk-heavenly-stem');

    await loadFixture('lists/lists-itemize.tex');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror ul li').length===3);
    await page.locator('.ProseMirror ul li').first().click();
    await page.locator('[data-group=format]').click();
    await page.getByRole('button',{name:'•',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.editor-dialog')));
    await page.locator('.editor-dialog input').fill('◦');
    await page.locator('.editor-dialog button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.ProseMirror ul')?.getAttribute('data-marker')==='◦');

    await page.evaluate(()=>{
      window.__savedText='';
      window.showSaveFilePicker=async()=>({
        name:'lineae.tex',
        createWritable:async()=>({write:async text=>{window.__savedText=text;},close:async()=>{}}),
      });
    });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>window.__savedText.includes('\\documentclass'));
    assert.match(await page.evaluate(()=>window.__savedText),/\\documentclass/,'Ctrl+S saves to the local file');

    await importSource('\\begin{tabular}{ll}\nA & B \\\\\nC & D \\\\\n\\end{tabular}');
    await page.waitForFunction(()=>Boolean(document.querySelector('.ProseMirror table')));
    const cell=page.locator('.ProseMirror td').first();
    const cellBox=await cell.boundingBox();
    await page.mouse.move(cellBox.x+cellBox.width/2,cellBox.y+cellBox.height-2);
    await page.waitForFunction(()=>{const button=document.querySelector('.table-insert-row');return button&&!button.hidden;});
    const rowsBefore=await page.locator('.ProseMirror table tr').count();
    await page.locator('.table-insert-row').click();
    assert.equal(await page.locator('.ProseMirror table tr').count(),rowsBefore+1,'Hover button inserts a table row');

    const columnCell=page.locator('.ProseMirror td').first();
    const columnBox=await columnCell.boundingBox();
    await page.mouse.move(columnBox.x+columnBox.width-2,columnBox.y+columnBox.height/2);
    await page.waitForFunction(()=>{const button=document.querySelector('.table-insert-column');return button&&!button.hidden;});
    const columnsBefore=await page.locator('.ProseMirror table tr').first().locator('td,th').count();
    await page.locator('.table-insert-column').click();
    await page.waitForFunction(count=>document.querySelectorAll('.ProseMirror table tr:first-child td,.ProseMirror table tr:first-child th').length>count,columnsBefore);

    await importSource('Before $x$ after');
    await page.waitForFunction(()=>Boolean(document.querySelector('.ProseMirror math-field')));
    await paper.locator('p').first().click({position:{x:2,y:8}});
    await page.keyboard.down('Shift');
    for(let index=0;index<12;index++)await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror .math-selected').length>0);

    await importSource('Paragraph');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror p').length===1);
    await paper.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('$');
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    await page.keyboard.type('\\');
    await page.waitForFunction(()=>!document.querySelector('.command-menu').hidden);
    await page.locator('.command-menu input').fill('matrix');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const matrixField=page.locator('.ProseMirror math-field').last();
    await matrixField.click({button:'right'});
    await context.locator('[data-command="matrix-bmatrix"]').click();
    assert.match(await matrixField.evaluate(field=>field.value),/\\begin\{bmatrix\}/,'Matrix delimiters can be changed');

    await importSource('Paragraph');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror p').length===1);
    await paper.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('Anchor');
    await page.locator('[data-group=reference]').click();
    await page.getByRole('button',{name:'label',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.editor-dialog')));
    await page.locator('.editor-dialog input').fill('sec:new');
    await page.locator('.editor-dialog button[type=submit]').click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.ProseMirror .label-node')));

    await page.getByRole('button',{name:'ref',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.editor-dialog')));
    await page.locator('.editor-dialog input').fill('sec:new');
    await page.locator('.editor-dialog button[type=submit]').click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.ProseMirror .ref-node')));

    await page.getByRole('button',{name:'title',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.editor-dialog')));
    await page.locator('.editor-dialog input').fill('My Title');
    await page.locator('.editor-dialog button[type=submit]').click();
    await page.getByRole('button',{name:'author',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.editor-dialog')));
    await page.locator('.editor-dialog input').fill('Me');
    await page.locator('.editor-dialog button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#document-meta .doc-title')?.textContent==='My Title');
    assert.equal(await page.locator('#document-meta .doc-author').textContent(),'Me');

    await paper.locator('p').last().click({position:{x:8,y:8}});
    await page.keyboard.press('End');
    await page.keyboard.type('\\');
    await page.waitForFunction(()=>!document.querySelector('.command-menu').hidden);
    await page.locator('.command-menu input').fill('title');
    assert.ok(await page.locator('#complete-title').count(),'Typing backslash offers document commands');
    await page.keyboard.press('Escape');

    await page.keyboard.type('\\');
    await page.locator('.command-menu input').fill('Gamma');
    assert.equal(await page.locator('.command-candidates button').first().getAttribute('id'),'complete-Gamma');
    await page.locator('.command-menu input').fill('gamma');
    assert.equal(await page.locator('.command-candidates button').first().getAttribute('id'),'complete-gamma');
    await page.keyboard.press('Escape');
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:'LaTeX',exact:true}).click();
    const editedSource=(await page.locator('.source-view').inputValue()).replace('\\end{document}','Unsaved regression text\n\\end{document}');
    await page.locator('.source-view').fill(editedSource);
    await page.getByRole('button',{name:'LaTeX',exact:true}).click();
    assert.equal(await page.evaluate(()=>{
      const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;
    }),true,'Switching views must not mark edits as saved');
    await importSource('$\\begin{pmatrix}a\\end{pmatrix}+\\begin{pmatrix}b\\end{pmatrix}$');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('b'));
    const siblingMath=page.locator('math-field');
    await siblingMath.click();
    await siblingMath.evaluate(field=>{
      for(let i=0;i<field.lastOffset;i++) {
        if(field.getValue(i,i+1)==='b') {field.position=i+1;break;}
      }
      field.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,composed:true,clientX:400,clientY:300}));
    });
    await context.locator('[data-command="matrix-bmatrix"]').click();
    assert.match(await siblingMath.evaluate(field=>field.value),/\\begin\{pmatrix\}a\\end\{pmatrix\}.*\\begin\{bmatrix\}b\\end\{bmatrix\}/,'Only the matrix containing the caret changes');
    await importSource('Fonts');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent==='Fonts');
    await paper.locator('p').click();await page.keyboard.press('End');
    await page.keyboard.type('\\');
    await page.locator('.command-menu input').fill('mathbb');await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    assert.equal(await page.locator('math-field').evaluate(field=>field.value),'','Font command must not insert default text');
    await page.keyboard.type('R');
    assert.match(await page.locator('math-field').evaluate(field=>field.value),/\\mathbb\{R\}/);
    await page.locator('math-field').evaluate(field=>field.executeCommand('selectAll'));
    await page.keyboard.type('\\');
    await page.locator('.command-menu input').fill('mathbf');await page.keyboard.press('Enter');
    assert.match(await page.locator('math-field').evaluate(field=>field.value),/\\mathbf\{R\}/,'Formatting preserves selected content');
    await page.locator('math-field').evaluate(field=>new Promise(resolve=>requestAnimationFrame(()=>{field.focus();resolve();})));
    await page.keyboard.press('Control+z');
    assert.match(await page.locator('math-field').evaluate(field=>field.value),/\\mathbb\{R\}/,'Undo restores original math font');
    assert.equal(await page.locator('math-field').count(),1,'Undo keeps the formula node');
    assert.match(await paper.textContent(),/Fonts/,'Undo keeps preceding text');
    await page.keyboard.press('Control+y');
    assert.match(await page.locator('math-field').evaluate(field=>field.value),/\\mathbf\{R\}/,'Redo restores math font');
    const bodyCommand=async name=>{
      await importSource('Commands');
      await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent==='Commands');
      await paper.locator('p').click();
      await page.keyboard.press('End');
      await page.keyboard.type('\\');
      await page.locator('.command-menu input').fill(name);
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
      return page.locator('math-field').last();
    };
    const fractionField=await bodyCommand('frac');
    await page.keyboard.type('1');
    assert.match(await fractionField.evaluate(field=>field.value),/^\\frac\{1\}\{\\placeholder\{\}\}$/,'Command insertion puts the caret inside the first placeholder');
    const accentField=await bodyCommand('hat');
    await page.keyboard.type('R');
    assert.equal(await accentField.evaluate(field=>field.value),'\\hat{R}','Accent command takes the next typed character');
    const textField=await bodyCommand('text');
    await page.keyboard.type('R');
    assert.equal(await textField.evaluate(field=>field.value),'\\text{R}','Text command keeps its command and replaces the sentinel');
    await page.keyboard.press('Control+j');
    assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'MATH-FIELD');
    await page.keyboard.type('+2');
    assert.match(await textField.evaluate(field=>field.value),/\\text\{R\}\s*\+2/,'Math input resumes after leaving text');
    const operatorField=await bodyCommand('operatorname');
    await page.keyboard.type('R');
    assert.equal(await operatorField.evaluate(field=>field.value),'\\operatorname{R}','Operator name takes the next typed character');
    const scriptField=await bodyCommand('mathscr');
    await page.keyboard.type('x');
    assert.equal(await scriptField.evaluate(field=>field.value),'\\mathscr{x}','Script style applies to the next typed character');
    const spaceField=await bodyCommand('mathbb');
    await page.keyboard.press('Space');
    assert.equal(await spaceField.evaluate(field=>field.value),'\\space','Space inserts a math space');
    assert.ok(await spaceField.evaluate(field=>[...field.shadowRoot.querySelectorAll('.ML__mediumspace')].every(element=>getComputedStyle(element).backgroundColor!=='rgba(0, 0, 0, 0)')),'Space gets a visible marker');
    const displayField=await bodyCommand('sum');
    await displayField.click({button:'right'});
    await page.waitForFunction(()=>!document.querySelector('.editor-context-menu').hidden);
    await context.locator('[data-command="display-style"]').click();
    assert.equal(await displayField.evaluate(field=>field.value),'\\displaystyle{\\sum}','Display style wraps the whole formula');
    await displayField.focus();
    await page.keyboard.type('\\');
    await page.waitForFunction(()=>!document.querySelector('.command-menu').hidden);
    await page.locator('.command-menu input').fill('prod');
    await page.locator('.command-menu input').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>{
      const field=document.querySelector('math-field');
      return field?.value.includes('\\prod')&&field.shadowRoot.querySelectorAll('.ML__op-symbol.ML__large-op').length===2;
    });
    assert.equal(await displayField.evaluate(field=>[...field.shadowRoot.querySelectorAll('.ML__op-symbol.ML__large-op')].length),2,'Display style applies to later input');
    await importSource('$\\mathbf{x+y}$');
    await page.waitForFunction(()=>document.querySelector('math-field'));
    assert.ok(await page.locator('math-field').first().evaluate(field=>[...field.shadowRoot.querySelectorAll('.ML__mathbf')].every(element=>getComputedStyle(element).backgroundColor!=='rgba(0, 0, 0, 0)')),'Font commands highlight their content');
    await importSource('$x+\\text{abc}+y$');
    await page.waitForFunction(()=>document.querySelector('math-field'));
    const textEnvField=page.locator('math-field').first();
    await textEnvField.click();
    await textEnvField.evaluate(field=>{
      field.focus();
      for(let i=0;i<=field.lastOffset;i++)if(field.getValue(i,i+1)==='c'){field.position=i+1;break;}
    });
    await textEnvField.focus();
    await page.keyboard.press('Control+0');
    assert.notEqual(await textEnvField.evaluate(field=>field.mode),'text','Ctrl+0 leaves the text environment');
    await importSource('H\\textsuperscript{2}O and x\\textsubscript{1}');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror sup')&&document.querySelector('.ProseMirror sub'));
    assert.equal(await paper.locator('sup').textContent(),'2');
    assert.equal(await paper.locator('sub').textContent(),'1');
    const textScript=await paper.locator('p').evaluate(node=>({base:parseFloat(getComputedStyle(node).fontSize),script:parseFloat(getComputedStyle(node.querySelector('sup')).fontSize)}));
    assert.ok(Math.abs(textScript.script/textScript.base-.7)<.05,'Text scripts use the XeTeX script size');
    await importSource('$x^2+y_1$');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('^2'));
    const mathScript=await page.locator('math-field').evaluate(field=>{
      const spans=[...field.shadowRoot.querySelectorAll('.ML__content span')].filter(element=>element.textContent&&!element.children.length);
      const base=spans.find(element=>element.textContent==='x');
      const script=spans.find(element=>element.textContent==='2');
      return parseFloat(getComputedStyle(script).fontSize)/parseFloat(getComputedStyle(base).fontSize);
    });
    assert.ok(Math.abs(mathScript-.7)<.02,'Math scripts use the XeTeX script size');
    await importSource('Body text');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent==='Body text');
    assert.ok(await page.evaluate(()=>document.querySelector('.document-page > #document-meta')!==null),'Title and author render inside the page');
    const metaTitleNode=page.locator('#document-meta .doc-title');
    const metaAuthorNode=page.locator('#document-meta .doc-author');
    await metaTitleNode.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Regression title');
    await metaAuthorNode.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Regression author');
    await paper.locator('p').click();
    await page.waitForTimeout(100);
    assert.equal(await metaTitleNode.textContent(),'Regression title');
    assert.equal(await metaAuthorNode.textContent(),'Regression author');
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:'LaTeX',exact:true}).click();
    const metaSource=await page.locator('.source-view').inputValue();
    assert.match(metaSource,/\\title\{Regression title\}/,'Editing the title writes it back to the document properties');
    assert.match(metaSource,/\\author\{Regression author\}/,'Editing the author writes it back to the document properties');
    await page.getByRole('button',{name:'LaTeX',exact:true}).click();
    await page.locator('#language').evaluate(element=>{element.value='zh-CN';element.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('[data-group=home]').click();
    await page.getByRole('button',{name:'↶',exact:true}).hover();
    await page.waitForFunction(()=>document.querySelector('.lineae-tooltip')?.textContent==='撤销');
    await page.locator('#language').evaluate(element=>{element.value='en';element.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.getByRole('button',{name:'↶',exact:true}).hover();
    await page.waitForFunction(()=>document.querySelector('.lineae-tooltip')?.textContent==='Undo');
    await page.locator('#language').evaluate(element=>{element.value='zh-CN';element.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('[data-group=home]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.group),'insert','Toolbar tabs support arrow-key navigation');
    await page.getByRole('button',{name:/主题：/}).click();
    await page.getByRole('button',{name:/主题：/}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark','Theme control applies the selected theme');
    await bodyCommand('frac');
    await page.keyboard.type('1');
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:'LaTeX',exact:true}).click();
    const exportedMath=await page.locator('.source-view').inputValue();
    assert.match(exportedMath,/\\frac\{1\}\{\}/,'Editing placeholders do not leak into exported LaTeX');
    assert.ok(!exportedMath.includes('\\placeholder{}'),'Exported LaTeX has no MathLive placeholders');
    await page.getByRole('button',{name:'LaTeX',exact:true}).click();
    await importSource(String.raw`Lead $\mathbf{AB}+C$ tail`);
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('mathbf{AB}'));
    await paper.locator('p').click({position:{x:2,y:8}});
    await paper.locator('p').evaluate(paragraph=>{
      const math=paragraph.querySelector('[data-math-view]');
      const boundary=Array.from(paragraph.childNodes).indexOf(math);
      window.getSelection().collapse(paragraph,boundary);
    });
    await page.keyboard.press('Control+e');
    await page.keyboard.press('e');
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    const chordField=page.locator('math-field');
    await chordField.evaluate(field=>{field.position=1;});
    const chordZoom=await page.locator('input[type=range]').inputValue();
    await page.keyboard.press('Control+0');
    assert.equal(await page.locator('input[type=range]').inputValue(),chordZoom);
    assert.ok(await chordField.evaluate(field=>field.position>1 && field.position<field.lastOffset),'Ctrl+0 leaves the style run without jumping to the formula end');
    const exitedPosition=await chordField.evaluate(field=>{const position=field.position;field.position=1;return position;});
    await page.keyboard.press('Control+j');
    assert.equal(await chordField.evaluate(field=>field.position),exitedPosition);
    await chordField.evaluate(field=>{field.executeCommand('moveToMathfieldEnd');});
    await page.keyboard.type('(x)');
    assert.match(await chordField.evaluate(field=>field.value),/\\left\(x\\right\)$/);
    await chordField.evaluate(field=>{field.executeCommand('selectAll');});
    await page.keyboard.type('\\');
    await page.locator('.command-menu input').fill('left');
    await page.keyboard.press('Enter');
    await page.locator('.delimiter-input input').first().fill('[');
    assert.equal(await page.locator('[data-math-view] .delimiter-input-embedded').count(),1);
    assert.equal(await page.locator('.delimiter-input input').last().evaluate(input=>document.activeElement===input),true);
    await page.keyboard.type(')');
    await page.waitForFunction(()=>/^\\left\[.*\\right\)$/.test(document.querySelector('math-field')?.value));
    assert.match(await chordField.evaluate(field=>field.value),/\\mathbf\{AB\}/,'Wrapping preserves selected math');
    await chordField.evaluate(field=>{field.focus();field.executeCommand('moveToMathfieldEnd');});
    await page.keyboard.press('Control+e');
    await page.keyboard.press('t');
    await page.keyboard.type('[');
    assert.match(await chordField.evaluate(field=>field.value),/\[$/,'Literal fence does not generate a pair');
    await importSource(String.raw`\LaTeX{} and \TeX{}`+'\n\n中文');
    await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror .tex-logo-e').length===2);
    assert.equal(await paper.locator('p').first().textContent(),'LaTeX and TeX');
    assert.equal(await paper.locator('.tex-logo-a').textContent(),'a');
    const paragraphGap=await paper.locator('p').evaluateAll(([first,second])=>second.getBoundingClientRect().top-first.getBoundingClientRect().bottom);
    assert.ok(Math.abs(paragraphGap)<1,'Paragraphs have no extra vertical gap');
    await importSource('Find word and word.\n\n$z$');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='Find word and word.');
    await paper.locator('p').first().click();
    await page.keyboard.press('Control+f');
    const find=page.locator('.document-find');
    await find.locator('input').first().fill('word');
    assert.equal(await find.locator('output').textContent(),'1 / 2');
    assert.equal(await page.locator('.find-match').count(),2,'All matches are highlighted');
    assert.equal(await page.locator('.find-current').count(),1,'Current match is highlighted distinctly');
    await page.keyboard.press('Enter');
    assert.equal(await find.locator('output').textContent(),'2 / 2');
    assert.equal(await page.locator('.find-current').count(),1);
    await page.keyboard.press('Escape');
    assert.equal(await find.isVisible(),false);
    await page.locator('math-field').click();
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    await page.keyboard.press('Control+i');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\int'));
    assert.match(await page.locator('math-field').evaluate(field=>field.value),/\\int/);
    await page.keyboard.press('Control+f');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\frac'));
    assert.match(await page.locator('math-field').evaluate(field=>field.value),/\\frac/);
    assert.equal(await find.isVisible(),false);
    await page.keyboard.press('Control+m');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\begin{pmatrix}'));
    assert.match(await page.locator('math-field').evaluate(field=>field.value),/\\begin\{pmatrix\}/);
    for (const [shortcut,operator] of [['Control+Shift+s','sum'],['Control+Shift+p','prod'],['Control+Shift+i','iint'],['Control+Shift+Alt+i','iiint'],['Alt+i','oint'],['Alt+Shift+i','oiint']]) {
      await page.keyboard.press(shortcut);
      await page.waitForFunction(name=>document.querySelector('math-field')?.value.includes('\\'+name),operator);
    }
    const beforeToolbarSum=await page.locator('math-field').first().evaluate(field=>field.value);
    const mathCount=await page.locator('math-field').count();
    await page.locator('[data-group=math]').click();
    await page.getByRole('button',{name:'sum',exact:true}).click();
    await page.waitForFunction(previous=>document.querySelector('math-field')?.value!==previous,beforeToolbarSum);
    assert.equal(await page.locator('math-field').count(),mathCount,'The sum button edits the active formula');
    await importSource(String.raw`\noindent Unindented`);
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p[data-indent="false"]')?.textContent==='Unindented');
    await paper.locator('p').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await paper.locator('p').last().getAttribute('data-indent'),'false');
    await page.keyboard.press('Control+i');
    await page.keyboard.type('Indented');
    await page.keyboard.press('Enter');
    assert.equal(await paper.locator('p').last().getAttribute('data-indent'),'true');
    await importSource('Selection $abc$');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value==='abc');
    const selectionField=page.locator('math-field');
    await selectionField.click();
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    await selectionField.evaluate(field=>field.executeCommand('moveToMathfieldStart'));
    await page.keyboard.press('Shift+ArrowRight');
    assert.equal(await selectionField.evaluate(field=>field.getValue(field.selection.ranges[0])),'a');
    const selectionBox=await selectionField.boundingBox();
    await page.mouse.move(selectionBox.x+2,selectionBox.y+selectionBox.height/2);
    await page.mouse.down();
    await page.mouse.move(selectionBox.x+selectionBox.width-2,selectionBox.y+selectionBox.height/2,{steps:10});
    await page.mouse.up();
    assert.ok(await selectionField.evaluate(field=>field.selection.ranges.some(([from,to])=>from!==to)),'Mouse drag creates a math selection');
    await selectionField.evaluate(field=>field.executeCommand('moveToMathfieldEnd'));
    await page.keyboard.type('\\\\');
    await page.waitForFunction(()=>document.querySelector('math-field')?.value.includes('\\backslash'));
    await selectionField.click();
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD');
    await selectionField.evaluate(field=>field.executeCommand('moveToMathfieldEnd'));
    await page.keyboard.type('[x');
    assert.match(await selectionField.evaluate(field=>field.value),/(?:\[|\\lbrack)\s*x/);
    await page.keyboard.type('$');
    assert.match(await selectionField.evaluate(field=>field.value),/\\right\./,'Pending delimiter is invisible after leaving math');
    await importSource(String.raw`\includegraphics[width=0.5\linewidth]{plot.png}`);
    const imageNode=paper.locator('figure.document-image');
    const chooser=page.waitForEvent('filechooser');
    await imageNode.getByRole('button',{name:/plot\.png/}).click();
    await (await chooser).setFiles({name:'plot.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=','base64')});
    await imageNode.locator('img').waitFor({state:'visible'});
    assert.equal(await imageNode.locator('img').evaluate(image=>image.style.width),'50%');
    await imageNode.hover();
    await imageNode.locator('.document-image-controls button').first().click();
    await page.locator('.editor-dialog input').fill('6cm');
    await page.locator('.editor-dialog button[type=submit]').click();
    assert.equal(await imageNode.locator('img').evaluate(image=>image.style.width),'6cm');
    await importSource('');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='');
    await paper.locator('p').click();
    await page.keyboard.type('```');
    await paper.locator('pre code').waitFor();
    await page.keyboard.type('return 42');
    assert.equal(await paper.locator('pre code').textContent(),'return 42');
    assert.equal(await paper.locator('pre .code-token-keyword').textContent(),'return');
    await page.locator('[data-group=insert]').click();
    await page.getByRole('button',{name:/^(代码块|Code block)$/}).click();
    await page.locator('.editor-dialog input').fill('Python');
    await page.locator('.editor-dialog button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.ProseMirror pre code')?.classList.contains('language-Python'));
    await page.waitForFunction(()=>document.activeElement?.classList.contains('ProseMirror'));
    await page.keyboard.press('Control+j');
    await paper.locator(':scope > p').waitFor();
    await page.keyboard.type('after');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror > p')?.textContent==='after');
    await page.keyboard.press('Enter');
    await page.keyboard.type('$$');
    await page.waitForFunction(()=>document.activeElement?.tagName==='MATH-FIELD' && document.activeElement.closest('.math-display'));
    assert.deepEqual(await paper.evaluate(element=>Array.from(element.children).map(child=>child.matches('.math-display')?'math':child.tagName)),['PRE','P','math','P']);
    const integral=page.locator('math-field');
    await page.keyboard.press('Control+i');
    await page.keyboard.type('_i');
    await page.keyboard.press('Control+j');
    await page.keyboard.press('Control+i');
    await page.keyboard.type('_0');
    assert.match(await integral.evaluate(field=>field.value),/\\int_\{?i\}?\s*\\int_\{?0\}?/);
    assert.ok(!(await integral.evaluate(field=>field.value)).includes('\\space'));
    await importSource('alpha beta gamma');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='alpha beta gamma');
    await paper.locator('p').scrollIntoViewIfNeeded();
    const words=await paper.locator('p').evaluate(paragraph=>{
      const bounds=[];
      const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()) {
        for(const word of node.textContent.matchAll(/alpha|gamma/g)) {
          const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
          const rect=range.getBoundingClientRect();bounds.push({left:rect.left,right:rect.right,y:(rect.top+rect.bottom)/2});
        }
      }
      return bounds;
    });
    for (let index=0;index<words.length;index++) {
      if(index) await page.keyboard.down('Control');
      const word=words[index];
      await page.mouse.move(word.left+0.5,word.y);await page.mouse.down();
      await page.mouse.move(word.right-0.5,word.y,{steps:8});await page.mouse.up();
      if(index) await page.keyboard.up('Control');
      const selected=await page.evaluate(()=>window.getSelection().toString());
      assert.equal(selected,index?'gamma':'alpha',JSON.stringify(word));
    }
    await page.waitForFunction(()=>document.querySelectorAll('.lineae-multi-selected').length>=2);
    await page.keyboard.press('Delete');
    assert.equal((await paper.locator('p').textContent()).trim(),'beta');
    await importSource('\\indent $x+y$ tail');
    await page.waitForFunction(()=>document.querySelector('math-field'));
    const inlineWidth=await page.locator('math-field').evaluate(field=>({host:field.getBoundingClientRect().width,base:field.shadowRoot.querySelector('.ML__base').getBoundingClientRect().width}));
    assert.ok(Math.abs(inlineWidth.host-inlineWidth.base)<1,'Inline math keeps no inherited indent gap: '+JSON.stringify(inlineWidth));
    const handlePlace=await page.locator('math-field').evaluate(field=>{
      const handle=field.closest('[data-math-view]').querySelector('.math-drag-handle');
      const f=field.getBoundingClientRect(),h=handle.getBoundingClientRect();
      return {fieldLeft:f.left,handleRight:h.right,handleTop:h.top,fieldTop:f.top};
    });
    assert.ok(handlePlace.handleRight<=handlePlace.fieldLeft-8,'Inline drag handle keeps a clear gap left of the formula: '+JSON.stringify(handlePlace));
    await importSource('Tail $x$');
    await page.waitForFunction(()=>document.querySelector('math-field')&&document.querySelector('.space-overlay text'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const parAfterMath=await page.evaluate(()=>{
      const page=document.querySelector('.document-page');
      const pageRect=page.getBoundingClientRect();
      const zoom=pageRect.width/page.offsetWidth||1;
      const mark=[...document.querySelectorAll('.space-overlay text')].find(node=>node.textContent==='¶');
      const field=document.querySelector('math-field').getBoundingClientRect();
      return { markX:Number(mark?.getAttribute('x')), fieldRight:(field.right-pageRect.left)/zoom };
    });
    assert.ok(parAfterMath.markX>=parAfterMath.fieldRight+1,'Paragraph mark follows the formula: '+JSON.stringify(parAfterMath));
    await importSource('前 后');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='前 后');
    await paper.locator('p').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{
      const paragraph=document.querySelector('.ProseMirror p');
      const overlay=document.querySelector('.space-overlay');
      if(!overlay || paragraph.childElementCount!==0)return false;
      const range=document.createRange();
      range.setStart(paragraph.firstChild,1);range.setEnd(paragraph.firstChild,2);
      const page=document.querySelector('.document-page');
      const pageRect=page.getBoundingClientRect();
      const zoom=pageRect.width/page.offsetWidth||1;
      const rect=range.getBoundingClientRect();
      const left=(rect.left-pageRect.left)/zoom;
      const right=(rect.right-pageRect.left)/zoom;
      return [...overlay.querySelectorAll('circle')].some(circle=>{
        const x=Number(circle.getAttribute('cx'));
        return x>=left-1&&x<=right+1;
      });
    });
    await paper.locator('p').click();
    await page.keyboard.press('End');
    const cdp=await page.context().newCDPSession(page);
    const overlayState=()=>page.evaluate(()=>document.querySelector('.space-overlay').innerHTML);
    const beforeComposition=await overlayState();
    await cdp.send('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});
    await page.waitForTimeout(120);
    assert.notEqual(await overlayState(),beforeComposition,'Markers follow composition text');
    assert.equal(await page.locator('.space-overlay').isVisible(),true);
    await cdp.send('Input.imeSetComposition',{text:'中文',selectionStart:2,selectionEnd:2});
    await cdp.send('Input.insertText',{text:'中文'});
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='前 后中文');
    await page.keyboard.press('Backspace');
    assert.equal(await paper.locator('p').textContent(),'前 后中');
    await paper.locator('p').evaluate(paragraph=>window.getSelection().collapse(paragraph.firstChild,0));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    await paper.focus();
    await page.keyboard.press('Delete');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent.trimStart()==='后中');
    await importSource('\\section{First}\\label{sec:first}\n\nMark \\label{note} here and see \\ref{sec:first}');
    await page.waitForFunction(()=>document.querySelector('.label-node')&&document.querySelector('.ref-node'));
    assert.equal(await page.locator('.ref-node').textContent(),'1','References show only the resolved number');
    await importSource('\\section{First}\n\n\\subsection{Child}\n\nBody \\label{yes}.\n\n\\section{Second}\n\nSee \\ref{yes}.');
    await page.waitForFunction(()=>document.querySelector('.ref-node')?.textContent==='1.1');
    assert.equal(await page.locator('.ref-node').textContent(),'1.1','Inline label uses the most recent numbered section');
    await importSource('\\section{First}\\label{sec:first}\n\nMark \\label{note} here and see \\ref{sec:first}');
    await page.waitForFunction(()=>document.querySelector('.label-node')&&document.querySelector('.ref-node'));
    const labelPlacement=await page.evaluate(()=>{
      const label=document.querySelector('.label-node');
      const page=document.querySelector('.document-page');
      const content=document.querySelector('.ProseMirror');
      return { position:getComputedStyle(label).position, left:label.getBoundingClientRect().left, right:label.getBoundingClientRect().right, pageLeft:page.getBoundingClientRect().left, contentLeft:content.getBoundingClientRect().left };
    });
    assert.equal(labelPlacement.position,'absolute','Labels do not occupy text width');
    assert.ok(labelPlacement.left>=labelPlacement.pageLeft&&labelPlacement.right<=labelPlacement.contentLeft,'Labels sit in the left page margin: '+JSON.stringify(labelPlacement));
    await page.locator('[data-group=reference]').click();
    await page.getByRole('button',{name:'ref',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.reference-dialog')));
    assert.match(await page.locator('.reference-dialog select').textContent(),/sec:first/,'Reference dialog lists existing labels');
    await page.locator('.reference-dialog select').selectOption('sec:first');
    await page.locator('.reference-dialog button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.ref-node').length===2);
    await importSource('Footnote here');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='Footnote here');
    await page.locator('[data-group=reference]').click();
    await page.getByRole('button',{name:'fn',exact:true}).click();
    await page.locator('.editor-dialog input').fill('A note');
    await page.locator('.editor-dialog button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.ProseMirror .footnote-node')?.textContent==='1');
    await importSource('Citation here');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='Citation here');
    await page.locator('[data-group=reference]').click();
    const [citationChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button',{name:'cite',exact:true}).click(),
    ]);
    await citationChooser.setFiles({name:'refs.bib',mimeType:'text/plain',buffer:Buffer.from('@article{knuth1984,title={Literate Programming},author={Knuth}}')});
    await page.waitForFunction(()=>Boolean(document.querySelector('.citation-dialog')));
    await page.locator('.citation-dialog select').selectOption('knuth1984');
    await page.locator('.citation-dialog button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.ProseMirror .cite-node')?.textContent.includes('knuth1984'));
    await importSource('alpha beta alpha');
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='alpha beta alpha');
    await paper.locator('p').click();
    await page.keyboard.press('Control+f');
    const findPanel=page.locator('.document-find');
    await findPanel.locator('input').first().fill('alpha');
    await findPanel.locator('.document-find-row input').fill('gamma');
    await findPanel.locator('[data-action="replace-all"]').click();
    await page.waitForFunction(()=>document.querySelector('.ProseMirror p')?.textContent==='gamma beta gamma');
    await page.keyboard.press('Escape');
    await importSource('See \\eqref{eq:y} and \\ref{eq:y}.\n\n\\begin{equation}x\\end{equation}\n\n\\begin{equation*}z\\end{equation*}\n\n\\begin{equation}y\\label{eq:y}\\end{equation}');
    await page.waitForFunction(()=>document.querySelectorAll('.math-display[data-numbered="true"]').length===2);
    const equationNumbers=await page.locator('.math-display[data-numbered="true"]').evaluateAll(nodes=>nodes.map(node=>({increment:getComputedStyle(node).counterIncrement,content:getComputedStyle(node,'::after').content})));
    assert.equal(equationNumbers.length,2);
    assert.ok(equationNumbers.every(item=>item.increment.includes('lineae-equation')&&item.content.includes('counter(lineae-equation)')),'Equation environments use an ordered CSS counter');
    assert.deepEqual(await paper.locator('.ref-node').allTextContents(),['(2)','2']);
    assert.equal(await paper.locator('math-field').last().evaluate(field=>field.value),'y');
    await page.locator('[data-group=layout]').click();
    const layoutSelects=page.locator('#layout-panel select');
    await layoutSelects.nth(0).selectOption('a5');
    await layoutSelects.nth(1).selectOption('landscape');
    await layoutSelects.nth(2).selectOption('narrow');
    const pageLayout=await page.evaluate(()=>{
      const page=document.querySelector('.document-page');
      return ['--page-width','--page-height','--page-margin-top','--page-margin-right'].map(name=>page.style.getPropertyValue(name));
    });
    assert.deepEqual(pageLayout,['210mm','148mm','1.27cm','1.27cm'],'Layout controls update the page metrics');
    await importSource('\\begin{theorem}[Example]\nStatement.\n\\end{theorem}\n\n\\begin{proof}\nArgument.\n\\end{proof}');
    await paper.locator('[data-theorem="proof"]').waitFor();
    assert.equal(await paper.locator('[data-theorem="theorem"] p').textContent(),'Statement.');
    await paper.evaluate(element=>{
      const transfer=new DataTransfer();
      const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII='),char=>char.charCodeAt(0));
      transfer.items.add(new File([png],'drop-test.png',{type:'image/png'}));
      const rect=element.getBoundingClientRect();
      element.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left+10,clientY:rect.top+10}));
    });
    await paper.locator('figure.document-image img').waitFor({state:'visible'});
    await paper.locator('p').first().click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await page.waitForFunction(async()=>{
      const entries=await navigator.clipboard.read();
      for(const entry of entries)if(entry.types.includes('text/html')&&(await (await entry.getType('text/html')).text()).includes('data-document-image="drop-test.png"'))return true;
      return false;
    });
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-group=reference]').click();
    const bibChooser=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:'cite',exact:true}).click();
    await (await bibChooser).setFiles({name:'works.bib',mimeType:'text/plain',buffer:Buffer.from('@misc{example,title={Example}}')});
    await page.locator('.citation-dialog select').selectOption('example');
    await page.locator('.citation-dialog button[type=submit]').click();
    await paper.locator('.cite-node').waitFor();
    await page.locator('[data-group=files]').click();
    const downloading=page.waitForEvent('download');
    await page.locator('#download').click();
    const downloaded=await downloading;
    assert.match(downloaded.suggestedFilename(),/\.zip$/);
    const projectBytes=await readFile(await downloaded.path());
    assert.ok(projectBytes.includes(Buffer.from('drop-test.png')));
    assert.ok(projectBytes.includes(Buffer.from('works.bib')));
    assert.ok(projectBytes.includes(Buffer.from('\\addbibresource{works.bib}')));
    await importSource('Before \\fbox{Box} after');
    const boxedText=paper.locator('[data-boxed]');
    await boxedText.waitFor();
    await boxedText.click();
    await page.waitForFunction(()=>Boolean(document.querySelector('.space-overlay [data-active-box]')));
    await page.keyboard.press('Control+j');
    await page.waitForFunction(()=>!document.querySelector('.space-overlay [data-active-box]'));
    await page.keyboard.type('X');
    assert.equal(await boxedText.textContent(),'Box','Ctrl+J leaves the complete box');
    assert.match(await paper.textContent(),/BoxX after/);
    await importSource('\\begin{quote}\nQuoted text.\n\\end{quote}');
    await paper.locator('blockquote p').click();
    await page.keyboard.press('Control+j');
    await page.keyboard.type('Outside');
    assert.equal(await paper.locator('blockquote').textContent(),'Quoted text.');
    assert.equal(await paper.locator(':scope > p').last().textContent(),'Outside');
    await importSource('\\begin{enumerate}\n\\item One\n\\item Two\n\\end{enumerate}');
    await page.waitForFunction(()=>{
      const list=document.querySelector('.ProseMirror ol');
      return list && list.querySelectorAll('p').length===2 && document.querySelectorAll('.space-overlay text').length>=2;
    });
    await paper.locator('li p').first().click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(()=>document.querySelectorAll('.space-overlay text').length===document.querySelectorAll('.ProseMirror p').length);
    await paper.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('\\');
    await completion.locator('input').fill('fbox');
    assert.equal(await completion.getByRole('option',{name:'\\fbox',exact:true}).count(),1);
    await page.keyboard.press('Escape');
    for (const width of [1280,390]) {
      await page.setViewportSize({width,height:1400});
      for (const group of ['files','home','insert','layout','table','format','reference','math']) {
        await page.locator(`[data-group=${group}]`).click();
        const layout=await page.locator('.ribbon').evaluate(element=>{
          const panel=[...element.querySelectorAll('.tools')].find(node=>!node.hidden);
          const bounds=element.getBoundingClientRect();
          return {left:bounds.left,right:bounds.right,scroll:panel.scrollWidth,client:panel.clientWidth};
        });
        assert.ok(layout.left>=-1 && layout.right<=width+1 && layout.scroll<=layout.client+1,JSON.stringify({group,width,layout}));
      }
    }
    await page.setViewportSize({width:1280,height:1400});
    await importSource('Before $x$ after');
    console.log('Math boundary before',await page.evaluate(()=>({position:document.querySelector('[data-math-view]').getMathPosition(),paragraph:document.querySelector('.ProseMirror p').innerHTML})));
    await page.locator('math-field').evaluate(field=>{field.focus();field.executeCommand('moveToMathfieldEnd');});
    await page.keyboard.press('ArrowRight');
    console.log('Math boundary after',await page.evaluate(()=>({node:window.getSelection()?.anchorNode?.parentElement?.outerHTML,offset:window.getSelection()?.anchorOffset})));
    assert.ok(await paper.evaluate(element=>element===document.activeElement),'ArrowRight exits at the end of inline math');
    await page.keyboard.type('Q');
    await page.locator('.source-toggle').click();
    assert.match(await page.locator('.source-view').inputValue(),/\$x\$Q after/);
    await page.locator('.source-toggle').click();
    await paper.locator('p').first().click();
    await paper.evaluate(element=>{
      const clipboard=new DataTransfer();
      const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
      clipboard.items.add(new File([png],'image.png',{type:'image/png'}));
      element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clipboard}));
    });
    await paper.locator('figure.document-image img').waitFor({state:'visible'});
    assert.match(await paper.locator('figure.document-image img').getAttribute('alt'),/^clipboard-.*\.png$/);
    assert.deepEqual(errors,[]);
    console.log('Browser regressions passed');
  }finally{
    await browser.close();
    await new Promise(done=>server.close(done));
  }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
