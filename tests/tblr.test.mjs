import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {editTblrRow} from '../apps/web/latex/tblr.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/academic-tblr.json',import.meta.url),'utf8'));
const table=source=>{const nodes=importBlocks(source);assert.equal(nodes.length,1);assert.equal(nodes[0].type,'table');return nodes[0];};
const wrap=body=>'\\begin{document}\r\nBefore.\n\n'+body+'\r\n\nAfter.\n\\end{document}\r\n';

test('native tabularray row edits preserve global options, spans and source trivia',()=>{
  const settings='colspec={lc}, rows={m}, hlines={solid}';
  const source=['\\begin{table}[ht]','\\caption{Caption}','\\begin{tblr}{'+settings+'}',
    '\\SetCell[c=2]{c} Full & \\\\*[4pt]','% Keep','A & B','\\end{tblr}','\\end{table}'].join('\r\n');
  const apply=({from,to,insert})=>source.slice(0,from)+insert+source.slice(to);
  const changed=apply(editTblrRow(source,0));
  assert.equal(changed,source.replace('\\\\*[4pt]\r\n','\\\\*[4pt]\r\n & \\\\\r\n'));
  assert.equal(table(changed).content.length,3);
  const deleted=apply(editTblrRow(source,1,true));
  assert.equal(deleted,source.replace('A & B\r\n',''));
  assert.equal(table(deleted).content.length,1);
  assert.equal(editTblrRow(source.replace(settings,settings+', row{2}={r}'),0),null);
});
const edit=(source,mutate)=>{
  const doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const projection=sourceProjection(source,doc);assert.ok(projection);
  mutate(doc.content.find(n=>n.type==='table'),doc);
  const changes=richSourceChanges(projection,doc);
  return changes===null?null:changes.toReversed().reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),source);
};
test('37 distinct synthetic tblr samples',()=>assert.equal(fixture.tables.length,37));
for(const entry of fixture.tables)test('synthetic tblr at '+entry.line,()=>{
  const node=table(entry.source);
  assert.equal(node.attrs.columns.length,entry.columns);
  for(const row of node.content)assert.equal(row.content.reduce((n,c)=>n+c.attrs.colspan,0),entry.columns);
  assert.equal(serialize(node),entry.source);
  assert.equal(serialize(table(serialize(node))),entry.source);
  const source=wrap(entry.source);
  assert.equal(edit(source,(_t,doc)=>{doc.content[0].content[0].text='Edited.';}),source.replace('Before.','Edited.'));
  assert.equal(edit(source,t=>{t.content[0].content[0].content=[{type:'paragraph',content:[{type:'text',text:'Changed'}]}];})?.includes('Changed'),true);
});
test('nested braces, escaped ampersands and internal math do not split cells',()=>{
  const source=String.raw`\begin{tblr}{colspec={X[c] X[c]},hlines,vlines}
\textbf{A \textit{B \& C}} & $\begin{aligned}a&=b\\c&=d\end{aligned}$ \\
{Grouped \{brace\}} & \(x_{i_{j}}+y\)
\end{tblr}`;
  const node=table(source);assert.equal(node.content.length,2);
  assert.equal(node.content[0].content.length,2);
  assert.equal(node.content[0].content[1].content[0].content[0].type,'math');
  assert.equal(serialize(node),source);
});
test('SetCell consumes covered slots without losing their original contents',()=>{
  const source=String.raw`\begin{tblr}{colspec={X[c]X[c]X[c]}}\SetCell[c=2]{c} First & hidden & Last\end{tblr}`;
  const node=table(source);assert.equal(node.content[0].content.length,2);
  assert.equal(node.content[0].content[0].attrs.colspan,2);
  const changed=edit(wrap(source),t=>{t.content[0].content[0].content[0].content[0].text='New';});
  assert.equal(changed,wrap(source.replace('First','New')));
});
test('rows, cells, row styles and individual rules map to existing cells',()=>{
  const node=table(String.raw`\begin{tblr}{colspec={X[l]X[r]},rows={c,m},cells={r},row{1}={font=\bfseries,c},hline{1,3}={0.8pt},vline{1,3}={1pt}}A&B\\C&D\end{tblr}`);
  const first=node.content[0].content[0];
  assert.equal(first.attrs.align,'center');
  assert.equal(first.attrs.tblrStyle.verticalAlign,'middle');
  assert.equal(first.attrs.tblrStyle.fontWeight,'700');
  assert.equal(first.attrs.tblrStyle.borderTop,'0.8pt solid currentColor');
  assert.equal(first.attrs.tblrStyle.borderLeft,'1pt solid currentColor');
  assert.equal(node.content[1].content[0].attrs.align,'right');
});
test('unknown options and mixed EOL remain exact after cell editing inside a float',()=>{
  const source='\\begin{table}[H]\r\n\\centering\n\\begin{tblr}{colspec={X[c]X[c]},future={a,{b,c}},hlines,vlines}\r\nOne & Two \\\\[6pt]\nThree & Four\r\n\\end{tblr}\n\\caption{Title}\\label{tab:t}\r\n\\end{table}';
  const node=table(source);assert.equal(serialize(node),source);
  assert.deepEqual(node.attrs.tblr.unsupported,['future={a,{b,c}}']);
  assert.equal(edit(wrap(source),t=>{t.content[0].content[0].content[0].content[0].text='New';}),wrap(source.replace('One','New')));
});
test('unknown cell commands and malformed structure stay Raw',()=>{
  for(const source of [String.raw`\begin{tblr}{colspec={XX}}\unknown{a}&b\end{tblr}`,String.raw`\begin{tblr}{colspec={XX}}a&b&c\end{tblr}`,String.raw`\begin{tblr}{colspec={XX}}\SetCell[c=3]{c}a&b\end{tblr}`,String.raw`\begin{tblr}{colspec={XX}}a&b`,String.raw`\begin{tblr}{colspec={XX}}\SetCell[r=2]{c}a&b\end{tblr}`]){
    assert.deepEqual(importBlocks(source),[{type:'raw',attrs:{source}}]);
  }
});
test('unsafe structural or style edits cannot silently discard tblr configuration',()=>{
  const source=wrap(String.raw`\begin{tblr}{colspec={XX},future={keep}}a&b\end{tblr}`);
  assert.equal(edit(source,t=>t.content.push(structuredClone(t.content[0]))),null);
  assert.equal(edit(source,t=>{t.attrs.borderMode='grid';}),null);
});

test('comments and ignored layout commands survive edits in other cells',()=>{
  const source=String.raw`\begin{tblr}{colspec={XX},future={keep}}
A % protected comment
& B \\
\hspace{2pt} C & D
\end{tblr}`;
  assert.equal(serialize(table(source)),source);
  assert.equal(edit(wrap(source),t=>{t.content[0].content[0].content[0].content[0].text='Changed';}),null);
  assert.equal(edit(wrap(source),t=>{t.content[1].content[0].content[0].content[0].text='Changed';}),null);
  assert.equal(edit(wrap(source),t=>{t.content[0].content[1].content[0].content[0].text='New';}),wrap(source.replace('& B','& New')));
});

test('multiline display math and hard breaks inside grouped cells are opaque to row splitting',()=>{
  const source=String.raw`\begin{tblr}{colspec={XX}}
\[\begin{aligned}
a&=b\\c&=d
\end{aligned}\] & {First\\Second} \\
Last & End
\end{tblr}`;
  const node=table(source);assert.equal(node.content.length,2);
  assert.equal(node.content[0].content[0].content[0].content[0].type,'math');
  assert.equal(serialize(node),source);
  assert.equal(edit(wrap(source),t=>{t.content[1].content[0].content[0].content[0].text='New';}),wrap(source.replace('Last','New')));
});

test('new in-cell line breaks are braced instead of creating extra table rows',()=>{
  const source=String.raw`\begin{tblr}{colspec={XX}}One&Two\end{tblr}`;
  const changed=edit(wrap(source),t=>{t.content[0].content[0].content[0].content.push({type:'hardBreak'},{type:'text',text:'Next'});});
  assert.ok(changed);const parsed=parseDocument(changed).blocks.flatMap(importBlocks).find(n=>n.type==='table');
  assert.equal(parsed.content.length,1);assert.equal(parsed.content[0].content.length,2);
  assert.equal(parsed.content[0].content[0].content[0].content.some(n=>n.type==='hardBreak'),true);
});
