import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/academic-tabularx.json',import.meta.url),'utf8'));
const table=source=>{const nodes=importBlocks(source);assert.equal(nodes.length,1);assert.equal(nodes[0].type,'table');assert.ok(nodes[0].attrs.tabularx);return nodes[0];};
const wrap=source=>'\\begin{document}\r\nBefore.\n\n'+source+'\r\n\nAfter.\n\\end{document}\r\n';
const edit=(source,mutate)=>{
  const doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const projection=sourceProjection(source,doc);assert.ok(projection);
  mutate(doc.content.find(n=>n.type==='table'),doc);
  const changes=richSourceChanges(projection,doc);
  return changes===null?null:changes.toReversed().reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),source);
};
test('synthetic contains one tabularx symbol table',()=>assert.equal(fixture.tables.length,1));
for(const form of ['source','inner'])test('synthetic symbol table '+form,()=>{
  const entry=fixture.tables[0],source=entry[form],node=table(source),meta=node.attrs.tabularx;
  assert.equal(node.content.length,entry.expectedRows);
  assert.equal(meta.width,String.raw`\textwidth`);
  assert.deepEqual(meta.specs.map(s=>s.type),['p','X','p','X']);
  assert.deepEqual(meta.specs.map(s=>s.width),[String.raw`0.085\textwidth`,null,String.raw`0.085\textwidth`,null]);
  assert.equal(meta.specs[0].align,'center');assert.equal(node.attrs.booktabs,true);
  for(const row of node.content)assert.equal(row.content.reduce((n,c)=>n+c.attrs.colspan,0),4);
  assert.equal(node.content.at(-1).content.at(-1).attrs.colspan,2);
  assert.equal(serialize(node),source);assert.equal(serialize(table(serialize(node))),source);
  if(form==='source'){assert.equal(node.attrs.caption,entry.caption);assert.equal(node.attrs.label,entry.label);}
});
test('synthetic neighbor edits and multicolumn content edits preserve all other bytes',()=>{
  const source=fixture.tables[0].source;
  assert.equal(edit(wrap(source),(_t,doc)=>{doc.content[0].content[0].text='Edited.';}),wrap(source).replace('Before.','Edited.'));
  const original=table(source),range=original.attrs.tabularx.cells[0];
  assert.equal(edit(wrap(source),t=>{t.content[0].content[0].content=[{type:'paragraph',content:[{type:'text',text:'Updated'}]}];}),wrap(source.slice(0,range.from)+'Updated'+source.slice(range.to)));
});
test('width, position, prefixes and empty intercolumn material are retained',()=>{
  const source=String.raw`\begin{tabularx}{0.8\textwidth}[t]{@{}>{\centering\arraybackslash}p{0.2\textwidth}>{\raggedright\arraybackslash}X@{}} A&B\\C&D\end{tabularx}`;
  const node=table(source),m=node.attrs.tabularx;
  assert.equal(m.width,'0.8\\textwidth');assert.equal(m.position,'t');
  assert.equal(m.specs[0].width,'0.2\\textwidth');assert.equal(m.specs[0].widthCSS,'25%');
  assert.equal(m.widthCSS,'80%');assert.equal(node.content[0].content[0].attrs.align,'center');
  assert.equal(node.content[0].content[1].attrs.align,'left');assert.equal(serialize(node),source);
});
test('nested width expression and unknown column declarations survive cell edits',()=>{
  const source=String.raw`\begin{tabularx}{\textwidth}{>{\future{a,{b,c}}}p{\dimexpr\textwidth-\foo{2pt}\relax}X@{\futuregap}}One&Two\end{tabularx}`;
  const node=table(source);assert.equal(node.attrs.tabularx.specs[0].width,String.raw`\dimexpr\textwidth-\foo{2pt}\relax`);
  assert.equal(node.attrs.tabularx.specs[0].widthCSS,null);
  assert.ok(node.attrs.tabularx.unsupported.length>0);
  assert.equal(edit(wrap(source),t=>{t.content[0].content[1].content[0].content[0].text='New';}),wrap(source.replace('Two','New')));
});
test('multicolumn consumes columns without tblr placeholder slots',()=>{
  const source=String.raw`\begin{tabularx}{\textwidth}{XXX}\multicolumn{2}{>{\centering\arraybackslash}p{3cm}}{\textbf{A \{B\}}}&C\\D&E&F\end{tabularx}`;
  const node=table(source);assert.equal(node.content[0].content.length,2);assert.equal(node.content[0].content[0].attrs.colspan,2);
  assert.equal(node.content[0].content[0].attrs.align,'center');assert.equal(serialize(node),source);
});
test('booktabs rule locations and widths map without changing original spelling',()=>{
  const source=String.raw`\begin{tabularx}{\textwidth}{XX}\toprule[1pt] A&B\\\midrule[.6pt]C&D\\\bottomrule\end{tabularx}`;
  const node=table(source);assert.equal(node.content.length,2);
  assert.equal(node.content[0].content[0].attrs.tblrStyle.borderTop,'1pt solid currentColor');
  assert.equal(node.content[1].content[0].attrs.tblrStyle.borderTop,'.6pt solid currentColor');
  assert.equal(node.content[1].content[0].attrs.tblrStyle.borderBottom,'0.8pt solid currentColor');
  assert.equal(serialize(node),source);
});
test('multiline formulas and nested groups protect internal row and cell separators',()=>{
  const source=String.raw`\begin{tabularx}{\textwidth}{XX}
\(\begin{aligned}a&=b\\
c&=d\end{aligned}\) & \textbf{a \textit{b \& c}} \\[6pt]
{first\\second}&last
\end{tabularx}`;
  const node=table(source);assert.equal(node.content.length,2);assert.equal(node.content[0].content[0].content[0].content[0].type,'math');
  assert.equal(serialize(node),source);
});
for(const eol of ['\n','\r\n'])test('comments and '+JSON.stringify(eol)+' survive a neighboring cell edit',()=>{
  const source=['\\begin{tabularx}{\\textwidth}{XX}','\\toprule','A % & \\\\ ignored','&B \\\\','\\bottomrule','\\end{tabularx}'].join(eol);
  assert.equal(serialize(table(source)),source);
  assert.equal(edit(wrap(source),t=>{t.content[0].content[1].content[0].content[0].text='Changed';}),wrap(source.replace('&B','&Changed')));
});
for(const body of [String.raw`\unknown{a}&b`,String.raw`\multicolumn{3}{c}{a}&b`,String.raw`a&b&c`,String.raw`\multicolumn{2}{c}{a}extra`,String.raw`\multirow{2}{*}{a}&b`])test('unsupported cell structure stays Raw: '+body,()=>{
  const source=String.raw`\begin{tabularx}{\textwidth}{XX}`+body+String.raw`\end{tabularx}`;
  assert.deepEqual(importBlocks(source),[{type:'raw',attrs:{source}}]);
});
test('unknown column types, incomplete arguments and unmatched environments stay Raw',()=>{
  for(const source of [String.raw`\begin{tabularx}{\textwidth}{YX}a&b\end{tabularx}`,String.raw`\begin{tabularx}{\textwidth}{>{\centering}p{2cm}X}a&b`,String.raw`\begin{tabularx}{\textwidth}{p{2cm}X}a&b\end{tblr}`])assert.deepEqual(importBlocks(source),[{type:'raw',attrs:{source}}]);
});
test('unsupported structural and column width mutations are rejected',()=>{
  const source=wrap(String.raw`\begin{tabularx}{\textwidth}{p{2cm}X}a&b\end{tabularx}`);
  assert.equal(edit(source,t=>t.content.push(structuredClone(t.content[0]))),null);
  assert.equal(edit(source,t=>{t.content[0].content[0].attrs.colwidth=[100];}),null);
});

test('spaced column prefixes and multicolumn-local spacing override the base format',()=>{
  const source=String.raw`\begin{tabularx}{\textwidth}{> {\centering\arraybackslash}p{2cm}X}\multicolumn{2}{@{}c@{}}{Title}\end{tabularx}`;
  const node=table(source);
  assert.equal(node.attrs.tabularx.specs[0].prefix,String.raw`> {\centering\arraybackslash}`);
  const style=node.content[0].content[0].attrs.tblrStyle;
  assert.equal(style.paddingLeft,'0px');assert.equal(style.paddingRight,'0px');
  assert.equal(serialize(node),source);
});
