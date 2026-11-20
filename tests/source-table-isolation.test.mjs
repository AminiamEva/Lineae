import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {sourceProjection,richSourceChanges} from '../apps/web/src/editor/source-sync.js';

const table=String.raw`\begin{table}[H]\begin{tblr}{X}cell\end{tblr}\end{table}`;
const wrap=body=>'\\begin{document}\n'+body+'\n\\end{document}';
const document=source=>({type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)});
const tables=doc=>doc.content.filter(n=>n.attrs?.tblr);
const edit=(table,text)=>table.content[0].content[0].content[0].content[0].text=text;
const apply=(source,patch)=>{assert.ok(patch);return patch.toReversed().reduce((s,c)=>s.slice(0,c.from)+c.insert+s.slice(c.to),source);};

for(const prefix of ['\\clearpage\n','Before.\\par\n','First.\nSecond.\n','“Candidate—cost”\n']){
 for(const eol of ['LF','CRLF','mixed'])test(`isolated cell after ${JSON.stringify(prefix)} ${eol}`,()=>{
  let i=0;const source=wrap(prefix+table+'\n% tail\n').replace(/\n/g,()=>eol==='LF'?'\n':eol==='CRLF'?'\r\n':i++%2?'\r\n':'\n');
  const doc=document(source),projection=sourceProjection(source,doc);assert.deepEqual(richSourceChanges(projection,doc),[]);
  edit(tables(doc)[0],'edited');assert.equal(apply(source,richSourceChanges(projection,doc)),source.replace('cell','edited'));
 });
}
for(const decoy of ['% '+table+'\n','\\newcommand{\\fake}{'+table+'}\n','\\begin{future}'+table+'\\end{future}\n']){
 test('identical tables ignore opaque decoy '+decoy.slice(0,24),()=>{
  const source=wrap(decoy+'\\clearpage\n'+table+table),doc=document(source),p=sourceProjection(source,doc);
  assert.equal(tables(doc).length,2);edit(tables(doc)[1],'second');
  const at=source.lastIndexOf('cell');assert.equal(apply(source,richSourceChanges(p,doc)),source.slice(0,at)+'second'+source.slice(at+4));
 });
}
test('continuous transactions with stale source metadata, undo and redo',()=>{
 const original=wrap('“Prefix”\n'+table+table+'\n\\clearpage'),doc=document(original);let source=original;
 for(const value of ['longer','x','cell','x']){
  const p=sourceProjection(source,doc);edit(tables(doc)[1],value);source=apply(source,richSourceChanges(p,doc));
  const at=original.lastIndexOf('cell');assert.equal(source,original.slice(0,at)+value+original.slice(at+4));
 }
});
test('two isolated cell edits are atomic and ordered',()=>{
 const source=wrap('\\clearpage\n'+table+'\n% separator\r\n'+table),doc=document(source),p=sourceProjection(source,doc);
 edit(tables(doc)[0],'one');edit(tables(doc)[1],'two');
 assert.equal(apply(source,richSourceChanges(p,doc)),source.replace('cell','one').replace('cell','two'));
});
for(const operation of ['neighbor','raw','delete','insert','replace','row','span','protected-cell'])test('isolation still refuses '+operation,()=>{
 const sample=operation==='protected-cell'?table.replace('cell','cell % keep\n'):table;
 const source=wrap('“Prefix”\n'+sample+'% opaque\n'),doc=document(source),p=sourceProjection(source,doc),t=tables(doc)[0];
 edit(t,'edited');
 if(operation==='neighbor')doc.content[0].content[0].text='Changed';
 if(operation==='raw')doc.content.find(n=>n.type==='raw').attrs.source='% altered';
 if(operation==='delete')doc.content.splice(doc.content.indexOf(t),1);
 if(operation==='insert')doc.content.splice(doc.content.indexOf(t),0,{type:'paragraph',content:[{type:'text',text:'inserted'}]});
 if(operation==='replace')doc.content[doc.content.indexOf(t)]={type:'paragraph',content:[{type:'text',text:'replacement'}]};
 if(operation==='row')t.content.push(structuredClone(t.content[0]));
 if(operation==='span')t.content[0].content[0].attrs.colspan=2;
 assert.equal(richSourceChanges(p,doc),null);
});
for(const depth of [2,3,4])test('nested H floats stay exact while outside cells edit, depth '+depth,()=>{
 let nested=table;
 for(let level=1;level<depth;level++)nested='\\begin{table}[H]\\caption{Outer '+level+'}'+nested+'\\end{table}';
 const source=wrap(table+'% before\r\n'+nested+'\n'+table),doc=document(source),p=sourceProjection(source,doc);
 assert.equal(tables(doc).length,2);
 const raw=doc.content.find(n=>n.type==='raw'&&n.attrs.source.includes(nested));assert.ok(raw);
 assert.equal(serialize(raw),raw.attrs.source);
 edit(tables(doc)[0],'first');edit(tables(doc)[1],'last');
 const first=source.indexOf('cell'),last=source.lastIndexOf('cell');
 const expected=source.slice(0,first)+'first'+source.slice(first+4,last)+'last'+source.slice(last+4);
 assert.equal(apply(source,richSourceChanges(p,doc)),expected);
 assert.ok(expected.includes(nested));
});
