import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDocument } from '../apps/web/latex/document.mjs';
import { parseInline } from '../apps/web/latex/inline.mjs';
import { exportDocument, resolvePackages } from '../apps/web/latex/packages.mjs';
import { appendAlignmentPair, mathDocumentSource, mathEditorSource, numberedMathRows } from '../apps/web/latex/math-environments.mjs';
import { serialize } from '../apps/web/src/editor/latex-codec.js';
import { importBlocks } from '../apps/web/latex/blocks.mjs';
import { listMarker, markerInput } from '../apps/web/latex/list-numbering.mjs';
import { buildProjectZip, projectDependencies } from '../apps/web/src/editor/project-zip.mjs';

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

test('preserves local image paths and supported widths and requests graphicx', () => {
  const image = String.raw`\includegraphics[width=0.5\linewidth]{figures/plot.png}`;
  const [node] = importBlocks(image);
  assert.equal(node.type, 'documentImage');
  assert.equal(serialize(node).trim(), image);
  assert.ok(resolvePackages('',image).some(rule=>rule.name==='graphicx'));
  assert.equal(importBlocks(String.raw`\includegraphics[angle=90]{plot.png}`)[0].type,'raw');
  const figure=['\\begin{figure}[ht]','\\centering',image,'\\caption{Plot}','\\label{fig:plot}','\\end{figure}'].join('\n');
  assert.equal(serialize(importBlocks(figure)[0]).trim(),figure);
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
  assert.match(source, /\\date\{\}\n\\begin\{document\}\n\\maketitle/);
  assert.match(source, /\\usepackage\{amsmath\}/);
  assert.equal((exportDocument(parts, '\\maketitle\n' + body).match(/\\maketitle/g) ?? []).length, 1);
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
