import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDocumentFormulas,projectSnapshotFormulas} from '../apps/web/src/editor/native-math/document.mjs';
import {nativeTarget} from '../apps/web/src/editor/native-math/resolve.mjs';
import {createMathSurface} from '../apps/web/src/editor/native-surface/math-surface.mjs';
import {createTextSurface} from '../apps/web/src/editor/native-surface/text-surface.mjs';
import {createNativeDocumentSession} from '../apps/web/src/editor/native-surface/document-session.mjs';
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

test('one native session restores the selected text or math address through observation',()=>{
  const source='\\begin{document}\nIntro.\n\n\\[\\frac{a}{}\\]\n\\end{document}\n';
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
  session.setObservation(page([],[glyph(proseTag,100),glyph(inserted.tag,300)]),projection);
  assert.equal(session.surface.caret.kind,'math');
  assert.equal(session.surface.caret.docOffset,pending);
  assert.equal(session.surface.anchor,session.surface.caret);
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

test('native math commands insert validated structures and target the new field',()=>{
  const {projection,formula,denominator}=setup();
  for(const [command,insert,caret] of [
    ['frac','\\frac{}{}',6],
    ['sqrt','\\sqrt{}',6],
    ['int','\\int_{}^{}{}',6],
    ['sum','\\sum_{}^{}{}',6],
    ['prod','\\prod_{}^{}{}',7],
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
