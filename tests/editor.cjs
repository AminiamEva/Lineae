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
    await page.keyboard.type('\\');
    await page.waitForFunction(()=>!document.querySelector('.command-menu').hidden);
    const completion=page.locator('.command-menu');
    const initialBounds=await completion.boundingBox();
    const initialScroll=await page.evaluate(()=>window.scrollY);
    const caretBounds=await paper.locator('p').last().boundingBox();
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
    assert.deepEqual(errors,[]);
    console.log('Browser regressions passed');
  }finally{
    await browser.close();
    await new Promise(done=>server.close(done));
  }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
