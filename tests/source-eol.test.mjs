import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceEndings, updateEndings, serializeSource} from '../apps/web/src/editor/source-eol.mjs';

const samples = [
  ['LF','a\nb\n'],
  ['CRLF','a\r\nb\r\n'],
  ['mixed','a\nb\r\nc'],
  ['final CRLF','a\nb\r\n'],
  ['final LF','a\r\nb\n'],
  ['no final newline','a\nb\r\nc'],
  ['empty',''],
  ['single line','abc'],
  ['blank lines','a\n\r\n\nb'],
  ['Chinese','信号\r\n窗口\n'],
  ['math','$E=\\frac{a}{b}$\n\\[x^2\\]\r\n'],
  ['macro','\\newcommand{\\x}[1]{{#1}}\r\n\\x{中文}\n'],
  ['trailing blanks','a\r\n\n\r\n'],
  ['standalone CR','a\rb\nc\r\n'],
];

function edit(state, from, to, insert) {
  const first = state.doc.slice(0,from).split('\n').length - 1;
  const last = first + state.doc.slice(from,to).split('\n').length - 1;
  return {
    doc: state.doc.slice(0,from)+insert+state.doc.slice(to),
    endings: updateEndings(state.endings,[{from:first,to:last,inserted:insert.split('\n').length-1}]),
  };
}

for (const [index,[name,source]] of samples.entries()) {
  const doc = source.replace(/\r\n?/g,'\n');
  const state = {doc,endings:sourceEndings(source)};
  test('EOL-'+String(index+1).padStart(2,'0')+' '+name+' exact round trip', () => {
    assert.equal(serializeSource(doc,state.endings),source);
  });
  for (const [where,offset] of [['first',0],['middle',Math.floor(doc.length/2)],['last',doc.length]]) {
    test(name+' changes '+where+' characters without changing separators', () => {
      const next = edit(state,offset,offset,'中');
      assert.strictEqual(next.endings,state.endings);
      assert.deepEqual(sourceEndings(serializeSource(next.doc,next.endings)),state.endings);
    });
  }
  test(name+' inserts, deletes and merges lines with neighbor endings', () => {
    const nearby = state.endings[0] ?? '\n';
    const inserted = edit(state,0,0,'x\ny\n');
    assert.equal(serializeSource(inserted.doc,inserted.endings),'x'+nearby+'y'+nearby+source);
    const deleted = edit(inserted,0,4,'');
    assert.equal(serializeSource(deleted.doc,deleted.endings),source);
    const added = edit(state,doc.length,doc.length,'\n');
    assert.equal(serializeSource(added.doc,added.endings),source+(state.endings.at(-1)??'\n'));
    const removed = edit(added,doc.length,doc.length+1,'');
    assert.equal(serializeSource(removed.doc,removed.endings),source);
  });
}

test('original QA edits retain 452 bytes including the final CR', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/source-workspace-mixed-eol.json',import.meta.url)));
  const original = Buffer.from(fixture.original.base64,'base64').toString('utf8');
  const expected = Buffer.from(fixture.expected.base64,'base64');
  let state = {doc:original.replace(/\r\n?/g,'\n'),endings:sourceEndings(original)};
  for (const [before,after] of [
    ['Signal energy','Signal power'],['E =','P ='],
    ['% Nested braces','% 第四阶段：源码完整性\n% Nested braces'],['Escapes:','Special characters:'],
  ]) {
    const from = state.doc.indexOf(before);
    assert.ok(from >= 0);
    state = edit(state,from,from+before.length,after);
  }
  const actual = Buffer.from(serializeSource(state.doc,state.endings),'utf8');
  assert.equal(actual.length,452);
  assert.deepEqual(actual,expected);
});

test('disjoint edits use original coordinates', () => {
  assert.deepEqual(updateEndings(['\n','\r\n','\r','\n'],[
    {from:0,to:1,inserted:2},{from:3,to:4,inserted:0},
  ]),['\n','\n','\r\n','\r']);
});

test('large source has no spread argument limit', () => {
  const endings = Array(300000).fill('\r\n');
  const result = updateEndings(endings,[{from:1,to:1,inserted:1}]);
  assert.equal(result.length,300001);
  assert.equal(result.at(-1),'\r\n');
});

test('serialization rejects mismatched metadata', () => {
  assert.throws(() => serializeSource('a\nb',[]),RangeError);
  assert.throws(() => serializeSource('a',['\n']),RangeError);
});
