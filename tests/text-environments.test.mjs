import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/academic-text-environments.json',import.meta.url),'utf8'));
const parse=(source,name)=>{const nodes=importBlocks(source);assert.equal(nodes.length,1);assert.equal(nodes[0].type,'blockquote');assert.equal(nodes[0].attrs.latexEnvironment,name);return nodes[0];};
const descendants=node=>[node,...(node.content??[]).flatMap(descendants)];
const wrap=body=>'\\begin{document}\r\nBefore.\n\n'+body+'\r\n\nAfter.\n\\end{document}\r\n';
const doc=source=>({type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)});
const apply=(s,edits)=>edits.toReversed().reduce((text,e)=>text.slice(0,e.from)+e.insert+text.slice(e.to),s);

for(const entry of fixture.environments)test('synthetic '+entry.environment+' at line '+entry.line,()=>{
  const node=parse(entry.source,entry.environment),all=descendants(node);
  assert.equal(node.content.filter(n=>n.type==='paragraph').length,entry.environment==='abstract'?7:1);
  assert.equal(all.filter(n=>n.type==='raw').length,0);
  assert.ok(all.some(n=>n.marks?.some(m=>m.type==='bold')));
  if(entry.environment==='abstract')assert.ok(all.some(n=>n.type==='math'));
  assert.equal(serialize(node),entry.source);assert.equal(serialize(JSON.parse(JSON.stringify(node))),entry.source);
});
for(const env of ['abstract','center']){
  test(env+' parses paragraphs, par, inline styles and all display delimiters',()=>{
    const source='\\begin{'+env+'}\nFirst \\textbf{bold} and \\textit{italic} $x$.\\par Second \\(y\\).\r\n\nThird. $$a+b$$ tail.\\[c+d\\]\\end{'+env+'}';
    const node=parse(source,env);assert.deepEqual(node.content.map(n=>n.type),['paragraph','paragraph','paragraph','mathBlock','paragraph','mathBlock']);
    assert.equal(serialize(node),source);
  });
  test(env+' preserves every mixed newline, comment and layout command',()=>{
    const source=' \r\n\\begin{'+env+'}\r\n% fake \\end{'+env+'}\n\\zihao{5}\r\n\\setlength{\\parskip}{0.6em}\nHello.\\par\r\n\\small \\noindent World.\n\\end{'+env+'} \r\n';
    const node=parse(source,env);assert.equal(node.content.length,2);assert.equal(node.content[0].type,'paragraph');assert.equal(serialize(node),source);
  });
  test(env+' empty and layout-only environments survive',()=>{
    for(const body of ['', '\r\n',String.raw`\zihao{5}\setlength{\parskip}{1em}`]){
      const source='\\begin{'+env+'}'+body+'\\end{'+env+'}',node=parse(source,env);
      assert.equal(serialize(node),source);assert.ok(node.content.length);
    }
  });
}
test('nested center and abstract environments keep boundaries',()=>{
  const source=String.raw`\begin{abstract}First.\begin{center}\textbf{Middle}\begin{center}Inner\end{center}\end{center}Last.\end{abstract}`;
  const node=parse(source,'abstract');assert.deepEqual(node.content.map(n=>n.type),['paragraph','blockquote','paragraph']);
  assert.equal(node.content[1].content[1].attrs.latexEnvironment,'center');assert.equal(serialize(node),source);
});
test('abstract/center embedded among ordinary text are separate block nodes',()=>{
  const source=String.raw`Before.\begin{center}Middle\end{center}After.`;
  assert.deepEqual(importBlocks(source).map(n=>n.type),['paragraph','blockquote','paragraph']);
});
test('unknown commands and environments remain Raw children',()=>{
  const source=String.raw`\begin{abstract}Known.\par\unknown{keep \par here}\par\begin{minipage}{2cm}opaque\end{minipage}\par End.\end{abstract}`;
  const node=parse(source,'abstract');assert.equal(descendants(node).filter(n=>n.type==='raw').length,2);assert.equal(serialize(node),source);
});
test('macro definitions cannot spoof the outer closing token',()=>{
  const source=String.raw`\begin{center}\newcommand{\x}{\end{center}}\par Real.\end{center}`;
  const node=parse(source,'center');assert.equal(node.content.at(-1).type,'paragraph');assert.equal(serialize(node),source);
});
test('unclosed and mismatched structures stay entirely Raw',()=>{
  for(const s of [String.raw`\begin{abstract}A`,String.raw`\begin{center}A\end{abstract}`,String.raw`\begin{abstract}\begin{center}A\end{abstract}`,String.raw`\begin{abstract}\zihao{5 A\end{abstract}`]){
    const nodes=importBlocks(s);assert.equal(nodes[0].type,'raw');assert.equal(serialize(nodes[0]),s);
  }
});
test('simple groups parse inside environments without expanding unknown commands',()=>{
  const source=String.raw`\begin{abstract}\textbf{Keywords}: {one; {two}; $x$}.\par {\unknown{keep}}\end{abstract}`;
  const node=parse(source,'abstract');assert.equal(node.content[0].type,'paragraph');assert.equal(node.content[1].type,'raw');assert.equal(serialize(node),source);
  assert.equal(importBlocks('{outside group}')[0].type,'raw','outside parsing policy is unchanged');
});
test('editing a supported paragraph preserves layout commands, separators and unknown siblings',()=>{
  const body='\\begin{abstract}\r\n\\zihao{5}\n\\setlength{\\parskip}{.6em}\r\nFirst \\textbf{bold}.\\par\n\\unknown{keep}\r\n\nLast.\n\\end{abstract}',source=wrap(body),document=doc(source),projection=sourceProjection(source,document);
  const container=document.content.find(n=>n.type==='blockquote');assert.ok(container);container.content[0].content[0].text='Edited ';
  const edits=richSourceChanges(projection,document);assert.ok(edits);assert.equal(apply(source,edits),source.replace('First ','Edited '));
});
test('editing a nested environment preserves both original wrappers',()=>{
  const source=wrap(String.raw`\begin{abstract}Start.\par\begin{center}Inside.\end{center}\par End.\end{abstract}`),document=doc(source),projection=sourceProjection(source,document);
  const inner=descendants(document).find(n=>n.attrs?.latexEnvironment==='center');assert.ok(inner);inner.content[0].content[0].text='Changed.';
  assert.equal(apply(source,richSourceChanges(projection,document)),source.replace('Inside.','Changed.'));
});
test('edits to neighboring paragraphs retain the full paper environments',()=>{
  for(const entry of fixture.environments){const source=wrap(entry.source),document=doc(source),projection=sourceProjection(source,document);
    document.content[0].content[0].text='Edited.';assert.equal(apply(source,richSourceChanges(projection,document)),source.replace('Before.','Edited.'));
  }
});
test('deleting an opaque child or changing container type is rejected',()=>{
  const source=wrap(String.raw`\begin{abstract}Text.\par\unknown{keep}\end{abstract}`);
  for(const edit of [n=>n.content.pop(),n=>{n.attrs.latexEnvironment='quote';}]){
    const document=doc(source),projection=sourceProjection(source,document),node=document.content.find(n=>n.type==='blockquote');assert.ok(node);edit(node);
    assert.equal(richSourceChanges(projection,document),null);
  }
});
test('quote keeps its original existing semantics',()=>{
  const node=importBlocks(String.raw`\begin{quote}Text.\end{quote}`)[0];assert.equal(node.type,'blockquote');assert.equal(node.attrs?.latexEnvironment,undefined);
  assert.equal(serialize(node),'\\begin{quote}\nText.\n\n\\end{quote}\n\n');
});
test('group parsing does not leak through array callback indices into existing quote paragraphs',()=>{
  const source='\\begin{quote}First.\n\n{Second.}\\end{quote}';
  assert.equal(importBlocks(source)[0].type,'raw');
});
test('unwrapping an environment cannot silently discard its layout directives',()=>{
  const source=wrap(String.raw`\begin{abstract}\zihao{5}Text.\end{abstract}`),document=doc(source),projection=sourceProjection(source,document);
  const at=document.content.findIndex(n=>n.attrs?.latexEnvironment);document.content.splice(at,1,...document.content[at].content);
  assert.equal(richSourceChanges(projection,document),null);
});
test('unsafe nested figure edits cannot fall back silently to old source',()=>{
  const source=wrap(String.raw`\begin{center}\begin{figure}[H]\includegraphics{a.png}\caption{A}\end{figure}\end{center}`),document=doc(source),projection=sourceProjection(source,document);
  descendants(document).find(n=>n.type==='documentImage').attrs.caption='broken {';
  assert.equal(richSourceChanges(projection,document),null);
});
test('numbered math environments and row spacing reuse existing nodes',()=>{
  const source=String.raw`\begin{abstract}Line\\[6pt]break.\par\begin{equation}x=1\label{eq:x}\end{equation}\end{abstract}`;
  const node=parse(source,'abstract');assert.equal(node.content[0].content[1].type,'hardBreak');assert.equal(node.content[1].type,'mathBlock');
  assert.equal(node.content[1].attrs.label,'eq:x');assert.equal(serialize(node),source);
});
