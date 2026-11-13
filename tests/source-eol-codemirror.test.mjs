import assert from 'node:assert/strict';
import {test} from 'node:test';

async function harness(source) {
  const {EditorState} = await import('@codemirror/state');
  const {history, undo, redo, isolateHistory} = await import('@codemirror/commands');
  const {sourceEolExtensions, sourceWithEndings} = await import('../apps/web/src/editor/source-eol-state.js');
  let state = EditorState.create({
    doc:source.replace(/\r\n?/g,'\n'),
    extensions:[history(),sourceEolExtensions(source)],
  });
  const dispatch = transaction => { state = transaction.state; };
  return {
    text: () => sourceWithEndings(state),
    edit(changes, separate = true) {
      dispatch(state.update({changes,userEvent:'input.type',
        annotations:separate ? isolateHistory.of('full') : []}));
    },
    undo: () => undo({state,dispatch}),
    redo: () => redo({state,dispatch}),
  };
}

test('CodeMirror undo restores deleted CRLF and redo preserves the new context', async () => {
  const h = await harness('a\r\nb\nc\r');
  h.edit({from:1,to:2});
  assert.equal(h.text(),'ab\nc\r');
  assert.equal(h.undo(),true);
  assert.equal(h.text(),'a\r\nb\nc\r');
  assert.equal(h.redo(),true);
  assert.equal(h.text(),'ab\nc\r');
  h.edit({from:1,insert:'\n'});
  assert.equal(h.text(),'a\nb\nc\r');
  h.undo();
  assert.equal(h.text(),'ab\nc\r');
  h.undo();
  assert.equal(h.text(),'a\r\nb\nc\r');
});

test('grouped CodeMirror history restores both document and separators', async () => {
  const source = 'a\r\nb\nc';
  const h = await harness(source);
  h.edit({from:1,insert:'\n'},false);
  h.edit({from:2,insert:'x\n'},false);
  const edited = h.text();
  assert.equal(edited,'a\r\nx\r\n\r\nb\nc');
  assert.equal(h.undo(),true);
  assert.equal(h.text(),source);
  assert.equal(h.redo(),true);
  assert.equal(h.text(),edited);
});

test('multiple ranges, complete replacement, empty files and repeated history', async () => {
  const h = await harness('a\r\nb\nc');
  h.edit([{from:0,insert:'x\n'},{from:4,insert:'\ny'}]);
  assert.equal(h.text(),'x\r\na\r\nb\n\nyc');
  h.undo();
  assert.equal(h.text(),'a\r\nb\nc');
  h.edit({from:0,to:5,insert:''});
  assert.equal(h.text(),'');
  h.edit({from:0,insert:'中文\n'});
  assert.equal(h.text(),'中文\n');
  h.undo();
  assert.equal(h.text(),'');
  h.undo();
  assert.equal(h.text(),'a\r\nb\nc');
});

for (const source of ['a\nb\r\nc\n','a\r\nb\nc\r','中文\r\n$x$\n\n']) {
  test('real CodeMirror edit sequences and undo/redo '+JSON.stringify(source), async () => {
    const h=await harness(source);
    const snapshots=[source];
    for (const changes of [{from:0,insert:'first\nnext\n'},{from:0,to:6},{from:1,insert:'中'},{from:0,to:1,insert:'Z'}]) {
      h.edit(changes); snapshots.push(h.text());
    }
    for (let i=snapshots.length-2;i>=0;i--) {assert.equal(h.undo(),true);assert.equal(h.text(),snapshots[i]);}
    for (let i=1;i<snapshots.length;i++) {assert.equal(h.redo(),true);assert.equal(h.text(),snapshots[i]);}
  });
}
test('same normalized text may legitimately have different separator metadata', async () => {
  const h=await harness('a\r\nb\n');
  h.edit({from:1,to:2});
  h.edit({from:1,insert:'\n'});
  assert.equal(h.text(),'a\nb\n');
  h.undo(); h.undo(); assert.equal(h.text(),'a\r\nb\n');
});
