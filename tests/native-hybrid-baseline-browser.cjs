const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs/promises');
const {createServer}=require('node:http');
const {tmpdir}=require('node:os');
const {join,resolve,sep,extname,isAbsolute,basename}=require('node:path');
const {createInterface}=require('node:readline');
const {chromium}=require('playwright');
const {expect}=require('playwright/test');

const paragraph='Office first, multiple words and \\textbf{bold words}, followed by enough ordinary text to occupy several lines. ';
const raw=['\\section{Caption}','rj','rj','2','','','','2',paragraph.repeat(13),'\\newpage','rj'];
const source=['\\documentclass{article}','% UTF-8 source offsets: 中文𠮷','\\usepackage{fontspec}','\\directlua{luaotfload.add_fallback("lineaehybrid",{"file:FandolSong-Regular.otf:mode=node;"})}',
  '\\setmainfont[RawFeature={fallback=lineaehybrid}]{Latin Modern Roman}','\\usepackage[paperwidth=5in,paperheight=4in,margin=.65in]{geometry}',
  '\\begin{document}',raw.join('\r\n\r\n'),'\\end{document}',''].join('\r\n');

async function capture(inputSource=source) {
  const root=await fs.mkdtemp(join(tmpdir(),'lineae-hybrid-coordinates-'));
  await fs.writeFile(join(root,'main.tex'),inputSource);
  const child=spawn(process.env.RTEX_EXECUTABLE??'rtex',['serve','--project',root,'--main','main.tex','--build',join(root,'build'),'--eligibility','allowlist'],
    {stdio:['pipe','pipe','pipe'],windowsHide:true});
  let errors='';
  child.stderr.on('data',d=>{errors=(errors+d).slice(-4000);});
  const done=once(child,'close');
  try {
    const measured=await new Promise((accept,reject)=>{
      const result={pages:{},versions:null};
      const timer=setTimeout(()=>reject(Error('Timed out waiting for rtex '+errors)),90000);
      done.then(()=>{clearTimeout(timer);reject(Error('rtex exited '+errors));},reject);
      createInterface({input:child.stdout}).on('line',line=>{
        try {
          const event=JSON.parse(line);
          if(event.reply==='spans')result.spans=event.spans;
          if(event.event==='LayoutUpdate'){
            if(event.compile?.state!=='Ok')throw Error(JSON.stringify(event.compile)+' '+errors);
            for(const p of event.pages_changed)result.pages[p.page]=p;
            if(event.convergence.state==='Converged'){
              result.versions=event.versions;result.placements=event.placements;
            }
          }
          if(result.versions&&result.spans){clearTimeout(timer);accept(result);}
        }catch(e){clearTimeout(timer);reject(e);}
      });
      child.stdin.write(JSON.stringify({cmd:'spans',path:'main.tex'})+'\n');
    });
    return measured;
  }finally{
    child.stdin.end();
    await done;
    await fs.rm(root,{recursive:true,force:true});
  }
}

async function testDraftPixels(page){
  const result=await page.evaluate(async()=>{
    const {snapshotDraft}=await import('/src/ui/native-draft-ink.mjs');
    const {nativeEditMetrics}=await import('/src/ui/native-edit-metrics.mjs');
    const style=document.createElement('style');
    style.textContent='.native-pending-prose{position:absolute;inset:0}';
    document.head.append(style);
    const section=document.createElement('section');
    section.style.cssText='position:fixed;top:0;left:0;z-index:5;width:600px;';
    const block=document.createElement('p');
    Object.assign(block.style,{position:'absolute',left:'29px',top:'37px',width:'186px',font:'16px/24px serif',
      textAlign:'justify',whiteSpace:'pre-wrap',margin:'0'});
    block.append('A quick brown fox jumps over the lazy dog. ');
    const strong=document.createElement('strong');strong.textContent='First 中文';
    const em=document.createElement('em');em.textContent=' next words stay here.';
    block.append(strong,em,document.createElement('br'),'最后一行的字完整保留。');
    section.append(block);
    const sheets=[0,78].map(top=>{
      const element=document.createElement('div');
      element.style.cssText='position:absolute;left:0;width:600px;top:'+top+'px;height:'+(top?400:78)+'px;';
      section.append(element);return element;
    });
    document.body.append(section);
    function characters(roots){
      const out=[],range=document.createRange();
      for(const root of roots){
        const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
        let node;
        while((node=walker.nextNode()))for(let i=0;i<node.length;i++){
          const char=node.data[i];if(/\s/.test(char))continue;
          range.setStart(node,i);range.setEnd(node,i+1);
          const r=range.getBoundingClientRect();
          out.push({char,x:r.left,y:r.top});
        }
      }
      return out;
    }
    const before=characters([block]);
    const ink=snapshotDraft(block,sheets.map(element=>({element,box:element.getBoundingClientRect()})),nativeEditMetrics(document));
    const after=characters(ink);
    for(const group of ink)group.remove();
    block.textContent=('两端对齐的长段落，“中文和 Office” 都要保持字距。 ').repeat(45);
    block.style.width='510px';
    block.style.textIndent='2em';
    const plain=characters([block]);
    const plainInk=snapshotDraft(block,sheets.map(element=>({element,box:element.getBoundingClientRect()})),nativeEditMetrics(document));
    const plainAfter=characters(plainInk);
    const fragments=plainInk.reduce((count,group)=>count+group.childElementCount,0);
    const lines=new Set(plain.map(c=>c.y)).size;
    for(const group of plainInk)group.remove();
    const longMark=document.createElement('strong');
    longMark.textContent=block.textContent;block.replaceChildren('Paragraph before ',longMark,' and after.');
    const marked=characters([block]);
    const markedInk=snapshotDraft(block,sheets.map(element=>({element,box:element.getBoundingClientRect()})),nativeEditMetrics(document));
    const markedAfter=characters(markedInk);
    section.remove();style.remove();
    return {count:ink.length,text:after.map(c=>c.char).join(''),expected:before.map(c=>c.char).join(''),
      plainText:plainAfter.map(c=>c.char).join(''),plainExpected:plain.map(c=>c.char).join(''),fragments,lines,
      markedText:markedAfter.map(c=>c.char).join(''),markedExpected:marked.map(c=>c.char).join(''),
      dx:Math.max(...before.map((c,i)=>Math.abs(c.x-after[i]?.x)),...plain.map((c,i)=>Math.abs(c.x-plainAfter[i]?.x)),
        ...marked.map((c,i)=>Math.abs(c.x-markedAfter[i]?.x))),
      dy:Math.max(...before.map((c,i)=>Math.abs(c.y-after[i]?.y)),...plain.map((c,i)=>Math.abs(c.y-plainAfter[i]?.y)),
        ...marked.map((c,i)=>Math.abs(c.y-markedAfter[i]?.y)))};
  });
  assert.equal(result.count,2);
  assert.equal(result.text,result.expected);
  assert.equal(result.plainText,result.plainExpected);
  assert.equal(result.markedText,result.markedExpected);
  assert.ok(result.fragments<=result.lines,'Long justified text should paint once per visual line: '+
    JSON.stringify({fragments:result.fragments,lines:result.lines,dx:result.dx,dy:result.dy}));
  assert.ok(result.dx<1 && result.dy<1,'Intermediate ink moved while waiting for native layout '+JSON.stringify(result));
  console.log('Intermediate glyph origin displacement in CSS pixels',JSON.stringify({x:result.dx,y:result.dy}));
}

// Exercise the shipped editor entry point. The bridge transports real rtex
// display lists and recorded font resources. Editing, transactions, source
// snapshots and the DOM handoff all run through the production application.
async function testDesktopDocument(browser, origin, initial) {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[], events=[], fonts=new Map();
  let revision=0, liveSource='', published=null,holdUpdate=null;
  const seen=[],sources=new Map();
  async function paintedSourceAfter(previous){
    const number=await page.evaluate(()=>{
      const panel=document.querySelector('#native-tex-preview');
      return panel?.dataset.state==='current' ? Number(panel.querySelector('[data-native-page]')?.dataset.paintRevision) : 0;
    });
    return number>previous && sources.get(number)===liveSource ? liveSource : '';
  }
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.exposeFunction('nativeTestCommand',async(command,args={})=>{
      if(command==='native_tex_open'||command==='native_tex_update'){
        if(command==='native_tex_update' && holdUpdate)await holdUpdate;
        const next=++revision;
        liveSource=args.source;
        sources.set(next,args.source);
        const measured=liveSource===source?initial:await capture(liveSource);
        for(const p of Object.values(measured.pages))for(const f of Object.values(p.dl.fonts)){
          if(f.filename)fonts.set('file:'+f.filename+'#'+(f.subfont??0),f.filename);
        }
        events.push({event:'LayoutUpdate',versions:{...measured.versions,source_revision:next,layout_version:next},
          compile:{state:'Ok'},convergence:{state:'Converged'},placements:measured.placements,
          pages_total:Object.keys(measured.pages).length,pages_changed:Object.values(measured.pages)});
        published=measured;
        seen.push({command,next,paths:args.spanPaths,hasSource:liveSource.includes('Caption')});
        return {sessionId:'paper',sourceRevision:next,editId:next,routed:'background',sourceSpans:{'main.tex':measured.spans}};
      }
      if(command==='native_tex_poll')return events.splice(0);
      if(command==='native_tex_font'){
        const filename=fonts.get(args.key);
        assert.ok(filename,'Unregistered test font '+args.key);
        let actual=filename;
        if(!isAbsolute(actual)){
          const which=join(process.env.RTEX_TEXLIVE_BIN,process.platform==='win32'?'kpsewhich.exe':'kpsewhich');
          actual=execFileSync(which,[basename(filename)],{encoding:'utf8',windowsHide:true}).trim();
        }
        return [...await fs.readFile(actual)];
      }
      if(command==='native_tex_close')return;
      return null;
    });
    await page.addInitScript(()=>{
      localStorage.setItem('lineae.native-document-workspace','0');
      window.__LINEAE_DESKTOP_ENGINE_TOGGLE__=true;
      window.__TAURI__={core:{invoke:(name,args)=>window.nativeTestCommand(name,args)}};
    });
    let releaseEditor;
    const startup=new Promise(resolve=>{releaseEditor=resolve;});
    await page.route('**/editor.mjs',async route=>{await startup;await route.continue();},{times:1});
    await page.goto(origin,{waitUntil:'commit'});
    try{
      await page.locator('header .open').waitFor({state:'attached'});
      assert.equal(await page.locator('header .open').isVisible(),false,'The initial paint must not expose the unassembled File controls');
    }finally{releaseEditor();}
    await page.waitForLoadState('domcontentloaded');
    const doc=page.locator('.document-page .ProseMirror');
    await page.locator('input#file').setInputFiles({name:'coordinates.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
    await doc.getByText('Caption',{exact:true}).first().waitFor({state:'attached'});
    await page.locator('#native-tex-toggle').click();
    const sheet=page.locator('#native-tex-preview [data-native-page]').first();
    await sheet.locator('canvas').waitFor();
    assert.deepEqual(seen.find(f=>f.hasSource)?.paths,['main.tex'],'The production snapshot supplies source ownership');
    async function paperPoint(spelling, occurrence=0, glyphIndex=-1) {
      const bytes=Buffer.from(liveSource);
      const owner=published.spans.filter(span=>bytes.subarray(span.range.start,span.range.end).toString().trim()===spelling)[occurrence];
      assert.ok(owner,'No native source span for '+spelling);
      const frag=published.placements.find(p=>p.par_id===owner.id).fragments[0];
      const dl=published.pages[frag.page].dl;
      const row=dl.lines.find(l=>Math.abs(l.x-frag.xs[0])<=64&&Math.abs(l.y-frag.baselines[0])<=64);
      const glyph=row.items.filter(it=>it[0]==='g').at(glyphIndex);
      return page.locator('[data-native-page="'+frag.page+'"] canvas').evaluate((canvas,{x,y})=>{
        const box=canvas.getBoundingClientRect();
        return {x:box.left+x*box.width,y:box.top+y*box.height};
      },{x:(glyph[4]+.8*glyph[6])/dl.page_width,y:(glyph[5]-row.h/2)/dl.page_height});
    }
    const coords=await paperPoint('rj',1);
    await page.mouse.click(coords.x,coords.y);
    await page.locator('main.native-ink-confirmed').waitFor({state:'attached',timeout:15000});
    assert.equal(await doc.evaluate(el=>el===document.activeElement&&el.editor.state.selection.$from.parent.textContent),'rj');
    // ProseMirror can redraw a view without changing the document or sending
    // new TeX. Keep the caret at this occurrence of the repeated paragraph.
    const location=await doc.evaluate(el=>{
      const view=el.editor.view, before=view.state.doc, pos=view.state.selection.$head.before();
      const old=view.nodeDOM(pos), render=view.nodeViews.paragraph;
      view.setProps({nodeViews:{...view.props.nodeViews,paragraph:(...args)=>render?.(...args)}});
      view.focus();
      window.dispatchEvent(new Event('lineae-layout'));
      if(old.isConnected || before!==view.state.doc)throw Error('Expected a view-only paragraph redraw');
      return pos;
    });
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') && !document.querySelector('.native-draft-mask'));
    const firstOccurrence=await paperPoint('rj',0);
    await page.mouse.click(firstOccurrence.x,firstOccurrence.y);
    assert.notEqual(await doc.evaluate(el=>el.editor.state.selection.$head.before()),location);
    await page.mouse.click(coords.x,coords.y);
    assert.equal(await doc.evaluate(el=>el.editor.state.selection.$head.before()),location);
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    assert.equal(await doc.evaluate(el=>el.editor.state.selection.$from.parent.textContent),'rj!');
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await page.keyboard.type('rj');
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$from.parent.textContent==='rj',null,{timeout:60000});
    const match=/rj!(?:\s)+(?<edited>rj)(?=\s+2)/d.exec(liveSource);
    assert.ok(match,'The new rj and the following paragraph both survive source writeback');
    const start=Buffer.byteLength(liveSource.slice(0,match.indices.groups.edited[0]));
    const owner=published.spans.find(s=>s.range.start<=start&&s.range.end>=start+2);
    const fragment=published.placements.find(p=>p.par_id===owner.id).fragments.at(-1);
    const lastPage=published.pages[fragment.page].dl;
    const line=lastPage.lines.find(l=>Math.abs(l.x-fragment.xs.at(-1))<=64&&Math.abs(l.y-fragment.baselines.at(-1))<=64);
    const glyph=line.items.filter(it=>it[0]==='g').at(-1);
    const dom=await doc.evaluate((el,{number,x,y})=>{
      const view=el.editor.view,head=view.state.selection.$head,p=view.nodeDOM(head.before());
      const r=window.getSelection().getRangeAt(0).getBoundingClientRect(),style=getComputedStyle(p);
      const canvas=document.querySelector('[data-native-page="'+number+'"] canvas').getBoundingClientRect();
      const caret=document.querySelector('.native-rich-caret').getBoundingClientRect();
      const ctx=document.createElement('canvas').getContext('2d');
      ctx.font=style.fontStyle+' '+style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
      return {x:r.left-(canvas.left+x*canvas.width),nativeX:caret.left-(canvas.left+x*canvas.width),
        y:r.top+ctx.measureText('Mg').fontBoundingBoxAscent*(p.currentCSSZoom||1)-(canvas.top+y*canvas.height),
        nativeY:caret.top-(canvas.top+y*canvas.height),nativeHeight:caret.height,
        selection:[window.getSelection().focusNode.nodeName,window.getSelection().focusOffset,r.toJSON()],
        font:[ctx.font,ctx.measureText('Mg').fontBoundingBoxAscent,p.currentCSSZoom,style.lineHeight],
        page:el.closest('.document-page').getBoundingClientRect().toJSON(),
        caret:caret.toJSON(),expectedY:canvas.top+y*canvas.height,
        rows:[...el.querySelectorAll('p')].filter(n=>n.textContent==='rj!').length};
    },{number:fragment.page,x:(glyph[4]+glyph[6])/lastPage.page_width,y:glyph[5]/lastPage.page_height});
    assert.equal(dom.rows,1);
    assert.ok(Math.abs(dom.x)<2&&Math.abs(dom.nativeX)<2&&Math.abs(dom.y)<2,JSON.stringify(dom));
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});
    assert.ok(await doc.evaluate(el=>el.textContent.includes('rjzhong')&&!document.querySelector('main.native-ink-confirmed')&&el===document.activeElement));
    await cdp.send('Input.insertText',{text:'中'});
    await page.keyboard.type('x');
    assert.equal(await doc.evaluate(el=>el.editor.state.selection.$from.parent.textContent),'rj中x');
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$from.parent.textContent==='rj中x',null,{timeout:60000});
    assert.ok(Object.values(published.pages).some(p=>p.dl.lines.some(l=>l.items.some(it=>it[0]==='g'&&it[2]===0x4e2d))),
      'The committed Han character reaches real LuaLaTeX ink before the next edit');
    await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');
    assert.equal(await doc.evaluate(el=>el.editor.state.selection.$from.parent.textContent),'rj');
    const initialCount=await doc.evaluate(el=>[...el.querySelectorAll('p')].filter(p=>p.textContent==='rj').length);
    await page.keyboard.press('Enter');await page.keyboard.type('#');
    assert.equal(await doc.evaluate(el=>el.editor.state.selection.$from.parent.type.name),'heading');
    await page.keyboard.press('Enter');await page.keyboard.type('rj');
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$from.parent.textContent==='rj',null,{timeout:60000});
    assert.equal(await doc.evaluate(el=>[...el.querySelectorAll('p')].filter(p=>p.textContent==='rj').length),initialCount+1);
    assert.match(liveSource,/\\section\{\}\s+rj\s+2/);
    assert.equal(await page.locator('.native-rich-caret').count(),1);
    assert.equal(await page.locator('.native-pending-prose,.native-draft-mask').count(),0);
    const saved=liveSource;
    const currentDocument=await doc.evaluateHandle(el=>el.editor.state.doc);
    const beforeReload=revision;
    await page.locator('input#file').setInputFiles({name:'coordinates.tex',mimeType:'text/plain',buffer:Buffer.from(liveSource)});
    await page.waitForFunction(old=>document.querySelector('.document-page .ProseMirror').editor.state.doc!==old,currentDocument);
    await currentDocument.dispose();
    await page.waitForFunction(rev=>{const panel=document.querySelector('#native-tex-preview');
      return panel.dataset.state==='current'&&Number(panel.querySelector('[data-native-page]')?.dataset.paintRevision)>rev;
    },beforeReload,{timeout:60000});
    assert.equal(seen.at(-1).command,'native_tex_open','Opening a file creates an isolated host session');
    assert.equal(liveSource,saved,'Reopened source matches the saved bytes');
    const restored=await paperPoint('rj!');
    await page.mouse.click(restored.x,restored.y);
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$from.parent.textContent==='rj!',null,{timeout:15000});
    const beforeModeSwitch=revision;
    await page.locator('[data-source-mode=split]').click();
    await page.locator('.tex-preview[data-native=true]').waitFor({state:'attached'});
    await page.locator('[data-source-mode=body]').click();
    const again=await paperPoint('rj!');
    await page.mouse.click(again.x,again.y);
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$from.parent.textContent==='rj!',null,{timeout:15000});
    assert.equal(revision,beforeModeSwitch,'View changes reuse the native frame for unchanged source');
    await page.keyboard.press('End');
    await page.keyboard.type(' alpha beta');
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$from.parent.textContent==='rj! alpha beta',null,{timeout:60000});
    await expect.poll(()=>paintedSourceAfter(beforeModeSwitch),{timeout:60000}).toContain('rj! alpha beta');
    const beforeSplitSource=await paintedSourceAfter(beforeModeSwitch);
    const beforeSplitDoc=await doc.evaluate(el=>JSON.stringify(el.editor.state.doc.toJSON()));
    for(let i=0;i<5;i++)await page.keyboard.press('ArrowLeft');
    let release;
    holdUpdate=new Promise(resolve=>{release=resolve;});
    try{
      await page.keyboard.press('Enter');
      await page.keyboard.type('X');
      await cdp.send('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});
      assert.ok(await doc.evaluate(el=>el.textContent.includes('Xzhong beta')&&el===document.activeElement));
      await cdp.send('Input.insertText',{text:'中'});
      await page.keyboard.type('Y');
      const at=await doc.evaluate(el=>{
        const head=el.editor.state.selection.$head;
        return [head.nodeBefore?.textContent,head.nodeAfter?.textContent,head.parent.textContent,
          el.editor.state.doc.child(head.index(0)-1).textContent];
      });
      assert.deepEqual(at,['X中Y',' beta','X中Y beta','rj! alpha']);
      const held=page.locator('.native-pending-prose').filter({hasText:'rj! alpha'});
      await held.waitFor();
      const row=await held.locator('span').filter({hasText:'rj!'}).first().boundingBox();
      assert.ok(row?.width>0 && row.height>0,'The split prefix has ink while native layout is held');
    }finally{holdUpdate=null;release();}
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      !document.querySelector('.native-pending-prose') &&
      document.querySelector('.ProseMirror').editor.state.selection.$head.parent.textContent==='X中Y beta',null,{timeout:60000});
    assert.match(liveSource,/rj! alpha\s+X中Y beta/);
    const beforeUndo=liveSource;
    const typedRevision=revision;
    let undos=0;
    while(undos<8 && await doc.evaluate(el=>JSON.stringify(el.editor.state.doc.toJSON()))!==beforeSplitDoc){
      await page.keyboard.press('ControlOrMeta+z');
      undos++;
    }
    assert.ok(undos>0);
    assert.equal(await doc.evaluate(el=>JSON.stringify(el.editor.state.doc.toJSON())),beforeSplitDoc);
    await expect.poll(()=>paintedSourceAfter(typedRevision),{timeout:60000,
      message:'Undo restores the original source bytes, including paragraph separators'}).toBe(beforeSplitSource);
    const undoneRevision=revision;
    for(let i=0;i<undos;i++)await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(()=>paintedSourceAfter(undoneRevision),{timeout:60000,
      message:'Redo restores the same split paragraph and exact source bytes'}).toBe(beforeUndo);
    assert.ok(await doc.evaluate(el=>el.editor.state.doc.textContent.includes('X中Y beta')));
    assert.equal(liveSource,beforeUndo,'Redo must recover the same split paragraph and exact TeX bytes');
    const wrapped='alpha beta\r\n  gamma \\emph{two words} end';
    const file=['\\documentclass{article}','\\usepackage[fontset=fandol]{ctex}','\\begin{document}',
      wrapped,'','neighbor','\\end{document}',''].join('\r\n');
    const oldRevision=revision;
    await page.locator('input#file').setInputFiles({name:'wrapped.tex',mimeType:'text/plain',buffer:Buffer.from(file)});
    await page.waitForFunction(old=>document.querySelector('#native-tex-preview')?.dataset.state==='current' &&
      Number(document.querySelector('[data-native-page]')?.dataset.paintRevision)>old,oldRevision,{timeout:60000});
    const word=await paperPoint(wrapped,0,4);
    await page.mouse.click(word.x,word.y);
    assert.equal(await doc.evaluate(el=>el.hasAttribute('data-native-ctex')),true,
      'An imported explicit Fandol article uses the native paragraph baseline and indent during editing');
    assert.deepEqual(await doc.evaluate(el=>{
      const head=el.editor.state.selection.$head;
      return [head.parent.textContent,head.parentOffset];
    }),
      ['alpha beta gamma two words end',5]);
    const beforeWrappedBreak=revision;
    await page.keyboard.press('Enter');
    await expect.poll(()=>paintedSourceAfter(beforeWrappedBreak),{timeout:60000,
      message:'Enter alone preserves the original physical lines and inserts a paragraph separator'}).toBe(
        file.replace('alpha beta','alpha\r\n\r\n beta'));
    await page.keyboard.type('X');
    await cdp.send('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});
    await cdp.send('Input.insertText',{text:'中'});await page.keyboard.type('Y');
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$head.parent.textContent==='X中Y beta gamma two words end',null,{timeout:60000});
    assert.equal(liveSource,file.replace('alpha beta','alpha\r\n\r\nX中Y beta'),'Physical source lines and original emphasis survive a typed split');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    assert.deepEqual(await doc.evaluate(el=>{
      const { $anchor,$head }=el.editor.state.selection;
      return [$anchor.parentOffset,$head.parentOffset,$head.parent.textContent];
    }),['X中Y beta gamma two words end'.length,0,'X中Y beta gamma two words end']);
    assert.deepEqual(errors,[]);
    console.log('PASS: shipped Lua document, repeated Enter, caret X/Y, CJK preedit/commit, and split-prefix ink through a delayed native frame');
  }catch(error){
    console.error('Hybrid replay',JSON.stringify({seen,body:liveSource.slice(liveSource.indexOf('Caption')-12,liveSource.indexOf('Caption')+112),
      spans:published?.spans?.map(s=>[s.id,s.range.start,s.range.end]),
      editor:await page.evaluate(()=>{
        const el=document.querySelector('.document-page .ProseMirror'),preview=document.querySelector('#native-tex-preview');
        return {selection:el?.editor?.state.selection.toJSON(),confirmed:Boolean(document.querySelector('main.native-ink-confirmed')),
          pending:[...document.querySelectorAll('.native-pending-prose')].map(row=>row.textContent.slice(0,24)),paragraphs:[...el?.querySelectorAll('h1,p')??[]].slice(0,16).map(p=>p.textContent.slice(0,22)),
          focus:document.activeElement?.className,state:preview?.dataset.state,fallback:preview?.dataset.fallbackReason,message:preview?.querySelector('[role=status]')?.textContent,
          paints:[...preview?.querySelectorAll('[data-native-page]')??[]].map(p=>p.dataset.paintRevision)};
      }).catch(()=>null),errors}));
    throw error;
  }finally{await page.close();}
}

(async()=>{
  const captured=await capture();
  assert.ok(Object.keys(captured.pages).length>=3,'Real paragraph must wrap across pages');
  const web=resolve('apps/web');
  const server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/harness'){
      return res.setHeader('Content-Type','text/html').end('<style>body{margin:0}main,aside{position:fixed;inset:0;overflow:auto}.document-page{width:700px;translate:var(--native-edit-shift,0 0)}p,h1{font:18px/26px serif;margin:0}.sheet{width:560px;position:relative;margin:0 auto}canvas{width:100%;height:100%;display:block}.native-rich-caret{position:absolute}main.native-ink-confirmed{opacity:0}</style><aside></aside><main><div class="document-page"><article contenteditable></article></div></main>');
    }
    const path=resolve(web,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(web+sep))return res.writeHead(404).end();
    try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.otf':'font/otf','.woff2':'font/woff2'})[extname(path)]??'application/octet-stream');res.end(await fs.readFile(pathname==='/editor.mjs'&&process.env.LINEAE_TEST_BUNDLE?process.env.LINEAE_TEST_BUNDLE:path));}
    catch{res.writeHead(404).end();}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  let browser;
  try {
    browser=await chromium.launch(process.env.LINEAE_EDGE==='1'?{channel:'msedge'}:{});
    const page=await browser.newPage({viewport:{width:900,height:850}});
    await page.goto('http://127.0.0.1:'+server.address().port+'/harness');
    const result=await page.evaluate(async({captured,source,raw})=>{
      const {bindRichSpans}=await import('/src/typesetting/rtex/rich-source-map.mjs');
      const {paragraphFrame,paragraphHit}=await import('/src/typesetting/rtex/paragraph-geometry.mjs');
      const {nativeParagraphOverlay}=await import('/src/ui/native-paragraph-overlay.mjs');
      const pages=new Map(Object.entries(captured.pages).map(([n,p])=>[+n,p]));
      const panel=document.querySelector('aside'),editor=document.querySelector('article');
      for(const [n,page] of pages){
        const parent=document.createElement('div');parent.className='sheet';
        parent.dataset.nativePage=n;parent.dataset.paintRevision=captured.versions.source_revision;
        parent.style.height=560*page.dl.page_height/page.dl.page_width+'px';
        parent.append(document.createElement('canvas'));panel.append(parent);
      }
      let offset=source.indexOf(raw[0]);
      const entries=[];
      for(const value of raw){
        const index=source.indexOf(value,offset),start=new TextEncoder().encode(source.slice(0,index)).length;
        offset=index+value.length+4;
        if(value==='\\newpage')continue;
        const el=document.createElement(value.startsWith('\\section')?'h1':'p');
        el.textContent=value.replace(/\\(?:section|textbf)\{([^}]*)\}/g,'$1').trimEnd();
        if(el.tagName==='H1')el.dataset.sectionNumber='1';
        if(!el.textContent)el.append(document.createElement('br'));
        editor.append(el);
        if(value)entries.push({element:el,text:el.textContent,heading:el.tagName==='H1',start,end:start+new TextEncoder().encode(value.trimEnd()).length});
      }
      const owners=bindRichSpans(new Map([['main.tex',entries]]),{'main.tex':captured.spans});
      const frame=paragraphFrame(captured,pages,owners);
      const overlay=nativeParagraphOverlay(editor,panel,panel,()=>false);
      overlay.present(frame,captured.versions.source_revision);
      const results=[];
      for(const zoom of [1,1.22,1.34]){
        document.querySelector('.document-page').style.zoom=zoom;
        for(const sheet of panel.children){
          const dl=pages.get(+sheet.dataset.nativePage).dl;
          sheet.style.width=560*zoom+'px';sheet.style.height=560*zoom*dl.page_height/dl.page_width+'px';
        }
        for(const e of entries){
          const p=frame.byElement.get(e.element);
          if(!p?.stops?.has(e.text.length))throw Error('No terminal stop for '+e.text.slice(0,50)+' '+JSON.stringify([p?.rows.length,p?.rows.flatMap(r=>r.glyphs).slice(0,12)]));
          const stop=p.stops.get(e.text.length);
          const sheet=panel.querySelector('[data-native-page="'+stop.row.page+'"]');
          panel.scrollTop=sheet.offsetTop;
          editor.focus({preventScroll:true});
          document.getSelection().collapse(e.element.firstChild,e.text.length);
          overlay.begin(stop.row.page);overlay.reveal(e.element);
          const caret=sheet.querySelector('.native-rich-caret');
          if(!caret)throw Error('No confirmed caret '+e.text.slice(0,24));
          const pos=()=>{const b=sheet.querySelector('canvas').getBoundingClientRect(),c=caret.getBoundingClientRect();
            return Math.abs(c.left-(b.left+b.width*stop.x));};
          function editingPoint(){
            const range=document.getSelection().getRangeAt(0);
            const rect=range.getBoundingClientRect(),box=sheet.querySelector('canvas').getBoundingClientRect();
            const ctx=document.createElement('canvas').getContext('2d'),style=getComputedStyle(e.element);
            ctx.font=style.fontStyle+' '+style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
            return Math.max(Math.abs(rect.left-box.left-box.width*stop.x),
              Math.abs(rect.top+ctx.measureText('Mg').fontBoundingBoxAscent*zoom-box.top-box.height*stop.y));
          }
          const error=Math.max(pos(),editingPoint());
          for(let i=0;i<8;i++)overlay.present(frame,captured.versions.source_revision);
          const hit=paragraphHit(frame,stop.row.page,stop.x,stop.y);
          results.push({text:e.text.slice(0,12),pages:new Set(p.rows.map(r=>r.page)).size,page:stop.row.page,
            baseline:stop.y,error:Math.max(error,pos(),editingPoint()),hit:hit?.element===e.element&&hit.offset===e.text.length});
        }
      }
      const last=entries.at(-1),lastFrame=frame.byElement.get(last.element);
      // The first Han commit can enable ctex while an adjacent paragraph is
      // still waiting for its first native box. Its column must survive that
      // change independently of the former 15pt indentation.
      const pending=document.createElement('p');
      pending.textContent='NEW';pending.style.textIndent='15px';
      last.element.after(pending);
      document.getSelection().collapse(pending.firstChild,3);
      overlay.painted();
      const startX=()=>{
        const range=document.createRange();range.setStart(pending.firstChild,0);range.collapse(true);
        return range.getBoundingClientRect().left;
      };
      const scale=document.querySelector('.document-page').currentCSSZoom;
      const firstX=startX();
      pending.style.textIndent='23px';
      overlay.painted();
      const indentError=Math.abs(startX()-firstX-8*scale);
      pending.remove();
      document.getSelection().collapse(last.element.firstChild,last.text.length);
      overlay.reveal(last.element);
      last.element.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertCompositionText'}));
      last.element.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
      last.element.firstChild.appendData('zhong');
      document.getSelection().collapse(last.element.firstChild,last.element.firstChild.length);
      overlay.present(frame,captured.versions.source_revision);
      const composing=!document.querySelector('.native-rich-caret')&&document.activeElement===editor&&
        panel.querySelectorAll('.native-draft-mask').length===lastFrame.rows.length;
      last.element.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
      // A frame for which the page has no pixels must not draw a confirmed caret.
      overlay.present(frame,captured.versions.source_revision+1);
      return {results,composing,indentError,staleCaret:Boolean(document.querySelector('.native-rich-caret'))};
    },{captured,source,raw});
    assert.ok(result.results.every(r=>r.hit&&r.error<1),JSON.stringify(result));
    assert.ok(result.results.some(r=>r.pages>1));
    assert.equal(new Set(result.results.filter(r=>r.text==='rj').map(r=>r.page+'/'+r.baseline)).size,3);
    assert.equal(new Set(result.results.filter(r=>r.text==='2').map(r=>r.baseline)).size,2);
    assert.ok(result.composing);assert.equal(result.staleCaret,false);
    assert.ok(result.indentError<.1,'Pending first line used its previous indent: '+result.indentError);
    await testDraftPixels(page);
    if(process.argv.includes('--app'))await testDesktopDocument(browser,'http://127.0.0.1:'+server.address().port,captured);
    console.log('PASS: actual LuaLaTeX spans, repeated lines and empty paragraphs, marks, wraps and page crossings, native caret X, IME, stale frames');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
})().catch(error=>{console.error(error);process.exitCode=1;});
