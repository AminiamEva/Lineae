import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBib } from '../../apps/web/bib/index.mjs';
import {
  findEntryByKey,
  getEntryField,
  resolveEntryValues,
  semanticSnapshot,
} from '../../apps/web/bib/model.mjs';
import { serializeBib } from '../../apps/web/bib/serializer.mjs';
import { codesOf, entryByKey, fixture, hasCode, reconstruct } from './helpers.mjs';

test('an empty source yields an empty document', () => {
  const document = parseBib('');
  assert.equal(document.entries.length, 0);
  assert.equal(document.blocks.length, 0);
  assert.equal(document.source.text, '');
  assert.equal(document.dirty, false);
  assert.equal(document.stats.entryCount, 0);
});

test('classic fixture: entries, strings, preamble and no syntax errors', () => {
  const source = fixture('classic.bib');
  const document = parseBib(source, { filename: 'classic.bib' });
  assert.equal(document.entries.length, 5);
  assert.equal(document.strings.length, 2);
  assert.equal(document.preambles.length, 1);
  assert.equal(document.diagnostics.length, 0, codesOf(document.diagnostics).join(','));
  assert.equal(document.source.filename, 'classic.bib');
  assert.equal(document.source.eol, '\n');
  assert.equal(reconstruct(document), document.source.text);
  assert.equal(serializeBib(document), source);
  assert.deepEqual(
    document.entries.map(entry => entry.key),
    ['knuth1984', 'lamport1994', 'smith2020', 'unicode2024', 'tr2001'],
  );
});

test('field value kinds are preserved (braced, quoted, number, macro, concatenation)', () => {
  const document = parseBib(fixture('classic.bib'));
  const knuth = entryByKey(document, 'knuth1984');
  assert.equal(knuth.type, 'article');
  assert.equal(knuth.typeRaw, 'Article');
  assert.equal(getEntryField(knuth, 'author').value.kind, 'braced');
  assert.equal(getEntryField(knuth, 'title').value.kind, 'quoted');
  assert.equal(getEntryField(knuth, 'year').value.kind, 'number');
  assert.equal(getEntryField(knuth, 'journal').value.kind, 'macro');
  assert.equal(getEntryField(knuth, 'month').value.kind, 'macro');
  assert.equal(getEntryField(knuth, 'number').value.kind, 'number');
});

test('@string macros are resolved in source order, including concatenation', () => {
  const document = parseBib(fixture('classic.bib'));
  const knuth = entryByKey(document, 'knuth1984');
  const resolved = resolveEntryValues(knuth, document);
  assert.equal(resolved.fields.journal, 'ACM Transactions on Programming Languages');
  assert.equal(resolved.fields.month, 'January');
  assert.deepEqual(resolved.unresolved, []);
});

test('the preamble keeps its exact text and resolves to its concatenated value', () => {
  const document = parseBib(fixture('classic.bib'));
  assert.equal(document.preambles.length, 1);
  const preamble = document.preambles[0];
  assert.match(preamble.raw, /^@preamble\{/);
  assert.match(preamble.raw, /\\noopsort/);
  const snapshot = semanticSnapshot(document);
  assert.match(snapshot.preambles[0].value, /\\noopsort/);
});

test('nested braces and TeX escapes are kept verbatim', () => {
  const source = fixture('classic.bib');
  const document = parseBib(source);
  const smith = entryByKey(document, 'smith2020');
  const title = getEntryField(smith, 'title');
  assert.equal(title.value.kind, 'braced');
  assert.ok(title.value.parts[0].value.includes('Nested {Braces {in {a {Title}}}}'));
  assert.equal(document.source.text.slice(title.value.start, title.value.end), title.value.raw);
  assert.ok(source.includes('\\& additions; 100\\% coverage'));
  assert.equal(getEntryField(entryByKey(document, 'knuth1984'), 'note').value.parts[0].value.includes('\\&'), true);
});

test('Unicode authors and titles survive unchanged', () => {
  const document = parseBib(fixture('classic.bib'));
  const misc = entryByKey(document, 'unicode2024');
  assert.equal(getEntryField(misc, 'author').value.parts[0].value, '李, 明 and Müller, Anna');
  assert.equal(
    getEntryField(misc, 'title').value.parts[0].value,
    '中文标题与 {Unicode} 组合：测试 — 破折号',
  );
});

test('custom entry types and parenthesized delimiters are supported', () => {
  const document = parseBib(fixture('messy.bib'));
  const weird = entryByKey(document, 'weird');
  assert.equal(weird.type, 'customtype');
  assert.equal(weird.typeRaw, 'customtype');
  const paren = entryByKey(document, 'parenkey');
  assert.equal(paren.format.delimiter, '(');
  assert.equal(getEntryField(paren, 'title').value.parts[0].value, 'Parenthesized entry');
});

test('duplicate keys are all preserved; lookup returns the first', () => {
  const document = parseBib(fixture('messy.bib'));
  const duplicates = document.entries.filter(entry => entry.key === 'dup');
  assert.equal(duplicates.length, 2);
  assert.equal(getEntryField(duplicates[0], 'title').value.parts[0].value, 'First version');
  assert.equal(getEntryField(duplicates[1], 'title').value.parts[0].value, 'Second version');
  assert.equal(findEntryByKey(document, 'dup').id, duplicates[0].id);
});

test('duplicate fields are kept but marked, first one wins', () => {
  const document = parseBib(fixture('messy.bib'));
  const entry = entryByKey(document, 'dupf');
  const titles = entry.fields.filter(field => field.name === 'title');
  assert.equal(titles.length, 2);
  assert.equal(titles[0].duplicate, false);
  assert.equal(titles[1].duplicate, true);
  assert.equal(getEntryField(entry, 'title').value.parts[0].value, 'First title');
  assert.ok(hasCode(document.diagnostics, 'BIB116'));
});

test('a missing comma between fields is recovered and both fields survive', () => {
  const document = parseBib(fixture('messy.bib'));
  const entry = entryByKey(document, 'missingcomma');
  assert.equal(entry.fields.length, 2);
  assert.equal(getEntryField(entry, 'year').value.parts[0].value, '2020');
  assert.ok(hasCode(document.diagnostics, 'BIB115'));
});

test('extra commas and empty braced values are tolerated', () => {
  const document = parseBib(fixture('messy.bib'));
  const entry = entryByKey(document, 'extracommas');
  assert.equal(entry.fields.length, 2);
  assert.equal(getEntryField(entry, 'note').value.parts[0].value, '');
  assert.equal(hasCode(document.diagnostics, 'BIB115'), true); // from missingcomma elsewhere
});

test('quoted values may contain backslash accents inside braces', () => {
  const document = parseBib(fixture('messy.bib'));
  const entry = entryByKey(document, 'quotedmath');
  assert.equal(getEntryField(entry, 'author').value.kind, 'quoted');
  assert.equal(getEntryField(entry, 'author').value.parts[0].value, 'M{\\"u}ller, J{\\"o}rg');
});

test('@comment blocks are preserved as opaque comment blocks', () => {
  const document = parseBib(fixture('messy.bib'));
  const comments = document.blocks.filter(block => block.kind === 'comment');
  assert.equal(comments.length, 1);
  assert.match(document.source.text.slice(comments[0].start, comments[0].end), /@comment\{jabref-meta/);
});

test('a broken braced value keeps the entry and the exact source', () => {
  const source = fixture('broken-brace.bib');
  const document = parseBib(source);
  assert.ok(hasCode(document.diagnostics, 'BIB102'));
  assert.ok(hasCode(document.diagnostics, 'BIB105'));
  assert.equal(document.entries.length, 1);
  assert.equal(document.entries[0].key, 'broken');
  assert.equal(reconstruct(document), document.source.text);
  assert.equal(serializeBib(document), source);
});

test('a broken quoted value is reported but not discarded', () => {
  const source = fixture('broken-quote.bib');
  const document = parseBib(source);
  assert.ok(hasCode(document.diagnostics, 'BIB103'));
  assert.equal(document.entries[0].key, 'quoted');
  assert.equal(serializeBib(document), source);
  assert.equal(document.entries[0].fields[0].value.parts[0].value.includes('An unclosed quoted value'), true);
});

test('a missing entry close is reported while fields stay intact', () => {
  const source = fixture('broken-entry.bib');
  const document = parseBib(source);
  assert.ok(hasCode(document.diagnostics, 'BIB105'));
  const entry = entryByKey(document, 'noclose');
  assert.equal(entry.fields.length, 2);
  assert.equal(serializeBib(document), source);
});

test('CRLF line endings are detected and preserved', () => {
  const source = fixture('classic.bib').replace(/\n/g, '\r\n');
  const document = parseBib(source);
  assert.equal(document.source.eol, '\r\n');
  assert.equal(serializeBib(document), source);
});

test('a UTF-8 BOM is kept aside and restored on serialization', () => {
  const source = '\ufeff' + fixture('classic.bib');
  const document = parseBib(source);
  assert.equal(document.source.hadBom, true);
  assert.equal(document.source.bom, '\ufeff');
  assert.ok(document.source.text.startsWith('%'));
  assert.ok(!document.source.text.startsWith('\ufeff'));
  assert.equal(serializeBib(document), source);
  assert.equal(reconstruct(document), document.source.text);
});

test('macro visibility follows source order and reports forward use', () => {
  const source = [
    '@misc{before, journal = acm}',
    '@string{acm = "ACM"}',
    '@misc{after, journal = acm}',
  ].join('\n');
  const document = parseBib(source);
  assert.equal(resolveEntryValues(entryByKey(document, 'before'), document).fields.journal, 'acm');
  assert.equal(resolveEntryValues(entryByKey(document, 'after'), document).fields.journal, 'ACM');
  assert.deepEqual(
    resolveEntryValues(entryByKey(document, 'before'), document).unresolved.map(item => item.reason),
    ['undefined'],
  );
});

test('entry and field source offsets slice back to their raw text', () => {
  const source = fixture('classic.bib');
  const document = parseBib(source);
  for (const entry of document.entries) {
    assert.equal(document.source.text.slice(entry.start, entry.end), entry.raw);
    for (const field of entry.fields) {
      assert.equal(document.source.text.slice(field.start, field.end), field.raw);
    }
  }
});
