import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EditorState} from '@codemirror/state';
import {CompletionContext} from '@codemirror/autocomplete';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {importBlocks} from '../apps/web/src/editor/latex-codec.js';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';
import {latexAssist,latexCompletion,scanLatex,commentAt} from '../apps/web/src/editor/latex-assist.js';

const source = '\\documentclass{article}\r\n\\newcommand{\\foo}{X}\n\\begin{document}\nHello.\n\n% keep comment\r\n\\unknown{x}\n\nSecond.\r\n\\end{document}\r\n';
const document = text => ({type:'doc',content:parseDocument(text).blocks.flatMap(importBlocks)});
const apply = (text,changes) => changes.toReversed().reduce((s,c)=>s.slice(0,c.from)+c.insert+s.slice(c.to),text);

test('rich patch preserves every unknown macro, comment and untouched EOL byte',()=>{
  const doc=document(source), projection=sourceProjection(source,doc);
  doc.content[0].content[0].text='Hello changed.';
  assert.equal(apply(source,richSourceChanges(projection,doc)),source.replace('Hello.','Hello changed.'));
});
test('protected raw replacement, removal and cross-block replacement are refused',()=>{
  const doc=document(source), projection=sourceProjection(source,doc);
  const changed=structuredClone(doc);changed.content[1]={type:'paragraph',content:[{type:'text',text:'lost'}]};
  assert.equal(richSourceChanges(projection,changed),null);
  doc.content.splice(1,1);assert.equal(richSourceChanges(projection,doc),null);
});
test('noncanonical supported syntax stays protected instead of being normalized',()=>{
  const text=source.replace('Hello.','Hello\nwrapped.');
  const doc=document(text), projection=sourceProjection(text,doc);
  doc.content[0].content[0].text+=' change';
  assert.equal(richSourceChanges(projection,doc),null);
});
test('splitting one safe paragraph preserves surrounding protected blocks',()=>{
  const doc=document(source), projection=sourceProjection(source,doc);
  doc.content.splice(0,1,{type:'paragraph',content:[{type:'text',text:'First.'}]},{type:'paragraph',content:[{type:'text',text:'Next.'}]});
  assert.equal(apply(source,richSourceChanges(projection,doc)),source.replace('Hello.','First.\n\nNext.'));
});
test('an empty rich projection can begin a document',()=>{
  const text='\\begin{document}\n\n\\end{document}\n',doc={type:'doc',content:[{type:'paragraph'}]};
  const projection=sourceProjection(text,doc);doc.content[0].content=[{type:'text',text:'Hello'}];
  assert.ok(apply(text,richSourceChanges(projection,doc)).includes('Hello'));
});
test('nested environments fold and mismatches are diagnosed; literal bodies are ignored',()=>{
  const result=scanLatex('\\begin{document}\n\\begin{itemize}\n\\item {x}\n\\end{itemize}\n\\end{document}');
  assert.equal(result.folds.length,2);assert.deepEqual(result.errors,[]);
  assert.ok(scanLatex('\\begin{align}\nx').errors.length);
  assert.deepEqual(scanLatex('\\begin{verbatim}\n{ % \\begin{x}\n\\end{verbatim}').errors,[]);
  assert.equal(commentAt('\\% text % comment'),8);
});
function complete(text) {
  const state=EditorState.create({doc:text,extensions:latexAssist()});
  return latexCompletion(new CompletionContext(state,text.length,false));
}
test('commands, environments and references complete contextually',()=>{
  assert.ok(complete('\\sec').options.some(o=>o.label==='\\section'));
  assert.deepEqual(complete('\\begin{ite').options.map(o=>o.label),['itemize']);
  assert.deepEqual(complete('\\label{sec:one}\n\\ref{sec').options.map(o=>o.label),['sec:one']);
});
test('completion is suppressed in comments and verbatim',()=>{
  assert.equal(complete('% \\sec'),null);
  assert.equal(complete('\\begin{verbatim}\n\\sec'),null);
});
