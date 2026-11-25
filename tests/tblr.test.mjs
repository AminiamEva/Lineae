import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {editTblrColumn,editTblrRow,mergeTblrCells,mergeTblrRows,splitTblrCell} from '../apps/web/latex/tblr.mjs';
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
  const indexed=source.replace(settings,settings+', row{2}={r}');
  const indexedPatch=editTblrRow(indexed,0);
  assert.equal(indexed.slice(0,indexedPatch.from)+indexedPatch.insert+indexed.slice(indexedPatch.to),
    changed.replace(settings,settings+', row{3}={r}'));
  const removed=editTblrRow(indexed,1,true);
  assert.equal(indexed.slice(0,removed.from)+removed.insert+indexed.slice(removed.to),deleted);
  const firstOption=source.replace(settings,'row{1}={l}, row{2}={r}, '+settings);
  const shifted=editTblrRow(firstOption,0,true);
  const retained=firstOption.slice(0,shifted.from)+shifted.insert+firstOption.slice(shifted.to);
  assert.equal(retained,source.replace(settings,' row{1}={r}, '+settings)
    .replace('\\SetCell[c=2]{c} Full & \\\\*[4pt]\r\n',''));
});

test('native tabularray column edits retain column declarations, rules and caret ownership',()=>{
  const settings='colspec={l X[c]}, rows={m}, vlines={solid}';
  const source=['\\begin{tblr}{'+settings+'}','A  & B \\\\',' C & D','\\end{tblr}'].join('\r\n');
  const apply=({from,to,insert})=>source.slice(0,from)+insert+source.slice(to);
  const patch=editTblrColumn(source,0,0,source.indexOf('A'));
  const draft=apply(patch);
  assert.equal(draft,source.replace('l X[c]','ll X[c]').replace('A  & B','A &   & B').replace('C & D','C &  & D'));
  assert.equal(draft[patch.offset],'A');
  assert.equal(apply(editTblrColumn(source,0,0,0,true)),source.replace('l X[c]',' X[c]')
    .replace('A  & B',' B').replace(' C & D','  D'));
  const combined=source.replace('A  & B','\\SetCell[c=2]{c} A & ');
  const combinedPatch=editTblrColumn(combined,1,0,0);
  assert.equal(combined.slice(0,combinedPatch.from)+combinedPatch.insert+combined.slice(combinedPatch.to),
    draft.replace('A &   & B','\\SetCell[c=3]{c} A &  & '));
  const indexed=source.replace('vlines={solid}','vline{2}={solid}');
  const indexedPatch=editTblrColumn(indexed,0,0,0);
  assert.equal(indexed.slice(0,indexedPatch.from)+indexedPatch.insert+indexed.slice(indexedPatch.to),
    draft.replace('vlines={solid}','vline{3}={solid}'));
  const contract=editTblrColumn(indexed,0,0,0,true);
  assert.equal(indexed.slice(0,contract.from)+contract.insert+indexed.slice(contract.to),
    apply(editTblrColumn(source,0,0,0,true)).replace('vlines={solid}','vline{1}={solid}'));
  assert.equal(editTblrColumn(indexed.replace('vline{2}', 'vline{1}={dashed}, vline{2}'),0,0,0,true),null);
});

test('tabularray column changes inside a combined span keep its vertical count and options',()=>{
  const source=['\\begin{tblr}{lll}', '\\SetCell[r = 2, c = 2]{c} Lead & Hidden & Far \\\\',
    ' & & After \\\\', 'A & B & C','\\end{tblr}'].join('\r\n');
  const apply=(text,{from,to,insert})=>text.slice(0,from)+insert+text.slice(to);
  const expanded=apply(source,editTblrColumn(source,2,0,source.indexOf('A & B')));
  assert.equal(expanded,source.replace('{lll}','{llll}').replace('c = 2','c = 3')
    .replace('Lead & Hidden','Lead &  & Hidden').replace(' & & After','  & & & After').replace('A & B','A &  & B'));
  const contracted=apply(source,editTblrColumn(source,2,1,0,true));
  assert.equal(contracted,source.replace('{lll}','{ll}').replace('c = 2','c = 1')
    .replace('Lead & Hidden','Lead ').replace(' & & After','  & After').replace('A & B','A '));
  assert.equal(table(contracted).content[0].content[0].attrs.rowspan,2);
  assert.equal(editTblrColumn(source,2,0,0,true),null);
  const blank=source.replace(' & Hidden',' & ');
  const contractedAnchor=apply(blank,editTblrColumn(blank,2,0,0,true));
  assert.equal(table(contractedAnchor).content[0].content[0].attrs.rowspan,2);
  assert.equal(table(contractedAnchor).content[0].content[0].attrs.colspan,1);
  assert.match(contractedAnchor,/\\SetCell\[r = 2, c = 1\]\{c\} Lead/);
  const moved=apply(source,editTblrRow(source,0,true));
  assert.equal(moved,source.replace('\\SetCell[r = 2, c = 2]{c} Lead & Hidden & Far \\\\\r\n & & After',
    ' \\SetCell[r = 1, c = 2]{c} Lead& & After'));
  assert.equal(editTblrRow(source.replace(' & & After','Content & & After'),0,true),null);
});

test('splitting a tabularray cell reveals the preserved covered cells',()=>{
  const source='\\begin{tblr}{lc}\r\n\\SetCell[ c = 2 ]{c} Lead & Hidden \\\\\r\n\\end{tblr}';
  const patch=splitTblrCell(source,0,0,source.indexOf('Lead'));
  const draft=source.slice(0,patch.from)+patch.insert+source.slice(patch.to);
  assert.equal(draft,source.replace(' c = 2 ',' c = 1 '));
  assert.equal(draft.slice(patch.offset,patch.offset+4),'Lead');
  assert.equal(table(draft).content[0].content[1].content[0].content[0].text,'Hidden');
});

test('merging adjacent tabularray cells keeps the selected text and remaining fields',()=>{
  const source='\\begin{tblr}{lcr}\r\nA & $z$ & C \\\\\r\nD & E & F\r\n\\end{tblr}';
  const patch=mergeTblrCells(source,0,0,1);
  const draft=source.slice(0,patch.from)+patch.insert+source.slice(patch.to);
  assert.equal(draft,source.replace('A & $z$','\\SetCell[c=2]{l} A $z$ & '));
  assert.equal(draft.slice(patch.offset-3,patch.offset),'$z$');
  assert.equal(table(draft).content[0].content[0].attrs.colspan,2);
});

test('tabularray row spans preserve covered source, neighboring cells and absolute rules',()=>{
  const source='\\begin{tblr}{colspec={lc},hline{2}={solid}}\r\nA & B \\\\\r\nC & D\r\n\\end{tblr}';
  const apply=(source,{from,to,insert})=>source.slice(0,from)+insert+source.slice(to);
  const merged=apply(source,mergeTblrRows(source,0,1,0));
  assert.equal(merged,source.replace('A & B','\\SetCell[r=2]{l} A C & B').replace('C & D',' & D'));
  const authored=merged.replace('\r\n & D','\r\nHidden & D');
  const node=table(authored);
  assert.equal(node.content[0].content[0].attrs.rowspan,2);
  assert.equal(node.content[1].content.length,1);
  assert.equal(serialize(node),authored);
  const withInteriorRow=apply(authored,editTblrRow(authored,0));
  assert.equal(withInteriorRow,authored.replace('r=2','r=3')
    .replace('hline{2}','hline{3}').replace('\r\nHidden','\r\n & \\\\\r\nHidden'));
  assert.equal(apply(withInteriorRow,editTblrRow(withInteriorRow,1,true)),authored);
  const conflicting=withInteriorRow.replace('hline{3}', 'hline{2}={dashed}, hline{3}');
  assert.equal(editTblrRow(conflicting,1,true),null);
  assert.equal(editTblrRow(authored,0,true),null);
  const split=apply(authored,splitTblrCell(authored,0,0,authored.indexOf('A C')));
  assert.equal(split,authored.replace('r=2','r=1'));
  assert.equal(table(split).content[1].content[0].content[0].content[0].text,'Hidden');
  const expanded=apply(authored,editTblrColumn(authored,1,0,authored.indexOf('D')));
  assert.equal(expanded,authored.replace('colspec={lc}','colspec={lcl}')
    .replace(' & B',' & B & ').replace(' & D',' & D & '));
  assert.equal(table(expanded).content[0].content[0].attrs.rowspan,2);
  const rowInserted=apply(authored,editTblrRow(authored,1));
  assert.equal(table(rowInserted).content.length,3);
  assert.equal(table(rowInserted).content[0].content[0].attrs.rowspan,2);
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
