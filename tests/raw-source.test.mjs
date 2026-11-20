import assert from 'node:assert/strict';
import test from 'node:test';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {importBlock, importBlocks, serialize} from '../apps/web/src/editor/latex-codec.js';
import {sourceProjection, richSourceChanges} from '../apps/web/src/editor/source-sync.js';

const wrap = body => '\\documentclass{article}\r\n\\begin{document}\n' + body + '\\end{document}\r\n';
const document = text => {
  const parsed = parseDocument(text);
  assert.ok(parsed, 'unsupported or incomplete environments must remain importable');
  assert.equal(parsed.start + parsed.blocks.join('') + parsed.end, text);
  return {type:'doc', content:parsed.blocks.flatMap(importBlocks)};
};
const apply = (text, changes) => {
  assert.ok(changes, 'edits to a separate supported paragraph must be accepted');
  return [...changes].sort((a,b) => b.from-a.from).reduce((value, change) =>
    value.slice(0,change.from) + change.insert + value.slice(change.to), text);
};

for (const raw of [
  '  \\unknown[opt]{value} \r\n\n\r\n',
  '\\newcommand{\\example}[1]{\r\n  \\section{#1}\n}\r\n',
  '\\renewcommand\\example[1]{\\par \\textbf{#1}}\n',
  '\\dirtree{%\r\n.1 root.\n.2 \\section{literal}.\r\n}\n',
  '\\begin{minipage}{.5\\textwidth}\r\n\\section{Inside}\n\n\\begin{minipage}{2cm}X\\end{minipage}\r\n\\end{minipage}\n',
  '\\begin{future}\n\\begin{other}\r\n\\section{Keep}\n\\end{other}\n\\end{future}',
]) {
  test('raw import and serialization preserve every byte: ' + JSON.stringify(raw.slice(0,45)), () => {
    const nodes = importBlocks(raw);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, 'raw');
    assert.equal(nodes[0].attrs.source, raw);
    assert.equal(serialize(nodes[0]), raw);
    assert.equal(importBlock(raw).attrs.source, raw);
    for (let iteration=0, value=raw; iteration<3; iteration++) {
      value = importBlocks(value).map(serialize).join('');
      assert.equal(value, raw, 'repeated raw round trip');
    }
  });
}

for (const raw of [
  '\\begin{future}\r\n\\begin{future}\n\\section{Protected}\r\n\\end{future}\n\\end{future}',
  '\\begin{minipage}{5cm}\n% \\end{minipage}\r\n\\begin{other}\n\\end{other}\r\n\\end{minipage}',
  '\\newcommand{\\example}{\r\n\\begin{future}\n\n\\section{Protected}\n\\end{future}\r\n}',
  '\\renewcommand{\\example}[1]{\\section{#1}\\par #1}',
  '\\dirtree{\n.1 \\section{Protected}.\r\n}',
  '\\unknown{value}',
]) {
  test('neighbor edits and structural edits preserve protected source: ' + JSON.stringify(raw.slice(0,40)), () => {
    const source = wrap('Before.\r\n\n' + raw + '\r\n\nAfter.\n');
    const doc = document(source);
    assert.deepEqual(doc.content.map(node => node.type), ['paragraph','raw','paragraph']);
    const projection = sourceProjection(source,doc);
    assert.ok(projection);
    assert.deepEqual(richSourceChanges(projection,doc), []);
    const next = structuredClone(doc);
    next.content[0].content[0].text = 'Before edited.';
    next.content[2].content[0].text = 'After edited.';
    assert.equal(apply(source,richSourceChanges(projection,next)), source.replace('Before.','Before edited.').replace('After.','After edited.'));
    const split = structuredClone(doc);
    split.content.splice(0,1,{type:'paragraph',content:[{type:'text',text:'One.'}]},{type:'paragraph',content:[{type:'text',text:'Two.'}]});
    assert.equal(apply(source,richSourceChanges(projection,split)), source.replace('Before.','One.\n\nTwo.'));
    const removed = structuredClone(doc);
    removed.content.splice(1,1);
    assert.equal(richSourceChanges(projection,removed), null, 'raw deletion must be refused');
  });
}

for (const tail of [
  '\\begin{minipage}{5cm}\nUnclosed.\r\n\n\\section{Still raw}',
  '\\begin{future}\n\\begin{child}\n\\end{future}\r\nTail.',
  '\\end{future}\r\n\\section{Still raw}',
]) {
  test('incomplete or mismatched environment remains protected: ' + JSON.stringify(tail.slice(0,45)), () => {
    const source = wrap('Before.\n\n' + tail + '\n');
    const doc = document(source);
    assert.equal(doc.content[0].type, 'paragraph');
    assert.ok(doc.content.slice(1).every(node => node.type === 'raw'));
    assert.equal(doc.content.slice(1).map(serialize).join(''), tail + '\n');
    const projection = sourceProjection(source,doc);
    doc.content[0].content[0].text = 'Edited.';
    assert.equal(apply(source,richSourceChanges(projection,doc)), source.replace('Before.','Edited.'));
  });
}

test('macro definitions do not execute their environment delimiters while splitting source', () => {
  const raw = '\\newcommand{\\open}{\\begin{future}}\r\n\n\\renewcommand{\\close}{\\end{future}}';
  const source = wrap(raw + '\n\nAfter.\n');
  const doc = document(source);
  assert.deepEqual(doc.content.map(node => node.type), ['raw','raw','paragraph']);
  const projection = sourceProjection(source,doc);
  doc.content.at(-1).content[0].text = 'Edited.';
  assert.equal(apply(source,richSourceChanges(projection,doc)), source.replace('After.','Edited.'));
});

test('comment and escaped command text cannot create headings or split raw source', () => {
  for (const source of ['\\unknown{x}% \\section{Comment}\n', '\\unknown{\\\\section{Escaped} \\par}']) {
    assert.deepEqual(importBlocks(source), [{type:'raw',attrs:{source}}]);
  }
});

test('unknown syntax inside supported containers survives serialization', () => {
  for (const source of [
    '\\begin{quote}\n\\unknown{value}\n\\end{quote}',
    '\\begin{itemize}\n\\item \\unknown{value}\n\\end{itemize}',
    '\\begin{description}\n\\item[Term] \\unknown{value}\n\\end{description}',
    '\\begin{theorem}\n\\begin{future}\n\n\\section{Protected}\n\\end{future}\n\\end{theorem}',
  ]) {
    const output = importBlocks(source).map(serialize).join('');
    assert.ok(output.includes(source) || output.includes('\\unknown{value}'), output);
    assert.ok(!output.includes('\\textbackslash'), 'unknown syntax must not become escaped text');
  }
});

test('an unknown macro in a heading is protected rather than escaped as plain text', () => {
  const source = '\\section{\\unknown}';
  assert.deepEqual(importBlocks(source), [{type:'raw',attrs:{source}}]);
});

test('literal environments ignore apparent nested environments and structural commands', () => {
  const raw = '\\begin{future}\n\\begin{verbatim}\n\\end{future}\n\\section{literal}\n\\end{verbatim}\n\\end{future}';
  const doc = document(wrap(raw + '\n'));
  assert.deepEqual(doc.content, [{type:'raw',attrs:{source:raw+'\n'}}]);
});

test('macro optional defaults and display delimiters are opaque definition text', () => {
  for (const raw of [
    '\\newcommand*{\\example}[1][\\section{Default}\r\n\nDefault]{#1}',
    '\\renewcommand\\example[1][\\begin{future}]{\\[ #1 \\]}',
    '\\newcommand{\\open}{\\[}\n\n\\newcommand{\\close}{\\]}',
  ]) {
    const source=wrap(raw+'\n\nAfter.\n'), doc=document(source);
    assert.equal(doc.content.at(-1).type,'paragraph');
    assert.ok(doc.content.slice(0,-1).every(node=>node.type==='raw'));
    const projection=sourceProjection(source,doc);
    doc.content.at(-1).content[0].text='Edited.';
    assert.equal(apply(source,richSourceChanges(projection,doc)),source.replace('After.','Edited.'));
  }
});

test('indented literal closing delimiter restores subsequent editable paragraphs', () => {
  const source=wrap('\\begin{verbatim}\n\\section{literal}\n  \\end{verbatim}\n\nAfter.\n');
  const doc=document(source);
  assert.deepEqual(doc.content.map(node=>node.type),['raw','paragraph']);
});

const basicTable = ['\\begin{tabular}{l}', 'X ' + String.raw`\\`, '\\end{tabular}'].join('\n');
for (const source of [
  '\\begin{table}\n\\caption{\\unknown{Caption}}\n'+basicTable+'\n\\end{table}',
  '\\begin{table}\n\\begin{minipage}{2cm}Keep\\end{minipage}\n'+basicTable+'\n\\end{table}',
  '\\begin{itemize}\n\\unknown{Keep}\n\\item Text\n\\end{itemize}',
  basicTable.replace('X ', '\\unknown{Keep} '),
]) {
  test('unsupported content in a known wrapper keeps the entire source: ' + source.slice(0,55), () => {
    assert.deepEqual(importBlocks(source), [{type:'raw',attrs:{source}}]);
    assert.equal(importBlocks(source).map(serialize).join(''),source);
  });
}

test('incomplete child-file fragments retain exact mixed endings through neighbor edits', () => {
  const source='Before.\r\n\n\\begin{minipage}{3cm}\n\\begin{future}\r\nTail.';
  const parsed=parseDocument(source,{fragment:true});
  assert.equal(parsed.start+parsed.blocks.join('')+parsed.end,source);
  const doc={type:'doc',content:parsed.blocks.flatMap(importBlocks)};
  assert.deepEqual(doc.content.map(node=>node.type),['paragraph','raw']);
  const projection=sourceProjection(source,doc,{fragment:true});
  assert.deepEqual(richSourceChanges(projection,doc),[]);
  doc.content[0].content[0].text='Edited.';
  assert.equal(apply(source,richSourceChanges(projection,doc)),source.replace('Before.','Edited.'));
});
