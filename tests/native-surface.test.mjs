import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDocumentFormulas,projectSnapshotFormulas} from '../apps/web/src/editor/native-math/document.mjs';
import {nativeTarget} from '../apps/web/src/editor/native-math/resolve.mjs';
import {createMathSurface} from '../apps/web/src/editor/native-surface/math-surface.mjs';
import {createTextSurface} from '../apps/web/src/editor/native-surface/text-surface.mjs';
import {projectTextDocument,projectMixedDocument,projectMixedSnapshot,textTarget,textEdit} from '../apps/web/src/editor/native-text/projection.mjs';

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

test('forward delete removes the selected denominator glyph even at the slot end', () => {
  const {projection, denominator, token} = setup(filled);
  const surface = createMathSurface({resolve: endpoint => nativeTarget(projection, endpoint)});
  const observation = page([field(denominator.tag, 'den', 300, false)], [glyph(token('b').tag, 300)]);
  surface.setObservation(observation);
  const first = surface.nearest(1, 300, 100);
  const last = surface.nearest(1, 320, 100);
  assert.ok(surface.selectBetween(first.docOffset, last.docOffset));
  surface.setObservation(observation);
  assert.equal(surface.erase(false)?.text, '\\frac{a}{}');
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

const textSource = '\\begin{document}\nAlpha beta.\n\\end{document}\n';

test('plain prose is tagged per grapheme without changing its bytes', () => {
  const projection = projectTextDocument(textSource);
  const paragraph = projection.paragraphs[0];
  assert.equal(paragraph.text, 'Alpha beta.');
  assert.equal(projection.projection.replace(/\\begingroup|\\endgroup|\\attribute65000=\d+ /g, ''),
    textSource);
  assert.deepEqual(paragraph.glyphs.map(glyph => glyph.char), [...'Alphabeta.']);
  assert.equal(projection.owners.get(paragraph.glyphs[0].tag).glyph.from16, 0);
});

test('a native text caret edits one grapheme and keeps prose offsets exact', () => {
  const projection = projectTextDocument(textSource);
  const surface = createTextSurface({projection});
  const glyphs = projection.paragraphs[0].glyphs.map((glyph, index) => ({
    owner: glyph.tag, char: glyph.char.codePointAt(0), bbox: [100 + index * 20, 90, 120 + index * 20, 100],
  }));
  assert.ok(surface.setObservation([{page: 1, exact: true, dl: {math_owners: {fields: [], glyphs}}}]));
  const caret = surface.nearest(1, 100, 95);
  assert.equal(caret.local, 0);
  const edit = surface.insert('X');
  assert.equal(edit.text, 'XAlpha beta.');
  assert.equal(edit.source, textSource.replace('Alpha beta.', 'XAlpha beta.'));
  assert.equal(surface.pendingOffset, projection.paragraphs[0].from16 + 1);
});

test('backspace removes one whole grapheme and never crosses a paragraph', () => {
  const projection = projectTextDocument(textSource);
  const surface = createTextSurface({projection});
  const paragraph = projection.paragraphs[0];
  const glyphs = paragraph.glyphs.map((glyph, index) => ({
    owner: glyph.tag, char: glyph.char.codePointAt(0), bbox: [100 + index * 20, 90, 120 + index * 20, 100],
  }));
  surface.setObservation([{page: 1, exact: true, dl: {math_owners: {fields: [], glyphs}}}]);
  surface.selectBetween(paragraph.from16 + 5, paragraph.from16 + 5);
  const edit = surface.erase();
  assert.equal(edit.text, 'Alph beta.');
  assert.equal(surface.pendingOffset, paragraph.from16 + 4);
  surface.clearPending();
  surface.selectBetween(paragraph.from16, paragraph.from16);
  assert.equal(surface.erase(), null);
});

test('native prose targeting refuses TeX syntax instead of guessing a range', () => {
  assert.equal(projectTextDocument('\\begin{document}\nCost $5.\n\\end{document}\n'),null);
  assert.equal(textTarget(null, 1, false), null);
});

test('mixed prose and display math share one projection and keep distinct owners', () => {
  const mixedSource = '\\begin{document}\nIntro text.\n\n\\[\\frac{a}{b}\\]\n\nOutro text.\n\\end{document}\n';
  const projection = projectMixedDocument(mixedSource);
  assert.equal(projection.kind, 'mixed');
  assert.deepEqual(projection.paragraphs.map(paragraph => paragraph.text), ['Intro text.', 'Outro text.']);
  assert.equal(projection.formulas.length, 1);
  assert.equal(projection.projection.replace(/\\begingroup|\\endgroup|\\attribute65000=\d+ /g, ''), mixedSource);
  const textOwner = projection.paragraphs[0].glyphs[0].tag;
  const mathOwner = projection.formulas[0].math.atoms.find(atom => atom.kind === 'token').tag;
  assert.equal(textTarget(projection, textOwner, false).kind, 'text');
  assert.equal(nativeTarget(projection, {owner:textOwner, role:'nucleus', after:false}), null);
  assert.equal(nativeTarget(projection, {owner:mathOwner, role:'nucleus', after:false}).kind, 'math');
});

test('inline math splits prose into runs that never edit across the math node', () => {
  const inlineSource = '\\begin{document}\nBefore $x$ after.\n\\end{document}\n';
  const projection = projectMixedDocument(inlineSource);
  assert.equal(projection.kind, 'mixed');
  const paragraph = projection.paragraphs[0];
  assert.equal(paragraph.text, 'Before $x$ after.');
  assert.deepEqual(paragraph.parts.map(part => part.kind), ['text', 'math', 'text']);
  assert.deepEqual(paragraph.runs.map(run => run.text), ['Before ', ' after.']);
  const surface = createTextSurface({projection});
  const glyphs = paragraph.glyphs.map((glyph, index) => ({
    owner:glyph.tag, char:glyph.char.codePointAt(0), bbox:[100 + index * 20, 90, 120 + index * 20, 100],
  }));
  surface.setObservation([{page:1, exact:true, dl:{math_owners:{fields:[], glyphs}}}]);
  const secondRun = paragraph.runs[1];
  surface.selectBetween(paragraph.from16 + secondRun.from16 + 1, paragraph.from16 + secondRun.from16 + 1);
  const edit = surface.insert('Z');
  assert.equal(edit.text, 'Before $x$ Zafter.');
  assert.equal(textEdit(projection, {
    paragraph, from16:paragraph.runs[0].to16 - 1, to16:paragraph.runs[1].from16 + 1, insert:'',
  }), null);
});

test('a protected block does not disable targeting in neighboring plain prose', () => {
  const source = '\\begin{document}\n\\section{Heading}\n\nPlain prose.\n\n\\custom{Keep me}\n\\end{document}\n';
  const projection = projectTextDocument(source);
  assert.equal(projection.paragraphs.length, 1);
  const [paragraph] = projection.paragraphs;
  assert.equal(paragraph.text, 'Plain prose.');
  assert.ok(projection.projection.includes('\\section{Heading}'));
  assert.ok(projection.projection.includes('\\custom{Keep me}'));
  assert.equal(textEdit(projection, {paragraph, from16:0, to16:0, insert:'X'}).source,
    source.replace('Plain prose.', 'XPlain prose.'));
});

test('identical offsets in two included files remain distinct native caret addresses', () => {
  const bytes = [...new TextEncoder().encode(source.split('\n')[1]+'\n')];
  const projection = projectSnapshotFormulas({
    source: source.replace('\\[\\frac{a}{}\\]', ''),
    mainFile:'main.tex',files:[{path:'one.tex',bytes},{path:'two.tex',bytes}],
  });
  const slots=projection.formulas.map(formula=>formula.math.slots.find(slot=>slot.role==='denominator'));
  const surface=createMathSurface({resolve:endpoint=>nativeTarget(projection,endpoint)});
  surface.setObservation(page(slots.map((slot,index)=>field(slot.tag,'den',300+100*index,true))));
  assert.equal(surface.stops.length,2);
  const offset=surface.stops[0].docOffset;
  assert.equal(surface.stops[1].docOffset,offset);
  assert.equal(surface.selectBetween(offset,offset,'one.tex','two.tex'),false);
  assert.ok(surface.selectBetween(offset,offset,'two.tex'));
  assert.equal(surface.insert('b').formula.filePath,'two.tex');
});

test('a plain marked paragraph instruments only the command argument',()=>{
  const source='\\begin{document}\n\\textbf{Bold prose.}\n\\end{document}\n';
  const projection=projectTextDocument(source);
  const [paragraph]=projection.paragraphs;
  assert.equal(paragraph.parts[0].mark,'bold');
  assert.equal(paragraph.text,'Bold prose.');
  assert.ok(projection.projection.includes('\\textbf{\\begingroup'));
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:0,insert:'X'}).source,
    source.replace('Bold prose.','XBold prose.'));
});

test('mixed project prose edits refer to the child file, not the main snapshot',()=>{
  const child='Original chapter.\n\n\\[\\frac{z}{}\\]\n';
  const bytes=[...new TextEncoder().encode(child)];
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',files:[{path:'chapter.tex',bytes}]});
  const [paragraph]=projection.paragraphs;
  assert.equal(paragraph.filePath,'chapter.tex');
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:0,insert:'X'}).source,'X'+child);
});
