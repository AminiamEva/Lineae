import test from 'node:test';
import assert from 'node:assert/strict';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
const figure=key=>`\\begin{figure}[H]\\includegraphics{${key}.png}\\end{figure}`;
const table=key=>`\\begin{table}[H]\\begin{tblr}{X}${key}\\end{tblr}\\end{table}`;
for(const gap of ['', '\n', '\r\n', '\n\n', ' \r\n\t', '% fake \\begin{table} \\end{figure}\r\n']) {
 for(const [name,make,type] of [['figure',figure,'documentImage'],['table',table,'table']]) {
  test(`adjacent ${name}: ${JSON.stringify(gap)}`,()=>{
   const source=make('first')+gap+make('second');
   const nodes=importBlocks(source);
   assert.deepEqual(nodes.filter(n=>n.type!=='raw').map(n=>n.type),[type,type]);
   const originals=nodes.filter(n=>n.type===type).map(n=>n.attrs.figureSource??n.attrs.tblr.source);
   assert.ok(originals[0].includes('first'));assert.ok(originals[1].includes('second'));
   const full='\\begin{document}\r\n'+source+'\n\\end{document}\r\n';
   const parsed=parseDocument(full),doc={type:'doc',content:parsed.blocks.flatMap(importBlocks)};
   assert.equal(parsed.start+parsed.blocks.join('')+parsed.end,full);
   assert.deepEqual(richSourceChanges(sourceProjection(full,doc),doc),[]);
   // Source-backed nodes and opaque gaps own all of the input, exactly once.
   assert.equal(nodes.map(serialize).join(''),source);
  });
 }
}
test('figure immediately before and after ordinary text',()=>{
 assert.deepEqual(importBlocks('Before.'+figure('a')+'After.').map(n=>n.type),['paragraph','documentImage','paragraph']);
});
test('leading and trailing comments around adjacent environments remain exact',()=>{
 const source='% before\r\n'+figure('a')+'% between\n'+table('b')+'% after fake \\begin{figure}\r\n';
 assert.equal(importBlocks(source).map(serialize).join(''),source);
});
test('starred floats keep their source wrappers and order',()=>{
 const source=figure('a').replaceAll('{figure}','{figure*}')+table('b').replaceAll('{table}','{table*}');
 const nodes=importBlocks(source);
 assert.deepEqual(nodes.map(n=>n.type),['documentImage','table']);
 assert.equal(nodes.map(serialize).join(''),source);
});
test('inner tblr stays inside its table; nested table remains opaque',()=>{
 const nested='\\begin{table}'+table('inside')+'\\end{table}';
 const nodes=importBlocks(table('first')+nested+table('last'));
 assert.deepEqual(nodes.map(n=>n.type),['table','raw','table']);
 assert.equal(nodes[1].attrs.source,nested);
 assert.equal(nodes[0].content[0].type,'tableRow');
});
test('unknown nested scope is never opened to extract figures or tables',()=>{
 const source=' \\begin{future}\\begin{future}'+figure('hidden')+table('hidden')+'\\end{future}\\end{future}\r\n';
 assert.deepEqual(importBlocks(source),[{type:'raw',attrs:{source}}]);
});
test('comments, macro definitions and groups cannot expose fake environments',()=>{
 for(const source of ['% '+figure('fake')+'\nText.', '\\newcommand{\\demo}{'+figure('fake')+'}', '{'+table('fake')+'}'])
  assert.ok(!importBlocks(source).some(n=>n.type==='documentImage'||n.type==='table'));
});
test('mismatched and incomplete environments preserve the complete source',()=>{
 for(const source of [figure('first')+'\\begin{table}tail', '\\begin{table}'+figure('inside')+'\\end{figure}'])
  assert.deepEqual(importBlocks(source),[{type:'raw',attrs:{source}}]);
});
test('editing a neighbor preserves original separators and source tables',()=>{
 const source='\\begin{document}\nBefore.\r\n'+figure('a')+'\n'+table('b')+'\r\nAfter.\n\\end{document}\n';
 const parsed=parseDocument(source),doc={type:'doc',content:parsed.blocks.flatMap(importBlocks)};
 const projection=sourceProjection(source,doc);doc.content[0].content[0].text='Edited.';
 const changes=richSourceChanges(projection,doc);assert.ok(changes);
 const result=changes.toReversed().reduce((s,c)=>s.slice(0,c.from)+c.insert+s.slice(c.to),source);
 assert.equal(result,source.replace('Before.','Edited.'));
});
