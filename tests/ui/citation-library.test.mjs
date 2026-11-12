import test from 'node:test';
import assert from 'node:assert/strict';
import { createCitationLibrary } from '../../apps/web/src/editor/citation-library.js';

function bib(name, source) {
  return new File([source], name, { type: 'text/plain' });
}

test('citation library imports multiple files and searches author, title, and year', async () => {
  const library = createCitationLibrary();
  await library.addFile(bib('one.bib', '@article{alpha, author={Ada Lovelace}, title={Analytical Engine}, year={1843}}'));
  await library.addFile(bib('two.bib', '@book{beta, author={Alan Turing}, title={Computing}, date={1950}}'));
  assert.deepEqual(library.search('lovelace').map(entry => entry.key), ['alpha']);
  assert.deepEqual(library.search('computing').map(entry => entry.key), ['beta']);
  assert.deepEqual(library.search('1950').map(entry => entry.key), ['beta']);
  assert.equal(library.entries.length, 2);
});

test('duplicate keys remain unavailable until the user chooses a source', async () => {
  const library = createCitationLibrary();
  await library.addFile(bib('first.bib', '@article{same, title={First}}'));
  await library.addFile(bib('second.bib', '@article{same, title={Second}}'));
  assert.equal(library.conflicts.get('same').length, 2);
  assert.equal(library.entries.length, 0);
  assert.equal(library.choose('same', 'second.bib', 0), true);
  assert.equal(library.entries[0].title, 'Second');
  assert.match(library.conflicts.get('same')[0].sourceText, /First/);
  assert.match(library.conflicts.get('same')[1].sourceText, /Second/);
});

test('citation diagnostics reuse tex citation scanning for missing keys', async () => {
  const library = createCitationLibrary();
  await library.addFile(bib('refs.bib', '@article{known, title={Known}}'));
  const result = library.diagnostics('\\cite{known,missing}');
  assert.deepEqual(result.citations.missing.map(item => item.key), ['missing']);
  assert.equal(result.citations.missing[0].start, 12);
});

test('bibliography edits use the transactional editor and preserve untouched source', async () => {
  const library = createCitationLibrary();
  await library.addFile(bib(
    'refs.bib',
    '% keep this comment\n@article{Key,\n  title = {Keep {\\TeX} and \\\\LaTeX},\n  CustomField = {未知字段},\n  bad = {raw {value}},\n}\n',
  ));
  const result = library.updateEntry('refs.bib', 'Key', { fields: { title: 'Changed {\\TeX}' } });
  assert.equal(result.ok, true);
  const text = library.getSource('refs.bib').sourceText;
  assert.match(text, /% keep this comment/);
  assert.match(text, /CustomField = \{未知字段\}/);
  assert.match(text, /title = \{Changed \{\\TeX\}\}/);
  assert.match(text, /bad = \{raw \{value\}\}/);
});

test('bibliography editing exposes previews, occurrence-safe removal, and batch import', async () => {
  const library = createCitationLibrary();
  await library.addFile(bib('refs.bib', '@article{same, title={First}}\n@article{same, title={Second}}'));
  const rename = library.previewRename('refs.bib', 'same', 'renamed', {
    texSource: '\\cite{same}',
    occurrence: 1,
  });
  assert.equal(rename.ok, true);
  assert.equal(rename.externalReferences.length, 1);
  assert.equal(rename.ambiguous, true);
  const imported = library.importEntries('refs.bib', [
    { key: 'third', type: 'misc', fields: { title: 'Third' } },
  ]);
  assert.equal(imported.ok, true);
  assert.equal(imported.count, 1);
  const removed = library.removeEntry('refs.bib', 'same', { occurrence: 0 });
  assert.equal(removed.ok, true);
  assert.equal(library.getSource('refs.bib').document.entries.length, 2);
});
