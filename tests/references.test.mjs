import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Schema} from '@tiptap/pm/model';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import * as refs from '../apps/web/src/editor/references.js';
import {createCitationLibrary} from '../apps/web/src/editor/citation-library.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
import {resolvePackages} from '../apps/web/latex/packages.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/academic-references.json',import.meta.url),'utf8'));
const figures=JSON.parse(readFileSync(new URL('./fixtures/academic-figures.json',import.meta.url),'utf8')).figures;
const table=JSON.parse(readFileSync(new URL('./fixtures/academic-tabularx.json',import.meta.url),'utf8')).tables[0];
const attrs=Object.fromEntries(['key','command','sourceCommand','equation','label','caption','numbered','level','figure','figureSource','tblr','tabularx','latex','delimiter'].map(k=>[k,{default:null}]));
const schema=new Schema({marks:{bold:{},italic:{}},nodes:{doc:{content:'block*'},text:{group:'inline'},paragraph:{group:'block',content:'inline*'},
  heading:{group:'block',content:'inline*',attrs},documentImage:{group:'block',attrs},mathBlock:{group:'block',attrs},
  table:{group:'block',content:'tableRow*',attrs},tableRow:{content:'tableCell*'},tableCell:{content:'block*'},
  ref:{group:'inline',inline:true,attrs},cite:{group:'inline',inline:true,attrs},label:{group:'inline',inline:true,attrs},math:{group:'inline',inline:true,attrs},raw:{group:'block',attrs:{source:{default:''}}}}});
const index=nodes=>refs.collectReferenceLabels(schema.nodeFromJSON({type:'doc',content:nodes}));
const inline=source=>{const block=importBlocks(source)[0];assert.equal(block.type,'paragraph');return block.content[0];};
test('synthetic has 12 autoref occurrences and one cite, including repeated fig:demo-8',()=>{
  assert.equal(fixture.references.filter(r=>r.command==='autoref').length,12);assert.equal(fixture.references.filter(r=>r.command==='cite').length,1);
});
for(const [i,entry] of fixture.references.entries())test('synthetic reference '+i+' at line '+entry.line,()=>{
  const node=inline(entry.source);assert.equal(node.type,entry.command==='cite'?'cite':'ref');
  assert.equal(node.attrs.key,entry.key);assert.equal(serialize(node),entry.source);
  assert.equal(serialize(JSON.parse(JSON.stringify(node))),entry.source);
});
for(const command of ['autoref','ref','pageref','eqref','cite','label'])test(command+' preserves comments and mixed EOL in command spelling',()=>{
  const source='\\'+command+' % keep\r\n {unknown:key}',node=inline(source);
  assert.equal(node.attrs.key,'unknown:key');assert.equal(serialize(node),source);
  node.attrs.key='changed:key';assert.equal(serialize(node),source.replace('unknown:key','changed:key'));
});
test('cite options and multiple keys roundtrip without BibTeX entries',()=>{
  for(const source of [String.raw`\cite[pp.~{2--4}]{known, missing}`,String.raw`\cite[see {]}][p.~3]{a,b}`,String.raw`\cite*{a}`]){
    const node=inline(source);assert.equal(node.type,'cite');assert.equal(serialize(node),source);
  }
});
test('starred cross references keep their command identity',()=>{
  for(const name of ['ref','autoref','pageref']){const s='\\'+name+'*{x}';assert.equal(serialize(inline(s)),s);}
});
test('unknown or malformed reference syntax remains Raw',()=>{
  for(const s of [String.raw`\autoref{unclosed`,String.raw`\cite[unclosed{key}`,String.raw`\myref{x}`,String.raw`\ref{\dynamic}`,String.raw`\label{{nested}}`]){
    assert.equal(importBlocks(s)[0].type,'raw');assert.equal(serialize(importBlocks(s)[0]),s);
  }
});
test('labels on headings, synthetic images and synthetic table resolve to structure nodes',()=>{
  const nodes=[...importBlocks(String.raw`\section{Intro}\label{sec:intro}`),...figures.flatMap(f=>importBlocks(f.source)),...importBlocks(table.source)];
  const labels=index(nodes);assert.equal(labels.find(l=>l.key==='sec:intro').kind,'heading');
  for(const [i,f] of figures.entries()){const target=labels.find(l=>l.key===f.label);assert.ok(target);assert.equal(target.kind,'figure');assert.equal(target.number,String(i+1));}
  const target=labels.find(l=>l.kind==='table');assert.ok(target);assert.equal(target.number,'1');assert.equal(target.key,nodes.at(-1).attrs.label);
});
test('heading labels on the next line attach and retain exact label spelling',()=>{
  const s='\\section{Intro}\r\n% label comment\n\\label % key\r\n{sec:intro}';
  const nodes=importBlocks(s);assert.equal(nodes.length,1);assert.equal(nodes[0].attrs.label,'sec:intro');assert.equal(serialize(nodes[0]).trim(),s);
});
test('separate label aliases retain target kind and position',()=>{
  const nodes=[...importBlocks(String.raw`\section{Intro}\label{sec:first}`),...importBlocks(String.raw`\label{sec:alias}`)];
  const labels=index(nodes);assert.equal(labels[1].kind,'heading');assert.equal(labels[1].position,labels[0].position);
});
test('duplicate labels are marked ambiguous rather than silently selecting the first',()=>{
  const labels=index(importBlocks(String.raw`\section{One}\label{same}\section{Two}\label{same}`));
  const target=labels.find(l=>l.key==='same');assert.equal(target.ambiguous,true);assert.equal(target.number,null);assert.equal(target.position,null);
});
test('uncaptioned images do not invent figure numbers',()=>{
  const labels=index(importBlocks(String.raw`\begin{figure}[H]\includegraphics{a.png}\label{fig:no-caption}\end{figure}`));
  assert.equal(labels[0].kind,'figure');assert.equal(labels[0].number,null);
});
test('starred captions do not consume figure or table reference numbers',()=>{
  for(const kind of ['figure','table']){
    const body=kind==='figure'?String.raw`\includegraphics{a.png}`:String.raw`\begin{tblr}{X}A\end{tblr}`;
    const source='\\begin{'+kind+'}\\caption*{Unnumbered}\\label{unnum}'+body+'\\end{'+kind+'}';
    const next=source.replace('\\caption*','\\caption').replace('{unnum}','{numbered}');
    const labels=index([...importBlocks(source),...importBlocks(next)]);
    assert.equal(labels.find(l=>l.key==='unnum').number,null);assert.equal(labels.find(l=>l.key==='numbered').number,'1');
  }
});
test('autoref requests hyperref, including when url is already present',()=>{
  for(const preamble of ['',String.raw`\usepackage{url}`])assert.ok(resolvePackages(preamble,String.raw`\autoref{x}`).some(p=>p.name==='hyperref'));
  assert.equal(resolvePackages(String.raw`\usepackage{hyperref}`,String.raw`\autoref{x}`).some(p=>p.name==='hyperref'),false);
});
test('paragraph edits preserve reference source spelling and unresolved keys',()=>{
  const body='See \\autoref{missing} and \\cite[see][p.~2]{known, missing}.',source='\\begin{document}\n'+body+'\n\nAfter.\n\\end{document}\n';
  const doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)},projection=sourceProjection(source,doc);
  assert.equal(doc.content[0].type,'paragraph');doc.content[0].content[0].text='Read ';
  const edits=richSourceChanges(projection,doc);assert.ok(edits);
  assert.equal(edits.toReversed().reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),source),source.replace('See ','Read '));
});
test('citation status reuses the BibTeX library, including conflict resolution',async()=>{
  assert.equal(typeof refs.citationTargets,'function');const library=createCitationLibrary();
  await library.addFile(new File(['@article{known,title={Original}}'],'one.bib',{type:'text/plain'}));
  let targets=refs.citationTargets('known, absent',library);assert.equal(targets[0].entry.title,'Original');assert.equal(targets[1].status,'missing');
  await library.addFile(new File(['@article{known,title={Other}}'],'two.bib',{type:'text/plain'}));
  assert.equal(refs.citationTargets('known',library)[0].status,'ambiguous');
  library.choose('known','two.bib',0);assert.equal(refs.citationTargets('known',library)[0].entry.title,'Other');
});
