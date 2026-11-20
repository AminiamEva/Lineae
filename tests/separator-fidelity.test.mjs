import test from 'node:test';
import assert from 'node:assert/strict';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
const pairs=[
 ['text','\\begin{center}First.\\end{center}','\\begin{abstract}Last.\\end{abstract}'],
 ['figure','\\begin{figure}\\includegraphics{a.png}\\end{figure}','\\begin{figure}\\includegraphics{b.png}\\end{figure}'],
 ['table','\\begin{table}\\begin{tblr}{X}First.\\end{tblr}\\end{table}','\\begin{table}\\begin{tblr}{X}Last.\\end{tblr}\\end{table}'],
];
for(const [name,left,right] of pairs)for(const gap of ['', '\n','\n\n\n',' \r\n\t\n \r\n','% comment\r\n','\r\n% fake \\end{center}\n']) {
 test(`${name} exact boundary ${JSON.stringify(gap)}`,()=>{
  const body=' \r\n'+left+gap+right+'\t\r\n';
  assert.equal(importBlocks(body).map(serialize).join(''),body);
  const source='\\begin{document}\r\n'+body+'\\end{document}';
  const p=parseDocument(source),doc={type:'doc',content:p.blocks.flatMap(importBlocks)};
  const projection=sourceProjection(source,doc);
  assert.equal(p.start+p.blocks.join('')+p.end,source);
  assert.deepEqual(richSourceChanges(projection,doc),[]);
 });
}
test('edit one recognized node preserves all other bytes and EOF without newline',()=>{
 const source='\\begin{document}\r\n\\begin{center}First.\\end{center} \r\n\t\n\\begin{abstract}Last.\\end{abstract}\n\\end{document}';
 const p=parseDocument(source),doc={type:'doc',content:p.blocks.flatMap(importBlocks)},projection=sourceProjection(source,doc);
 doc.content[0].content[0].content[0].text='Edited.';
 const changes=richSourceChanges(projection,doc);assert.ok(changes);
 assert.equal(changes.toReversed().reduce((s,c)=>s.slice(0,c.from)+c.insert+s.slice(c.to),source),source.replace('First.','Edited.'));
});
test('unsafe edits with opaque source remain rejected',()=>{
 const source='\\begin{document}\n\\begin{center}\\unknown{keep}\n\\end{center}\r\n\\end{document}';
 const doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)},projection=sourceProjection(source,doc);
 doc.content[0].content=[];assert.equal(richSourceChanges(projection,doc),null);
 const raw={type:'raw',attrs:{source:'% exact\r\n\n'}};assert.equal(serialize(raw),raw.attrs.source);
});
