const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {build}=require('esbuild');
const references=JSON.parse(readFileSync(__dirname+'/fixtures/academic-references.json','utf8')).references;
const figures=JSON.parse(readFileSync(__dirname+'/fixtures/academic-figures.json','utf8')).figures;
module.exports=async function(context,url){
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.setViewportSize({width:1440,height:1000});await page.goto(url);
    const bundle=await build({stdin:{contents:"export {DOMParser} from '@tiptap/pm/model';export {serialize} from './apps/web/src/editor/latex-codec.js';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'referenceFixture',write:false});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const source='\\begin{document}\r\nBefore.\n\n'+references.map(r=>r.source).join(' ')+'\n\n'+
      '\\section{Target}\r\n% label note\n\\label{sec:target}\n\n'+figures.map(f=>f.source).join('\r\n\n')+'\n\n'+
      '\\begin{table}[H]\\caption{Table target}\\label{tab:target}\\begin{tblr}{X}A\\end{tblr}\\end{table}\n\n'+
      'See \\autoref{tab:target}, \\ref{sec:target}, \\pageref{sec:target}, \\autoref{absent}, \\cite[see][p.~2]{missing}. \\label % alias\r\n{tab:alias}\n\\end{document}\r\n';
    const open=async(text=source)=>{await page.locator('input[type=file]').setInputFiles({name:'paper-references.tex',mimeType:'text/plain',buffer:Buffer.from(text)});await page.locator('[data-source-mode=split]').click();};
    const read=async()=>{await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.referenceCopy=text;};});await page.locator('.tex-actions button').nth(2).click();return page.evaluate(()=>window.referenceCopy);};
    await open();assert.equal(await read(),source);
    for(const ref of references.filter(r=>r.command==='autoref')){
      const node=page.locator('[data-ref-view="'+ref.key+'"]').first();assert.equal(await node.getAttribute('data-reference-state'),'resolved');
      assert.ok((await node.textContent()).endsWith(' '+(figures.findIndex(f=>f.label===ref.key)+1)));
      assert.equal(await node.getAttribute('data-tooltip'),ref.source);
    }
    assert.equal(await page.locator('[data-ref-view="tab:target"]').getAttribute('data-reference-state'),'resolved');
    assert.deepEqual(await page.locator('[data-ref-view="sec:target"]').allTextContents(),['1','?']);
    assert.equal(await page.locator('[data-ref-view="sec:target"]').last().getAttribute('data-reference-state'),'page-unavailable');
    assert.equal(await page.locator('[data-ref-view=absent]').getAttribute('data-reference-state'),'missing');
    assert.equal(await page.locator('[data-cite-view=synthetic-demo-citation]').getAttribute('data-reference-state'),'missing');
    const missingColor=await page.locator('[data-cite-view=synthetic-demo-citation]').evaluate(el=>getComputedStyle(el).color);
    console.log('references browser: PASS 12 synthetic autoref + 1 cite, target numbers and unresolved/page states');
    const restored=await page.locator('.ProseMirror').evaluate(el=>{
      const editor=el.editor,div=document.createElement('div');div.innerHTML=editor.getHTML();
      const parsed=referenceFixture.DOMParser.fromSchema(editor.schema).parse(div).toJSON();
      const atoms=[];const walk=n=>{if(['ref','cite','label'].includes(n.type))atoms.push(referenceFixture.serialize(n));for(const c of n.content??[])walk(c);};walk(parsed);
      return {atoms,heading:parsed.content.find(n=>n.type==='heading')};
    });
    assert.deepEqual(restored.atoms.slice(0,13),references.map(r=>r.source));
    assert.equal(restored.atoms.at(-1),'\\label % alias\r\n{tab:alias}');
    assert.equal(restored.heading.attrs.label,'sec:target');assert.ok(restored.heading.attrs.labelSource.includes('% label note'));
    console.log('references browser: PASS HTML source commands and multiline heading label roundtrip');
    await page.locator('[data-source-mode=body]').click();
    for(const [key,type] of [['fig:demo-1','documentImage'],['tab:target','table'],['sec:target','heading']]){
      await page.locator('[data-ref-view="'+key+'"]').first().dispatchEvent('mousedown',{ctrlKey:true,bubbles:true,cancelable:true});
      const selected=await page.locator('.ProseMirror').evaluate(el=>{
        const selection=el.editor.state.selection,ancestors=[];
        if(selection.node)ancestors.push({type:selection.node.type.name,label:selection.node.attrs.label});
        for(let d=selection.$from.depth;d>0;d--){const node=selection.$from.node(d);ancestors.push({type:node.type.name,label:node.attrs.label});}
        return ancestors;
      });assert.ok(selected.some(n=>n.type===type&&n.label===key));
    }
    console.log('references browser: PASS Ctrl-click navigates to heading, figure and table');
    const plain='\\begin{document}\r\nBefore.\n\nRead \\autoref* % keep\r\n{missing} and \\cite[see][p.~2]{known, missing}.\n\nAfter.\n\\end{document}\r\n';
    for(const mode of ['split','body']){
      await open(plain);await page.locator('[data-source-mode='+mode+']').click();
      await page.locator('.ProseMirror').evaluate(el=>el.editor.view.dispatch(el.editor.state.tr.insertText('Edited.',1,8)));
      await page.locator('[data-source-mode=source]').click();assert.equal(await read(),plain.replace('Before.','Edited.'));
      await page.locator('.cm-content').focus();await page.keyboard.press('Control+z');assert.equal(await read(),plain);
    }
    console.log('references browser: PASS Document/Split edits and undo preserve comments, options and keys');
    const {writeBibliographyMetadata}=await import('../apps/web/src/editor/project-assets.js');
    const bib='@article{synthetic-demo-citation,title={Explicit test bibliography},author={Tester},year={2026}}';
    const withBib=writeBibliographyMetadata(source,{sources:[{path:'refs.bib',sourceText:bib}],choices:[]});
    await open(withBib);
    assert.equal(await page.locator('[data-cite-view=synthetic-demo-citation]').getAttribute('data-reference-state'),'resolved');
    assert.notEqual(await page.locator('[data-cite-view=synthetic-demo-citation]').evaluate(el=>getComputedStyle(el).color),missingColor,'missing citations must have a visible state');
    assert.match(await page.locator('[data-cite-view=synthetic-demo-citation]').getAttribute('data-tooltip'),/Explicit test bibliography/);
    assert.equal(await page.locator('[data-cite-view=missing]').getAttribute('data-reference-state'),'missing');assert.equal(await read(),withBib);
    await open();assert.equal(await page.locator('[data-cite-view=synthetic-demo-citation]').getAttribute('data-reference-state'),'missing');
    assert.deepEqual(errors,[]);
    console.log('references browser: PASS existing BibTeX restore resolves known key and clears on next document');
  }finally{await page.close();}
};
