import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBib } from '../../apps/web/bib/index.mjs';
import { serializeBib } from '../../apps/web/bib/serializer.mjs';
import { createBibEditor } from '../../apps/web/bib/editor.mjs';
import { fixture, lines, expectOk } from './helpers.mjs';

test('every untouched fixture serializes byte-for-byte', () => {
  for (const name of ['classic.bib', 'biblatex.bib', 'crossref.bib', 'messy.bib', 'broken-brace.bib']) {
    const source = fixture(name);
    const document = parseBib(source);
    assert.equal(serializeBib(document), source, name);
  }
});

test('EOL conversion is explicit and reversible', () => {
  const document = parseBib(fixture('classic.bib'));
  const crlf = serializeBib(document, { eol: 'crlf' });
  assert.ok(!/[^\r]\n/.test(crlf));
  assert.equal(parseBib(crlf).source.eol, '\r\n');
  assert.equal(serializeBib(parseBib(crlf), { eol: 'lf' }), document.source.text);
});

test('BOM handling is explicit', () => {
  const document = parseBib('\ufeff' + fixture('classic.bib'));
  assert.equal(serializeBib(document).charCodeAt(0), 0xfeff);
  assert.notEqual(serializeBib(document, { bom: 'never' }).charCodeAt(0), 0xfeff);
});

test('final newline can be ensured or removed', () => {
  const document = parseBib('@misc{k, title={x}}');
  assert.equal(serializeBib(document, { finalNewline: 'ensure' }).endsWith('\n'), true);
  assert.equal(serializeBib(parseBib('@misc{k}\n'), { finalNewline: 'none' }), '@misc{k}');
});

test('editing one field changes only that field line', () => {
  const source = fixture('classic.bib');
  const editor = createBibEditor(source);
  expectOk(editor.updateEntry('knuth1984', { fields: { title: 'The TeXbook' } }));
  const before = lines(source);
  const after = lines(editor.toBibTeX());
  assert.equal(after.length, before.length);
  const changed = before.map((line, index) => (line === after[index] ? null : index)).filter(index => index !== null);
  assert.deepEqual(changed, [10]);
  assert.equal(after[10], '  title     = "The TeXbook",');
});

test('quoted and numeric styles survive an edit', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectOk(editor.updateEntry('knuth1984', { fields: { year: '1985' } }));
  expectOk(editor.updateEntry('knuth1984', { fields: { title: 'A newer title' } }));
  const text = editor.toBibTeX();
  assert.match(text, /title     = "A newer title"/);
  assert.match(text, /year      = 1985/);
  const reparsed = parseBib(text);
  const entry = reparsed.entries.find(item => item.key === 'knuth1984');
  assert.equal(entry.fields.find(field => field.name === 'year').value.kind, 'number');
  assert.equal(entry.fields.find(field => field.name === 'title').value.kind, 'quoted');
});

test('a field that needs quotes switches to braces safely', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectOk(editor.updateEntry('knuth1984', { fields: { title: 'A "quoted" title' } }));
  const text = editor.toBibTeX();
  assert.match(text, /title     = \{A "quoted" title\}/);
  assert.equal(parseBib(text).entries.find(item => item.key === 'knuth1984').fields.find(field => field.name === 'title').value.kind, 'braced');
});

test('untouched concatenations, macros and unknown fields stay verbatim', () => {
  const source = fixture('classic.bib');
  const editor = createBibEditor(source);
  expectOk(editor.updateEntry('knuth1984', { fields: { note: 'Changed note' } }));
  const text = editor.toBibTeX();
  assert.match(text, /journal   = acmtrans/);
  assert.match(text, /month     = jan/);
  assert.match(text, /pages     = \{1--10\}/);
});

test('adding a field keeps every existing field and appends in order', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectOk(editor.updateEntry('lamport1994', { fields: { isbn: '0-201-52983-1' } }));
  const text = editor.toBibTeX();
  assert.match(text, /isbn = \{0-201-52983-1\}/);
  const reparsed = parseBib(text).entries.find(item => item.key === 'lamport1994');
  assert.equal(reparsed.fields.at(-1).name, 'isbn');
  assert.equal(reparsed.fields.length, 6);
});

test('a new entry is appended after a blank line and parses back', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectOk(editor.addEntry({
    key: 'new2024',
    type: 'misc',
    fields: { author: 'New, Author', title: 'A New Entry', year: '2024' },
  }));
  const text = editor.toBibTeX();
  assert.match(text, /\n\n@misc\{new2024,/);
  const reparsed = parseBib(text);
  assert.equal(reparsed.entries.at(-1).key, 'new2024');
  assert.equal(serializeBib(reparsed), text);
});

test('removing an entry keeps the surrounding comments and bytes', () => {
  const editor = createBibEditor(fixture('crossref.bib'));
  expectOk(editor.removeEntry('related2021'));
  const text = editor.toBibTeX();
  assert.ok(!text.includes('related2021'));
  assert.ok(text.includes('@set{set2021'));
  assert.ok(text.includes('@inproceedings{child2021'));
  assert.equal(parseBib(text).entries.length, 3);
});

test('changing an entry type rewrites only the header', () => {
  const editor = createBibEditor(fixture('messy.bib'));
  expectOk(editor.updateEntry('weird', { type: 'misc' }));
  const text = editor.toBibTeX();
  assert.match(text, /@misc\{weird,/);
  assert.match(text, /howpublished = \{Self-published\}/);
  assert.equal(parseBib(text).entries.find(item => item.key === 'weird').type, 'misc');
});

test('CRLF documents keep CRLF in regenerated entries', () => {
  const source = fixture('classic.bib').replace(/\n/g, '\r\n');
  const editor = createBibEditor(source);
  expectOk(editor.updateEntry('lamport1994', { fields: { title: 'CRLF title' } }));
  const text = editor.toBibTeX();
  assert.match(text, /title = \{CRLF title\},\r\n/);
  assert.ok(!/[^\r]\n/.test(text));
});

test('the serializer refuses unbalanced new values instead of corrupting the file', () => {
  const document = parseBib('@misc{k, title={ok}}');
  const entry = document.entries[0];
  const brokenValue = {
    kind: 'braced',
    parts: [{ kind: 'braced', raw: '{a{b}', value: 'a{b', start: null, end: null }],
    raw: '{a{b}',
    start: null,
    end: null,
  };
  const brokenField = { ...entry.fields[0], value: brokenValue, dirty: true };
  const brokenEntry = { ...entry, fields: [brokenField], dirty: true };
  const brokenDocument = { ...document, entries: [brokenEntry], dirty: true };
  assert.throws(
    () => serializeBib(brokenDocument),
    error => error.code === 'BIB301',
  );
});

test('serializeBib rejects objects that are not BibDocuments', () => {
  assert.throws(() => serializeBib({ foo: 'bar' }), error => error.code === 'BIB303');
});

test('serializeBib refuses a block that references a missing entry', () => {
  const document = parseBib('@misc{k, title={T}}');
  const broken = {
    ...document,
    blocks: [...document.blocks, { kind: 'entry', entryId: 'e999', start: 0, end: 0 }],
    dirty: true,
  };
  assert.throws(() => serializeBib(broken), error => error.code === 'BIB303');
});

test('serialization is idempotent after edits', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectOk(editor.updateEntry('smith2020', { fields: { pages: '1--20' } }));
  expectOk(editor.addEntry({ key: 'extra2025', type: 'online', fields: { title: 'Extra', url: 'https://example.org' } }));
  const first = editor.toBibTeX();
  const second = serializeBib(parseBib(first));
  assert.equal(second, first);
});

test('a comment at the end of the file survives edits', () => {
  const source = '@misc{k, title={x}}\n\n% trailing note\n';
  const editor = createBibEditor(source);
  expectOk(editor.updateEntry('k', { fields: { title: 'y' } }));
  const text = editor.toBibTeX();
  assert.ok(text.endsWith('% trailing note\n'));
  assert.match(text, /title=\{y\}/);
});
