import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDocumentFormulas,projectSnapshotFormulas} from '../apps/web/src/editor/native-math/document.mjs';
import {nativeTarget} from '../apps/web/src/editor/native-math/resolve.mjs';
import {applySlotEdit,applyStructureCommand,applyScalableFence,nativeMathCommandNames,projectMath} from '../apps/web/src/editor/native-math/source.mjs';
import {createMathSurface} from '../apps/web/src/editor/native-surface/math-surface.mjs';
import {createTextSurface} from '../apps/web/src/editor/native-surface/text-surface.mjs';
import {createNativeDocumentSession} from '../apps/web/src/editor/native-surface/document-session.mjs';
import {projectTextDocument,projectMixedDocument,projectMixedSnapshot,textTarget,textEdit} from '../apps/web/src/editor/native-text/projection.mjs';
import {richSourceChanges,sourceProjection} from '../apps/web/src/editor/source-sync.js';
import {importBlocks} from '../apps/web/latex/blocks.mjs';
import {parseDocument} from '../apps/web/latex/document.mjs';

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
  const to=textTarget(projection,root.glyphs.at(-1).tag,true);
  session.setObservation(page([],[glyph(from.owner,100),glyph(atom.tag,200),glyph(to.owner,300)]),projection,false,regions);
  assert.equal(session.select(from,to),true);
  assert.deepEqual(session.proseRanges(from,to).map(range=>range.paragraph?.text??
    range.formula.source.slice(range.formula.outerFrom16,range.formula.outerTo16)),['Child.','\\[x\\]','Main.']);
  assert.equal(session.surface.erase(),null,'A cross-file range cannot silently delete one file only');
  assert.equal(session.surface.insert('unsafe'),null);
  assert.equal(session.editAcrossFiles('replacement'),null,'The formula is a separate structural selection');
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
    ['int','\\int_{}^{}{}',6],
    ['sum','\\sum_{}^{}{}',6],
    ['prod','\\prod_{}^{}{}',7],
    ['iint','\\iint_{}^{}{}',7],
    ['oiint','\\oiint_{}^{}{}',8],
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
