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
