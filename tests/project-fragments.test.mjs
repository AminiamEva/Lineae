import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection, richSourceChanges} from '../apps/web/src/editor/source-sync.js';
import {importBlocks} from '../apps/web/src/editor/latex-codec.js';
test('fragment parsing preserves exact bytes, including empty and trailing blank lines', () => {
  for(const text of ['', 'Text', 'Text\r\n', 'Text\n\n', '\\section{中文}\r\n\r\nParagraph.\r\n']) {
    assert.equal(parseDocument(text),null);
    const parsed=parseDocument(text,{fragment:true});
    assert.ok(parsed);
    assert.equal(parsed.start+parsed.blocks.join('')+parsed.end,text);
  }
});
test('fragment rich edits use child-file offsets without introducing a document wrapper', () => {
  const text='Child paragraph.\r\n';
  const doc={content:parseDocument(text,{fragment:true}).blocks.flatMap(importBlocks)};
  const projection=sourceProjection(text,doc,{fragment:true});
  doc.content[0].content[0].text='Changed paragraph.';
  const changes=richSourceChanges(projection,doc);
  assert.ok(changes);
  let result=text;
  for(const change of [...changes].reverse()) result=result.slice(0,change.from)+change.insert+result.slice(change.to);
  assert.equal(result,'Changed paragraph.\r\n');
});

function applyChanges(text,changes){assert.ok(changes);return changes.toReversed().reduce((value,change)=>value.slice(0,change.from)+change.insert+value.slice(change.to),text);}
test('append after the final heading and continue typing through empty paragraphs',()=>{
 let source='\\section{Heading}\n';
 const initial={content:parseDocument(source,{fragment:true}).blocks.flatMap(importBlocks)};
 const doc=structuredClone(initial);doc.content.push({type:'paragraph'});
 source=applyChanges(source,richSourceChanges(sourceProjection(source,initial,{fragment:true}),doc));
 const projection=sourceProjection(source,doc,{fragment:true});assert.ok(projection);
 doc.content[1].content=[{type:'text',text:'Typed after heading'}];
 source=applyChanges(source,richSourceChanges(projection,doc));assert.match(source,/Typed after heading/);
});
test('escaped characters stay editable across successive project patches',()=>{
 let source='',doc={content:[{type:'paragraph'}]},projection=sourceProjection(source,doc,{fragment:true});
 for(const text of ['#','#a','#a正文','#a正文!']){
  doc=structuredClone(doc);doc.content[0].content=[{type:'text',text}];source=applyChanges(source,richSourceChanges(projection,doc));projection=sourceProjection(source,doc,{fragment:true});assert.ok(projection);
 }
 assert.match(source,/\\#a正文!/);
});
