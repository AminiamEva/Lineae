import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDocumentFormulas,projectSnapshotFormulas} from '../apps/web/src/editor/native-math/document.mjs';
import {nativeMathContext,nativeTarget} from '../apps/web/src/editor/native-math/resolve.mjs';
import {applySlotEdit,applyStructureCommand,applyScalableFence,nativeMathCommandNames,projectMath} from '../apps/web/src/editor/native-math/source.mjs';
import {createMathSurface} from '../apps/web/src/editor/native-surface/math-surface.mjs';
import {createTextSurface} from '../apps/web/src/editor/native-surface/text-surface.mjs';
import {createNativeDocumentSession} from '../apps/web/src/editor/native-surface/document-session.mjs';
import {canBeginProseFormula,projectTextDocument,projectMixedDocument,projectMixedSnapshot,textTarget,textEdit} from '../apps/web/src/editor/native-text/projection.mjs';
import {richSourceChanges,sourceProjection,standaloneMathChanges} from '../apps/web/src/editor/source-sync.js';
import {importBlocks} from '../apps/web/latex/blocks.mjs';
import {parseDocument} from '../apps/web/latex/document.mjs';

const source = '\\begin{document}\n\\[\\frac{a}{}\\]\n\\end{document}\n';
const filled = '\\begin{document}\n\\[\\frac{a}{b}\\]\n\\end{document}\n';

test('native inline formula insertion accepts a plain run beside existing math and marks',()=>{
  const mixed='\\begin{document}\nBefore $x$ \\textbf{bold} after.\n\\end{document}\n';
  const [paragraph]=projectMixedDocument(mixed).paragraphs;
  const text=(local)=>({kind:'text',paragraph,local});
  assert.equal(canBeginProseFormula(text(0),text(3),false),true);
  assert.equal(canBeginProseFormula(text(0),text(0),true),false);
  assert.equal(canBeginProseFormula(text(2),text(paragraph.text.indexOf('after')),false),false);
  const bold=paragraph.text.indexOf('bold');
  assert.equal(canBeginProseFormula(text(bold+1),text(bold+2),false),false);
});

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

test('native display Enter splits between atoms and adds a row to an existing alignment', () => {
  const display='\\begin{document}\n\\[a+b\\]\n\\end{document}\n';
  const {projection,formula,token}=setup(display);
  const surface=createMathSurface({resolve:endpoint=>nativeTarget(projection,endpoint)});
  surface.setObservation(page([], [glyph(token('a').tag,100)]));
  surface.nearest(1,120,100);
  const split=surface.command('enterLine');
  assert.equal(split.text,'\\begin{gathered}a\\\\+b\\end{gathered}');
  assert.equal(split.text.slice(surface.pendingOffset-formula.from16,split.text.indexOf('\\end')),'+b');

  const align='\\begin{document}\n\\begin{align}a&=b\\\\c&=d\\end{align}\n\\end{document}\n';
  const aligned=setup(align);
  const grid=createMathSurface({resolve:endpoint=>nativeTarget(aligned.projection,endpoint)});
  grid.setObservation(page([], [glyph(aligned.token('b').tag,100)]));
  grid.nearest(1,120,100);
  const row=grid.command('enterLine');
  assert.equal(row.text,'\\begin{align}a&=b\\\\&\\\\c&=d\\end{align}');
  const newCell=grid.pendingOffset-aligned.formula.from16;
  assert.equal(row.text.slice(newCell-3,newCell+2),'\\\\&\\\\');
});

test('native completion inserts the exact case and keeps subsequent input separate from a control word',()=>{
  assert.ok(nativeMathCommandNames.includes('Delta')&&nativeMathCommandNames.includes('delta'));
  const math=projectMath('\\frac{a}{}');
  const slot=math.slots.find(slot=>slot.role==='denominator');
  const symbol=applyStructureCommand(math,{slotId:slot.id,from16:0,to16:0,command:'Delta'});
  assert.equal(symbol.source,'\\frac{a}{\\Delta}');
  const next=projectMath(symbol.source);
  const atom=next.slots.find(slot=>slot.role==='nucleus'&&slot.raw==='\\Delta');
  const typed=applySlotEdit(next,{slotId:atom.id,from16:atom.raw.length,to16:atom.raw.length,insert:'x'});
  assert.equal(typed.source,'\\frac{a}{\\Delta x}');
  assert.equal(typed.selection.head16,typed.source.indexOf('x')+1);
});

test('native deletion removes an operator with empty slots and retains filled limits',()=>{
  const erase=source=>{
    const math=projectMath(source);
    const symbol=math.slots.find(slot=>slot.role==='nucleus'&&slot.raw==='\\int');
    return applySlotEdit(math,{slotId:symbol.id,from16:0,to16:symbol.raw.length,insert:''});
  };
  const withEmptySlots='x+\\int_{}^{}{}';
  const empty=erase(withEmptySlots);
  assert.equal(empty.source,'x+');
  assert.deepEqual(empty.patch,{from:2,to:withEmptySlots.length,insert:''});
  assert.throws(()=>erase('x+\\int_{0}^{}{}'),/structural TeX/);
  assert.equal(erase('x+\\int_{}^{}{g}').source,'x+{g}');
});

test('Backspace on an empty native script removes its syntax and returns to the operator',()=>{
  const {projection,formula}=setup('\\begin{document}\n\\[x+\\int_{}^{}{}\\]\n\\end{document}\n');
  const sub=formula.math.slots.find(slot=>slot.role==='subscript');
  const surface=createMathSurface({resolve:endpoint=>nativeTarget(projection,endpoint)});
  surface.setObservation(page([field(sub.tag,'sub',100,true)]));
  surface.nearest(1,100,100);
  const edit=surface.erase();
  assert.equal(edit.text,'x+\\int^{}{}');
  assert.equal(surface.pendingOffset,formula.from16+'x+\\int'.length);
});

test('one-character shortcuts continue on the base line and doubled caret produces a literal',()=>{
  const wrap=body=>'\\begin{document}\n\\['+body+'\\]\n\\end{document}\n';
  let evidence=setup(wrap('x'));
  const surface=createMathSurface({resolve:endpoint=>nativeTarget(evidence.projection,endpoint)});
  surface.setObservation(page([], [glyph(evidence.token('x').tag,100)]));
  surface.nearest(1,120,100);
  assert.equal(surface.singleCharacterScript('^','2').text,'x^{2}');
  evidence=setup(wrap('x^{2}'));
  surface.setObservation(page([], [glyph(evidence.token('x').tag,100),
    {owner:evidence.token('2').tag,char:50,bbox:[121,69,134,80]}]));
  assert.equal(surface.caret.docOffset,evidence.formula.to16);
  assert.equal(surface.caret.top,90);
  assert.equal(surface.insert('+').text,'x^{2}+');
  evidence=setup(wrap('x'));
  surface.setObservation(page([], [glyph(evidence.token('x').tag,100)]));
  surface.nearest(1,120,100);
  assert.equal(surface.singleCharacterScript('^','^').text,'x\\text{ˆ}');
  evidence=setup(wrap('x\\text{ˆ}'));
  surface.setObservation(page([], [glyph(evidence.token('x').tag,100),glyph(evidence.token('ˆ').tag,140)]));
  assert.equal(surface.caret.docOffset,evidence.formula.to16);
  assert.equal(surface.insert('+').text,'x\\text{ˆ}+');
});

test('scalable fences preserve selected structures and an empty fence has a verified insertion slot',()=>{
  const raw='\\frac{x}{y}';
  const math=projectMath(raw);
  const root=math.slots.find(slot=>slot.role==='body');
  const wrapped=applyScalableFence(math,root,0,raw.length,['(',')']);
  assert.equal(wrapped.source,'\\left('+raw+'\\right)');
  const empty=setup('\\begin{document}\n\\[\\left(\\right)\\]\n\\end{document}\n');
  const owner=empty.formula.math.atoms.find(atom=>atom.kind==='fence');
  const surface=createMathSurface({resolve:endpoint=>nativeTarget(empty.projection,endpoint)});
  surface.setObservation(page([], [glyph(owner.tag,100),glyph(owner.tag,150)]));
  const caret=surface.nearest(1,121,100);
  assert.equal(caret.slot.role,'body');
  assert.equal(caret.x,120);
  assert.equal(surface.insert('x').text,'\\left(x\\right)');
});

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

test('one native session restores the selected text or math address through observation',()=>{
  const source='\\begin{document}\nIntro.\n\n\\[\\frac{a}{}\\]\n\nOutro.\n\\end{document}\n';
  let projection=projectMixedDocument(source);
  const session=createNativeDocumentSession(endpoint=>nativeTarget(projection,endpoint));
  const textOwner=projection.paragraphs[0].glyphs[0].tag;
  const denominator=projection.formulas[0].math.slots.find(slot=>slot.role==='denominator');
  const prose=textTarget(projection,textOwner,false);
  const formula=nativeTarget(projection,{owner:denominator.tag,role:'den'});
  session.setObservation(page([field(denominator.tag,'den',300,true)],[glyph(textOwner,100)]),projection);
  assert.equal(session.select(prose,formula),false);
  assert.equal(session.select(formula,formula),true);
  const edit=session.surface.insert('b');
  const pending=session.surface.pendingOffset;
  assert.equal(edit.text,'\\frac{a}{b}');
  projection=projectMixedDocument(source.replace('{}','{b}'),{previous:projection});
  const inserted=projection.formulas[0].math.atoms.find(atom=>atom.nucleus==='b');
  const proseTag=projection.paragraphs[0].glyphs[0].tag;
  const outroTag=projection.paragraphs[1].glyphs[0].tag;
  session.setObservation(page([],[glyph(proseTag,100),glyph(inserted.tag,300),glyph(outroTag,400)]),projection);
  assert.equal(session.surface.caret.kind,'math');
  assert.equal(session.surface.caret.docOffset,pending);
  assert.equal(session.surface.anchor,session.surface.caret);
  assert.equal(session.leaveFormula(),true);
  assert.equal(session.surface.caret.paragraph.text,'Outro.');
  assert.equal(session.move(-1,false),true);
  assert.equal(session.surface.caret.kind,'math');
  const start=textTarget(projection,proseTag,false);
  assert.equal(session.select(start,start),true);
  assert.equal(session.surface.insert('X').source,projection.source.replace('Intro','XIntro'));
});

test('PDF-backed editing requires geometry already verified against the registered layout',()=>{
  const projection=projectMixedDocument(source);
  const session=createNativeDocumentSession(endpoint=>nativeTarget(projection,endpoint));
  const target=projection.formulas[0].math.slots.find(slot=>slot.role==='denominator');
  const [observed]=page([field(target.tag,'den',300,true)]);
  observed.exact=false;
  assert.equal(session.setObservation([observed],projection),false);
  assert.equal(session.setObservation([observed],projection,true),true);
  assert.equal(session.surface.insert('b').text,'\\frac{a}{b}');
});

test('native project selection follows include order and keeps complete display formulas',()=>{
  const source='\\begin{document}\n\\input{chapter}\n\nMain.\n\\end{document}\n';
  const chapter='Child.\n\n\\[x\\]\n';
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',
    files:[{path:'chapter.tex',bytes:new TextEncoder().encode(chapter)}]});
  const session=createNativeDocumentSession(endpoint=>nativeTarget(projection,endpoint));
  const root=projection.paragraphs.find(paragraph=>paragraph.filePath==='main.tex');
  const child=projection.paragraphs.find(paragraph=>paragraph.filePath==='chapter.tex');
  const formula=projection.formulas[0],atom=formula.math.atoms.find(atom=>atom.nucleus==='x');
  const regions=[{path:'chapter.tex',from:0,to:chapter.length},{path:'main.tex',from:source.indexOf('Main.'),to:source.length}];
  const from=textTarget(projection,child.glyphs[0].tag,false);
  const to=textTarget(projection,root.glyphs[1].tag,true);
  session.setObservation(page([],[glyph(from.owner,100),glyph(atom.tag,200),glyph(to.owner,300)]),projection,false,regions);
  assert.equal(session.select(from,to),true);
  assert.deepEqual(session.proseRanges(from,to).map(range=>range.paragraph?.text??
    range.formula.source.slice(range.formula.outerFrom16,range.formula.outerTo16)),['Child.','\\[x\\]','Main.']);
  assert.equal(session.surface.erase(),null,'A cross-file range cannot silently delete one file only');
  assert.equal(session.surface.insert('unsafe'),null);
  const edit=session.editAcrossFiles('replacement');
  assert.equal(edit.edits[1].formula,formula);
  assert.equal(edit.source,'replacement\n\n\n');
  assert.equal(edit.edits[2].source,source.replace('Main.','in.'));
});

test('native vertical movement keeps the visual column and extends to another page',()=>{
  const projection=projectMixedDocument('\\begin{document}\nTop.\n\nBottom.\n\\end{document}\n');
  const top=projection.paragraphs[0].glyphs[0],bottom=projection.paragraphs[1].glyphs[0];
  const session=createNativeDocumentSession(()=>null);
  const [first]=page([],[glyph(top.tag,100)]);
  const [second]=page([],[glyph(bottom.tag,130)]);
  second.page=2;
  session.setObservation([first,second],projection);
  const start=textTarget(projection,top.tag,false);
  session.select(start,start);
  assert.equal(session.moveVertical(1,true,true),true);
  assert.equal(session.surface.caret.page,2);
  assert.equal(session.surface.anchor.page,1);
  assert.deepEqual(session.proseRanges(session.surface.anchor,session.surface.caret).map(range=>range.paragraph.text),
    ['Top.','Bottom.']);
});

test('native outline targeting selects the second repeated heading on its measured page',()=>{
  const source='\\begin{document}\n\\section{Repeat}\n\n\\section{Repeat}\n\\end{document}\n';
  const projection=projectMixedDocument(source);
  const [a,b]=projection.paragraphs.map(paragraph=>paragraph.glyphs[0]);
  const [first]=page([],[glyph(a.tag,100)]),[second]=page([],[glyph(b.tag,100)]);
  second.page=2;
  const session=createNativeDocumentSession(()=>null);
  session.setObservation([first,second],projection);
  const target={from:source.lastIndexOf('\\section'),to:source.length,heading:'section',source};
  assert.equal(session.selectRegion(target),true);
  assert.equal(session.surface.caret.page,2);
  assert.equal(session.selectRegion({...target,source:source+'% edited'}),false);
});

test('native cross-file replacement produces one edit per file and a parent caret address',()=>{
  const source='\\begin{document}\nAlpha beta.\n\n\\input{chapter}\n\\end{document}\n';
  const chapter='XYZ child.\n';
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',
    files:[{path:'chapter.tex',bytes:new TextEncoder().encode(chapter)}]});
  const session=createNativeDocumentSession(()=>null);
  const [root,child]=projection.paragraphs;
  const from=textTarget(projection,root.glyphs[4].tag,true),to=textTarget(projection,child.glyphs[1].tag,true);
  const regions=[{path:'main.tex',from:0,to:source.indexOf('\\input')},{path:'chapter.tex',from:0,to:chapter.length}];
  session.setObservation(page([],[glyph(from.owner,100),glyph(to.owner,200)]),projection,false,regions);
  assert.equal(session.select(from,to),true);
  const edit=session.editAcrossFiles(' changed.');
  assert.deepEqual(edit.edits.map(change=>change.source),[source.replace('Alpha beta.','Alpha changed.'),'Z child.\n']);
  assert.equal(session.surface.pendingOffset,source.indexOf('Alpha')+'Alpha changed.'.length);
  assert.equal(edit.paragraph.filePath,'main.tex');
});

test('native cross-file replacement covers inline math and preserves surviving text marks',()=>{
  const source='\\begin{document}\nBefore $z$ end.\n\n\\input{chapter}\n\\end{document}\n';
  const chapter='\\textbf{XYZ} child.\n';
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',
    files:[{path:'chapter.tex',bytes:new TextEncoder().encode(chapter)}]});
  const session=createNativeDocumentSession(()=>null);
  const [root,child]=projection.paragraphs;
  const from=textTarget(projection,root.glyphs[5].tag,true),to=textTarget(projection,child.glyphs[1].tag,true);
  const regions=[{path:'main.tex',from:0,to:source.indexOf('\\input')},{path:'chapter.tex',from:0,to:chapter.length}];
  session.setObservation(page([],[glyph(from.owner,100),glyph(to.owner,200)]),projection,false,regions);
  assert.equal(session.select(from,to),true);
  const edit=session.editAcrossFiles(' updated.');
  assert.deepEqual(edit.edits.map(change=>change.source),[
    source.replace('Before $z$ end.','Before updated.'),'\\textbf{Z} child.\n',
  ]);
});

test('native cross-file replacement preserves enclosing text environments',()=>{
  const source='\\begin{document}\n\\begin{center}\nBefore section.\n\\end{center}\n\n\\input{chapter}\n\\end{document}\n';
  const chapter='\\begin{proof}\nStartChild.\n\\end{proof}\n';
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',
    files:[{path:'chapter.tex',bytes:new TextEncoder().encode(chapter)}]});
  const session=createNativeDocumentSession(()=>null);
  const [root,child]=projection.paragraphs;
  assert.equal(root.container.type,'blockquote');
  assert.equal(child.container.type,'theoremBlock');
  const from=textTarget(projection,root.glyphs[5].tag,true),to=textTarget(projection,child.glyphs[4].tag,true);
  const regions=[{path:'main.tex',from:0,to:source.indexOf('\\input')},{path:'chapter.tex',from:0,to:chapter.length}];
  session.setObservation(page([],[glyph(from.owner,100),glyph(to.owner,200)]),projection,false,regions);
  assert.equal(session.select(from,to),true);
  const edit=session.editAcrossFiles(' updated.');
  assert.deepEqual(edit.edits.map(change=>change.source),[
    source.replace('Before section.','Before updated.'),chapter.replace('StartChild.','Child.'),
  ]);
});

test('native project boundaries follow verified vertical space without splitting a shared line',()=>{
  const source='\\begin{document}\nBefore.\n\n\\input{chapter}\n\nAfter.\n\\end{document}\n';
  const chapter='Child.\n';
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',
    files:[{path:'chapter.tex',bytes:new TextEncoder().encode(chapter)}]});
  const [before,after,child]=projection.paragraphs;
  const regions=[{path:'main.tex',from:0,to:source.indexOf('\\input')},
    {path:'chapter.tex',from:0,to:chapter.length},
    {path:'main.tex',from:source.indexOf('After.'),to:source.length}];
  const onLine=(paragraph,y)=>({...glyph(paragraph.glyphs[0].tag,100),bbox:[100,y,120,y+10]});
  const session=createNativeDocumentSession(()=>null);
  const first=page([],[onLine(before,100),onLine(child,150)]);
  const second=page([],[onLine(after,70)])[0];
  second.page=2;
  session.setObservation([...first,second],projection,false,regions);
  assert.deepEqual(session.fileBoundaries(),[{path:'chapter.tex',page:1,y:130},
    {path:'main.tex',page:2,y:70,atPageStart:true}]);
  session.setObservation(page([],[onLine(before,100),onLine(child,100),onLine(after,150)]),projection,false,regions);
  assert.deepEqual(session.fileBoundaries(),[{path:'main.tex',page:1,y:130}]);
});

test('native include folding preserves the first and last page boundaries and hides its stops',()=>{
  const source='\\begin{document}\nBefore.\n\n\\input{chapter}\n\nAfter.\n\\end{document}\n';
  const child='Start.\n\nEnd.\n';
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',
    files:[{path:'chapter.tex',bytes:new TextEncoder().encode(child)}]});
  const [before,after,start,end]=projection.paragraphs;
  const regions=[{path:'main.tex',from:0,to:source.indexOf('\\input')},
    {path:'chapter.tex',from:0,to:child.length,trail:['main.tex']},
    {path:'main.tex',from:source.indexOf('After.'),to:source.length}];
  const onLine=(paragraph,y)=>({...glyph(paragraph.glyphs[0].tag,100),bbox:[100,y,120,y+10]});
  const session=createNativeDocumentSession(()=>null);
  const first=page([],[onLine(before,100),onLine(start,150)])[0];
  const third=page([],[onLine(end,100),onLine(after,170)])[0];
  third.page=3;
  session.setObservation([first,third],projection,false,regions);
  assert.deepEqual(session.foldFiles(['chapter.tex']),[{path:'chapter.tex',firstPage:1,lastPage:3,from:130,to:140,indices:[1]}]);
  const childCaret=textTarget(projection,start.glyphs[0].tag,false);
  assert.equal(session.select(childCaret,childCaret),false);
  assert.deepEqual(session.foldFiles([]),[]);
  assert.equal(session.select(childCaret,childCaret),true);
  first.dl.math_owners.glyphs=[onLine(before,100),onLine(start,100)];
  session.setObservation([first,third],projection,false,regions);
  assert.deepEqual(session.foldFiles(['chapter.tex']),[]);
});

test('an inline project input folds only its verified horizontal span',()=>{
  const source='\\begin{document}\nBefore \\input{chapter} After.\n\\end{document}\n';
  const chapter='Child';
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',
    files:[{path:'chapter.tex',bytes:new TextEncoder().encode(chapter)}]});
  const [before,after,child]=projection.paragraphs;
  assert.deepEqual([before.text,after.text,child.text],['Before','After.','Child']);
  assert.ok(projection.projection.includes(' \\input{chapter} '));
  const regions=[{path:'main.tex',from:0,to:source.indexOf('\\input')},
    {path:'chapter.tex',from:0,to:chapter.length},
    {path:'main.tex',from:source.indexOf(' After.'),to:source.length}];
  const onLine=(paragraph,x)=>({...glyph(paragraph.glyphs[0].tag,x),bbox:[x,100,x+20,110]});
  const session=createNativeDocumentSession(()=>null);
  session.setObservation(page([],[onLine(before,100),onLine(child,145),onLine(after,190)]),projection,false,regions);
  assert.deepEqual(session.foldFiles(['chapter.tex']),[{
    path:'chapter.tex',firstPage:1,lastPage:1,from:110,to:100,indices:[1],sameLine:true,
    lineMasks:[{page:1,left:145,right:165,top:100,bottom:110}],
  }]);
  const beforeCaret=textTarget(projection,before.glyphs[0].tag,false);
  assert.equal(session.select(beforeCaret,beforeCaret),true);
  const childCaret=textTarget(projection,child.glyphs[0].tag,false);
  assert.equal(session.select(childCaret,childCaret),false);
});

test('drawing measurement leaves the source and ordinary formula authority intact',()=>{
  const drawing='\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}';
  const source='\\begin{document}\n'+drawing+'\n\n\\[\\frac{a}{}\\]\n\\end{document}\n';
  const plain=projectMixedDocument(source),measured=projectMixedDocument(source,{measureDrawings:true});
  assert.equal(measured.source,source);
  assert.equal(measured.formulas[0].math.projection,plain.formulas[0].math.projection);
  assert.ok(measured.projection.includes(drawing));
  const corners=[...measured.owners.values()].filter(owner=>owner.drawing);
  assert.deepEqual(corners.map(({corner})=>corner),['top','bottom']);
  for(const {drawing:range} of corners)assert.equal(source.slice(range.from16,range.to16),drawing);
  assert.equal([...plain.owners.values()].some(owner=>owner.drawing),false);
});

test('repeat raster occurrences get distinct source ranges in one observation',()=>{
  const first='\\includegraphics[width=18pt]{plot.png}',second='\\includegraphics[width=25pt]{plot.png}';
  const source='\\begin{document}\n'+first+'\n\n'+second+'\n\\end{document}\n';
  const measured=projectMixedDocument(source,{measureDrawings:true});
  const corners=[...measured.owners.values()].filter(owner=>owner.corner==='top');
  assert.deepEqual(corners.map(({drawing})=>[drawing.raster,source.slice(drawing.from16,drawing.to16)]),
    [['plot.png',first],['plot.png',second]]);
  assert.equal(measured.source,source);
  assert.equal(projectMixedDocument(source),null);
});

test('a native project replacement can span a child and return to the original file',()=>{
  const source='\\begin{document}\nBefore \\input{chapter} After.\n\\end{document}\n';
  const chapter='Middle';
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',
    files:[{path:'chapter.tex',bytes:new TextEncoder().encode(chapter)}]});
  const [before,after,child]=projection.paragraphs;
  const regions=[{path:'main.tex',from:0,to:source.indexOf('\\input')},
    {path:'chapter.tex',from:0,to:chapter.length},
    {path:'main.tex',from:source.indexOf(' After.'),to:source.length}];
  const session=createNativeDocumentSession(()=>null);
  const from=textTarget(projection,before.glyphs[1].tag,true),to=textTarget(projection,after.glyphs[1].tag,true);
  session.setObservation(page([],[glyph(from.owner,100),glyph(child.glyphs[0].tag,200),glyph(to.owner,300)]),projection,false,regions);
  assert.equal(session.select(from,to),true);
  const edit=session.editAcrossFiles('Z');
  assert.equal(edit.source,source.replace('Before','BeZ').replace('After','ter'));
  assert.deepEqual(edit.edits.map(({paragraph,text})=>[paragraph.filePath,text]),[
    ['main.tex','BeZ'],['chapter.tex',''],['main.tex','ter.'],
  ]);
});

test('prose can replace a complete inline formula but cannot edit part of its source', () => {
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
  const replacement=textEdit(projection,{
    paragraph,from16:paragraph.runs[0].to16-1,to16:paragraph.runs[1].from16+1,insert:'-',
  });
  assert.equal(replacement.text,'Before-after.');
  assert.equal(textEdit(projection,{
    paragraph,from16:paragraph.parts[1].from16+1,to16:paragraph.runs[1].from16,insert:'',
  }),null);
});

test('a protected block does not disable targeting in neighboring plain prose', () => {
  const source = '\\begin{document}\n\\section{\\custom{Heading}}\n\nPlain prose.\n\n\\custom{Keep me}\n\\end{document}\n';
  const projection = projectTextDocument(source);
  assert.equal(projection.paragraphs.length, 1);
  const [paragraph] = projection.paragraphs;
  assert.equal(paragraph.text, 'Plain prose.');
  assert.ok(projection.projection.includes('\\section{\\custom{Heading}}'));
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
  const denominators=surface.stops.filter(stop=>stop.slot.role==='denominator');
  assert.equal(denominators.length,2);
  const offset=denominators[0].docOffset;
  assert.equal(denominators[1].docOffset,offset);
  assert.equal(surface.selectBetween(offset,offset,'one.tex','two.tex'),false);
  assert.ok(surface.selectBetween(offset,offset,'two.tex'));
  assert.equal(surface.insert('b').formula.filePath,'two.tex');
});

test('a plain marked paragraph instruments only the command argument',()=>{
  const source='\\begin{document}\n\\textbf{Bold prose.}\n\\end{document}\n';
  const projection=projectTextDocument(source);
  const [paragraph]=projection.paragraphs;
  assert.deepEqual(paragraph.parts[0].marks,['bold']);
  assert.equal(paragraph.text,'\\textbf{Bold prose.}');
  assert.ok(projection.projection.includes('\\textbf{\\begingroup'));
  const offset=paragraph.parts[0].from16;
  assert.equal(textEdit(projection,{paragraph,from16:offset,to16:offset,insert:'X'}).source,
    source.replace('Bold prose.','XBold prose.'));
});

test('native prose edits a nested marked run without rewriting its wrappers or neighbors',()=>{
  const source='\\begin{document}\r\nBefore \\textbf{bold \\textit{both}} after.\r\n\\end{document}\r\n';
  const projection=projectTextDocument(source);
  const [paragraph]=projection.paragraphs;
  assert.deepEqual(paragraph.parts.map(({text,marks})=>[text,marks]),[
    ['Before ',[]],['bold ',['bold']],['both',['bold','italic']],[' after.',[]],
  ]);
  const {from16,to16}=paragraph.parts[2];
  assert.equal(textEdit(projection,{paragraph,from16,to16,insert:'inside'}).source,
    source.replace('{both}','{inside}'));
  assert.equal(textEdit(projection,{paragraph,from16:0,to16,insert:'ambiguous'}),null);
  assert.match(projection.projection,/\\textbf\{\\begingroup.*\\textit\{\\begingroup/);
});

test('mixed project prose edits refer to the child file, not the main snapshot',()=>{
  const child='Original chapter.\n\n\\[\\frac{z}{}\\]\n';
  const bytes=[...new TextEncoder().encode(child)];
  const projection=projectMixedSnapshot({source,mainFile:'main.tex',files:[{path:'chapter.tex',bytes}]});
  const [paragraph]=projection.paragraphs;
  assert.equal(paragraph.filePath,'chapter.tex');
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:0,insert:'X'}).source,'X'+child);
});

test('native mixed prose keeps marked runs and neighboring inline formula addresses',()=>{
  const source='\\begin{document}\nBefore \\textbf{bold \\textit{both}} $x$ after.\n\\end{document}\n';
  const projection=projectMixedDocument(source);
  const [paragraph]=projection.paragraphs;
  assert.deepEqual(paragraph.parts.map(part=>part.kind==='math'?part.latex:[part.text,part.marks]),[
    ['Before ',[]],['bold ',['bold']],['both',['bold','italic']],[' ',[]],'x',[' after.',[]],
  ]);
  const {from16,to16}=paragraph.parts[2];
  assert.equal(textEdit(projection,{paragraph,from16,to16,insert:'inside'}).source,
    source.replace('{both}','{inside}'));
  assert.equal(projection.formulas[0].math.source,'x');
});

test('native mixed projection observes inline math inside recognized text marks',()=>{
  const raw='\\begin{document}\nBefore \\textbf{bold $\\frac{x}{}$ inside} after.\n\\end{document}\n';
  const projection=projectMixedDocument(raw);
  assert.equal(projection.formulas[0].math.source,'\\frac{x}{}');
  assert.equal(projection.paragraphs[0].parts[2].insideMark,true);
  const {from16,to16}=projection.paragraphs[0].parts[3];
  const edited=textEdit(projection,{paragraph:projection.paragraphs[0],from16,to16,insert:' around'});
  assert.equal(edited.source,raw.replace(' inside',' around'));
  const slot=projection.formulas[0].math.slots.find(slot=>slot.role==='denominator');
  assert.equal(nativeTarget(projection,{owner:slot.tag,role:'den'}).docOffset,raw.indexOf('}{}')+2);
});

test('native math commands insert validated structures and target the new field',()=>{
  const {projection,formula,denominator}=setup();
  for(const [command,insert,caret] of [
    ['frac','\\frac{}{}',6],
    ['sqrt','\\sqrt{}',6],
    ['int','\\int{}',4],
    ['sum','\\sum{}',4],
    ['prod','\\prod{}',5],
    ['iint','\\iint{}',5],
    ['oiint','\\oiint{}',6],
    ['indexedRoot','\\sqrt[]{}',6],
    ['pmatrix','\\begin{pmatrix}&\\\\&\\end{pmatrix}',15],
  ]){
    const surface=createMathSurface({resolve:endpoint=>nativeTarget(projection,endpoint)});
    surface.setObservation(page([field(denominator.tag,'den',300,true)]));
    surface.nearest(1,300,100);
    const edit=surface.command(command);
    assert.equal(edit.patch.insert,insert);
    assert.equal(edit.text,'\\frac{a}{'+insert+'}');
    assert.equal(surface.pendingOffset,formula.from16+denominator.from16+caret);
    assert.equal(surface.insert(insert),null,'Raw typing cannot inject a TeX structure');
  }
});

test('an inserted integral accepts ordinary text in its body and scripts at the symbol',()=>{
  const source='\\begin{document}\n\\[x+\\int{}\\]\n\\end{document}\n';
  const {projection,formula,token}=setup(source),atom=token('\\int');
  const surface=createMathSurface({resolve:endpoint=>nativeTarget(projection,endpoint)});
  surface.setObservation(page([],[glyph(atom.tag,300)]));
  surface.nearest(1,320,100);
  assert.equal(surface.caret.hit.operatorHint,true);
  assert.equal(surface.insert('x').text,'x+\\int{x}');
  surface.clearPending();
  assert.equal(surface.singleCharacterScript('_','0').text,'x+\\int_{0}{}');
  surface.clearPending();
  assert.equal(surface.moveEmptySlot(false),true);
  assert.equal(surface.caret.slot.role,'body');
  assert.equal(surface.caret.docOffset,formula.from16+'x+\\int{'.length);
  assert.equal(surface.erase().text,'x+');
});

test('native script commands preserve the nucleus and place the caret within the new script',()=>{
  const {projection,formula,token}=setup();
  const atom=token('a');
  for(const [command,marker] of [['superscript','^'],['subscript','_']]){
    const surface=createMathSurface({resolve:endpoint=>nativeTarget(projection,endpoint)});
    surface.setObservation(page([],[glyph(atom.tag,300)]));
    surface.nearest(1,320,100);
    assert.equal(surface.command(command).text,`\\frac{a${marker}{}}{}`);
    assert.equal(surface.pendingOffset,formula.from16+atom.from16+3);
  }
});

test('right arrow leaves a native math font wrapper within its enclosing fraction slot',()=>{
  const source='\\begin{document}\n\\[\\frac{\\mathbf{ab}}{c}\\]\n\\end{document}\n';
  const {projection,formula,token}=setup(source);
  const a=token('a'),b=token('b'),c=token('c');
  const session=createNativeDocumentSession(endpoint=>nativeTarget(projection,endpoint));
  session.setObservation(page([],[glyph(a.tag,100),glyph(b.tag,130),glyph(c.tag,160)]),projection);
  const start=nativeTarget(projection,{owner:a.tag,role:'nucleus',after:false});
  assert.equal(session.select(start,start),true);
  assert.equal(session.move(1,true),true,'Extending selection still advances by a character');
  assert.equal(session.surface.caret.docOffset,formula.from16+a.to16);
  assert.equal(session.select(start,start),true);
  assert.equal(session.move(1,false),true);
  assert.equal(session.surface.caret.slot.role,'numerator');
  assert.equal(session.surface.insert('Z').text,'\\frac{\\mathbf{ab}Z}{c}');
});

test('leaving a terminal fraction ends the inner slot and retains the outer math caret',()=>{
  const source='\\begin{document}\n\\[\\frac{a}{b}\\]\n\\end{document}\n';
  const {projection,formula,token}=setup(source);
  const session=createNativeDocumentSession(endpoint=>nativeTarget(projection,endpoint));
  session.setObservation(page([],[glyph(token('a').tag,100),glyph(token('b').tag,130)]),projection);
  const inside=nativeTarget(projection,{owner:token('b').tag,role:'nucleus',after:false});
  assert.equal(session.select(inside,inside),true);
  assert.equal(session.surface.leaveStructure(),true);
  assert.equal(session.surface.caret.docOffset,formula.to16);
  assert.equal(session.surface.insert('Z').text,'\\frac{a}{b}Z');
});

test('native math paste accepts a complete fragment and restores the caret after it',()=>{
  const source='\\begin{document}\n\\[x\\]\n\\end{document}\n';
  let projection=projectDocumentFormulas(source);
  const surface=createMathSurface({resolve:endpoint=>nativeTarget(projection,endpoint)});
  const [formula]=projection.formulas;
  surface.setObservation(page([],[glyph(formula.math.atoms.find(atom=>atom.nucleus==='x').tag,100)]));
  surface.nearest(1,120,100);
  assert.equal(surface.insert('\\frac{a}{b}'),null);
  assert.equal(surface.insert('\\input{bad}',{paste:true}),null);
  const pasted=surface.insert('\\frac{a}{b}',{paste:true});
  assert.equal(pasted.text,'x\\frac{a}{b}');
  const next=source.slice(0,formula.from16)+pasted.text+source.slice(formula.to16);
  projection=projectDocumentFormulas(next);
  surface.setObservation(page([],projection.formulas[0].math.atoms.filter(atom=>atom.nucleus)
    .map((atom,index)=>glyph(atom.tag,index*30))));
  assert.equal(surface.caret.docOffset,formula.from16+pasted.text.length);
  assert.equal(surface.insert('y').text,'x\\frac{a}{b}y');
});

test('native edits keep numbered equation annotations in the source and out of editable slots',()=>{
  const source='\\begin{document}\n\\begin{equation}\n\\label{eq:repeat}\n\\frac{a}{}\\tag{4}\n\\end{equation}\n\\end{document}\n';
  const {formula,denominator}=setup(source);
  assert.ok(formula.math.projection.includes('\\label{eq:repeat}'));
  assert.ok(formula.math.projection.includes('\\tag{4}'));
  const changed=applySlotEdit(formula.math,{slotId:denominator.id,from16:0,to16:0,insert:'b'});
  assert.equal(changed.source,formula.math.source.replace('\\frac{a}{}','\\frac{a}{b}'));
  const body=formula.math.slots[0],start=body.raw.indexOf('\\label');
  assert.throws(()=>applySlotEdit(formula.math,{slotId:body.id,from16:start,to16:start+5,insert:''}));
});

test('alignment variants keep pair counts, stars and row delimiters during native edits',()=>{
  for(const [environment,argument,body] of [
    ['alignat','{2}','a&=b & c&=d'],['alignat*','{2}','a&=b & c&=d'],
    ['flalign*','','a&=b&&'],['eqnarray','','a&=&b'],['multline*','','a+b'],
  ]){
    const latex='\\begin{'+environment+'}'+argument+body+'\\\\c+d\\end{'+environment+'}';
    const source='\\begin{document}\n'+latex+'\n\\end{document}\n';
    const {formula,token}=setup(source);
    assert.equal(formula.math.source,latex);
    const b=token('b');
    const result=applySlotEdit(formula.math,{slotId:b.slotIds[0],from16:0,to16:0,insert:'X'});
    assert.equal(result.source,latex.slice(0,b.from16)+'X'+latex.slice(b.from16));
  }
});

test('tagged plain table text maps to the original cell and exact byte range',()=>{
  const source='\\begin{document}\n\\begin{tabular}{ll}\nOne & Two \\\\\nThree & Four\n\\end{tabular}\n\\end{document}\n';
  const projection=projectTextDocument(source);
  assert.deepEqual(projection.paragraphs.map(({tableCell:{row,column}})=>[row,column]),[[0,0],[0,1],[1,0],[1,1]]);
  const paragraph=projection.paragraphs[3];
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:0,insert:'X'}).source,source.replace('Four','XFour'));
});

test('native table ranges keep multicolumn and multirow wrappers intact',()=>{
  const source=String.raw`\begin{document}
\begin{tabular}{lll}
\multicolumn{2}{c}{Total} & One \\
\multirow{2}{*}{Group} & Two & Three \\
 & Four & Five
\end{tabular}
\end{document}
`;
  const projection=projectTextDocument(source);
  const find=text=>projection.paragraphs.find(paragraph=>paragraph.text===text);
  assert.deepEqual([find('Total').tableCell.column,find('One').tableCell.column,find('Four').tableCell.column],[0,1,0]);
  assert.equal(textEdit(projection,{paragraph:find('Group'),from16:0,to16:0,insert:'X'}).source,
    source.replace('{Group}','{XGroup}'));
});

test('native empty table cells accept text only at the observed boundary',()=>{
  const source='\\begin{document}\n\\begin{tabular}{ll}\n & value\n\\end{tabular}\n\\end{document}\n';
  const projection=projectTextDocument(source);
  const [empty]=projection.paragraphs;
  assert.equal(empty.text,'');
  const [{tag}]=empty.glyphs;
  assert.ok(projection.projection.includes(`\\attribute65000=${tag} $ $`));
  const surface=createTextSurface({projection});
  const field={owner:tag,role:'math',empty:true,bbox:[100,200,100,200]};
  assert.equal(surface.setObservation([{page:1,exact:true,dl:{math_owners:{fields:[field]}}}]),true);
  assert.equal(surface.caret.hit.role,'math');
  assert.equal(surface.insert('new').source,source.replace(' & value',' new& value'));
});

test('native table projection includes plain and empty cells beside protected cells',()=>{
  const source='\\begin{document}\n\\begin{tabular}{lll}\nFirst & $x$ & \\\\\n\\end{tabular}\n\\end{document}\n';
  const projection=projectTextDocument(source);
  assert.deepEqual(projection.paragraphs.map(({tableCell,text})=>[tableCell.column,text]),[[0,'First'],[2,'']]);
  assert.ok(projection.projection.includes(' & $x$ &'));
  const [paragraph]=projection.paragraphs;
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:0,insert:'X'}).source,source.replace('First','XFirst'));
  const mixed=projectMixedDocument(source);
  assert.deepEqual(mixed.paragraphs.map(({tableCell,text})=>[tableCell.column,text]),[[0,'First'],[2,'']]);
  assert.equal(mixed.formulas.length,1);
  assert.equal(mixed.formulas[0].math.source,'x');
  assert.equal(source[mixed.formulas[0].from16],'x');
});

test('native table geometry keeps complex float declarations out of editable cell ranges',()=>{
  const source='\\begin{document}\n\\begin{table}[ht]\n\\caption{Keep}\n'+
    '\\begin{tabularx}{\\textwidth}{lX}\nLeft & $\\frac{a}{}$\n\\end{tabularx}\n\\end{table}\n\\end{document}\n';
  const mixed=projectMixedDocument(source);
  const [paragraph]=mixed.paragraphs;
  assert.deepEqual([paragraph.text,paragraph.from16],['Left',source.indexOf('Left')]);
  assert.ok(mixed.projection.includes('\\caption{Keep}'));
  assert.equal(mixed.formulas[0].math.source,'\\frac{a}{}');
});

test('marked prose and formula fields share their native table cell address',()=>{
  const source='\\begin{document}\n\\begin{tabular}{ll}\nLeft & \\textbf{Value} $\\frac{a}{}$ unit\n'+
    '\\end{tabular}\n\\end{document}\n';
  const projection=projectMixedDocument(source);
  const cell=projection.paragraphs.find(paragraph=>paragraph.tableCell.column===1);
  assert.deepEqual(cell.parts.map(part=>part.kind),['text','text','math','text']);
  assert.deepEqual(cell.parts[0].marks,['bold']);
  assert.deepEqual(projection.formulas[0].tableCell,cell.tableCell);
  const start=cell.parts[0].from16;
  assert.equal(textEdit(projection,{paragraph:cell,from16:start,to16:start,insert:'X'}).source,
    source.replace('Value','XValue'));
});

test('native tab visits unfilled fields in source order without leaving the formula',()=>{
  const {projection,numerator,denominator}=setup(source.replace('{a}','{}'));
  const surface=createMathSurface({resolve:endpoint=>nativeTarget(projection,endpoint)});
  surface.setObservation(page([field(numerator.tag,'num',100,true),field(denominator.tag,'den',300,true)]));
  surface.nearest(1,100,100);
  assert.equal(surface.moveEmptySlot(false),true);
  assert.equal(surface.caret.slot.role,'denominator');
  assert.equal(surface.moveEmptySlot(false),false);
  assert.equal(surface.moveEmptySlot(true),true);
  assert.equal(surface.caret.slot.role,'numerator');
});

test('native heading text mapping leaves short titles, stars and labels intact',()=>{
  const source='\\begin{document}\n\\section*[Short]{Long title}\\label{s:test}\n\\end{document}\n';
  const projection=projectTextDocument(source);
  const [paragraph]=projection.paragraphs;
  assert.equal(paragraph.heading,'section');
  assert.equal(paragraph.text,'Long title');
  assert.equal(source.slice(paragraph.from16+paragraph.text.length,paragraph.headingEnd),'}\\label{s:test}');
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:0,insert:'X'}).source,source.replace('Long title','XLong title'));
});

test('native prose escapes percent and deletes the complete escaped token as one glyph',()=>{
  const source='\\begin{document}\r\n\\section[Short]{Yield 50}\\label{s:test}\r\n\\end{document}\r\n';
  const {paragraphs:[heading],...projection}=projectTextDocument(source);
  const inserted=textEdit(projection,{paragraph:heading,from16:8,to16:8,insert:'%'});
  assert.equal(inserted.source,source.replace('50}','50\\%}'));
  assert.deepEqual(inserted.patch,{from:8,to:8,insert:'%',latex:'\\%'});
  const parsed=projectTextDocument(inserted.source);
  const [paragraph]=parsed.paragraphs;
  const percent=paragraph.glyphs.at(-1);
  assert.equal(percent.char,'%');
  assert.deepEqual([percent.from16,percent.to16],[8,10]);
  assert.equal(textEdit(parsed,{paragraph,from16:9,to16:10,insert:''}),null);
  const surface=createTextSurface({projection:parsed});
  surface.setObservation(page([],[glyph(percent.tag,300)]));
  surface.nearest(1,320,100);
  assert.equal(surface.erase().source,source);
});

test('native prose round-trips literal caret, tilde, and backslash as graphemes',()=>{
  const source='\\begin{document}\nLiteral end.\n\\end{document}\n';
  const projection=projectTextDocument(source);
  const insertion=textEdit(projection,{paragraph:projection.paragraphs[0],from16:8,to16:8,insert:'^~\\'});
  const literals='\\textasciicircum{}\\textasciitilde{}\\textbackslash{}';
  assert.equal(insertion.source,source.replace('end.',literals+'end.'));
  const observed=projectTextDocument(insertion.source);
  const [paragraph]=observed.paragraphs;
  assert.equal(paragraph.parts[0].text,'Literal ^~\\end.');
  const glyph=paragraph.glyphs.find(glyph=>glyph.char==='\\');
  assert.equal(glyph.to16,insertion.selection);
  assert.equal(textEdit(observed,{paragraph,from16:glyph.from16,to16:glyph.to16,insert:''}).source,
    insertion.source.replace('\\textbackslash{}',''));
});

test('native typing carries trailing whitespace through a geometry revision',()=>{
  const source='\\begin{document}\nWord \n\\end{document}\n';
  const end=source.indexOf('Word ')+5;
  const projection=projectMixedDocument(source,{keepThrough:end});
  const [paragraph]=projection.paragraphs;
  assert.equal(paragraph.text,'Word ');
  const session=createNativeDocumentSession(()=>null);
  session.expectInitialText({kind:'text'},end,undefined);
  session.setObservation(page([],[glyph(paragraph.glyphs.at(-1).tag,100)]),projection);
  assert.equal(session.surface.caret.docOffset,end);
  assert.equal(session.surface.insert('next').source,source.replace('Word ','Word next'));
});

test('native text ranges preserve proof titles, comments and container declarations',()=>{
  const source='\\begin{document}\r\n\\begin{proof}[Reason]\r\nOne step.\r\n\r\nAnother step.\r\n\\end{proof}\r\n\r\n'+
    '\\begin{abstract}\r\n% keep declaration and comment\r\n\\small\r\nA summary.\r\n\\end{abstract}\r\n\\end{document}\r\n';
  const projection=projectTextDocument(source);
  assert.deepEqual(projection.paragraphs.map(p=>[p.text,p.container]),[
    ['One step.',{type:'theoremBlock',path:[0]}],
    ['Another step.',{type:'theoremBlock',path:[1]}],
    ['A summary.',{type:'blockquote',path:[0]}],
  ]);
  const paragraph=projection.paragraphs[2];
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:1,insert:'The'}).source,
    source.replace('A summary.','The summary.'));
});

test('splitting a proof paragraph keeps its title, indentation and CRLF bytes',()=>{
  const source='\\begin{document}\r\n\\begin{proof}[Reason]\r\n  AlphaBeta\r\n\r\n  Untouched.\r\n\\end{proof}\r\n\\end{document}\r\n';
  const draft=source.replace('AlphaBeta','Alpha\r\n\r\nBeta');
  const document=text=>({type:'doc',content:parseDocument(text).blocks.flatMap(raw=>importBlocks(raw))});
  const projection=sourceProjection(source,document(source));
  assert.deepEqual(richSourceChanges(projection,document(draft)),
    [{from:source.indexOf('Beta'),to:source.indexOf('Beta'),insert:'\r\n\r\n'}]);
  assert.deepEqual(richSourceChanges(sourceProjection(draft,document(draft)),document(source)),
    [{from:source.indexOf('Beta'),to:source.indexOf('Beta')+4,insert:''}]);
  assert.deepEqual(projectTextDocument(draft).paragraphs.map(paragraph=>[paragraph.text,paragraph.container.path]),
    [['Alpha',[0]],['Beta',[1]],['Untouched.',[2]]]);
});

test('legacy quote markup has native paragraph owners without changing its import',()=>{
  const environment='\\begin{quote}\r\nFirst.\r\n\r\nSecond.\r\n\\end{quote}';
  const source='\\begin{document}\r\n'+environment+'\r\n\\end{document}\r\n';
  assert.equal(importBlocks(environment)[0].attrs?.latexEnvironment,undefined);
  const projection=projectTextDocument(source);
  assert.deepEqual(projection.paragraphs.map(paragraph=>paragraph.container.path),[[0],[1]]);
  const paragraph=projection.paragraphs[1];
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:6,insert:'Next'}).source,
    source.replace('Second.','Next.'));
});

test('nested text environments resolve repeated prose by its exact container path',()=>{
  const source='\\begin{document}\n\\begin{center}\nSame.\n\n\\begin{quote}\nSame.\n\\end{quote}\n\\end{center}\n\\end{document}\n';
  const projection=projectTextDocument(source),[outer,inner]=projection.paragraphs;
  assert.deepEqual([outer.container.path,inner.container.path],[[0],[1,0]]);
  const doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const after=structuredClone(doc);
  after.content[0].content[1].content[0].content[0].text='New.';
  const [patch]=richSourceChanges(sourceProjection(source,doc),after);
  const apply=(source,{from,to,insert})=>source.slice(0,from)+insert+source.slice(to);
  assert.equal(apply(source,patch),source.slice(0,inner.from16)+'New.'+source.slice(inner.from16+inner.text.length));
});

test('native proof ownership and source writeback retain marked prose, formulas, and proof titles',()=>{
  const source='\\begin{document}\r\n\\begin{proof}[Idea]\r\n  \\emph{Step} $x$ here.\r\n\\end{proof}\r\n\\end{document}\r\n';
  const projected=projectMixedDocument(source);
  const [paragraph]=projected.paragraphs;
  assert.equal(paragraph.container.type,'theoremBlock');
  assert.deepEqual(paragraph.parts[0].marks,['italic']);
  assert.equal(projected.formulas[0].math.source,'x');
  const doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const layout=sourceProjection(source,doc);
  const revised=structuredClone(doc);
  revised.content[0].content[0].content[0].text='Next step';
  const from=source.indexOf('Step');
  assert.deepEqual(richSourceChanges(layout,revised),[{from,to:from+1,insert:'Next s'}]);
  const formula=structuredClone(doc);
  formula.content[0].content[0].content.find(node=>node.type==='math').attrs.latex='y';
  const mathFrom=source.indexOf('$x$')+1;
  assert.deepEqual(richSourceChanges(layout,formula),[{from:mathFrom,to:mathFrom+1,insert:'y'}]);
});

test('references stay byte-identical during an edit of adjacent native prose',()=>{
  const source='\\begin{document}\r\nBefore \\ref  {sec:one} and \\cite[see][p. 4]{item}. Tail.\r\n\\end{document}\r\n';
  const projection=projectMixedDocument(source),[paragraph]=projection.paragraphs;
  assert.deepEqual(paragraph.parts.filter(part=>part.kind==='reference').map(part=>part.source),
    ['\\ref  {sec:one}','\\cite[see][p. 4]{item}']);
  const [{reference}]=[...projection.owners.values()].filter(owner=>owner.reference);
  assert.equal(reference.key,'sec:one');
  assert.equal(source.slice(reference.from16,reference.to16),'\\ref  {sec:one}');
  const offset=paragraph.text.indexOf('Tail');
  const patch=textEdit(projection,{paragraph,from16:offset,to16:offset+4,insert:'End'});
  assert.equal(patch.source,source.replace('Tail.','End.'));
  const before={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const after=structuredClone(before);
  after.content[0].content.at(-1).text='. End.';
  const changes=richSourceChanges(sourceProjection(source,before),after);
  assert.equal(changes.reduceRight((value,{from,to,insert})=>value.slice(0,from)+insert+value.slice(to),source),patch.source);
});

test('native prose remains editable on both sides of an exact footnote',()=>{
  const source='\\begin{document}\r\nBefore\\footnote{Comment.} after.\r\n\\end{document}\r\n';
  const projection=projectMixedDocument(source),[paragraph]=projection.paragraphs;
  const note=paragraph.parts.find(part=>part.type==='footnote');
  assert.equal(note.kind,'atom');
  assert.ok(projection.projection.includes(note.source));
  const before={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  for(const [index,oldText,newText] of [[0,'Before','Start'],[2,'after','end']]){
    const from=paragraph.text.indexOf(oldText);
    const edit=textEdit(projection,{paragraph,from16:from,to16:from+oldText.length,insert:newText});
    const after=structuredClone(before);
    after.content[0].content[index].text=after.content[0].content[index].text.replace(oldText,newText);
    const patches=richSourceChanges(sourceProjection(source,before),after);
    assert.equal(patches.reduceRight((value,{from,to,insert})=>value.slice(0,from)+insert+value.slice(to),source),edit.source);
    assert.ok(edit.source.includes(note.source));
  }
  const from16=3,to16=paragraph.text.indexOf('after')+2;
  const replacement=textEdit(projection,{paragraph,from16,to16,insert:'T'});
  assert.equal(replacement.source,source.replace('Before\\footnote{Comment.} after.','BefTter.'));
  assert.equal(textEdit(projection,{paragraph,from16,to16:note.to16-1,insert:'T'}),null);
});

test('native prose targets both sides of explicit LaTeX line breaks and preserves the spelling',()=>{
  const source='\\begin{document}\r\nAlpha\\newline\r\nBeta\\\\[2pt]\r\nGamma\r\n\\end{document}\r\n';
  const draft=source.replace('Beta','Delta');
  const document=text=>({type:'doc',content:parseDocument(text).blocks.flatMap(raw=>importBlocks(raw))});
  const before=projectTextDocument(source),[paragraph]=before.paragraphs;
  assert.deepEqual(paragraph.parts.map(part=>part.kind),['text','break','text','break','text']);
  assert.deepEqual(paragraph.runs.map(run=>run.text),['Alpha','Beta','Gamma']);
  const [,run]=paragraph.runs;
  assert.equal(textEdit(before,{paragraph,from16:run.from16,to16:run.to16,insert:'Delta'}).source,draft);
  const patches=richSourceChanges(sourceProjection(source,document(source)),document(draft));
  assert.equal(patches.reduceRight((value,{from,to,insert})=>value.slice(0,from)+insert+value.slice(to),source),draft);
});

test('a native selection can remove complete display math between plain paragraphs',()=>{
  const source='\\begin{document}\nBefore.\n\n\\[x+y\\]\n\nAfter.\n\\end{document}\n';
  const draft=source.replace('Before.\n\n\\[x+y\\]\n\nAfter.','Before/After.');
  const document=text=>({type:'doc',content:parseDocument(text).blocks.flatMap(raw=>importBlocks(raw))});
  const patches=richSourceChanges(sourceProjection(source,document(source)),document(draft));
  assert.equal(patches.reduceRight((value,{from,to,insert})=>value.slice(0,from)+insert+value.slice(to),source),draft);
  const protectedSource=source.replace('\\[x+y\\]','% retain this comment\n\\[x+y\\]');
  assert.equal(richSourceChanges(sourceProjection(protectedSource,document(protectedSource)),document(draft)),null);
});

test('changing a project paragraph leaves untouched native ownership and instrumented files stable',()=>{
  const source='\\begin{document}\nFirst.\n\nUnchanged $x+y$.\n\\input{child}\n\\end{document}\n';
  const files=[{path:'child.tex',bytes:new TextEncoder().encode('Other text.')}];
  const initial=projectMixedSnapshot({source,mainFile:'main.tex',files});
  const draft=source.replace('First.','文First.');
  const next=projectMixedSnapshot({source:draft,mainFile:'main.tex',files},initial);
  const [oldFirst,oldStable]=initial.paragraphs,[newFirst,newStable]=next.paragraphs;
  assert.equal(newFirst.glyphs[0].char,'文');
  assert.ok(newFirst.glyphs[0].tag>=initial.nextTag);
  assert.deepEqual(newFirst.glyphs.slice(1).map(glyph=>glyph.tag),oldFirst.glyphs.map(glyph=>glyph.tag));
  assert.deepEqual(newStable.glyphs.map(glyph=>glyph.tag),oldStable.glyphs.map(glyph=>glyph.tag));
  assert.deepEqual(next.formulas[0].math.atoms.map(atom=>atom.tag),initial.formulas[0].math.atoms.map(atom=>atom.tag));
  assert.deepEqual(next.files,initial.files);
});

test('verified prose glyph ownership restores a caret when an earlier source command shifts its offset',()=>{
  const source='\\begin{document}\nIntro.\n\nFocus here.\n\\end{document}\n';
  const initial=projectMixedDocument(source);
  const revised=source.replace('Focus here.','\\newpage\n\nFocus here.');
  const next=projectMixedDocument(revised,{previous:initial});
  const session=createNativeDocumentSession(()=>null);
  const observed=projection=>page([],projection.paragraphs.flatMap(paragraph=>paragraph.glyphs)
    .map((entry,index)=>glyph(entry.tag,index*20)));
  session.setObservation(observed(initial),initial);
  const owner=initial.paragraphs[1].glyphs[1].tag;
  const target=textTarget(initial,owner,true);
  assert.equal(session.select(target,target),true);
  session.setObservation(observed(next),next);
  assert.equal(session.surface.caret.docOffset,revised.indexOf('Focus')+2);
  assert.equal(session.surface.caret.glyph.tag,owner);
});

test('native prose edits retain emphasis, color and small-caps commands verbatim',()=>{
  const source='\\begin{document}\n\\emph{Alpha $x$} \\textcolor[HTML]{AABBCC}{Beta} \\textsc{Gamma}.\n\\end{document}\n';
  const draft=source.replace('{Beta}','{Delta}');
  const document=text=>({type:'doc',content:parseDocument(text).blocks.flatMap(raw=>importBlocks(raw))});
  const native=projectMixedDocument(source),[paragraph]=native.paragraphs;
  assert.deepEqual(paragraph.runs.filter(run=>run.marks.length).map(run=>run.marks),[['italic'],['textStyle'],['smallcaps']]);
  assert.equal(native.formulas[0].math.source,'x');
  const patches=richSourceChanges(sourceProjection(source,document(source)),document(draft));
  assert.equal(patches.reduceRight((value,{from,to,insert})=>value.slice(0,from)+insert+value.slice(to),source),draft);
});

test('nested paragraph formatting keeps indent and inline math outside a native prose patch',()=>{
  const body=String.raw`{\fbox{\parbox{\linewidth}{{\linespread{1.2}\selectfont {\raggedleft \noindent Text $z$ tail.\par}\par}}}}`;
  const source='\\begin{document}\r\n'+body+'\r\n\\end{document}\r\n';
  const projection=projectMixedDocument(source);
  const [paragraph]=projection.paragraphs;
  assert.ok(paragraph.wrapped);
  assert.equal(paragraph.from16,source.indexOf('Text'));
  assert.equal(projection.formulas[0].math.source,'z');
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:0,insert:'X'}).source,source.replace('Text','XText'));
});

test('book matter and date commands keep exact bytes when editing native prose',()=>{
  const source=['\\documentclass{book}','\\title{Sample}','\\author{Author}','\\date{\\today}',
    '\\begin{document}','\\frontmatter','\\maketitle','\\mainmatter','\\chapter{Opening}',
    'Main text.','','\\backmatter','\\chapter{Notes}','Back text.','\\end{document}',''].join('\r\n');
  const projection=projectMixedDocument(source);
  const paragraph=projection.paragraphs.find(paragraph=>paragraph.text==='Back text.');
  assert.ok(paragraph);
  const edit=textEdit(projection,{paragraph,from16:0,to16:4,insert:'Edited'});
  assert.equal(edit.source,source.replace('Back text.','Edited text.'));
  assert.equal(projection.paragraphs.find(paragraph=>paragraph.text==='Notes').heading,'chapter');
});

test('each sibling TikZ drawing owns its measured corners and only its source bytes',()=>{
  const drawing='\\begin{tikzpicture}\r\n\\draw (0,0) -- (1,1);\r\n\\end{tikzpicture}';
  const picture=caption=>['\\begin{subfigure}{.4\\textwidth}',drawing,'\\caption{'+caption+'}','\\end{subfigure}'].join('\r\n');
  const source=['\\begin{document}','\\begin{figure}[ht]',picture('First'),'\\hfill',picture('Second'),
    '\\caption{Both drawings}','\\label{fig:both}','\\end{figure}','\\end{document}',''].join('\r\n');
  const projection=projectMixedDocument(source,{measureDrawings:true});
  assert.deepEqual([...projection.owners.values()].map(owner=>owner.drawing?.from16),[
    source.indexOf(drawing),source.indexOf(drawing),source.lastIndexOf(drawing),source.lastIndexOf(drawing),
  ]);
  const before={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const after=structuredClone(before);
  after.content[0].content[1].attrs.tikzSource=drawing.replace('(1,1)','(2,1)');
  const changes=standaloneMathChanges(sourceProjection(source,before),after);
  assert.ok(changes);
  const result=changes.reduceRight((text,{from,to,insert})=>text.slice(0,from)+insert+text.slice(to),source);
  assert.equal(result,source.slice(0,source.lastIndexOf(drawing))+
    source.slice(source.lastIndexOf(drawing)).replace('(1,1)','(2,1)'));
});

test('native math context identifies an integral body, its limits and a nested fraction',()=>{
  const source='\\begin{document}\n\\[\\int_{0}^{1}{\\frac{x}{y}}\\]\n\\end{document}\n';
  const projection=projectDocumentFormulas(source),[formula]=projection.formulas;
  const target=char=>nativeTarget(projection,{owner:formula.math.atoms.find(atom=>atom.nucleus===char).tag,
    role:'nucleus',after:false});
  assert.deepEqual(nativeMathContext(target('0')),[{text:'op/int'},{key:'subscript'}]);
  assert.deepEqual(nativeMathContext(target('y')),
    [{text:'op/int'},{key:'integrand'},{key:'frac'},{key:'denominator'}]);
});

test('native list prose path distinguishes duplicate text inside a nested item',()=>{
  const source='\\begin{document}\n\\begin{enumerate}\n\\item Same text.\n'+
    '\\begin{itemize}\n\\item Same text.\n\\end{itemize}\n\\item Same text.\n'+
    '\\end{enumerate}\n\\end{document}\n';
  const projection=projectTextDocument(source);
  assert.deepEqual(projection.paragraphs.map(p=>p.container.path),[[0,0],[0,1,0,0],[1,0]]);
  const paragraph=projection.paragraphs[1];
  assert.equal(textEdit(projection,{paragraph,from16:0,to16:0,insert:'X'}).source,
    source.replace('itemize}\n\\item Same','itemize}\n\\item XSame'));
});
