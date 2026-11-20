const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {build}=require('esbuild');
const entries=JSON.parse(readFileSync(__dirname+'/fixtures/academic-text-environments.json','utf8')).environments;
module.exports=async function(context,url){
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.setViewportSize({width:1440,height:1000});await page.goto(url);
    const bundle=await build({stdin:{contents:"export {DOMParser} from '@tiptap/pm/model';export {serialize} from './apps/web/src/editor/latex-codec.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'environmentFixture',write:false});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const wrap=body=>'\\begin{document}\r\nBefore.\n\n'+body+'\r\n\nAfter.\n\\end{document}\r\n';
    const source=wrap(entries.map(e=>e.source).join('\r\n\n'));
    const open=async(text=source)=>{await page.locator('input[type=file]').setInputFiles({name:'paper-environments.tex',mimeType:'text/plain',buffer:Buffer.from(text)});await page.locator('[data-source-mode=split]').click();};
    const read=async()=>{await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.environmentCopy=text;};});await page.locator('.tex-actions button').nth(2).click();return page.evaluate(()=>window.environmentCopy);};
    await open();
    assert.equal(await page.locator('blockquote[data-latex-environment=abstract] > p').count(),7);
    assert.equal(await page.locator('blockquote[data-latex-environment=center] strong').count(),1);assert.equal(await read(),source);
    assert.equal(await page.locator('blockquote[data-latex-environment=center] p').evaluate(el=>getComputedStyle(el).textAlign),'center');
    assert.equal(await page.locator('blockquote[data-latex-environment=center]').evaluate(el=>getComputedStyle(el).borderLeftWidth),'0px');
    console.log('text environments browser: PASS real paper abstract paragraphs, center formatting and exact source');
    const restored=await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor,div=document.createElement('div');div.innerHTML=editor.getHTML();
      return environmentFixture.DOMParser.fromSchema(editor.schema).parse(div).toJSON().content.filter(n=>n.type==='blockquote').map(n=>({source:environmentFixture.serialize(n),name:n.attrs.latexEnvironment}));
    });
    assert.deepEqual(restored.map(e=>e.name),entries.map(e=>e.environment));assert.deepEqual(restored.map(e=>e.source.trim()),entries.map(e=>e.source));
    console.log('text environments browser: PASS HTML roundtrip retains zihao, setlength, par and math');
    const simple=wrap('\\begin{abstract}\r\n\\setlength{\\parskip}{.6em}\n\\zihao{5}\r\nFirst \\textbf{bold}.\\par\r\n\\unknown{keep}\n\\begin{center}Inside.\\end{center}\n\\end{abstract}');
    for(const mode of ['split','body']){
      await open(simple);await page.locator('[data-source-mode='+mode+']').click();
      await page.locator('.ProseMirror').evaluate(el=>{
        const editor=el.editor;let pos;
        editor.state.doc.descendants((node,p)=>{if(node.isText&&node.text==='First ')pos=p;});
        editor.view.dispatch(editor.state.tr.insertText('Edited ',pos,pos+6));
      });
      await page.locator('[data-source-mode=source]').click();assert.equal(await read(),simple.replace('First ','Edited '));
      await page.locator('.cm-content').focus();await page.keyboard.press('Control+z');assert.equal(await read(),simple);
    }
    console.log('text environments browser: PASS Document/Split paragraph edit and undo preserve layout and Raw children');
    await open(simple);await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor;let pos;editor.state.doc.descendants((node,p)=>{if(node.isText&&node.text==='Inside.')pos=p;});
      editor.view.dispatch(editor.state.tr.insertText('Changed.',pos,pos+7));
    });assert.equal(await read(),simple.replace('Inside.','Changed.'));
    console.log('text environments browser: PASS nested center edit retains both wrappers');
    await open(simple);await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor;let from,to;editor.state.doc.descendants((node,p)=>{if(node.type.name==='raw'){from=p;to=p+node.nodeSize;}});
      editor.view.dispatch(editor.state.tr.delete(from,to));
    });assert.equal(await read(),simple);assert.equal(await page.locator('pre[data-raw]').count(),1);
    console.log('text environments browser: PASS accidental opaque child deletion is rejected');
    await open();await page.locator('[data-source-mode=body]').click();await page.locator('.ProseMirror').evaluate(el=>el.editor.view.dispatch(el.editor.state.tr.insertText('Edited.',1,8)));
    await page.locator('[data-source-mode=source]').click();assert.equal(await read(),source.replace('Before.','Edited.'));assert.deepEqual(errors,[]);
    console.log('text environments browser: PASS neighboring edit retains complete paper environments');
  }finally{await page.close();}
};
