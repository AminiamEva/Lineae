import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDocumentFormulas} from '../apps/web/src/editor/native-math/document.mjs';
import {nativeTarget} from '../apps/web/src/editor/native-math/resolve.mjs';
import {createMathSurface} from '../apps/web/src/editor/native-surface/math-surface.mjs';

const source = '\\begin{document}\n\\[\\frac{a}{}\\]\n\\end{document}\n';
const filled = '\\begin{document}\n\\[\\frac{a}{b}\\]\n\\end{document}\n';

function setup(text = source) {
  const projection = projectDocumentFormulas(text);
  const formula = projection.formulas[0];
  const slot = role => formula.math.slots.find(candidate => candidate.role === role);
  const token = nucleus => formula.math.atoms.find(atom => atom.nucleus === nucleus);
  return {
    projection, formula, token,
    denominator: slot('denominator'), numerator: slot('numerator'),
  };
}

const page = (fields, glyphs = []) => [{
  page: 1, exact: true,
  dl: {math_owners: {fields, glyphs}},
}];
const field = (owner, role, x, empty) => ({owner, role, empty, bbox: [x, 100, x, 100]});
const glyph = (owner, x, width = 20) => ({owner, char: 97, bbox: [x, 90, x + width, 100]});

test('a native caret stops at real formula boundaries and edits exactly one slot', () => {
  const {projection, denominator, numerator, token} = setup();
  const surface = createMathSurface({resolve: endpoint => nativeTarget(projection, endpoint)});
  assert.equal(denominator.raw, '');
  assert.ok(surface.setObservation(page([
    field(denominator.tag, 'den', 300, true),
    field(numerator.tag, 'num', 100, false),
  ], [glyph(token('a').tag, 100)])));
  const caret = surface.nearest(1, 300, 100);
  assert.equal(caret.slot.id, denominator.id);
  assert.equal(caret.local, 0);
  const edit = surface.insert('b');
  assert.equal(edit.text, '\\frac{a}{b}');
  assert.deepEqual(edit.patch, {from: 9, to: 9, insert: 'b'});
  assert.equal(surface.pendingOffset, caret.docOffset + 1);
});

test('arrows stay inside the served formula and deletion removes one source character', () => {
  const {projection, denominator, numerator, token} = setup();
  const surface = createMathSurface({resolve: endpoint => nativeTarget(projection, endpoint)});
  surface.setObservation(page([
    field(denominator.tag, 'den', 300, true),
    field(numerator.tag, 'num', 100, false),
  ], [glyph(token('a').tag, 100)]));
  const den = surface.nearest(1, 300, 100);
  assert.ok(den);
  const left = surface.move(-1);
  assert.ok(left.docOffset < den.docOffset, 'Left moves to a real earlier stop, not a guessed one');
  let first = left;
  for (let i = 0; i < 8; i++) first = surface.move(-1);
  assert.equal(surface.move(-1).docOffset, first.docOffset, 'The first stop clamps instead of inventing one');
  assert.ok(surface.move(1).docOffset > first.docOffset);

  const typed = setup(filled);
  const b = typed.token('b');
  assert.ok(b);
  const surface2 = createMathSurface({resolve: endpoint => nativeTarget(typed.projection, endpoint)});
  surface2.setObservation(page([
    field(typed.denominator.tag, 'den', 300, false),
  ], [glyph(b.tag, 300)]));
  assert.equal(surface2.nearest(1, 320, 100).slot.role, 'nucleus');
  const erased = surface2.erase(true);
  assert.equal(erased.text, '\\frac{a}{}');
  assert.equal(erased.patch.insert, '');
  assert.equal(surface2.pendingOffset, typed.formula.from16 + b.from16);
});

test('a selection across slots is not silently rewritten', () => {
  const {projection, denominator, numerator, token} = setup();
  const surface = createMathSurface({resolve: endpoint => nativeTarget(projection, endpoint)});
  surface.setObservation(page([
    field(denominator.tag, 'den', 300, true),
    field(numerator.tag, 'num', 100, false),
  ], [glyph(token('a').tag, 100)]));
  const numeratorStop = surface.nearest(1, 100, 100);
  const denominatorStop = surface.nearest(1, 300, 100);
  assert.ok(numeratorStop && denominatorStop);
  surface.selectBetween(numeratorStop.docOffset, denominatorStop.docOffset);
  assert.equal(surface.insert('x'), null);
});

test('a pending caret offset resolves against the next observation', () => {
  const first = setup();
  let projection = first.projection;
  const surface = createMathSurface({resolve: endpoint => nativeTarget(projection, endpoint)});
  surface.setObservation(page([field(first.denominator.tag, 'den', 300, true)],
    [glyph(first.token('a').tag, 100)]));
  surface.nearest(1, 300, 100);
  surface.insert('b');
  const pending = surface.pendingOffset;
  const second = setup(filled);
  projection = second.projection;
  assert.ok(surface.setObservation(page([field(second.denominator.tag, 'den', 300, false)],
    [glyph(second.token('b').tag, 300)])));
  assert.equal(surface.caret.docOffset, pending);
  assert.equal(surface.caret.slot.role, 'nucleus');
});
