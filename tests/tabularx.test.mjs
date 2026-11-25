import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
import {insertTableSourceColumn,insertTableSourceRow,parseTabularx,removeTableSourceColumn,removeTableSourceRow} from '../apps/web/latex/tabularx.mjs';
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
test('inserting a row preserves column declarations, row spacing and mixed EOLs',()=>{
  const source='\\begin{tabularx}{\\textwidth}{p{3cm}XX}\r\n'+
    '\\multicolumn{2}{c}{A} & B \\\\*[6pt]\n\\midrule\nC & D & E\r\n\\end{tabularx}';
  for(const index of [0,1]){
    const change=insertTableSourceRow(source,index);
    assert.ok(change);
    assert.equal(change.from,change.to);
    const draft=source.slice(0,change.from)+change.insert+source.slice(change.to);
    const parsed=parseTabularx(draft);
    assert.equal(parsed.rows.length,3);
    assert.deepEqual(parsed.rows[index+1].map(cell=>cell.text),['','','']);
    assert.deepEqual(parsed.rows.filter((_,row)=>row!==index+1).map(row=>row.map(cell=>cell.text)),[['A','B'],['C','D','E']]);
  }
});
test('inserting a row in a table float changes only its tabularx body',()=>{
  const {source,caption,label,expectedRows}=fixture.tables[0];
  const {from,to,insert}=insertTableSourceRow(source,0);
  assert.equal(from,to);
  const node=table(source.slice(0,from)+insert+source.slice(to));
  assert.equal(node.attrs.caption,caption);
  assert.equal(node.attrs.label,label);
  assert.equal(node.content.length,expectedRows+1);
});
test('inserting a column widens intersected spans and retains the caret in its original cell',()=>{
  const source=String.raw`\begin{tabularx}{\textwidth}{p{3cm}XX} \multicolumn{ 2 }{c}{A} & B\\[4pt] C & D & E\end{tabularx}`;
  const {from,to,insert,offset}=insertTableSourceColumn(source,1,0,source.indexOf('C'));
  const draft=source.slice(0,from)+insert+source.slice(to);
  assert.equal(draft,source.replace('p{3cm}XX','p{3cm}lXX').replace('{ 2 }','{ 3 }').replace('C & D','C &  & D'));
  assert.equal(draft[offset],'C');
  const updated=parseTabularx(draft);
  assert.deepEqual(updated.rows.map(row=>row.map(cell=>[cell.text,cell.attrs.colspan])),[
    [['A',3],['B',1]],[['C',1],['',1],['D',1],['E',1]],
  ]);
});
test('deleting a row preserves directives and neighboring comments',()=>{
  const removed='  C & \\textit{Delete} \\\\[4pt]\r\n';
  const source='\\begin{tabularx}{\\textwidth}{XX}\n'+
    '\\toprule\nA & B \\\\\n% Keep with neighboring rows\r\n'+removed+
    '\\midrule\nE & F \\\\\n\\bottomrule\n\\end{tabularx}';
  const {from,to,insert}=removeTableSourceRow(source,1);
  assert.equal(source.slice(from,to),removed);
  assert.equal(insert,'');
  assert.deepEqual(parseTabularx(source.slice(0,from)+source.slice(to)).rows.map(row=>row.map(cell=>cell.text)),[
    ['A','B'],['E','F'],
  ]);
});
test('deleting a column preserves neighboring alignment and shrinks crossing spans',()=>{
  const source=String.raw`\begin{tabularx}{\textwidth}{p{3cm}XX} \multicolumn{ 2 }{c}{A} & B\\[4pt] C & D & E\end{tabularx}`;
  const {from,to,insert}=removeTableSourceColumn(source,1,1);
  const draft=source.slice(0,from)+insert+source.slice(to);
  assert.equal(draft,source.replace('p{3cm}XX','p{3cm}X').replace('{ 2 }','{ 1 }').replace(' & D',' '));
  assert.deepEqual(parseTabularx(draft).rows.map(row=>row.map(cell=>cell.text)),[['A','B'],['C','E']]);
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

test('ordinary tabular axis edits preserve CRLF, rules, spans and noncanonical cell spacing',()=>{
  const source=['\\begin{tabular}{|lcr|}','\\hline','\\multicolumn{2}{c}{Title} & Tail \\\\',
    '\\hline','A  & B  & C \\\\','\\hline','\\end{tabular}'].join('\r\n');
  const apply=({from,to,insert})=>source.slice(0,from)+insert+source.slice(to);
  assert.equal(apply(insertTableSourceRow(source,0)),source.replace('Tail \\\\\r\n','Tail \\\\\r\n &  & \\\\\r\n'));
  const at=source.indexOf('A  ');
  const added=insertTableSourceColumn(source,1,0,at);
  const expanded=apply(added);
  assert.equal(expanded,source.replace('|lcr|','|llcr|').replace('{2}','{3}').replace('A  & B','A &   & B'));
  assert.equal(expanded[added.offset],'A');
  assert.equal(apply(removeTableSourceColumn(source,1,0)),source.replace('|lcr|','|cr|')
    .replace('{2}','{1}').replace('A  & B',' B'));
  assert.equal(apply(removeTableSourceRow(source,1)),source.replace('A  & B  & C \\\\\r\n',''));
  assert.equal(removeTableSourceColumn(source.replace('\\hline','\\cline{1-2}'),1,0),null);
});

test('single-column tables expose empty rows for native insertion and deletion',()=>{
  for(const declaration of ['\\begin{tabular}{l}','\\begin{tabularx}{\\textwidth}{X}']){
    const environment=declaration.includes('tabularx')?'tabularx':'tabular';
    const source=declaration+'\nEntry \\\\\n\\end{'+environment+'}';
    const add=insertTableSourceRow(source,0),draft=source.slice(0,add.from)+add.insert+source.slice(add.to);
    assert.equal(draft,source.replace('\n\\end','\n\\\\\n\\end'));
    assert.equal(importBlocks(draft)[0].content.length,2);
    const remove=removeTableSourceRow(draft,1);
    assert.equal(draft.slice(0,remove.from)+remove.insert+draft.slice(remove.to),source);
  }
});
