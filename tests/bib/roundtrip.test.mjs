import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBib, serializeBib, createBibEditor, checkTexCitations, validateBib } from '../../apps/web/bib/index.mjs';
import { semanticSnapshot } from '../../apps/web/bib/model.mjs';
import { fixture } from './helpers.mjs';

test('parse -> serialize -> parse preserves semantics for every fixture', () => {
  for (const name of ['classic.bib', 'biblatex.bib', 'crossref.bib', 'messy.bib']) {
    const source = fixture(name);
    const first = parseBib(source);
    const output = serializeBib(first);
    const second = parseBib(output);
    assert.deepEqual(semanticSnapshot(second), semanticSnapshot(first), name);
    assert.equal(second.entries.length, first.entries.length, name);
    assert.equal(serializeBib(second), output, name);
  }
});

test('an edited document round-trips with the same semantics', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  assert.equal(editor.updateEntry('knuth1984', { fields: { title: 'A TeXbook', note: null, doi: '10.1000/x' } }).ok, true);
  assert.equal(editor.addEntry({
    key: 'new2024',
    type: 'article',
    fields: { author: 'New, Author', title: 'New {Braces} and \\& symbols', journal: 'Testing', year: '2024' },
  }).ok, true);
  const output = editor.toBibTeX();
  const reparsed = parseBib(output);
  assert.deepEqual(semanticSnapshot(reparsed), semanticSnapshot(editor.getDocument()));
});

test('renaming an entry keeps cross-reference semantics after a round-trip', () => {
  const editor = createBibEditor(fixture('crossref.bib'));
  assert.equal(editor.renameEntry('proc2021', 'proceedings21').ok, true);
  const output = editor.toBibTeX();
  const reparsed = parseBib(output);
  assert.deepEqual(semanticSnapshot(reparsed), semanticSnapshot(editor.getDocument()));
  assert.match(output, /crossref = \{proceedings21\}/);
  assert.equal(reparsed.entries.find(entry => entry.key === 'child2021').fields.find(field => field.name === 'crossref').value.parts[0].value, 'proceedings21');
});

test('unknown fields and custom types survive an unrelated edit', () => {
  const source = '@customtype{k,\n  title = {T},\n  vendor_field = {V},\n  empty = {},\n}';
  const editor = createBibEditor(source);
  assert.equal(editor.updateEntry('k', { fields: { title: 'T2' } }).ok, true);
  const output = editor.toBibTeX();
  const reparsed = parseBib(output);
  const entry = reparsed.entries[0];
  assert.equal(entry.type, 'customtype');
  assert.equal(entry.fields.find(field => field.name === 'vendor_field').value.parts[0].value, 'V');
  assert.equal(entry.fields.find(field => field.name === 'empty').value.parts[0].value, '');
});

test('serialization stays byte-identical when reopened without edits', () => {
  for (const name of ['classic.bib', 'crossref.bib']) {
    const source = fixture(name);
    assert.equal(serializeBib(parseBib(source)), source);
    const editor = createBibEditor(source);
    assert.equal(editor.toBibTeX(), source);
  }
});

test('a large generated database round-trips without loss', () => {
  const parts = ['% generated database'];
  for (let index = 0; index < 300; index += 1) {
    parts.push(`@article{key${index},
  author = {Author ${index}, A. and Other, B.},
  title = {Title number ${index} with {braces} and Unicode 中文},
  journal = {Journal of Testing},
  year = {${1950 + (index % 70)}},
  volume = {${index % 50}},
  pages = {${index}--${index + 10}},
}`);
  }
  const source = parts.join('\n\n') + '\n';
  const document = parseBib(source);
  assert.equal(document.entries.length, 300);
  assert.equal(document.diagnostics.length, 0);
  const output = serializeBib(document);
  assert.equal(output, source);
  assert.deepEqual(semanticSnapshot(parseBib(output)), semanticSnapshot(document));
});

test('the XeLaTeX compile fixtures round-trip, validate and resolve citations', () => {
  for (const [directory, profile] of [['bibtex', 'bibtex'], ['biblatex', 'biblatex']]) {
    const base = join('tests', 'bib', 'xelatex', directory);
    const source = readFileSync(join(base, 'refs.bib'), 'utf8');
    const document = parseBib(source);
    assert.equal(document.stats.errorCount, 0, directory);
    assert.equal(serializeBib(document), source, directory);
    const report = validateBib(document, { profile });
    assert.equal(report.errorCount, 0, `${directory}: ${report.diagnostics.map(item => item.code)}`);
    const tex = readFileSync(join(base, 'main.tex'), 'utf8');
    const check = checkTexCitations(tex, document);
    assert.deepEqual(check.missing, [], `${directory} cites a missing key`);
  }
});

test('a CJK database round-trips in UTF-8', () => {
  const source = `@book{zhongwen2024,
  author = {王, 小明 and 李, 华},
  title = {中文文献测试：标点、空格与数学 $x^2$},
  publisher = {测试出版社},
  year = {2024},
  note = {包含 \\textendash{} 与 \\& 等命令},
}
`;
  const document = parseBib(source);
  const output = serializeBib(document);
  assert.equal(output, source);
  assert.deepEqual(semanticSnapshot(parseBib(output)), semanticSnapshot(document));
  const editor = createBibEditor(source);
  assert.equal(editor.updateEntry('zhongwen2024', { fields: { title: '中文标题（修改后）' } }).ok, true);
  const edited = editor.toBibTeX();
  assert.match(edited, /中文标题（修改后）/);
  assert.equal(parseBib(edited).entries[0].fields.find(field => field.name === 'title').value.parts[0].value, '中文标题（修改后）');
});
