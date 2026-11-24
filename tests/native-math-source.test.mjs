import test from 'node:test';
import assert from 'node:assert/strict';
import {projectMath, applySlotEdit} from '../apps/web/src/editor/native-math/source.mjs';

const field = (snapshot, role, raw) => snapshot.slots.find(s => s.role === role && (raw === undefined || s.raw === raw));
const edit = (snapshot, slot, from16, to16, insert) => applySlotEdit(snapshot, {slotId: slot.id, from16, to16, insert});
const patched = (source, patch) => source.slice(0, patch.from) + patch.insert + source.slice(patch.to);

test('empty fraction fields remain empty and denominator insertion is exactly one source character', () => {
  const source = String.raw`\frac{a}{}`;
  const snapshot = projectMath(source);
  assert.equal(snapshot.supported, true);
  assert.equal(snapshot.source, source);
  const denominator = field(snapshot, 'denominator');
  const owner = snapshot.atoms.find(a => a.id === denominator.ownerId);
  assert.equal(denominator.raw, '');
  assert.equal(denominator.tag, owner.tag);
  assert.match(snapshot.projection, /\\frac\{/);
  assert.ok(snapshot.projection.includes('}{}'), 'nothing is inserted into an empty denominator');
  assert.ok(snapshot.projection.indexOf(`\\attribute65000=${owner.tag}\\relax `) < snapshot.projection.indexOf('\\frac'));
  const result = edit(snapshot, denominator, 0, 0, 'b');
  assert.deepEqual(result.patch, {from: 9, to: 9, insert: 'b'});
  assert.equal(result.source, String.raw`\frac{a}{b}`);
  assert.equal(patched(source, result.patch), result.source);
  assert.deepEqual(result.selection, {
    slotId: denominator.id, from16: 1, to16: 1, anchor16: 10, head16: 10,
  });
  assert.equal(snapshot.source, source);
  assert.equal(denominator.raw, '');
  assert.ok(projectMath(String.raw`\frac{}{}`).projection.includes('\\frac{}{}'));
});

test('nested owners expose independent source fields and reconcile edited and shifted siblings', () => {
  const source = String.raw`\frac{\sqrt{a}}{\frac{b}{}}z`;
  const before = projectMath(source);
  const empty = field(before, 'denominator', '');
  const change = edit(before, empty, 0, 0, 'c');
  const after = projectMath(change.source, {previous: before});
  assert.equal(field(after, 'denominator', 'c').id, empty.id);
  assert.equal(field(after, 'radicand', 'a').id, field(before, 'radicand', 'a').id);
  assert.equal(after.atoms.find(a => a.raw === 'z').id, before.atoms.find(a => a.raw === 'z').id);
  const undo = projectMath(source, {previous: after});
  assert.equal(field(undo, 'denominator', '').id, empty.id);
  const redo = projectMath(change.source, {previous: undo});
  assert.equal(field(redo, 'denominator', 'c').id, empty.id);
  assert.equal(redo.source, change.source);
});

test('unchanged identical siblings retain range-matched IDs after a prefix insertion', () => {
  const before = projectMath('aa');
  const after = projectMath('baa', {previous: before});
  const oldTokens = before.atoms.filter(a => a.kind === 'token');
  const newTokens = after.atoms.filter(a => a.kind === 'token');
  assert.deepEqual(newTokens.slice(1).map(a => a.id), oldTokens.map(a => a.id));
  assert.ok(!oldTokens.some(a => a.id === newTokens[0].id));
});

test('scripts support grouped, empty and single arguments with projection-only single-argument braces', () => {
  const snapshot = projectMath(String.raw`x^2_{ab}y_{}^{\frac{a}{b}}`);
  assert.equal(snapshot.supported, true);
  const exponent = field(snapshot, 'superscript', '2');
  assert.equal(exponent.single, true);
  assert.match(snapshot.projection, /\^\{\\attribute65000=\d+\\relax 2/);
  assert.ok(snapshot.projection.includes('_{}'));
  assert.equal(edit(snapshot, exponent, 0, 1, '3').source, String.raw`x^3_{ab}y_{}^{\frac{a}{b}}`);
  assert.throws(() => edit(snapshot, exponent, 0, 1, '34'), /ungrouped script/);
  assert.throws(() => edit(snapshot, exponent, 0, 1, ''), /ungrouped script/);
  const grouped = field(snapshot, 'subscript', 'ab');
  assert.equal(edit(snapshot, grouped, 1, 1, 'c').source, String.raw`x^2_{acb}y_{}^{\frac{a}{b}}`);
});

test('comments, whitespace and mixed EOL are byte-for-byte preserved', () => {
  const source = ' \r\n\\frac % macro comment\r\n{a% }\\unknown\r\n}{% empty\n}\t';
  const snapshot = projectMath(source);
  assert.equal(snapshot.supported, true);
  assert.equal(snapshot.source, source);
  assert.equal(field(snapshot, 'denominator').raw, '% empty\n');
  const numerator = field(snapshot, 'numerator');
  const result = edit(snapshot, numerator, 0, 1, 'b');
  assert.equal(result.source, source.replace('{a%', '{b%'));
  assert.deepEqual(result.patch, {from: numerator.from16, to: numerator.from16 + 1, insert: 'b'});
  assert.throws(() => edit(snapshot, numerator, 2, 3, 'x'), /comment/);
  const trailing = projectMath('a% retained');
  assert.ok(trailing.projection.endsWith('% retained\n\\endgroup'));
});

test('UTF-16, UTF-8 and inserted projection maps round trip Unicode and CRLF', () => {
  const source = '\\frac{𝑥a\u0301}{β}\r\n';
  const snapshot = projectMath(source);
  assert.equal(snapshot.supported, true);
  const m = snapshot.mapping;
  assert.equal(m.source16To8[source.length], Buffer.byteLength(source));
  assert.equal(m.projection16To8[snapshot.projection.length], Buffer.byteLength(snapshot.projection));
  const astral = source.indexOf('𝑥');
  assert.equal(m.source16To8[astral + 1], null);
  assert.equal(m.sourceToProjection16[astral + 1], null);
  for (let i = 0; i <= source.length; i++) {
    if (m.source16To8[i] === null) continue;
    const projected = m.sourceToProjection16[i];
    assert.equal(m.projectionToSource16[projected], i);
    const byte = m.source16To8[i];
    assert.equal(m.source8To16[byte], i);
    assert.equal(m.projectionToSource8[m.sourceToProjection8[byte]], byte);
  }
  assert.equal(m.source8To16[m.source16To8[astral] + 1], null);
  for (const insertion of m.insertions) {
    assert.equal(snapshot.projection.slice(insertion.from16, insertion.to16), insertion.text);
    assert.equal(m.projectionToSource16[insertion.from16], insertion.source16);
    assert.equal(m.projectionToSource16[insertion.to16], insertion.source16);
  }
  // Removing exactly the recorded insertion spans reproduces every source byte.
  let recovered = snapshot.projection;
  for (const insertion of [...m.insertions].reverse()) {
    recovered = recovered.slice(0, insertion.from16) + recovered.slice(insertion.to16);
  }
  assert.equal(recovered, source);
});

test('slot-relative offsets, grapheme-safe minimal replacement, and immutable results', () => {
  const snapshot = projectMath(String.raw`\frac{𝑥á}{β}`);
  const numerator = field(snapshot, 'numerator');
  const result = edit(snapshot, numerator, 0, numerator.raw.length, '𝑥b');
  assert.deepEqual(result.patch, {from: numerator.from16 + 2, to: numerator.to16, insert: 'b'});
  assert.equal(result.source, String.raw`\frac{𝑥b}{β}`);
  assert.throws(() => edit(snapshot, numerator, 1, 1, 'a'), /grapheme/);
  assert.throws(() => edit(snapshot, numerator, 3, 3, 'a'), /grapheme/);
  assert.throws(() => edit(snapshot, numerator, 0, 0, '\ud800'), /surrogate/);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.slots[0]));
  assert.ok(Object.isFrozen(snapshot.mapping.sourceToProjection16));
  assert.ok(Object.isFrozen(result.patch));
  assert.throws(() => { snapshot.slots[0].raw = 'changed'; }, TypeError);
});

test('unknown syntax and malformed input fail closed with explicit diagnostics', () => {
  for (const source of [
    String.raw`\unknown{a}`, String.raw`\alpha`, String.raw`\sqrt[3]{a}`,
    String.raw`\frac a b`, String.raw`\frac{a}`, '{a', 'a}', 'x^', 'x^a^b',
    String.raw`x^\sqrt{a}`, '$a$', String.raw`\[a\]`, 'a+b', '😀', '\ud800',
  ]) {
    const snapshot = projectMath(source);
    assert.equal(snapshot.supported, false, JSON.stringify(source));
    assert.equal(snapshot.source, source);
    assert.equal(snapshot.projection, source);
    assert.deepEqual(snapshot.slots, []);
    assert.deepEqual(snapshot.atoms, []);
    assert.equal(snapshot.mapping, undefined);
    assert.equal(snapshot.diagnostics[0].code, 'unsupported-math');
    assert.throws(() => applySlotEdit(snapshot, {slotId: 'missing', from16: 0, to16: 0, insert: 'b'}));
  }
});

test('reject unknown/stale IDs, invalid ranges, structural edits and manufactured snapshots', () => {
  const snapshot = projectMath(String.raw`\frac{a}{b}`);
  const numerator = field(snapshot, 'numerator');
  assert.throws(() => edit(snapshot, {id: 'missing'}, 0, 0, 'a'), /stale/);
  for (const [from, to] of [[-1, 0], [1, 0], [0, 2], [0.5, 1], [NaN, 1]]) {
    assert.throws(() => edit(snapshot, numerator, from, to, 'a'), /range/);
  }
  for (const insert of ['{', '}', '\\alpha', '^', '_', '%', '$', '+']) {
    assert.throws(() => edit(snapshot, numerator, 0, 0, insert), /unsupported/);
  }
  const root = field(snapshot, 'body');
  assert.throws(() => edit(snapshot, root, 0, 5, ''), /structural/);
  assert.throws(() => edit(snapshot, root, 2, 2, 'a'), /structural/);
  const later = projectMath('b', {previous: snapshot});
  assert.throws(() => edit(later, numerator, 0, 0, 'a'), /stale/);
  assert.throws(() => projectMath('a', {previous: {...snapshot}}), /Previous/);
  assert.throws(() => applySlotEdit({...snapshot}, {slotId: numerator.id, from16: 0, to16: 0, insert: 'b'}), /snapshot/);
});

test('attribute configuration is explicit and no-op patches stay empty', () => {
  const snapshot = projectMath('abc', {attribute: 64000});
  assert.match(snapshot.projection, /\\attribute64000=/);
  assert.doesNotMatch(snapshot.projection, /65000/);
  const result = edit(snapshot, field(snapshot, 'body'), 0, 3, 'abc');
  assert.deepEqual(result.patch, {from: 3, to: 3, insert: ''});
  assert.equal(result.source, snapshot.source);
  for (const attribute of [-1, 65536, 1.5, NaN]) {
    assert.throws(() => projectMath('a', {attribute}), /Attribute/);
  }
});

test('unsupported intermediate snapshots do not recycle old owner/slot IDs', () => {
  const before = projectMath(String.raw`\frac{a}{b}`);
  const opaque = projectMath(String.raw`\unknown{a}`, {previous: before});
  const after = projectMath('b', {previous: opaque});
  const oldIds = new Set(before.atoms.map(a => a.id));
  assert.equal(after.supported, true);
  assert.ok(after.atoms.every(a => !oldIds.has(a.id)));
});

test('CRLF is one grapheme boundary and edits via ancestor slots cannot escape a single script', () => {
  const snapshot = projectMath('x^a\r\nb');
  const root = field(snapshot, 'body');
  assert.throws(() => edit(snapshot, root, 4, 4, 'c'), /grapheme/);
  assert.throws(() => edit(snapshot, root, 2, 3, 'ab'), /ungrouped script/);
  assert.equal(edit(snapshot, root, 5, 6, 'c').source, 'x^a\r\nc');
});
