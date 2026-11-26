import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDocument } from '../apps/web/latex/document.mjs';
import { parseInline } from '../apps/web/latex/inline.mjs';
import { exportDocument, resolvePackages } from '../apps/web/latex/packages.mjs';
import { alignmentLabelRange, appendAlignmentPair, mathDocumentSource, mathEditorSource, numberedMathRows } from '../apps/web/latex/math-environments.mjs';

test('alignment label commands map only the requested numbered row',()=>{
  const source='\\begin{alignat}{1}\r\na &= b \\\\[3pt]\r\n'+
    'c &= \\frac{x}{y} \\label{eq:second} \\\\\r\nd &= e \\notag\r\n\\end{alignat}';
  const first=alignmentLabelRange(source,0),second=alignmentLabelRange(source,1);
  assert.equal(source.slice(first.from,first.to),'\r\na &= b ');
  assert.equal(source.slice(second.from,second.to),'\r\nc &= \\frac{x}{y} \\label{eq:second} ');
  assert.equal(alignmentLabelRange(source,2),null);
  assert.equal(alignmentLabelRange(source.replaceAll('{alignat}','{alignat*}'),1),null);
});
import { serialize } from '../apps/web/src/editor/latex-codec.js';
import { importBlocks } from '../apps/web/latex/blocks.mjs';
import { listMarker, markerInput } from '../apps/web/latex/list-numbering.mjs';
import { buildProjectZip, projectDependencies } from '../apps/web/src/editor/project-zip.mjs';
import { relativeImageWidth } from '../apps/web/latex/images.mjs';

test('paragraph alignment round-trips without leaking into the next paragraph', () => {
  for (const align of ['left','center','right']) {
    const paragraph={type:'paragraph',attrs:{align},content:[{type:'text',text:'Aligned'}]};
    const [restored]=importBlocks(serialize(paragraph));
    assert.equal(restored.attrs.align,align);
    assert.equal(restored.content[0].text,'Aligned');
  }
});

test('Word-style numbering preserves the marker and starting number in TeX', () => {
  for (const [input, style, start] of [
    ['b. ','lower-alpha',2], ['AA. ','upper-alpha',27], ['（３） ','decimal-parens',3], ['IV) ','upper-roman-paren',4],
    ['甲 ','cjk-heavenly-stem-bare',1], ['十二、 ','cjk-ideographic-comma',12], ['③ ','circled-decimal-bare',3],
  ]) {
    const attrs=listMarker(markerInput.exec(input));
    assert.deepEqual(attrs,{start,labelStyle:style},input);
    const node={type:'orderedList',attrs,content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Item'}]}]}]};
    const output=serialize(node);
    assert.deepEqual(importBlocks(output)[0].attrs,{labelStyle:style,...(start>1 ? {start} : {})},output);
    if (input.startsWith('甲')) {
      const source=exportDocument({start:'\\documentclass{article}\n\\begin{document}\n',end:'\\end{document}',eol:'\n'},output,{chineseTypesetting:true});
      assert.match(source,/\\usepackage\{ctex\}/);
      assert.match(source,/\\DeclareRobustCommand\{\\lineaeStem\}/);
    }
  }
  assert.equal(listMarker(markerInput.exec('word. ')),null);
  assert.equal(listMarker(markerInput.exec(' ')),null,'a single space must not start a list');
});

test('list labels use XeLaTeX-safe commands', () => {
  const item={type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Item'}]}]};
  const bullet=serialize({type:'bulletList',attrs:{marker:'▪'},content:[item]});
  assert.match(bullet,/\\raisebox\{\.25ex\}\{\\rule\{\.45em\}\{\.45em\}\}/);
  assert.equal(importBlocks(bullet)[0].attrs.marker,'▪');

  const ordered=serialize({type:'orderedList',attrs:{labelStyle:'cjk-ideographic-comma'},content:[item]});
  assert.match(ordered,/\\zhnumber\{\\arabic\*\}/);
  assert.doesNotMatch(ordered,/\\zhnum\{/);
  const packages=resolvePackages('',ordered).map(rule=>rule.name);
  assert.ok(packages.includes('enumitem'));
  assert.ok(packages.includes('zhnumber'));
});

test('font marks round-trip XeLaTeX commands', () => {
  const node={type:'paragraph',content:[{type:'text',text:'X',marks:[
    {type:'circled'},
    {type:'underline',attrs:{style:'double'}},
    {type:'textStyle',attrs:{backgroundColor:'#fff3a3',color:'#c00000',fontSize:'11pt'}},
  ]}]};
  const output=serialize(node);
  assert.match(output,/\\textcircled\{/);
  assert.match(output,/\\uuline\{/);
  assert.match(output,/\\colorbox\[HTML\]\{fff3a3\}/i);
  const [restored]=importBlocks(output);
  const marks=restored.content[0].marks;
  assert.ok(marks.some(mark=>mark.type==='circled'));
  assert.ok(marks.some(mark=>mark.type==='underline'&&mark.attrs.style==='double'));
  assert.ok(marks.some(mark=>mark.type==='textStyle'&&mark.attrs.backgroundColor?.toLowerCase()==='#fff3a3'));
  const packages=resolvePackages('',output).map(rule=>rule.name);
  assert.ok(packages.includes('ulem'));
  assert.ok(packages.includes('xcolor'));
});

test('paragraph formatting inside list items round-trips', () => {
  const [list]=importBlocks('\\begin{itemize}\n\\item {\\colorbox{yellow}{\\parbox{\\linewidth}{Shaded}}}\n\\end{itemize}');
  const paragraph=list.content[0].content[0];
  assert.equal(paragraph.attrs.shading,'yellow');
  const output=serialize(list);
  assert.match(output,/\\colorbox\{yellow\}/);
  const [restored]=importBlocks(output);
  assert.equal(restored.content[0].content[0].attrs.shading,'yellow');

  const [quote]=importBlocks('\\begin{quote}\n{\\colorbox{yellow}{\\parbox{\\linewidth}{Shaded}}}\n\\end{quote}');
  assert.equal(quote.content[0].attrs.shading,'yellow');
});

test('exports theorem and proof environments and a path-safe project ZIP', async () => {
  const [theorem]=importBlocks('\\begin{theorem}[Example]\nStatement.\n\\end{theorem}');
  assert.equal(theorem.type,'theoremBlock');
  assert.match(serialize(theorem),/\\begin\{theorem\}\[Example\]/);
  assert.equal(importBlocks('\\begin{proof}\nArgument.\n\\end{proof}')[0].attrs.kind,'proof');
  const zip=await buildProjectZip([['main.tex','text'],['ref/图.png',new Blob([new Uint8Array([1,2,3])])]]);
  const bytes=new Uint8Array(await zip.arrayBuffer());
  const view=new DataView(bytes.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);
  assert.equal(view.getUint16(bytes.length-12,true),2);
  assert.ok(new TextDecoder().decode(bytes).includes('ref/图.png'));
  await assert.rejects(buildProjectZip([['../outside.tex','x']]),/Invalid ZIP entry/);
  assert.deepEqual(projectDependencies('% \\input{ignored}\n\\input{chapters/intro}\n\\addbibresource{ref/works.bib}\n\\includegraphics{ref/图.png}'),['chapters/intro.tex','ref/works.bib','ref/图.png']);
});

test('keeps numbered equation labels out of math content and exports eqref', () => {
  const [math]=importBlocks('\\begin{equation}\nx=1\n\\label{eq:x}\n\\end{equation}');
  assert.equal(math.attrs.label,'eq:x');
  assert.equal(math.attrs.latex.trim(),'x=1');
  assert.match(serialize(math),/x=1\\label\{eq:x\}/);
  const [leading]=importBlocks('\\begin{equation}\n\\label{eq:x}\nx=1\n\\end{equation}');
  assert.equal(leading.attrs.label,'eq:x');
  assert.equal(leading.attrs.latex.trim(),'x=1');
  const [paragraph]=importBlocks(String.raw`See \eqref{eq:x}.`);
  assert.equal(serialize(paragraph).trim(),String.raw`See \eqref{eq:x}.`);
  assert.equal(resolvePackages('',serialize(paragraph)).filter(rule=>rule.name==='amsmath').length,1);
});
import { pageMetrics, readPageSetup, writePageSetup } from '../apps/web/latex/geometry.mjs';

test('round-trips a code listing and scoped table rule width', () => {
  const listing=['\\begin{lstlisting}[language=Python]','def f():','    return 42','\\end{lstlisting}'].join('\n');
  assert.equal(serialize(importBlocks(listing)[0]).trim(),listing);
  const literal = '\\begin{lstlisting}\n\\begin{not-an-environment}\n\\end{lstlisting}';
  const parsed = parseDocument('\\documentclass{article}\n\\begin{document}\n'+literal+'\n\\end{document}\n');
  assert.ok(parsed.blocks.some(block=>block.includes(literal)));
  const table=['{\\setlength{\\arrayrulewidth}{0.8pt}','\\begin{tabular}{|l|l|}','\\hline','a & b \\\\','\\hline','\\end{tabular}','}'].join('\n');
  assert.equal(serialize(importBlocks(table)[0]).trim(),table);
});

test('recognizes full text control words without consuming unknown commands', () => {
  assert.equal(parseInline(String.raw`\textdegreeExtra`),null);
  const [paragraph] = importBlocks(String.raw`25\textdegree{} and \texteuro{}10`);
  assert.equal(serialize(paragraph).trim(),String.raw`25\textdegree{} and \texteuro{}10`);
  assert.ok(resolvePackages('',serialize(paragraph)).some(rule=>rule.name==='textcomp'));
});

test('keeps wrapfigure and includegraphics textwidth factors independent', () => {
  assert.equal(relativeImageWidth('0.4\\textwidth','0.4\\textwidth'),'100%');
  assert.equal(relativeImageWidth('0.2\\textwidth','0.4\\textwidth'),'50%');
  assert.equal(relativeImageWidth('6cm','0.4\\textwidth'),'6cm');
  assert.equal(relativeImageWidth('\\linewidth','0.4\\textwidth'),'100%');
  assert.equal(relativeImageWidth('0.8\\linewidth','0.4\\textwidth'),'80%');
  const source=['\\begin{wrapfigure}{r}{0.4\\textwidth}','\\includegraphics[width=0.4\\textwidth]{pic.png}','\\caption{Long caption}','\\end{wrapfigure}'].join('\n');
  const [node]=importBlocks(source);
  assert.equal(node.type,'documentImage');
  assert.equal(node.attrs.wrap,true);
  assert.equal(node.attrs.wrapWidth,'0.4\\textwidth');
  assert.equal(node.attrs.width,'0.4\\textwidth');
  assert.equal(node.attrs.caption,'Long caption');
  assert.match(serialize(node),/\\begin\{wrapfigure\}\{r\}\{0\.4\\textwidth\}/);
});

test('wrapfigure centering round-trips inside the environment', () => {
  const source=['\\begin{wrapfigure}{r}{0.4\\textwidth}','\\centering','\\includegraphics[width=0.4\\textwidth]{pic.png}','\\caption{Center}','\\end{wrapfigure}'].join('\n');
  const [node]=importBlocks(source);
  assert.equal(node.attrs.wrap,true);
  assert.equal(node.attrs.centered,true);
  assert.equal(node.attrs.align,'center');
  assert.match(serialize(node),/\\begin\{wrapfigure\}\{r\}\{0\.4\\textwidth\}\n\\centering\n/);
  const plain=['\\begin{wrapfigure}{r}{0.4\\textwidth}','\\includegraphics[width=0.4\\textwidth]{pic.png}','\\end{wrapfigure}'].join('\n');
  assert.doesNotMatch(serialize(importBlocks(plain)[0]),/\\centering/);
});

test('preserves local image paths and supported widths and requests graphicx', () => {
  const image = String.raw`\includegraphics[width=0.5\linewidth]{figures/plot.png}`;
  const [node] = importBlocks(image);
  assert.equal(node.type, 'documentImage');
  assert.equal(serialize(node).trim(), image);
  assert.ok(resolvePackages('',image).some(rule=>rule.name==='graphicx'));
  assert.equal(importBlocks(String.raw`\includegraphics[angle=90]{plot.png}`)[0].type,'documentImage');
  assert.equal(importBlocks(String.raw`\includegraphics[angle=90]{plot.png}`)[0].attrs.angle,'90');
  const figure=['\\begin{figure}[ht]','\\centering',image,'\\caption{Plot}','\\label{fig:plot}','\\end{figure}'].join('\n');
  assert.equal(serialize(importBlocks(figure)[0]).trim(),figure);
});
test('requests subcaption for subfigure environments and only once', () => {
  const source=['\\begin{figure}','\\centering','\\begin{subfigure}[t]{0.4\\textwidth}','\\centering','\\includegraphics[width=\\linewidth]{a.png}','\\caption{A}','\\end{subfigure}\\quad','\\begin{subfigure}{0.4\\textwidth}','\\centering','\\includegraphics[width=\\linewidth]{b.png}','\\end{subfigure}','\\caption{Both}','\\end{figure}'].join('\n');
  const node=importBlocks(source)[0];
  assert.equal(node.type,'subfigures');
  const body=serialize(node);
  assert.ok(resolvePackages('',body).some(rule=>rule.name==='subcaption'));
  assert.ok(resolvePackages('',body).some(rule=>rule.name==='graphicx'));
  assert.equal(resolvePackages('\\usepackage{subcaption}\n',body).some(rule=>rule.name==='subcaption'),false);
  const output=exportDocument({start:'\\documentclass{article}\n\\begin{document}\n',end:'\\end{document}',eol:'\n'},body);
  assert.ok(output.includes('\\usepackage{subcaption}'));
  assert.equal((output.match(/\\usepackage\{subcaption\}/g)??[]).length,1);
});
import { parseDelimiterPair, wrapMathWithDelimiters } from '../apps/web/latex/delimiters.mjs';

test('builds asymmetric and invisible math delimiters without accepting arbitrary commands', () => {
  assert.equal(wrapMathWithDelimiters(parseDelimiterPair('( ]'), 'x'), String.raw`\left( x \right]`);
  assert.equal(wrapMathWithDelimiters(parseDelimiterPair('{ .'), ''), String.raw`\left\{ \placeholder{} \right.`);
  assert.equal(parseDelimiterPair(String.raw`\frac )`), null);
});

test('re-serializes text symbols and formula wrappers after visual import', () => {
  const paragraph = String.raw`\textbf{\LaTeX{} \textasciigrave{} \textasciicircum{}} \(x^2\)`;
  const [node] = importBlocks(paragraph);
  node.content.push({ type: 'text', text: ' edited' });
  const output = serialize(node);
  for (const command of [String.raw`\LaTeX{}`, String.raw`\textasciigrave{}`, String.raw`\textasciicircum{}`, String.raw`\(x^2\)`]) {
    assert.ok(output.includes(command), output);
  }
  for (const source of ['$$x^2$$', String.raw`\begin{equation}x^2\end{equation}`, String.raw`\begin{equation*}x^2\end{equation*}`]) {
    assert.equal(serialize(importBlocks(source)[0]).trim(), source);
  }
});

test('preserves the bytes of an untouched document, including CRLF and opaque environments', () => {
  const source = [
    '\\documentclass{article}', '% keep this', '\\begin{document}', '',
    '数学 $x^2$', '', '\\begin{opaque}', 'first', '', 'second', '\\end{opaque}', '', '\\end{document}', '',
  ].join('\r\n');
  const doc = parseDocument(source);
  assert.equal(doc.eol, '\r\n');
  assert.ok(doc.blocks.some(block => block.includes('first\r\n\r\nsecond')));
  assert.equal(exportDocument(doc, doc.blocks.join('')), source);
});

for (const [name, beginEol, bodyEol, suffix] of [
  ['LF', '\n', '\n', '% note\n'],
  ['CRLF', '\r\n', '\r\n', '% note\r\n'],
  ['mixed line endings', '\r\n', '\n', ' \t% 注释\r\n% after\n'],
  ['no final newline', '\n', '\r\n', '%'],
]) {
  test('preserves a document closing comment with ' + name, () => {
    const body = 'Text.' + bodyEol;
    const end = '\\end{document}' + suffix;
    const source = '\\begin{document}' + beginEol + body + end;
    const parsed = parseDocument(source);
    assert.ok(parsed);
    assert.equal(parsed.blocks.join(''), body);
    assert.equal(parsed.end, end);
    assert.equal(exportDocument(parsed, body), source);
  });
}

test('rejects non-comment text on the document closing line', () => {
  for (const suffix of ['text', '\\% escaped']) {
    assert.equal(parseDocument('\\begin{document}\nText.\n\\end{document}' + suffix), null);
  }
});

test('serializes raw blocks with a blank line before following text', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      { type: 'raw', attrs: { source: '\\begin{opaque}\nbody\n\\end{opaque}' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
    ],
  };
  assert.equal(serialize(doc), 'Before\n\n\\begin{opaque}\nbody\n\\end{opaque}\n\nAfter\n\n');
});

test('parses text superscripts and subscripts as structure', () => {
  const [sup] = parseInline(String.raw`\textsuperscript{2}`);
  const [sub] = parseInline(String.raw`\textsubscript{1}`);
  assert.equal(sup.tag, 'sup');
  assert.deepEqual(sup.children, ['2']);
  assert.equal(sub.tag, 'sub');
  assert.deepEqual(sub.children, ['1']);
});

test('round-trips footnotes as inline nodes', () => {
  const [footnote] = parseInline('\\footnote{A note}');
  assert.equal(footnote.footnote, 'A note');
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'footnote', attrs: { text: 'A note' } }] }] };
  assert.equal(serialize(doc), '\\footnote{A note}\n\n');
});

test('round-trips citations as inline nodes', () => {
  const [cite] = parseInline('\\cite{knuth1984}');
  assert.equal(cite.cite, 'knuth1984');
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'cite', attrs: { key: 'knuth1984' } }] }] };
  assert.equal(serialize(doc), '\\cite{knuth1984}\n\n');
});

test('parses small caps and boxed text as structure', () => {
  const [smallCaps] = parseInline(String.raw`\textsc{Small}`);
  const [boxed] = parseInline(String.raw`\fbox{Box}`);
  assert.equal(smallCaps.tag, 'textsc');
  assert.deepEqual(smallCaps.children, ['Small']);
  assert.equal(boxed.tag, 'fbox');
  assert.deepEqual(boxed.children, ['Box']);
});

test('serializes small caps and boxed text marks', () => {
  const doc = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Small', marks: [{ type: 'smallcaps' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'Box', marks: [{ type: 'boxed' }] },
      ],
    }],
  };
  assert.equal(serialize(doc), '\\textsc{Small} \\fbox{Box}\n\n');
});

test('round-trips page geometry through the preamble', () => {
  const preamble = '\\documentclass{article}\n\\begin{document}\n';
  const written = writePageSetup(preamble, { paper: 'letter', orientation: 'landscape', margin: '1in' });
  assert.match(written, /\\usepackage\[letterpaper,landscape,margin=1in\]\{geometry\}/);
  assert.deepEqual(readPageSetup(written), {
    paper: 'letter', orientation: 'landscape', margin: '1in',
    margins: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
  });
  assert.deepEqual(pageMetrics({ paper: 'letter', orientation: 'landscape', margin: '1in' }), {
    width: '11in', height: '8.5in', margin: '1in',
    margins: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
  });
  const defaults = readPageSetup('\\documentclass{article}\n');
  assert.deepEqual(defaults, {
    paper: 'letter', orientation: 'portrait', margin: 'custom',
    margins: { top: '44.027mm', right: '47.456mm', bottom: '42.070mm', left: '47.191mm' },
  });
  assert.deepEqual(readPageSetup('\\documentclass[a4paper]{article}\n'), {
    paper: 'a4', orientation: 'portrait', margin: 'custom',
    margins: { top: '44.379mm', right: '44.719mm', bottom: '42.448mm', left: '44.027mm' },
  });
  assert.deepEqual(readPageSetup('\\documentclass[a5paper]{article}\n'), {
    paper: 'a5', orientation: 'portrait', margin: 'custom',
    margins: { top: '45.082mm', right: '25.597mm', bottom: '43.313mm', left: '25.400mm' },
  });
  const asymmetric = writePageSetup(preamble, { paper: 'a5', margins: { top: '1cm', right: '2cm', bottom: '3cm', left: '4cm' } });
  assert.match(asymmetric, /a5paper/);
  assert.match(asymmetric, /top=1cm/);
  assert.match(asymmetric, /left=4cm/);
  assert.deepEqual(readPageSetup(asymmetric).margins, { top: '1cm', right: '2cm', bottom: '3cm', left: '4cm' });
});

test('round-trips table floats with captions and labels', () => {
  const body = '\\begin{table}[htbp]\n\\centering\n\\caption{Results}\n\\label{tab:results}\n\\begin{tabular}{lc}\nA & B \\\\\n\\end{tabular}\n\\end{table}';
  const source = '\\documentclass{article}\n\\begin{document}\n\n' + body + '\n\n\\end{document}\n';
  const doc = parseDocument(source);
  const [table] = doc.blocks.flatMap(importBlocks).filter(node => node.type === 'table');
  assert.ok(table);
  assert.equal(table.attrs.caption, 'Results');
  assert.equal(table.attrs.label, 'tab:results');
  assert.equal(table.attrs.placement, 'htbp');
  assert.equal(table.attrs.centered, true);
  const latex = serialize(table);
  assert.match(latex, /\\begin\{table\}\[htbp\]/);
  assert.match(latex, /\\caption\{Results\}/);
  assert.match(latex, /\\label\{tab:results\}/);
  assert.match(latex, /\\begin\{tabular\}\{lc\}/);
});

test('imports table floats with arraystretch as editable tables', () => {
  const body = [
    '\\begin{table}[H]', '\\centering', '\\renewcommand{\\arraystretch}{0.7}',
    '\\caption{电阻阻值测量数据}', '\\begin{tabular}{lccc}', '\\toprule',
    ' & 1 & 2 & 3 \\\\', '\\midrule',
    '1000欧阻值/$\\Omega$ & 985.175 & 985.284 & 895.085 \\\\',
    '50欧阻值/$\\Omega$ & 52.6881 & 52.7008 & 52.7112 \\\\',
    '\\bottomrule', '\\end{tabular}', '\\end{table}',
  ].join('\n');
  const source = '\\documentclass{article}\n\\begin{document}\n\n' + body + '\n\n\\end{document}\n';
  const doc = parseDocument(source);
  const [table] = doc.blocks.flatMap(importBlocks).filter(node => node.type === 'table');
  assert.ok(table, 'table float is imported as a table');
  assert.equal(table.attrs.arrayStretch, 0.7);
  assert.equal(table.attrs.caption, '电阻阻值测量数据');
  assert.equal(table.attrs.placement, 'H');
  assert.equal(table.attrs.centered, true);
  assert.equal(table.content.length, 3);
  const again = parseDocument('\\documentclass{article}\n\\begin{document}\n\n' + serialize(table) + '\n\\end{document}\n')
    .blocks.flatMap(importBlocks).filter(node => node.type === 'table')[0];
  assert.ok(again, 'serialized table re-imports as a table');
  assert.equal(again.attrs.arrayStretch, 0.7);
});

test('imports a figure whose image is wrapped in a center environment', () => {
  const source = [
    '\\begin{figure}[H]', '\\centering', '\\caption{测量面板示例}',
    '\\begin{center}', '\\includegraphics[width=0.6\\textwidth]{example.png}', '\\end{center}',
    '\\end{figure}',
  ].join('\n');
  const [node] = importBlocks(source);
  assert.equal(node.type, 'documentImage');
  assert.equal(node.attrs.figure, true);
  assert.equal(node.attrs.placement, 'H');
  assert.equal(node.attrs.centered, true);
  assert.equal(node.attrs.caption, '测量面板示例');
  assert.equal(node.attrs.path, 'example.png');
  assert.equal(node.attrs.width, '0.6\\textwidth');
  const again = importBlocks(serialize(node))[0];
  assert.equal(again.type, 'documentImage');
  assert.equal(again.attrs.caption, '测量面板示例');
});

test('parses extended math environments as math blocks', () => {
  for (const environment of [
    ['alignat', '\\begin{alignat}{2}\na&=b & c&=d\n\\end{alignat}'],
    ['eqnarray', '\\begin{eqnarray}\na&=&b\n\\end{eqnarray}'],
    ['smallmatrix', '\\begin{smallmatrix}\na&b\\\\c&d\n\\end{smallmatrix}'],
  ]) {
    const [name, body] = environment;
    const source = '\\documentclass{article}\n\\begin{document}\n\n' + body + '\n\n\\end{document}\n';
    const doc = parseDocument(source);
    const nodes = doc.blocks.flatMap(importBlocks);
    assert.ok(nodes.some(node => node.type === 'mathBlock' && node.attrs.latex.includes(name)), name);
  }
});

test('exports title and math structures with the required outer commands', () => {
  const parts = parseDocument('\\documentclass{article}\n\\title{Example}\n\\begin{document}\n\\end{document}\n');
  const cases = String.raw`\begin{cases}1&x>0\\0&x\le0\end{cases}`;
  const body = serialize(importBlocks(cases)[0]);
  assert.ok(body.startsWith('\\[' + cases + '\\]'));
  const source = exportDocument(parts, body);
  assert.match(source, /\\begin\{document\}\n\\maketitle/);
  assert.doesNotMatch(source, /\\date\{\}/);
  assert.match(source, /\\usepackage\{amsmath\}/);
  assert.equal((exportDocument(parts, '\\maketitle\n' + body).match(/\\maketitle/g) ?? []).length, 1);
  const dated = exportDocument(parseDocument('\\documentclass{article}\n\\title{Example}\n\\date{\\today}\n\\begin{document}\n\\end{document}\n'), body);
  assert.match(dated, /\\date\{\\today\}/);
});

test('uses side limits for inline operators without changing the source', () => {
  const source = '\\lim_{x\\to0}f(x)+\\sum_{i=1}^n a_i';
  const editing = mathEditorSource(source, { inline:true });
  assert.equal(editing, '\\lim\\nolimits_{x\\to0}f(x)+\\sum\\nolimits_{i=1}^n a_i');
  assert.equal(mathDocumentSource(editing, source, { inline:true }), source);
  assert.equal(mathEditorSource('\\displaystyle{\\lim_{x\\to0}f(x)}', { inline:true }),
    '\\displaystyle{\\lim_{x\\to0}f(x)}');
});

test('counts numbered alignment rows while skipping nested matrices and suppressed rows', () => {
  const latex = String.raw`\begin{align}a&=\begin{matrix}1\\2\end{matrix}\label{eq:a}\\b&=2\notag\\c&=3\end{align}`;
  assert.deepEqual(numberedMathRows({ latex }), [
    { index: 0, label: 'eq:a' },
    { index: 1, label: null, unnumbered: true },
    { index: 2, label: null },
  ]);
  assert.deepEqual(numberedMathRows({ latex: latex.replaceAll('{align}', '{align*}') }), []);
});

test('round-trips equation tags and suppressed numbers through the editor', () => {
  const align = String.raw`\begin{align}a&=b\tag{2.1}\label{eq:a}\\c&=d\notag\\e&=f\tag*{$\ast$}\end{align}`;
  const editing = mathEditorSource(align);
  assert.equal(editing, String.raw`\begin{aligned}a&=b\\c&=d\\e&=f\end{aligned}`);
  assert.equal(mathDocumentSource(editing, align), align);
  assert.deepEqual(numberedMathRows({ latex: align }), [
    { index: 0, label: 'eq:a', tag: '2.1' },
    { index: 1, label: null, unnumbered: true },
    { index: 2, label: null, tag: '$\\ast$', tagStar: true },
  ]);
  const equation = String.raw`x=1\tag{A}`;
  assert.equal(mathEditorSource(equation), 'x=1');
  assert.equal(mathDocumentSource('x=1', equation), String.raw`x=1\tag{A}`);
  assert.deepEqual(numberedMathRows({ latex: equation, delimiter: 'equation' }), [
    { index: 0, label: null, tag: 'A' },
  ]);
  assert.deepEqual(numberedMathRows({ latex: String.raw`\begin{align*}a&=b\\c&=d\tag{B}\end{align*}` }), [
    { index: 0, label: null, unnumbered: true },
    { index: 1, label: null, tag: 'B' },
  ]);
  assert.deepEqual(numberedMathRows({ latex: 'x', delimiter: 'equation*' }), []);
  assert.deepEqual(numberedMathRows({ latex: String.raw`x\tag{C}`, delimiter: 'equation*' }), [
    { index: 0, label: null, tag: 'C' },
  ]);
  assert.equal(mathEditorSource(String.raw`x\label{eq:x}`), 'x');
  assert.equal(mathDocumentSource('x', String.raw`x\label{eq:x}`), String.raw`x\label{eq:x}`);
  assert.equal(mathEditorSource(String.raw`x\label{eq:inline}`, { inline:true }), String.raw`x\label{eq:inline}`);
});

test('extends an alignment without losing the exported environment', () => {
  const input = '\\begin{alignat*}{1}a&b\\\\c&d\\end{alignat*}';
  const extended = appendAlignmentPair(input);
  assert.match(extended, /^\\begin\{alignat\*\}\{2\}a&b & \\placeholder\{\} & \\placeholder\{\}/);
  const editable = mathEditorSource(extended);
  assert.match(editable, /^\\begin\{aligned\}/);
  assert.equal(mathDocumentSource(editable, extended), extended);
  assert.match(serialize({type:'mathBlock',attrs:{latex:'\\begin{align}x&y\\end{align}',label:'eq:xy',labelRow:0}}),
    /x&y\\label\{eq:xy\}\\end\{align\}/);
});

test('recognizes inline formatting and preserves the original math delimiter', () => {
  const [span] = parseInline(String.raw`\textcolor[HTML]{445566}{\textit{中文 \(x^2\)}}`);
  assert.equal(span.value, '#445566');
  const [text, math] = span.children[0].children;
  assert.equal(text, '中文 ');
  assert.deepEqual(math, { math: 'x^2', delimiters: ['\\(', '\\)'] });
  assert.equal(parseInline(String.raw`\unknown{内容}`), null);
});

test('adds only missing dependencies and respects declared package lists and comments', () => {
  const preamble = '\\usepackage[options]{amsmath, xcolor}\n%\\usepackage{booktabs}\n';
  const body = '\\dfrac{1}{2} \\toprule \\textcolor{red}{x}\n%\\includegraphics{x}\n\\href{u}{name}';
  assert.deepEqual(resolvePackages(preamble, body).map(rule => rule.name), ['booktabs', 'hyperref']);
});

test('places font support before the class and color support before the document', () => {
  const source = '\\documentclass{article}\n\\begin{document}\n\\end{document}\n';
  const doc = parseDocument(source);
  const body = String.raw`{\fontsize{24}{29}\selectfont \textcolor{red}{X}}`;
  const result = exportDocument(doc, body);
  assert.match(result, /^\\RequirePackage\{fix-cm\}\n\\documentclass/);
  assert.match(result, /\\usepackage\{xcolor\}\n\\begin\{document\}/);
  assert.equal(exportDocument(parseDocument(result), body), result);
});

test('tracks tabcolsep, @{} removal and column rules instead of flattening the tabular spec', async () => {
  const { parseTable } = await import('../apps/web/latex/tables.mjs');
  const ruled = parseTable(['\\begin{tabular}{|c|c|}', 'A & B \\\\', '\\end{tabular}'].join('\n'));
  assert.equal(ruled.columnLayout.boundaries[0].rules, 1);
  assert.equal(ruled.columnLayout.boundaries[1].rules, 1);
  assert.equal(ruled.columnLayout.boundaries[2].rules, 1);
  const at = parseTable(['\\begin{tabular}{@{}c@{}c@{}}', 'A & B \\\\', '\\end{tabular}'].join('\n'));
  assert.equal(at.columnLayout.boundaries[0].tabcolsep, false);
  assert.equal(at.columnLayout.boundaries[1].tabcolsep, false);
  assert.equal(at.columnLayout.boundaries[2].tabcolsep, false);
  const middle = parseTable(['\\begin{tabular}{c@{}c}', 'A & B \\\\', '\\end{tabular}'].join('\n'));
  assert.equal(middle.columnLayout.boundaries[1].tabcolsep, false);
});

test('keeps booktabs rules and alignment around editable cells', async () => {
  const { parseTable, serializeTable } = await import('../apps/web/latex/tables.mjs');
  const source = ['\\begin{tabular}{lc}', '\\toprule', 'A & B \\\\', '\\midrule', '1 & 2 \\\\', '\\bottomrule', '\\end{tabular}'].join('\n');
  const table = parseTable(source);
  assert.equal(table.columns, 'lc');
  assert.deepEqual(table.rows[1].rules, ['\\midrule']);
  table.rows[1].cells[0] = '3 ';
  assert.match(serializeTable(table, '\n'), /\\midrule\n3 & 2/);
  assert.deepEqual(resolvePackages('', source).map(rule => rule.name), ['booktabs']);
});
test('imports and exports editable multirow cells with their package dependency', async () => {
  const {parseTable,serializeTable}=await import('../apps/web/latex/tables.mjs');
  const source=['\\begin{tabular}{lc}','\\multirow{2}{*}{A} & B \\\\',' & C \\\\','\\end{tabular}'].join('\n');
  const table=parseTable(source);
  assert.equal(table.rows[0].rowspans[0],2);
  assert.deepEqual(table.rows[1].cells,['C']);
  assert.match(serializeTable(table,'\n'),/\\multirow\{2\}\{\*\}\{A\}/);
  const node=importBlocks(source)[0];
  assert.equal(node.content[0].content[0].attrs.rowspan,2);
  assert.match(serialize(node),/\\multirow\{2\}\{\*\}\{A\}/);
  assert.deepEqual(resolvePackages('',serialize(node)).map(rule=>rule.name),['multirow']);
});
test('keeps common decorated and repeated table column specifications editable', async()=>{
  const {parseTable,serializeTable}=await import('../apps/web/latex/tables.mjs');
  const source=['\\begin{tabular}{>{\\raggedright\\arraybackslash}p{3cm}*{2}{c}}','A & B & C \\\\','\\end{tabular}'].join('\n');
  const table=parseTable(source);
  assert.equal(table.specs.length,3);assert.equal(table.specs[0].width,'3cm');
  assert.equal(serializeTable(table,'\n'),source);
});

test('a tabular pasted directly after text is split into paragraph and table', async()=>{
  const {importBlocks}=await import('../apps/web/latex/blocks.mjs');
  const source=['Before.','\\begin{tabular}{c|c}','\\toprule','A & B \\\\','\\midrule','C & D \\\\','\\bottomrule','\\end{tabular}'].join('\n');
  const nodes=importBlocks(source);
  assert.deepEqual(nodes.map(node=>node.type),['paragraph','table']);
  assert.equal(nodes[0].content[0].text,'Before.');
  assert.equal(nodes[1].content.length,2);
});
