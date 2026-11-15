import test from 'node:test';
import assert from 'node:assert/strict';
import {composeProject,projectDocumentEdits} from '../apps/web/src/project/include-document.mjs';
function fixture(entries){
  const files=new Map(entries.map(([path,draft],i)=>[path,{id:String(i),path,draft,kind:'tex'}]));
  return {files,file:id=>[...files.values()].find(f=>f.id===id)};
}
test('continuous includes keep source intervals and edits in their own files',()=>{
  const root='\\documentclass{article}\n\\begin{document}\nFirst.\n\n\\input{a}\n\nLast.\n\\end{document}\n';
  const p=fixture([['main.tex',root],['a.tex','Child.\n']]);
  const c=composeProject(p,'0');
  assert.deepEqual(c.issues,[]);
  assert.equal(c.regions.length,3);
  assert.deepEqual(c.regions.map(r=>r.path),['main.tex','a.tex','main.tex']);
  const doc=structuredClone({content:c.content});
  doc.content[1].content[0].content[0].text='Edited.';
  const changes=projectDocumentEdits(c,doc);
  assert.ok(changes);
  assert.equal(changes.get('0'),root);
  assert.equal(changes.get('1'),'Edited.\n');
  assert.equal(projectDocumentEdits(c,{content:doc.content.slice(1)}),null);
});
test('cyclic and repeated includes are diagnosed before exposing an editable projection',()=>{
  const p=fixture([['main.tex','\\input{a}\n\\input{a}'],['a.tex','\\input{main}']]);
  const c=composeProject(p,'0');
  assert.ok(c.issues.some(s=>s.startsWith('Cycle:')));
  assert.ok(c.issues.some(s=>s.startsWith('Repeated include:')));
});
test('missing includes are retained in authoritative source and diagnosed',()=>{
  const p=fixture([['main.tex','before\n\\input{missing}\nafter']]);
  const c=composeProject(p,'0');
  assert.ok(c.issues.length);
  assert.equal(c.sources.get('0'),p.file('0').draft);
});
