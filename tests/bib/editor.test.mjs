import test from 'node:test';
import assert from 'node:assert/strict';
import { createBibEditor, parseBib, serializeBib } from '../../apps/web/bib/index.mjs';
import { fixture, expectError, expectOk, entryByKey } from './helpers.mjs';

test('createBibEditor accepts source text and a parsed document', () => {
  const fromText = createBibEditor(fixture('classic.bib'));
  const fromDocument = createBibEditor(parseBib(fixture('classic.bib')));
  assert.equal(fromText.getEntries().length, 5);
  assert.equal(fromDocument.getEntries().length, 5);
  assert.equal(fromText.getEntry('knuth1984').key, 'knuth1984');
  assert.equal(fromText.getEntry('missing'), null);
  assert.equal(fromText.getEntry(42), null);
});

test('addEntry appends an entry with ordered fields', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  const result = expectOk(editor.addEntry({
    key: 'new2024',
    type: 'online',
    fields: {
      author: 'New, Author',
      title: 'A New Entry',
      url: 'https://example.org/a?x=1&y=2',
      year: '2024',
    },
  }));
  assert.equal(result.entry.key, 'new2024');
  assert.deepEqual(result.entry.fields.map(field => field.name), ['author', 'title', 'url', 'year']);
  assert.equal(editor.getEntries().length, 6);
  assert.equal(editor.getEntry('new2024').fields[0].nameRaw, 'author');
  const reparsed = parseBib(editor.toBibTeX());
  assert.equal(reparsed.entries.at(-1).key, 'new2024');
});

test('addEntry rejects duplicates, invalid keys, types and fields', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectError(editor.addEntry({ key: 'knuth1984', type: 'misc' }), 'BIB402');
  expectError(editor.addEntry({ key: '', type: 'misc' }), 'BIB403');
  expectError(editor.addEntry({ key: 'bad key', type: 'misc' }), 'BIB403');
  expectError(editor.addEntry({ key: 'k1', type: '1bad' }), 'BIB404');
  expectError(editor.addEntry({ key: 'k2', type: 'misc', fields: { 'bad field': 'x' } }), 'BIB405');
  expectError(editor.addEntry({ key: 'k3', type: 'misc', fields: { title: 'a {b' } }), 'BIB405');
  expectError(editor.addEntry({ key: 'k4', type: 'misc', fields: { title: { text: 'x', delimiter: 'weird' } } }), 'BIB405');
  assert.equal(editor.getEntries().length, 5);
});

test('addEntry refuses a duplicate key in the same batch input', () => {
  const editor = createBibEditor('');
  expectOk(editor.addEntry({ key: 'a', fields: [] }));
  expectError(editor.addEntry({ key: 'a', fields: [] }), 'BIB402');
});

test('updateEntry reports missing keys and refuses key changes', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectError(editor.updateEntry('nope', { fields: { title: 'x' } }), 'BIB401');
  expectError(editor.updateEntry('knuth1984', { key: 'other' }), 'BIB408');
});

test('updateEntry changes only the requested fields and keeps unknown fields', () => {
  const source = '@misc{k,\n  title = {Old},\n  customfield = {Keep me},\n  year = {2020},\n}';
  const editor = createBibEditor(source);
  const result = expectOk(editor.updateEntry('k', { fields: { title: 'New' } }));
  assert.deepEqual(result.changedFields, [{ name: 'title', action: 'updated' }]);
  const entry = editor.getEntry('k');
  assert.equal(entry.fields.find(field => field.name === 'customfield').value.parts[0].value, 'Keep me');
  assert.equal(entry.fields.find(field => field.name === 'year').value.parts[0].value, '2020');
  assert.match(editor.toBibTeX(), /customfield = \{Keep me\}/);
});

test('updateEntry can remove a field with null and add new fields', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectOk(editor.updateEntry('knuth1984', { fields: { note: null, doi: '10.1000/x' } }));
  const entry = editor.getEntry('knuth1984');
  assert.equal(entry.fields.some(field => field.name === 'note'), false);
  assert.equal(entry.fields.at(-1).name, 'doi');
  assert.equal(entry.fields.find(field => field.name === 'doi').value.parts[0].value, '10.1000/x');
});

test('updateEntry can change type and clear fields explicitly', () => {
  const editor = createBibEditor('@article{k, title={T}, year={2020}}');
  expectOk(editor.updateEntry('k', { type: 'booklet' }));
  assert.equal(editor.getEntry('k').type, 'booklet');
  expectOk(editor.updateEntry('k', { replaceFields: true, fields: { title: 'Only' } }));
  assert.deepEqual(editor.getEntry('k').fields.map(field => field.name), ['title']);
  const reparsed = parseBib(editor.toBibTeX());
  assert.equal(reparsed.entries[0].type, 'booklet');
  assert.equal(reparsed.entries[0].fields.length, 1);
});

test('an empty update is a no-op that emits no event', () => {
  const editor = createBibEditor('@misc{k}');
  let events = 0;
  editor.subscribe(() => { events += 1; });
  const result = editor.updateEntry('k', {});
  assert.equal(result.ok, true);
  assert.equal(result.revision, 0);
  assert.equal(editor.getDocument().revision, 0);
  assert.equal(events, 0);
});

test('removeEntry returns dangling references and removes only that entry', () => {
  const editor = createBibEditor(fixture('crossref.bib'));
  const result = expectOk(editor.removeEntry('proc2021'));
  assert.equal(editor.getEntry('proc2021'), null);
  assert.deepEqual(
    result.danglingReferences.map(item => item.entryKey).sort(),
    ['child2021', 'related2021', 'set2021'],
  );
  assert.equal(editor.getEntries().length, 3);
  expectError(editor.removeEntry('proc2021'), 'BIB401');
});

test('renameEntry updates crossref, entryset and related fields', () => {
  const editor = createBibEditor(fixture('crossref.bib'));
  const result = expectOk(editor.renameEntry('proc2021', 'proceedings21'));
  assert.equal(editor.getEntry('proc2021'), null);
  assert.equal(editor.getEntry('proceedings21').key, 'proceedings21');
  assert.equal(result.updatedReferences.length, 3);
  assert.deepEqual(
    result.updatedReferences.map(item => `${item.entryKey}.${item.field}`).sort(),
    ['child2021.crossref', 'related2021.related', 'set2021.entryset'],
  );
  const text = editor.toBibTeX();
  assert.match(text, /crossref = \{proceedings21\}/);
  assert.match(text, /entryset = \{child2021, proceedings21\}/);
  assert.match(text, /related = \{child2021, proceedings21\}/);
});

test('renameEntry reports .tex citations without modifying them', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  const texSource = 'See \\cite{knuth1984} and \\citep[p.~1]{knuth1984, lamport1994}.';
  const result = expectOk(editor.renameEntry('knuth1984', 'knuth84', { texSource }));
  assert.equal(result.externalReferences.length, 2);
  assert.deepEqual(result.externalReferences.map(item => item.command), ['cite', 'citep']);
  assert.ok(texSource.includes('\\cite{knuth1984}'), 'the .tex source is untouched');
});

test('renameEntry updates BibLaTeX xdata references', () => {
  const editor = createBibEditor(fixture('biblatex.bib'));
  const result = expectOk(editor.renameEntry('common', 'shared-data'));
  assert.ok(result.updatedReferences.some(item => item.entryKey === 'shared2020' && item.field === 'xdata'));
  assert.match(editor.toBibTeX(), /xdata = \{shared-data\}/);
  assert.equal(parseBib(editor.toBibTeX()).entries.length, 6);
});

test('renameEntry rejects duplicates, invalid keys and missing entries', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectError(editor.renameEntry('knuth1984', 'lamport1994'), 'BIB402');
  expectError(editor.renameEntry('knuth1984', 'bad key'), 'BIB403');
  expectError(editor.renameEntry('missing', 'other'), 'BIB401');
  const same = editor.renameEntry('knuth1984', 'knuth1984');
  assert.equal(same.ok, true);
  assert.equal(same.revision, 0);
});

test('searchEntries searches keys, types and resolved fields', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  assert.equal(editor.searchEntries('knuth').results.length, 1);
  assert.equal(editor.searchEntries('KNUTH').results.length, 1);
  assert.equal(editor.searchEntries('unicode2024').results[0].key, 'unicode2024');
  assert.equal(editor.searchEntries('1984').results[0].key, 'knuth1984');
  assert.equal(editor.searchEntries('中文标题').results[0].key, 'unicode2024');
  assert.equal(editor.searchEntries('misc').total, 1);
  assert.equal(editor.searchEntries('no such text').total, 0);
  const limited = editor.searchEntries('', { limit: 2 });
  assert.equal(limited.results.length, 2);
  assert.equal(limited.total, 5);
  assert.equal(limited.truncated, true);
  const allFields = editor.searchEntries('coverage', { fields: ['note'] });
  assert.equal(allFields.results[0].key, 'knuth1984');
  assert.equal(editor.searchEntries('coverage', { fields: ['title'] }).total, 0);
});

test('importEntries is transactional and can skip duplicate conflicts', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  const failure = editor.importEntries([
    { key: 'batch1', type: 'misc', fields: { title: 'Batch one' } },
    { key: 'knuth1984', type: 'misc', fields: { title: 'Conflict' } },
  ]);
  expectError(failure, 'BIB407');
  assert.equal(editor.getEntry('batch1'), null);
  assert.equal(editor.getEntries().length, 5);

  const skipped = expectOk(editor.importEntries([
    { key: 'batch1', type: 'misc', fields: { title: 'Batch one' } },
    { key: 'knuth1984', type: 'misc' },
  ], { onConflict: 'skip' }));
  assert.equal(skipped.count, 1);
  assert.deepEqual(skipped.skipped, ['knuth1984']);
  assert.equal(editor.getEntry('batch1').key, 'batch1');
  assert.equal(editor.getDocument().revision, 1);
});

test('updateEntries commits all changes or none', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  const failure = editor.updateEntries([
    { key: 'knuth1984', patch: { fields: { title: 'Should not stick' } } },
    { key: 'missing', patch: { fields: { title: 'x' } } },
  ]);
  expectError(failure, 'BIB407');
  assert.equal(editor.getEntry('knuth1984').fields.find(field => field.name === 'title').value.parts[0].value, 'The {\\TeX}book');

  const success = expectOk(editor.updateEntries([
    { key: 'knuth1984', patch: { fields: { volume: '18' } } },
    { key: 'lamport1994', patch: { fields: { edition: '3rd' } } },
  ]));
  assert.equal(success.count, 2);
  assert.equal(editor.getEntry('knuth1984').fields.find(field => field.name === 'volume').value.parts[0].value, '18');
  assert.equal(editor.getEntry('lamport1994').fields.find(field => field.name === 'edition').value.parts[0].value, '3rd');
});

test('change events fire once per commit and unsubscribe stops them', () => {
  const editor = createBibEditor('@misc{k}');
  const events = [];
  const unsubscribe = editor.subscribe(event => events.push(event));
  expectOk(editor.updateEntry('k', { fields: { title: 'T' } }));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'change');
  assert.equal(events[0].revision, 1);
  assert.deepEqual(events[0].actions, [{ type: 'update', key: 'k', occurrence: 0, changedFields: [{ name: 'title', action: 'added' }] }]);
  assert.equal(Object.isFrozen(events[0].document), true);
  unsubscribe();
  expectOk(editor.updateEntry('k', { fields: { year: '2020' } }));
  assert.equal(events.length, 1);
});

test('documents and entries are deeply frozen snapshots', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  const before = editor.getDocument();
  expectOk(editor.updateEntry('knuth1984', { fields: { title: 'Changed' } }));
  const after = editor.getDocument();
  assert.notEqual(before, after);
  assert.equal(Object.isFrozen(before), true);
  assert.equal(Object.isFrozen(before.entries), true);
  assert.equal(Object.isFrozen(before.entries[0].fields[0]), true);
  assert.equal(before.entries.find(entry => entry.key === 'knuth1984').fields.find(field => field.name === 'title').value.parts[0].value, 'The {\\TeX}book');
  assert.equal(after.revision, 1);
  assert.equal(before.revision, 0);
});

test('destroy emits one event and disables the editor', () => {
  const editor = createBibEditor('@misc{k}');
  const events = [];
  editor.subscribe(event => events.push(event));
  editor.destroy();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'destroyed');
  assert.throws(() => editor.getEntries(), error => error.code === 'BIB406');
  assert.throws(() => editor.addEntry({ key: 'x' }), error => error.code === 'BIB406');
  assert.throws(() => editor.getDocument(), error => error.code === 'BIB406');
  editor.destroy();
  assert.equal(events.length, 1);
});

test('a throwing listener is isolated and reported', () => {
  const errors = [];
  const editor = createBibEditor('@misc{k}', { onListenerError: error => errors.push(error.message) });
  editor.subscribe(() => { throw new Error('listener failed'); });
  expectOk(editor.updateEntry('k', { fields: { title: 'T' } }));
  assert.deepEqual(errors, ['listener failed']);
  assert.equal(editor.getEntry('k').fields[0].name, 'title');
});

test('toBibTeX matches serializeBib(getDocument())', () => {
  const editor = createBibEditor(fixture('classic.bib'));
  expectOk(editor.updateEntry('lamport1994', { fields: { title: 'X' } }));
  assert.equal(editor.toBibTeX(), serializeBib(editor.getDocument()));
});
