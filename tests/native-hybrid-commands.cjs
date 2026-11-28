const assert=require('node:assert/strict');

// The same keystrokes run in the browser against rtex and in the distributed
// Windows WebView. Never insert a template through the editor's command API.
module.exports=async function checkCommands(page,{hybrid=true}={}) {
  const pm=page.locator('.document-page .ProseMirror');
  const menu=page.locator('.command-menu'),input=menu.getByRole('combobox');
  const cdp=await page.context().newCDPSession(page);
  const key=key=>page.keyboard.press(key),type=text=>page.keyboard.type(text);
  const choose=async name=>{await type('\\'+name);await key('Enter');};
  const model=()=>pm.evaluate(el=>el.editor.getJSON());
  function prosePoints(paragraph){
    return paragraph.evaluate(el=>{
      const paper=document.querySelector('[data-native-page] canvas')?.getBoundingClientRect()??{left:0,top:0};
      function glyphPoint(text){
        const range=document.createRange();
        range.setStart(text,0);range.setEnd(text,1);
        const live=range.getBoundingClientRect(),style=getComputedStyle(text.parentElement);
        const sample=document.createElement('span'),baseline=document.createElement('i');
        sample.style.cssText='position:fixed;left:0;top:0;visibility:hidden;white-space:pre';
        for(const property of ['fontFamily','fontWeight','fontStyle','fontSize','lineHeight'])
          sample.style[property]=style[property];
        sample.style.zoom=String(text.parentElement.currentCSSZoom||1);
        baseline.style.cssText='display:inline-block;height:0;width:0;vertical-align:baseline';
        sample.append(text.data[0],baseline);document.body.append(sample);
        range.selectNodeContents(sample.firstChild);
        const rise=baseline.getBoundingClientRect().top-range.getBoundingClientRect().top;
        sample.remove();
        return {text:text.data[0],x:live.left-paper.left,y:live.top+rise-paper.top};
      }
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),out=[];
      while(walker.nextNode()){
        const n=walker.currentNode;
        if(/^(Lead |Bold|tail|After)/.test(n.data) && !n.parentElement.closest('math-field'))out.push(glyphPoint(n));
      }
      const radicalX=el.querySelector('math-field')?.shadowRoot?.querySelector('.ML__mathit')?.firstChild;
      if(radicalX?.nodeType===3)out.push(glyphPoint(radicalX));
      return out;
    });
  }
  try{
    await type('\\');
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    if(hybrid)assert.equal(await page.locator('body.native-tex-rich-edit').count(),1,'The command input retains the active paper');
    const menuState=await menu.evaluate(m=>{
      const option=m.querySelector('[role=option]'),b=option.getBoundingClientRect();
      return {visible:option.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)),
        top:m.getBoundingClientRect().top,toolbar:document.querySelector('header .ribbon').getBoundingClientRect().bottom,
        mounted:m.querySelectorAll('[role=option]').length,total:Number(option.getAttribute('aria-setsize'))};
    });
    assert.ok(menuState.visible && menuState.top>=menuState.toolbar && menuState.total>300 && menuState.mounted<50,JSON.stringify(menuState));
    await key('ArrowUp');
    assert.equal(await menu.getByRole('option',{selected:true}).getAttribute('aria-posinset'),String(menuState.total));
    await key('ArrowDown');
    await type('section');
    await cdp.send('Input.imeSetComposition',{text:'x',selectionStart:1,selectionEnd:1});
    await key('Enter');
    assert.ok(await menu.isVisible(),'The composition Enter must leave completion open');
    await cdp.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});
    await input.fill('section');
    await menu.getByRole('option',{name:'\\section',exact:true}).click();
    const headingStyle=hybrid && await pm.evaluateHandle(el=>{
      const observed={};
      const listen=event=>{
        if(event.key!=='Enter')return;
        observed.ctex=el.hasAttribute('data-native-ctex');
        observed.indent=getComputedStyle(el).getPropertyValue('--tex-paragraph-indent');
        observed.text=el.editor.state.doc.firstChild.textContent;
        el.removeEventListener('keydown',listen,true);
      };
      el.addEventListener('keydown',listen,true);
      return observed;
    });
    await cdp.send('Input.imeSetComposition',{text:'biao',selectionStart:4,selectionEnd:4});
    assert.equal(await pm.locator('h1').textContent(),'biao');
    await cdp.send('Input.insertText',{text:'标题'});
    await key('Enter');
    if(headingStyle){
      const atEnter=await headingStyle.jsonValue();
      await headingStyle.dispose();
      assert.ok(atEnter.ctex && atEnter.text==='标题',
        'Use the committed heading metrics before Enter places the first body line: '+JSON.stringify(atEnter));
    }
    await type('Lead ');await choose('textbf');await type('Bold');await choose('textbf');await type(' ');
    await type('\\missingCommand');await key('Escape');await type('P');
    const prose=(await model()).content;
    assert.equal(prose[0].type,'heading');
    assert.equal(prose[0].content[0].text,'标题');
    assert.equal(prose[1].content.find(n=>n.marks?.some(m=>m.type==='bold'))?.text,'Bold');
    assert.equal(prose[1].content.at(-1).text,' P');
    // Invoke a math template from prose and send its first argument in the
    // very next keyboard event; a wait for focus would hide the regression.
    await choose('sqrt');await type('x');await key('Control+Shift+j');await type('tail');
    assert.match((await model()).content[1].content.find(n=>n.type==='math').attrs.latex,/\\sqrt\{x\}/);
    assert.ok((await model()).content[1].content.at(-1).text.endsWith('tail'));
    const before=await prosePoints(pm.locator('p').filter({hasText:'Lead'}));
    await key('Enter');await type('$$\\frac');await key('Enter');
    await type('a');await key('Tab');await type('b');
    const display=pm.locator('.math-display math-field');
    assert.equal(await display.evaluate(f=>f.value),'\\frac{a}{b}');
    await type('\\');await key('Escape');await type('c');await key('Backspace');
    assert.equal(await display.evaluate(f=>f.value),'\\frac{a}{b}');
    // Capture a and b on their own baselines, including the denominator.
    const points=async locator=>{
      await page.waitForFunction(f=>[...f.shadowRoot.querySelectorAll('.ML__mathit')]
        .map(e=>e.textContent).sort().join('')==='ab',await locator.elementHandle());
      return locator.evaluate(field=>{
        const paper=document.querySelector('[data-native-page] canvas')?.getBoundingClientRect()??{left:0,top:0};
        return [...field.shadowRoot.querySelectorAll('.ML__mathit')].filter(el=>/^[ab]$/.test(el.textContent)).map(el=>{
          const text=el.textContent,rect=el.getBoundingClientRect(),probe=document.createElement('i');
          probe.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline;margin:0;padding:0;border:0';
          el.append(probe);
          const y=probe.getBoundingClientRect().top-paper.top;
          probe.remove();
          return {text,x:rect.left-paper.left,y};
        });
      });
    };
    const live=await points(display);
    // Leave immediately after another deletion. The retained ink must not
    // clone the pending "bc" denominator before MathLive paints "b".
    await type('c');await key('Backspace');await key('Control+Shift+j');await type('After');
    const result=(await model()).content;
    assert.equal(result.find(n=>n.type==='mathBlock').attrs.latex,'\\frac{a}{b}');
    assert.equal(result.at(-1).content[0].text,'After');
    const after=await prosePoints(pm.locator('p').filter({hasText:'After'}));
    assert.deepEqual(before.map(p=>p.text).sort(),['B','L','t','x']);
    assert.deepEqual(after.map(p=>p.text),['A']);
    return {live,points,before,after};
  }finally{await cdp.detach();}
};

module.exports.checkBoundaries=async function checkBoundaries(page){
  const pm=page.locator('.document-page .ProseMirror'),key=k=>page.keyboard.press(k),type=s=>page.keyboard.type(s);
  const choose=async name=>{await type('\\'+name);await key('Enter');};
  await type('First');await choose('newpage');await type('Tail');
  await type('\\\\');await type('next');
  const content=await pm.evaluate(el=>el.editor.getJSON().content);
  const breakAt=content.findIndex(n=>n.type==='pageBreak');
  assert.ok(breakAt>0 && content[breakAt-1].content.at(-1).text==='First',JSON.stringify(content));
  assert.equal(content[breakAt+1].content.map(n=>n.text).join(''),'Tail\\next');
  await type('$z');await key('Shift+ArrowLeft');await choose('left');await type('()');
  const field=pm.locator('.math-inline math-field').last();
  assert.match(await field.evaluate(f=>f.value),/\\left\(z\\right\)/);
  await key('End');await type('q');await key('Shift+ArrowLeft');await choose('frac');await type('d');
  assert.match(await field.evaluate(f=>f.value),/\\frac\{q\}\{d\}/);
  await key('Control+Shift+j');await type('End');
  assert.ok((await pm.evaluate(el=>el.editor.state.selection.$head.parent.textContent)).endsWith('End'));
};
