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

test('continuation after a final input belongs to the parent with a real paragraph break',()=>{
  for(const eol of ['\n','\r\n']){
    const root=['\\documentclass{article}','\\begin{document}','Root.','','\\input{child}','\\end{document}',''].join(eol);
    const p=fixture([['main.tex',root],['child.tex','Child.'+eol]]),c=composeProject(p,'0');
    assert.equal(c.regions.at(-1).continuation,true);
    const doc=structuredClone({content:c.content});doc.content.at(-1).content=[{type:'paragraph',content:[{type:'text',text:'Parent continuation.'}]}];
    const changes=projectDocumentEdits(c,doc);assert.ok(changes);
    assert.equal(changes.get('1'),'Child.'+eol);
    assert.equal(changes.get('0'),root.replace('\\input{child}'+eol,'\\input{child}'+eol+eol+'Parent continuation.'+eol));
    assert.equal(projectDocumentEdits(c,{content:c.content}).get('0'),root,'Choosing a boundary without typing leaves source unchanged');
  }
});

test('editing an empty parent slot before or between inputs creates source paragraph boundaries',()=>{
  const root='\\documentclass{article}\n\\begin{document}\n\\input{a}\n\\input{b}\n\\end{document}\n';
  const p=fixture([['main.tex',root],['a.tex','A.\n'],['b.tex','B.\n']]),c=composeProject(p,'0');
  const doc=structuredClone({content:c.content});
  doc.content[0].content=[{type:'paragraph',content:[{type:'text',text:'Before.'}]}];
  doc.content[2].content=[{type:'paragraph',content:[{type:'text',text:'Between.'}]}];
  const changes=projectDocumentEdits(c,doc);assert.ok(changes);
  assert.equal(changes.get('0'),'\\documentclass{article}\n\\begin{document}\nBefore.\n\n\\input{a}\n\nBetween.\n\n\\input{b}\n\\end{document}\n');
  assert.equal(changes.get('1'),'A.\n');assert.equal(changes.get('2'),'B.\n');
});
