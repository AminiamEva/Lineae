import test from 'node:test';
import assert from 'node:assert/strict';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {sourceProjection,richSourceChanges,standaloneMathChanges} from '../apps/web/src/editor/source-sync.js';
import {documentMetadata,writeDocumentMetadata} from '../apps/web/latex/document-metadata.mjs';
const text=n=>(n.content??[]).map(c=>c.text??'').join('');
const wrap=s=>'\\begin{document}\r\n'+s+'\n\\end{document}\r\n';

test('title edits preserve preamble trivia and generate a single real maketitle',()=>{
  const source='\\documentclass{article}\r\n% \\title{Comment}\r\n\\title  {Before {Nested}}\r\n'+
    '\\begin{document}\r\n% \\maketitle\r\nBody.\r\n\\end{document}\r\n';
  assert.equal(documentMetadata(parseDocument(source).start,'title').value,'Before {Nested}');
  const title=writeDocumentMetadata(source,'title','Yield 50\\%');
  assert.equal(title.draft,source.replace('Before {Nested}','Yield 50\\%')
    .replace('\\begin{document}\r\n','\\begin{document}\r\n\\maketitle\r\n\r\n'));
  assert.equal(source.slice(0,title.change.from)+title.change.insert+source.slice(title.change.to),title.draft);
  const date=writeDocumentMetadata(title.draft,'date','');
  assert.equal(date.addMaketitle,false);
  assert.equal(documentMetadata(date.preamble,'date').value,'');
});

for(const [open,close] of [['\\[','\\]'],['$$','$$']]) {
  for(const eol of ['\n','\r\n'])test('formula edits retain display spelling '+open+' '+JSON.stringify(eol),()=>{
    const source=wrap('Before.'+eol+open+eol+'\\frac{a}{}'+eol+close+eol+'After.'+eol+eol+'\\unknown{keep}');
    const doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
    const original=structuredClone(doc),projection=sourceProjection(source,doc);
    const math=doc.content.find(node=>node.type==='mathBlock');
    math.attrs.latex='\\frac{a}{b}'; // MathLive's normalized field serialization.
    const changes=standaloneMathChanges(projection,doc);
    const at=source.indexOf('\\frac{a}{}')+9;
    assert.deepEqual(changes,[{from:at,to:at,insert:'b'}]);
    const apply=(text,changes)=>changes.toReversed().reduce((text,c)=>text.slice(0,c.from)+c.insert+text.slice(c.to),text);
    const edited=apply(source,changes);
    assert.equal(edited,source.replace('\\frac{a}{}','\\frac{a}{b}'));
    assert.deepEqual(richSourceChanges(projection,doc),changes);
    const after=sourceProjection(edited,doc);
    const undo=standaloneMathChanges(after,original);
    assert.equal(apply(edited,undo),source,'Undo retains the original display delimiters and EOL bytes');
    const again=sourceProjection(source,original);
    assert.equal(apply(source,standaloneMathChanges(again,doc)),edited,'Redo changes only the denominator letter');
    original.content[0].content[0].text='Different.';
    assert.equal(standaloneMathChanges(after,original),null,'The specialized path cannot own a simultaneous text edit');
  });
}

for(const [open,close] of [['$$','$$'],['\\[','\\]']]) {
  for(const latex of ['x^2', '\r\nx=1\n+y\r\n', '\n x=1\r\n\n+y\n', String.raw`\begin{aligned}x&=1\\[6pt]y&=2\end{aligned}`]) {
    test('extract '+open+' '+JSON.stringify(latex),()=>{
      const source='Before.'+open+latex+close+'After.';
      for(const nodes of [importBlocks(source),parseDocument(wrap(source)).blocks.flatMap(importBlocks)]) {
        assert.deepEqual(nodes.map(n=>n.type),['paragraph','mathBlock','paragraph']);
        assert.equal(text(nodes[0]),'Before.');assert.equal(text(nodes[2]),'After.');
        assert.deepEqual(nodes[1].attrs,{latex,display:true,delimiter:open});
        assert.equal(serialize(nodes[1]),open+latex+close+'\n\n');
      }
    });
  }
  test('adjacent '+open+' displays remain separate',()=>{
    const nodes=importBlocks(open+'a'+close+open+'b'+close);
    assert.deepEqual(nodes.map(n=>n.type),['mathBlock','mathBlock']);
    assert.deepEqual(nodes.map(n=>n.attrs.latex),['a','b']);
  });
  test('mixed inline and '+open+' display math retain delimiters',()=>{
    const nodes=importBlocks('Before $a$ '+open+'b'+close+' after \\(c\\).');
    assert.deepEqual(nodes.map(n=>n.type),['paragraph','mathBlock','paragraph']);
    assert.equal(nodes[0].content.find(n=>n.type==='math').attrs.delimiter,'$');
    assert.equal(nodes[2].content.find(n=>n.type==='math').attrs.delimiter,'\\(');
  });
  test('mixed EOL projection with '+open+' patches only neighboring text',()=>{
    const source=wrap('Before.\r\n'+open+'\r\nx+y\n'+close+'\nAfter.\r\n\n\\unknown{keep}');
    const doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
    assert.deepEqual(doc.content.map(n=>n.type),['paragraph','mathBlock','paragraph','raw']);
    const projection=sourceProjection(source,doc);assert.ok(projection);
    assert.deepEqual(richSourceChanges(projection,doc),[]);
    doc.content[0].content[0].text='Edited.';
    const changes=richSourceChanges(projection,doc);assert.ok(changes);
    assert.equal(changes.toReversed().reduce((s,c)=>s.slice(0,c.from)+c.insert+s.slice(c.to),source),source.replace('Before.','Edited.'));
  });
}
test('ordinary inline math remains inline',()=>{
  const [p]=importBlocks(String.raw`A $x$ B \(y\) C`);
  assert.equal(p.type,'paragraph');assert.deepEqual(p.content.filter(n=>n.type==='math').map(n=>n.attrs.latex),['x','y']);
});
test('line break optional spacing is not a display opener',()=>{
  for(const source of [String.raw`A\\[6pt]B`,String.raw`A\\[0.5em]B`]) {
    const nodes=importBlocks(source);assert.equal(nodes.length,1);assert.equal(nodes[0].type,'paragraph');
    assert.equal(nodes[0].content.filter(n=>n.type==='hardBreak').length,1);
  }
  const lone=String.raw`A\[6pt]B`;
  assert.deepEqual(importBlocks(lone),[{type:'raw',attrs:{source:lone}}]);
});
test('backslash parity distinguishes line break followed by display',()=>{
  const nodes=importBlocks(String.raw`A\\\[x\]B`);
  assert.deepEqual(nodes.map(n=>n.type),['paragraph','mathBlock','paragraph']);
  assert.equal(nodes[1].attrs.latex,'x');
});
test('escaped dollars never create display blocks',()=>{
  const nodes=importBlocks(String.raw`Price \$\$ and $x$`);
  assert.deepEqual(nodes.map(n=>n.type),['paragraph']);
  assert.equal(nodes[0].content.filter(n=>n.type==='math').length,1);
});
test('comments cannot end displays or introduce headings',()=>{
  for(const [open,close] of [['$$','$$'],['\\[','\\]']]) {
    const latex='a % '+close+' \\section{fake}\r\n+b';
    const nodes=importBlocks('Before.'+open+latex+close+'After.');
    assert.deepEqual(nodes.map(n=>n.type),['paragraph','mathBlock','paragraph']);
    assert.equal(nodes[1].attrs.latex,latex);
  }
});
for(const source of [
  String.raw`\begin{future}A $$x$$ \[y\]\end{future}`,
  String.raw`\newcommand{\x}{A $$x$$ \[y\]}`,
  String.raw`\unknown{A $$x$$ \[y\]}`,
  String.raw`A $$unclosed`,String.raw`A \[unclosed`,
  String.raw`A \[x$$ B`,String.raw`A $$x\] B`,
])test('unsafe or opaque source remains Raw: '+source,()=>{
  assert.deepEqual(importBlocks(source),[{type:'raw',attrs:{source}}]);
  const parsed=parseDocument(wrap(source));assert.equal(parsed.start+parsed.blocks.join('')+parsed.end,wrap(source));
});
test('literal environments retain apparent delimiters as code',()=>{
  const source='\\begin{lstlisting}\n$$x$$ \\[y\\]\n\\end{lstlisting}';
  assert.equal(importBlocks(source)[0].type,'codeBlock');
});
test('headings and math are not extracted from inside inline math',()=>{
  const source=String.raw`A $\text{\section{fake}}$ B \(\text{\[fake\]}\)`;
  const nodes=importBlocks(source);assert.deepEqual(nodes.map(n=>n.type),['paragraph']);
  assert.equal(nodes[0].content.filter(n=>n.type==='math').length,2);
});
test('top-level heading followed immediately by a display retains both structures',()=>{
  const nodes=importBlocks(String.raw`\section{\textbf{Title}}Text.$$x$$Tail.`);
  assert.deepEqual(nodes.map(n=>n.type),['heading','paragraph','mathBlock','paragraph']);
});

test('the typing paragraph after final display math owns no source bytes',()=>{
  const source=wrap('Before.\n\n\\[\n\\frac{a}{b}\n\\]');
  const original={type:'doc',content:[...parseDocument(source).blocks.flatMap(importBlocks),{type:'paragraph'}]};
  const edited=structuredClone(original);
  edited.content.find(node=>node.type==='mathBlock').attrs.latex='\n\\frac{a}{cb}\n';
  const insertion=source.indexOf('{b}')+1;
  assert.deepEqual(standaloneMathChanges(sourceProjection(source,original),edited),
    [{from:insertion,to:insertion,insert:'c'}]);
  const changed=source.slice(0,insertion)+'c'+source.slice(insertion);
  assert.deepEqual(standaloneMathChanges(sourceProjection(changed,edited),original),
    [{from:insertion,to:insertion+1,insert:''}]);
});

test('plain table cell edits preserve layout tokens and row line endings',()=>{
  const source=wrap('\\begin{tabular}{ll}\r\nOne  & Two \\\\\r\nThree & Four\r\n\\end{tabular}');
  const original={type:'doc',content:[...parseDocument(source).blocks.flatMap(importBlocks),{type:'paragraph'}]};
  const edited=structuredClone(original);
  edited.content[0].content[1].content[1].content[0].content[0].text='XFour';
  const at=source.indexOf('Four');
  const projection=sourceProjection(source,original);
  assert.deepEqual(standaloneMathChanges(projection,edited),[{from:at,to:at,insert:'X'}]);
  assert.deepEqual(richSourceChanges(projection,edited),[{from:at,to:at,insert:'X'}]);
  const changed=source.slice(0,at)+'X'+source.slice(at);
  assert.deepEqual(standaloneMathChanges(sourceProjection(changed,edited),original),[{from:at,to:at+1,insert:''}]);
});

test('span placeholders never shift the cell byte range on writeback',()=>{
  const source=wrap(String.raw`\begin{tabular}{lll}
\multicolumn{2}{c}{Total} & One \\
\multirow{2}{*}{Group} & Two & Three \\
 & Four & Five
\end{tabular}`);
  const original={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const edited=structuredClone(original);
  const table=edited.content[0];
  table.content[1].content[0].content[0].content[0].text='XGroup';
  table.content[2].content[0].content[0].content[0].text='YFour';
  assert.deepEqual(standaloneMathChanges(sourceProjection(source,original),edited),[
    {from:source.indexOf('Group'),to:source.indexOf('Group'),insert:'X'},
    {from:source.indexOf('Four'),to:source.indexOf('Four'),insert:'Y'},
  ]);
});

test('plain cell writeback leaves a neighboring inline formula and its spelling intact',()=>{
  const source=wrap('\\begin{tabular}{ll}\r\nLeft & $ x $ \\\\\r\nBelow & Right\r\n\\end{tabular}');
  const original={type:'doc',content:[...parseDocument(source).blocks.flatMap(importBlocks),{type:'paragraph'}]};
  const edited=structuredClone(original);
  edited.content[0].content[0].content[0].content[0].content[0].text='XLeft';
  const projection=sourceProjection(source,original),at=source.indexOf('Left');
  assert.deepEqual(standaloneMathChanges(projection,edited),[{from:at,to:at,insert:'X'}]);
  assert.deepEqual(richSourceChanges(projection,edited),[{from:at,to:at,insert:'X'}]);
  const formula=edited.content[0].content[0].content[1].content[0].content[0];
  assert.equal(formula.type,'math');
  formula.attrs.latex=' z ';
  const math=source.indexOf('$ x $')+2;
  assert.deepEqual(standaloneMathChanges(projection,edited),[
    {from:at,to:at,insert:'X'}, {from:math,to:math+1,insert:'z'},
  ]);
});

test('complex table cell edits preserve float captions and column declarations',()=>{
  for(const [open,close] of [
    ['\\begin{tblr}{colspec={ll},row{1}={font=\\bfseries}}','\\end{tblr}'],
    ['\\begin{tabularx}{\\textwidth}{p{3cm}X}','\\end{tabularx}'],
  ]){
    const source=wrap('\\begin{table}[ht]\r\n\\caption{A caption}\r\n'+open+'\r\nLeft & $x$\r\n'+close+'\r\n\\end{table}');
    const original={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
    assert.equal(original.content[0].type,'table');
    const edited=structuredClone(original);
    edited.content[0].content[0].content[0].content[0].content[0].text='XLeft';
    edited.content[0].content[0].content[1].content[0].content[0].attrs.latex='y';
    const projection=sourceProjection(source,original),at=source.indexOf('Left'),math=source.indexOf('$x$')+1;
    const expected=[{from:at,to:at,insert:'X'},{from:math,to:math+1,insert:'y'}];
    assert.deepEqual(richSourceChanges(projection,edited),expected);
    assert.deepEqual(standaloneMathChanges(projection,edited),expected);
  }
});

test('inline math edits preserve repeated formula delimiters and untouched prose',()=>{
  const source=wrap('Text with  $ x $ and \\(x\\).\r\n');
  const original={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const edited=structuredClone(original);
  const maths=edited.content[0].content.filter(node=>node.type==='math');
  maths[1].attrs.latex='y';
  const at=source.indexOf('\\(x\\)')+2;
  const expected=[{from:at,to:at+1,insert:'y'}];
  const projection=sourceProjection(source,original);
  assert.deepEqual(standaloneMathChanges(projection,edited),expected);
  assert.deepEqual(richSourceChanges(projection,edited),expected);
  maths[1].attrs.delimiter='$';
  assert.equal(standaloneMathChanges(projection,edited),null);
});

test('an inline formula inside a formatting command keeps its original enclosing braces',()=>{
  const source=wrap('Before \\textbf{bold $x$ inside} after.');
  const original={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const projection=sourceProjection(source,original);
  const textEdit=structuredClone(original);
  textEdit.content[0].content[3].text=' around';
  const from=source.indexOf('inside');
  assert.deepEqual(richSourceChanges(projection,textEdit),[{from,to:from+6,insert:'around'}]);
  const formula=structuredClone(original);
  formula.content[0].content[2].attrs.latex='y';
  const at=source.indexOf('$x$')+1;
  assert.deepEqual(richSourceChanges(projection,formula),[{from:at,to:at+1,insert:'y'}]);
});

test('TikZ visual updates replace only the verified drawing body inside a figure',()=>{
  const source=wrap('\\begin{figure}[ht]\r\n  \\centering\r\n'+
    '\\begin{tikzpicture}\r\n\\draw (0,0) -- (1,1);\r\n\\end{tikzpicture}\r\n'+
    '  \\caption{Diagonal}\r\n  \\label{fig:keep}\r\n\\end{figure}');
  const original={type:'doc',content:[...parseDocument(source).blocks.flatMap(importBlocks),{type:'paragraph'}]};
  const edited=structuredClone(original);
  edited.content[0].attrs.tikzSource=edited.content[0].attrs.tikzSource.replace('(1,1)','(2,1)');
  const at=source.indexOf('(1,1)')+1;
  const expected=[{from:at,to:at+1,insert:'2'}];
  const projection=sourceProjection(source,original);
  assert.deepEqual(standaloneMathChanges(projection,edited),expected);
  assert.deepEqual(richSourceChanges(projection,edited),expected);
  edited.content[0].attrs.tikzSource+='\n\\caption{Not part of the drawing}';
  assert.equal(standaloneMathChanges(projection,edited),null);
});

test('nested prose edits preserve a proof title, an abstract declaration, and mixed line endings',()=>{
  const source=wrap('\\begin{proof}[Claim]\r\n  First step.\r\n\\end{proof}\r\n\r\n'+
    '\\begin{abstract}\n% preserve this comment\r\n\\small\r\nSummary.\r\n\\end{abstract}');
  const before={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const after=structuredClone(before);
  after.content.find(node=>node.type==='theoremBlock').content[0].content[0].text='First proof step.';
  after.content.find(node=>node.type==='blockquote').content[0].content[0].text='Brief Summary.';
  const changes=[
    {from:source.indexOf('step.'),to:source.indexOf('step.'),insert:'proof '},
    {from:source.indexOf('Summary.'),to:source.indexOf('Summary.'),insert:'Brief '},
  ];
  const projection=sourceProjection(source,before);
  assert.deepEqual(standaloneMathChanges(projection,after),changes);
  assert.deepEqual(richSourceChanges(projection,after),changes);
  const changed=source.replace('First step.','First proof step.').replace('Summary.','Brief Summary.');
  const undo=standaloneMathChanges(sourceProjection(changed,after),before);
  assert.equal(undo.toReversed().reduce((text,c)=>text.slice(0,c.from)+c.insert+text.slice(c.to),changed),source);
});

test('nested list edits preserve item commands, list options and adjacent identical text',()=>{
  const source=wrap('\\begin{enumerate}[start=3]\r\n\\item Same text.\r\n'+
    '  \\begin{description}\n  \\item[Term] Same text.\r\n  \\end{description}\r\n'+
    '\\item Same text.\r\n\\end{enumerate}');
  const before={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)};
  const after=structuredClone(before);
  after.content[0].content[0].content[1].content[0].content[0].content[0].text='XSame text.';
  const at=source.indexOf('Same text.',source.indexOf('[Term]'));
  const projection=sourceProjection(source,before);
  const expected=[{from:at,to:at,insert:'X'}];
  assert.deepEqual(standaloneMathChanges(projection,after),expected);
  assert.deepEqual(richSourceChanges(projection,after),expected);
});
