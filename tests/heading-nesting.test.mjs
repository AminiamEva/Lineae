import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBlock,importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/academic-headings.json',import.meta.url),'utf8'));
const textOf=node=>(node.content??[]).map(child=>child.text??'').join('');

test('synthetic fixture contains all 46 headings',()=>assert.equal(fixture.headings.length,46));
for(const entry of fixture.headings) test('synthetic heading at line '+entry.line+': '+entry.title,()=>{
  const [node,...rest]=importBlocks(entry.source);
  assert.equal(node.type,'heading');assert.equal(rest.length,0);
  assert.equal(node.attrs.level,entry.level);assert.equal(node.attrs.numbered,entry.numbered);
  assert.equal(textOf(node),entry.title);
  assert.equal(node.content.every(child=>child.marks?.some(mark=>mark.type==='bold')),entry.bold);
  const restored=importBlocks(serialize(node))[0];
  assert.deepEqual(restored,node);
});
for(const name of ['section','subsection','subsubsection']) for(const star of ['','*']) {
  test(name+star+' nested bold italic and escaped braces',()=>{
    const source='\\'+name+star+String.raw`{A \textbf{B \textit{C \{D\}}} E}`;
    for(const node of [importBlock(source),importBlocks(source)[0]]) {
      assert.equal(node.type,'heading');assert.equal(textOf(node),'A B C {D} E');
      assert.equal(node.attrs.numbered,!star);
      const nested=node.content.filter(child=>child.marks?.some(mark=>mark.type==='italic'));
      assert.equal(nested.map(child=>child.text).join(''),'C {D}');
      assert.ok(nested.every(child=>child.marks.some(mark=>mark.type==='bold')));
      assert.equal(textOf(importBlocks(serialize(node))[0]),'A B C {D} E');
    }
  });
}
test('balanced short titles, whitespace, comments and labels keep heading boundaries',()=>{
  const source='\\section*[Short {with ]} \\textbf{B}] % } ignored\r\n{Long \\textit{Title}}\\label{sec:one}\nFollowing.';
  const [node,paragraph]=importBlocks(source);
  assert.equal(node.type,'heading');assert.equal(textOf(node),'Long Title');
  assert.equal(node.attrs.shortTitle,'Short {with ]} \\textbf{B}');
  assert.equal(node.attrs.label,'sec:one');assert.equal(textOf(paragraph),'Following.');
});
test('adjacent nested headings do not swallow prose or each other',()=>{
  const nodes=importBlocks(String.raw`Before.\section{\textbf{First}}Between.\subsection*{\textit{Second}}After.`);
  assert.deepEqual(nodes.map(n=>n.type),['paragraph','heading','paragraph','heading','paragraph']);
  assert.deepEqual(nodes.map(textOf),['Before.','First','Between.','Second','After.']);
});
test('unknown commands and unclosed heading arguments remain exact Raw',()=>{
  for(const source of [String.raw`\section{\unknown{X}}`,String.raw`\section{\textbf{unfinished}`,String.raw`\section[unfinished{title}`,String.raw`\section{a {unsupported group}}`]) {
    assert.deepEqual(importBlocks(source),[{type:'raw',attrs:{source}}]);
  }
});
test('headings inside Raw scopes remain protected',()=>{
  for(const source of [String.raw`\begin{minipage}{3cm}\section{\textbf{Hidden}}\end{minipage}`,String.raw`\newcommand{\x}{\section{\textbf{Hidden}}}`]) {
    assert.deepEqual(importBlocks(source),[{type:'raw',attrs:{source}}]);
  }
});
test('all synthetic headings coexist with Raw and mixed EOL neighbor edits',()=>{
  const source='\\begin{document}\r\n'+fixture.headings.map(h=>h.source).join('\r\n\n')+'\n\n\\unknown{Keep}\r\n\nAfter.\n\\end{document}\r\n';
  const parsed=parseDocument(source),doc={type:'doc',content:parsed.blocks.flatMap(importBlocks)};
  assert.equal(doc.content.filter(n=>n.type==='heading').length,46);
  const projection=sourceProjection(source,doc);assert.ok(projection);
  assert.deepEqual(richSourceChanges(projection,doc),[]);
  doc.content.at(-1).content[0].text='Edited.';
  const changes=richSourceChanges(projection,doc);assert.ok(changes);
  const result=changes.toReversed().reduce((s,c)=>s.slice(0,c.from)+c.insert+s.slice(c.to),source);
  assert.equal(result,source.replace('After.','Edited.'));
});
