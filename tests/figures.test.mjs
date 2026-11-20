import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {imageWidthPattern} from '../apps/web/latex/images.mjs';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
import * as assets from '../apps/web/src/editor/project-assets.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/academic-figures.json',import.meta.url),'utf8'));
const parse=source=>{const nodes=importBlocks(source);assert.equal(nodes.length,1);assert.equal(nodes[0].type,'documentImage');return nodes[0];};
const apply=(source,edits)=>edits.toReversed().reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),source);
const wrap=body=>'\\begin{document}\r\nBefore.\n\n'+body+'\r\n\nAfter.\n\\end{document}\r\n';
const doc=source=>({type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)});

test('synthetic fixture contains 11 figures',()=>assert.equal(fixture.figures.length,11));
for(const entry of fixture.figures)test('synthetic figure at line '+entry.line,()=>{
  const node=parse(entry.source);
  for(const key of ['path','width','caption','label'])assert.equal(node.attrs[key],entry[key]);
  assert.equal(node.attrs.placement,'H');assert.equal(node.attrs.align,'center');assert.equal(node.attrs.figure,true);
  assert.equal(serialize(node),entry.source);assert.equal(serialize(JSON.parse(JSON.stringify(node))),entry.source);
});
for(const width of ['\\linewidth','\\textwidth','0.6\\textwidth','.8\\linewidth','1\\linewidth','6cm','12.5mm','72pt'])test('figure width '+width,()=>{
  const source='\\begin{figure}[!htbp]\\centering\\includegraphics[width='+width+']{plots/a.png}\\caption{A}\\label{fig:a}\\end{figure}';
  assert.ok(imageWidthPattern.test(width));assert.equal(parse(source).attrs.width,width);assert.equal(serialize(parse(source)),source);
});
test('balanced multiline caption, comments, optional caption and mixed EOL survive',()=>{
  const source='  \\begin{figure*}[htbp]\r\n% \\end{figure*}\n\\centering\r\n\\includegraphics\n[width={\\textwidth}]\r\n{figures/a.png}\n\\caption[Short {]}]{Long \\textbf{bold \\{x\\}}\r\n$y_{i}$ 95\\%}\n\\label{fig:a}\r\n\\end{figure*} \n';
  const node=parse(source);assert.equal(node.attrs.caption,'Long \\textbf{bold \\{x\\}}\r\n$y_{i}$ 95\\%');
  assert.equal(node.attrs.width,'\\textwidth');assert.equal(serialize(node),source);
});
test('figure metadata order and starred caption preserve original bytes',()=>{
  const source=String.raw`\begin{figure}[H]\caption*{A {nested} caption}\label{f}\includegraphics{a.png}\raggedleft\end{figure}`;
  const node=parse(source);assert.equal(node.attrs.align,'right');assert.equal(node.attrs.caption,'A {nested} caption');assert.equal(serialize(node),source);
});
test('unsupported and malformed figures stay Raw without interpreting nested images',()=>{
  for(const source of [
    String.raw`\begin{figure}\begin{minipage}{.5\linewidth}\includegraphics{a.png}\end{minipage}\end{figure}`,
    String.raw`\begin{figure}\includegraphics{a.png}\includegraphics{b.png}\end{figure}`,
    String.raw`\begin{figure}\includegraphics[angle=90]{a.png}\end{figure}`,
    String.raw`\begin{figure}\mystyle{\caption{fake}}\includegraphics{a.png}\end{figure}`,
    String.raw`\begin{figure}\includegraphics{a.png}\caption{unclosed\end{figure}`,
    String.raw`\begin{figure}\includegraphics{a.png}\end{table}`,
    String.raw`\begin{figure}\includegraphics{a.png}`,
  ]){const nodes=importBlocks(source);assert.equal(nodes[0].type,'raw');assert.equal(serialize(nodes[0]),source);}
});
test('neighbor edits retain all 11 figures byte for byte',()=>{
  const source=wrap(fixture.figures.map(f=>f.source).join('\r\n\n')),document=doc(source),projection=sourceProjection(source,document);
  assert.equal(document.content.filter(n=>n.type==='documentImage').length,11);
  document.content[0].content[0].text='Edited.';
  assert.equal(apply(source,richSourceChanges(projection,document)),source.replace('Before.','Edited.'));
});
test('editing figure width and nested caption patches only their arguments',()=>{
  const body=fixture.figures[0].source.replaceAll('\n','\r\n'),source=wrap(body),document=doc(source),projection=sourceProjection(source,document);
  const image=document.content.find(n=>n.type==='documentImage');assert.ok(image);
  image.attrs.width='\\textwidth';image.attrs.caption=String.raw`Updated \textbf{caption}`;
  const expected=source.replace('0.6\\linewidth','\\textwidth').replace(fixture.figures[0].caption,image.attrs.caption);
  assert.equal(apply(source,richSourceChanges(projection,document)),expected);
  assert.equal(serialize(image),body.replace('0.6\\linewidth','\\textwidth').replace(fixture.figures[0].caption,image.attrs.caption));
});
test('unsafe figure edits cannot discard protected source',()=>{
  const source=wrap(fixture.figures[0].source),document=doc(source),projection=sourceProjection(source,document);
  document.content.find(n=>n.type==='documentImage').attrs.caption='broken {';
  assert.equal(richSourceChanges(projection,document),null);
});
test('changing width preserves braces, spacing and comments around the dimension',()=>{
  const source='\\begin{figure}[H]\n\\includegraphics[width={ 0.5\\linewidth % keep this comment\r\n}]{a.png}\n\\end{figure}';
  const node=parse(source);node.attrs.width='\\textwidth';
  assert.equal(serialize(node),source.replace('0.5\\linewidth','\\textwidth'));
});
test('adding and removing optional image metadata preserves the remaining source',()=>{
  const source='\\begin{figure}\r\n% keep\n\\includegraphics{a.png}\r\n\\end{figure}';
  const node=parse(source);Object.assign(node.attrs,{placement:'H',width:'6cm',caption:'New caption',label:'fig:new',align:'center',centered:true});
  const updated=serialize(node),reparsed=parse(updated);
  for(const key of ['placement','width','caption','label','align'])assert.equal(reparsed.attrs[key],node.attrs[key]);
  assert.ok(updated.includes('% keep\n'));
  Object.assign(reparsed.attrs,{placement:null,width:null,caption:null,label:null,align:null,centered:false});
  const removed=serialize(reparsed);assert.ok(removed.includes('% keep\n'));
  assert.equal(parse(removed).attrs.path,'a.png');assert.equal(parse(removed).attrs.caption,null);
});
test('project image resources resolve exact and extensionless paths without inventing assets',()=>{
  assert.equal(typeof assets.resolveImageAsset,'function');assets.clearProjectAssets();
  assert.equal(assets.resolveImageAsset('figures/a'),null);
  const png=new Blob(['png'],{type:'image/png'});assets.rememberAsset('figures/a.png',png);
  assert.equal(assets.resolveImageAsset('figures/a.png'),png);assert.equal(assets.resolveImageAsset('figures/a'),png);
  assert.equal(assets.resolveImageAsset('a.png'),null);
  assets.rememberAsset('figures/a.jpg',new Blob(['jpg'],{type:'image/jpeg'}));
  assert.equal(assets.resolveImageAsset('figures/a'),null,'ambiguous resources must not be guessed');
  assets.clearProjectAssets();assert.equal(assets.resolveImageAsset('figures/a.png'),null);
});
test('resource listeners refresh attached images and clear on project changes',()=>{
  assert.equal(typeof assets.onAssetsChanged,'function');let changes=0;
  const dispose=assets.onAssetsChanged(()=>changes++);assets.rememberAsset('a.png',new Blob(['a']));assets.clearProjectAssets();
  assert.equal(changes,2);dispose();assets.rememberAsset('b.png',new Blob(['b']));assert.equal(changes,2);assets.clearProjectAssets();
});
