const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs/promises');
const {createServer}=require('node:http');
const {tmpdir}=require('node:os');
const {join,resolve,sep,extname,isAbsolute,basename}=require('node:path');
const {createInterface}=require('node:readline');
const {chromium}=require('playwright');

const paragraph='Office first, multiple words and \\textbf{bold words}, followed by enough ordinary text to occupy several lines. ';
const raw=['\\section{Caption}','rj','rj','2','','','','2',paragraph.repeat(13),'\\newpage','rj'];
const source=['\\documentclass{article}','% UTF-8 source offsets: 中文𠮷','\\usepackage{fontspec}','\\setmainfont{Latin Modern Roman}','\\usepackage[paperwidth=5in,paperheight=4in,margin=.65in]{geometry}',
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

// Exercise the shipped editor entry point. The bridge transports real rtex
// display lists and recorded font resources. Editing, transactions, source
// snapshots and the DOM handoff all run through the production application.
async function testDesktopDocument(browser, origin, initial) {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[], events=[], fonts=new Map();
  let revision=0, liveSource='', published=null;
  const seen=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.exposeFunction('nativeTestCommand',async(command,args={})=>{
      if(command==='native_tex_open'||command==='native_tex_update'){
        const next=++revision;
        liveSource=args.source;
        const measured=liveSource===source?initial:await capture(liveSource);
        for(const p of Object.values(measured.pages))for(const f of Object.values(p.dl.fonts)){
          if(f.filename)fonts.set('file:'+f.filename+'#'+(f.subfont??0),f.filename);
        }
        events.push({event:'LayoutUpdate',versions:{...measured.versions,source_revision:next,layout_version:next},
          compile:{state:'Ok'},convergence:{state:'Converged'},placements:measured.placements,
          pages_total:Object.keys(measured.pages).length,pages_changed:Object.values(measured.pages)});
        published=measured;
        seen.push({next,paths:args.spanPaths,hasSource:liveSource.includes('Caption')});
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
    await page.goto(origin);
    const doc=page.locator('.document-page .ProseMirror');
    await page.locator('input#file').setInputFiles({name:'coordinates.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
    await doc.getByText('Caption',{exact:true}).first().waitFor({state:'attached'});
    await page.locator('#native-tex-toggle').click();
    const sheet=page.locator('#native-tex-preview [data-native-page]').first();
    await sheet.locator('canvas').waitFor();
    assert.deepEqual(seen.find(f=>f.hasSource)?.paths,['main.tex'],'The production snapshot supplies source ownership');
    async function paperPoint(spelling, occurrence=0) {
      const bytes=Buffer.from(liveSource);
      const owner=published.spans.filter(span=>bytes.subarray(span.range.start,span.range.end).toString().trim()===spelling)[occurrence];
      assert.ok(owner,'No native source span for '+spelling);
      const frag=published.placements.find(p=>p.par_id===owner.id).fragments[0];
      const dl=published.pages[frag.page].dl;
      const row=dl.lines.find(l=>Math.abs(l.x-frag.xs[0])<=64&&Math.abs(l.y-frag.baselines[0])<=64);
      const last=row.items.filter(it=>it[0]==='g').at(-1);
      return page.locator('[data-native-page="'+frag.page+'"] canvas').evaluate((canvas,{x,y})=>{
        const box=canvas.getBoundingClientRect();
        return {x:box.left+x*box.width,y:box.top+y*box.height};
      },{x:(last[4]+.8*last[6])/dl.page_width,y:(last[5]-row.h/2)/dl.page_height});
    }
    const coords=await paperPoint('rj',1);
    await page.mouse.click(coords.x,coords.y);
    await page.locator('main.native-ink-confirmed').waitFor({state:'attached',timeout:15000});
    assert.equal(await doc.evaluate(el=>el===document.activeElement&&el.editor.state.selection.$from.parent.textContent),'rj');
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
    const currentDocument=await doc.evaluateHandle(el=>el.editor.state.doc);
    const beforeReload=revision;
    await page.locator('input#file').setInputFiles({name:'coordinates.tex',mimeType:'text/plain',buffer:Buffer.from(liveSource)});
    await page.waitForFunction(old=>document.querySelector('.document-page .ProseMirror').editor.state.doc!==old,currentDocument);
    await currentDocument.dispose();
    const restored=await paperPoint('rj!');
    await page.mouse.click(restored.x,restored.y);
    await page.waitForFunction(()=>document.querySelector('main.native-ink-confirmed') &&
      document.querySelector('.ProseMirror').editor.state.selection.$from.parent.textContent==='rj!',null,{timeout:15000});
    assert.equal(revision,beforeReload,'Reopening identical bytes reuses the confirmed Lua frame');
    assert.deepEqual(errors,[]);
    console.log('PASS: shipped Lua document, click duplicate by native coordinates, typing, repeated Enter, caret X/Y and CJK preedit/commit');
  }catch(error){
    console.error('Hybrid replay',JSON.stringify({seen,body:liveSource.slice(liveSource.indexOf('Caption')-12,liveSource.indexOf('Caption')+112),
      spans:published?.spans?.map(s=>[s.id,s.range.start,s.range.end]),
      editor:await page.evaluate(()=>{
        const el=document.querySelector('.document-page .ProseMirror'),preview=document.querySelector('#native-tex-preview');
        return {selection:el?.editor?.state.selection.toJSON(),paragraphs:[...el?.querySelectorAll('h1,p')??[]].slice(0,16).map(p=>p.textContent.slice(0,22)),
          focus:document.activeElement?.className,state:preview?.dataset.state,message:preview?.querySelector('[role=status]')?.textContent,
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
      return {results,composing,staleCaret:Boolean(document.querySelector('.native-rich-caret'))};
    },{captured,source,raw});
    assert.ok(result.results.every(r=>r.hit&&r.error<1),JSON.stringify(result));
    assert.ok(result.results.some(r=>r.pages>1));
    assert.equal(new Set(result.results.filter(r=>r.text==='rj').map(r=>r.page+'/'+r.baseline)).size,3);
    assert.equal(new Set(result.results.filter(r=>r.text==='2').map(r=>r.baseline)).size,2);
    assert.ok(result.composing);assert.equal(result.staleCaret,false);
    if(process.argv.includes('--app'))await testDesktopDocument(browser,'http://127.0.0.1:'+server.address().port,captured);
    console.log('PASS: actual LuaLaTeX spans, repeated lines and empty paragraphs, marks, wraps and page crossings, native caret X, IME, stale frames');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
})().catch(error=>{console.error(error);process.exitCode=1;});
