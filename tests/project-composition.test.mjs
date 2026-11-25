import test from 'node:test';
import assert from 'node:assert/strict';
import {composeProject,projectDocumentEdits} from '../apps/web/src/project/include-document.mjs';
import {ProjectDocumentSession} from '../apps/web/src/project/document-session.mjs';
import {Schema} from '@tiptap/pm/model';
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
test('native repeated inputs have one editable source and two visible occurrences',()=>{
  const root='Before.\n\n\\input{a}\n\nBetween.\n\n\\input{a}\n\nAfter.\n';
  const project=fixture([['main.tex',root],['a.tex','Child.\n']]);
  const editable=composeProject(project,'0',{repeated:'first'});
  const visible=composeProject(project,'0',{boundariesOnly:true,repeated:'all'});
  assert.deepEqual(editable.issues,[]);
  assert.deepEqual(visible.issues,[]);
  assert.deepEqual(visible.regions.filter(region=>region.path==='a.tex').map(region=>region.occurrence),[0,1]);
  assert.equal(editable.regions.filter(region=>region.path==='a.tex').length,1);
  const doc=structuredClone({content:editable.content});
  doc.content[1].content[0].content[0].text='Edited once.';
  assert.deepEqual(projectDocumentEdits(editable,doc),new Map([['0',root],['1','Edited once.\n']]));
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

test('rapid parent continuation preserves typed spaces separately from existing source whitespace',()=>{
  const root='\\begin{document}\r\n\\input{child}\r\n\r\nParen  \r\n\\end{document}\r\n';
  const project=fixture([['main.tex',root],['child.tex','Child.\r\n']]);
  const session=new ProjectDocumentSession(),initial=session.compose(project,'0');
  const document=structuredClone({content:initial.content});
  session.hydrate(initial,document);
  const text=document.content.at(-1).content[0].content[0];
  text.text='Parent ';
  const draft=root.replace('Paren  ','Parent   ');
  assert.equal(session.changes(document)?.get('0'),draft);
  project.file('0').draft=draft;
  assert.ok(session.rebase(session.compose(project,'0',{boundariesOnly:true}),document));
  text.text='Parent continuation.';
  assert.equal(session.changes(document)?.get('0'),root.replace('Paren','Parent continuation.'));
});

test('rebasing project regions keeps an earlier formula edit during a later native paragraph split',()=>{
  const root='\\begin{document}\n\\input{child}\n\\end{document}\n';
  const child='AlphaBeta\n\n\\[\\frac{z}{}\\]\n';
  const project=fixture([['main.tex',root],['child.tex',child]]);
  const session=new ProjectDocumentSession();
  const initial=session.compose(project,'0');
  const document=structuredClone({content:initial.content});
  session.hydrate(initial,document);
  document.content[1].content[1].attrs.latex='\\frac{z}{q}';
  const withFormula=child.replace('}{','}{q');
  project.file('1').draft=withFormula;
  assert.ok(session.rebase(session.compose(project,'0',{boundariesOnly:true}),document));
  const split=structuredClone(document);
  split.content[1].content.splice(0,1,...['Alpha','Beta'].map(text=>
    ({type:'paragraph',content:[{type:'text',text}]})));
  assert.equal(session.changes(split)?.get('1'),withFormula.replace('AlphaBeta','Alpha\n\nBeta'));
  assert.equal(session.changes(split)?.get('0'),root);
  assert.equal(session.changes(document)?.get('1'),withFormula);
  project.file('1').draft=session.changes(split).get('1');
  assert.ok(session.rebase(session.compose(project,'0',{boundariesOnly:true}),split));
  assert.equal(session.changes(document)?.get('1'),withFormula);
  assert.equal(session.changes(document)?.get('0'),root);
});

test('a proven native project revision deletes a formula and restores exact drafts with history',()=>{
  const root='\\begin{document}\n\\input{child}\n\nAfter.\n\\end{document}\n';
  const child='Original.\r\n\r\n\\[x\\]\r\n';
  const project=fixture([['main.tex',root],['child.tex',child]]);
  const session=new ProjectDocumentSession();
  const original=session.compose(project,'0');
  const schema=new Schema({nodes:{
    doc:{content:'projectRegion+'},
    projectRegion:{content:'block+',attrs:{regionKey:{default:''},path:{default:''},trail:{default:[]}}},
    paragraph:{group:'block',content:'text*'},
    mathBlock:{group:'block',attrs:{latex:{}}},
    text:{},
  }});
  const read=content=>schema.nodeFromJSON({type:'doc',content});
  const before=read(original.content);
  session.hydrate(original,before.toJSON());
  const changed=structuredClone(original.content);
  changed[1].content.splice(1,1);
  changed[1].content[0].content[0].text='Replacement.';
  changed[2].content[0].content[0].text='ter.';
  const after=read(changed);
  const beforeDrafts=new Map([['0',root],['1',child]]);
  const afterDrafts=new Map([['0',root.replace('After.','ter.')],['1','Replacement.\r\n\r\n\r\n']]);
  const verified=session.verify(project,after,afterDrafts);
  assert.ok(verified);
  assert.equal(session.verify(project,after,new Map(afterDrafts).set('1','Wrong.')),null);
  assert.equal(session.verify(project,after,new Map(afterDrafts).set('0',root.replace('\\input{child}',''))),null);
  session.record(project,{before:{doc:before,drafts:beforeDrafts},after:{doc:after,drafts:afterDrafts}});
  for(const [id,draft] of afterDrafts)project.file(id).draft=draft;
  session.hydrate(verified,after.toJSON());
  assert.deepEqual(session.restore(project,{before:after,doc:before}).drafts,beforeDrafts);
  project.file('1').draft+=' external edit';
  assert.equal(session.restore(project,{before:after,doc:before}),null);
});

test('project undo and redo distinguish commands with the same rich document',()=>{
  const root='\\begin{document}\n\\input{child}\n\\end{document}\n';
  const child='\\newpage\r\n',cleared='\\clearpage\r\n';
  const project=fixture([['main.tex',root],['child.tex',child]]);
  const session=new ProjectDocumentSession(),composition=session.compose(project,'0');
  const schema=new Schema({nodes:{
    doc:{content:'projectRegion+'},
    projectRegion:{content:'block+',attrs:{regionKey:{default:''},path:{default:''},trail:{default:[]}}},
    paragraph:{group:'block'},pageBreak:{group:'block'},text:{},
  }});
  const doc=schema.nodeFromJSON({type:'doc',content:composition.content});
  session.hydrate(composition,doc.toJSON());
  const before=new Map([['1',child]]),after=new Map([['1',cleared]]);
  const verified=session.verify(project,doc,after);
  assert.ok(verified);
  session.record(project,{before:{doc,drafts:before},after:{doc,drafts:after}});
  project.file('1').draft=cleared;
  session.hydrate(verified,doc.toJSON());
  const undo=session.restore(project,{before:doc,doc});
  assert.deepEqual(undo.drafts,before);
  project.file('1').draft=child;
  session.hydrate(undo.composition,doc.toJSON());
  assert.deepEqual(session.restore(project,{before:doc,doc}).drafts,after);
});
