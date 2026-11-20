import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as codec from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/academic-table-floats.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const parse=source=>{assert.equal(typeof codec.parseTableFloat,'function','Codec exposes the lossless float descriptor');return codec.parseTableFloat(source);};
test('synthetic contains 38 table occurrences including one nested table',()=>{
  assert.equal(fixture.tables.length,38);assert.equal(fixture.tables.filter(t=>t.nested).length,1);
});
for(const entry of fixture.tables)test('synthetic table at line '+entry.line,()=>{
  const float=parse(entry.source);assert.ok(float);
  for(const key of ['placement','caption','label','centered'])assert.equal(float[key],entry[key],key);
  assert.equal(float.source,entry.source);
  assert.equal(float.open+float.body+float.close,entry.source);
  const nodes=codec.importBlocks(entry.source);
  assert.equal(nodes.length,1);
  // Both table adapters use the existing Table AST; nested floats stay Raw.
  if(entry.nested)assert.deepEqual(nodes,[{type:'raw',attrs:{source:entry.source}}]);
  else {assert.equal(nodes[0].type,'table');assert.equal((nodes[0].attrs.tblr??nodes[0].attrs.tabularx).source,entry.source);}
  assert.equal(codec.serialize(nodes[0]),entry.source);
});
for(const placement of ['H','htbp','!ht',''])test('placement '+placement+' and balanced caption preserve mixed EOL',()=>{
  const source='  \\begin{table}'+(placement?'['+placement+']':'')+'\r\n\\centering\n\\caption[Short {]}]{Long \\textbf{bold \\{x\\}}}\r\n\\label{tab:x}\n\\begin{tabularx}{\\textwidth}{XX}\r\nA&B\\\\\n\\end{tabularx}\n\\end{table} \r\n';
  const float=parse(source);assert.ok(float);
  assert.equal(float.placement,placement||null);assert.equal(float.caption,String.raw`Long \textbf{bold \{x\}}`);
  assert.equal(float.shortCaption,'Short {]}');assert.equal(float.label,'tab:x');assert.equal(float.centered,true);
  assert.equal(float.open+float.body+float.close,source);
});
test('nested environments, groups, math and comments cannot spoof outer metadata',()=>{
  const source=String.raw`\begin{table*}[htbp]
% \end{table*} \caption{comment}
\caption*{Outer}\label{tab:outer}
\begin{minipage}{3cm}\centering\caption{Inner}\label{inner}\end{minipage}
\newcommand{\x}{\caption{Macro}}
{\caption{Grouped}}
\begin{verbatim}
\end{table*}
\caption{Literal}
\end{verbatim}
\end{table*}`;
  const f=parse(source);assert.ok(f);assert.equal(f.environment,'table*');assert.equal(f.caption,'Outer');
  assert.equal(f.captionStarred,true);assert.equal(f.label,'tab:outer');assert.equal(f.centered,false);
});
test('unknown outer commands and all inner content remain intact',()=>{
  const source=String.raw`\begin{table}[H]\unknown{before}\begin{tblr}{X}a&b\end{tblr}\unknown{after}\end{table}`;
  assert.equal(parse(source).source,source);assert.equal(codec.serialize(codec.importBlocks(source)[0]),source);
});
test('unclosed, mismatched and adjacent floats are never guessed as one',()=>{
  for(const s of [String.raw`\begin{table}\begin{tblr}{X}x\end{table}`,String.raw`\begin{table}x`,String.raw`\begin{table}x\end{table*}`,String.raw`\begin{table}x\end{table}\begin{table}y\end{table}`])assert.equal(parse(s),null);
});
test('neighbor edits preserve every synthetic table and separator byte',()=>{
  for(const entry of fixture.tables){
    const source='\\begin{document}\nBefore.\r\n\n'+entry.source+'\r\n\nAfter.\n\\end{document}\r\n';
    const doc={type:'doc',content:parseDocument(source).blocks.flatMap(codec.importBlocks)};
    const projection=sourceProjection(source,doc);assert.ok(projection);assert.deepEqual(richSourceChanges(projection,doc),[]);
    doc.content[0].content[0].text='Edited.';
    const edits=richSourceChanges(projection,doc);assert.ok(edits);
    assert.equal(edits.toReversed().reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),source),source.replace('Before.','Edited.'));
  }
});
