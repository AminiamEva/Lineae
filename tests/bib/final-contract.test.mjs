import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAGNOSTIC_CODES,
  applyCitationRenames,
  createBibEditor,
  parseBib,
  preflightBib,
  scanTexCitations,
  serializeBib,
} from '../../apps/web/bib/index.mjs';

const DUPLICATES = [
  '@misc{k, title={A}}',
  '@misc{k, title={B}}',
  '@misc{ref, crossref = {k}}',
].join('\n');

test('BIB409 is exported for ambiguous keys', () => {
  assert.equal(DIAGNOSTIC_CODES.AMBIGUOUS_KEY, 'BIB409');
});

test('duplicate keys remain queryable and getEntry returns the first', () => {
  const editor = createBibEditor(DUPLICATES);
  assert.equal(editor.getEntries().length, 3);
  assert.equal(editor.getEntry('k').fields[0].value.parts[0].value, 'A');
  assert.equal(editor.getEntry('ref').key, 'ref');
});

test('updateEntry refuses ambiguous keys and supports source-order occurrence', () => {
  const editor = createBibEditor(DUPLICATES);
  const ambiguous = editor.updateEntry('k', { fields: { title: 'X' } });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.error.code, 'BIB409');
  assert.deepEqual(ambiguous.error.details.occurrences, [0, 1]);

  const first = editor.updateEntry('k', { fields: { title: 'First' } }, { occurrence: 0 });
  assert.equal(first.ok, true);
  assert.equal(first.occurrence, 0);
  assert.equal(editor.getEntries()[0].fields[0].value.parts[0].value, 'First');
  assert.equal(editor.getEntries()[1].fields[0].value.parts[0].value, 'B');

  const second = editor.updateEntry('k', { fields: { title: 'Second' } }, { occurrence: 1 });
  assert.equal(second.ok, true);
  assert.equal(editor.getEntries()[0].fields[0].value.parts[0].value, 'First');
  assert.equal(editor.getEntries()[1].fields[0].value.parts[0].value, 'Second');
});

test('removeEntry refuses ambiguity and removes the selected occurrence', () => {
  const editor = createBibEditor(DUPLICATES);
  const ambiguous = editor.removeEntry('k');
  assert.equal(ambiguous.error.code, 'BIB409');
  assert.equal(editor.getEntries().length, 3);

  const removed = editor.removeEntry('k', { occurrence: 1 });
  assert.equal(removed.ok, true);
  assert.equal(removed.occurrence, 1);
  assert.equal(removed.remainingWithKey, 1);
  assert.deepEqual(removed.danglingReferences, []);
  assert.equal(editor.getEntries().length, 2);
  assert.equal(editor.getEntry('k').fields[0].value.parts[0].value, 'A');

  const removedFirst = editor.removeEntry('k', { occurrence: 0 });
  assert.equal(removedFirst.ok, true);
  assert.equal(removedFirst.remainingWithKey, 0);
  assert.deepEqual(removedFirst.danglingReferences, [{ entryKey: 'ref', field: 'crossref' }]);
  assert.equal(editor.getEntry('k'), null);
});

test('occurrence must be a non-negative integer within the duplicate set', () => {
  const editor = createBibEditor(DUPLICATES);
  for (const occurrence of [-1, 1.5, '1', null]) {
    const result = editor.removeEntry('k', { occurrence });
    assert.equal(result.error.code, 'BIB408', String(occurrence));
  }
  const outOfRange = editor.updateEntry('k', { fields: { title: 'X' } }, { occurrence: 2 });
  assert.equal(outOfRange.error.code, 'BIB401');
  assert.equal(outOfRange.error.details.count, 2);
});

test('renameEntry refuses ambiguity, reports it, and does not guess internal references', () => {
  const editor = createBibEditor(DUPLICATES);
  const ambiguous = editor.renameEntry('k', 'k2');
  assert.equal(ambiguous.error.code, 'BIB409');

  const renamed = editor.renameEntry('k', 'k2', {
    occurrence: 1,
    texSource: '\\cite{k} and \\citep{k}',
  });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.entry.key, 'k2');
  assert.equal(renamed.ambiguous, true);
  assert.deepEqual(renamed.ambiguity, { key: 'k', count: 2, occurrences: [0, 1] });
  assert.equal(renamed.occurrence, 1);
  assert.equal(renamed.referencesSkipped, true);
  assert.deepEqual(renamed.updatedReferences, []);
  assert.equal(renamed.externalReferences.length, 2);
  assert.equal(renamed.externalReferencesAmbiguous, true);

  const text = editor.toBibTeX();
  assert.ok(text.includes('@misc{k, title={A}}'));
  assert.ok(text.includes('@misc{k2, title={B}}'));
  // Ambiguous crossref is left untouched rather than silently retargeted.
  assert.ok(text.includes('crossref = {k}'));
});

test('renameEntry still updates references for a unique key', () => {
  const editor = createBibEditor('@misc{k, title={A}}\n@misc{ref, crossref = {k}}');
  const result = editor.renameEntry('k', 'k2');
  assert.equal(result.ok, true);
  assert.equal(result.ambiguous, false);
  assert.deepEqual(result.updatedReferences, [{ entryKey: 'ref', field: 'crossref', count: 1 }]);
  assert.ok(editor.toBibTeX().includes('crossref = {k2}'));
});

test('renameEntry validates the new key before changing anything', () => {
  const editor = createBibEditor('@misc{k, title={A}}');
  const invalid = editor.renameEntry('k', 'bad key');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'BIB403');
  assert.equal(editor.getEntry('k').key, 'k');
  const reserved = editor.renameEntry('k', '');
  assert.equal(reserved.error.code, 'BIB403');
});

test('renameEntry rejects an existing target and out-of-range occurrence', () => {
  const editor = createBibEditor(DUPLICATES);
  const existing = editor.renameEntry('k', 'ref', { occurrence: 0 });
  assert.equal(existing.error.code, 'BIB402');
  assert.equal(editor.getEntry('ref').key, 'ref');
  const outOfRange = editor.renameEntry('k', 'k2', { occurrence: 2 });
  assert.equal(outOfRange.error.code, 'BIB401');
  assert.equal(editor.getEntry('k').key, 'k');
});

test('preflightBib re-parses serialized output and reports fresh errors', () => {
  const clean = parseBib('@misc{k, title={T}}');
  const cleanResult = preflightBib(clean);
  assert.equal(cleanResult.ok, true);
  assert.equal(cleanResult.text, '@misc{k, title={T}}');
  assert.equal(cleanResult.errorCount, 0);
  assert.equal(cleanResult.document.entries[0].key, 'k');

  const broken = parseBib('@misc{k, title={x');
  const brokenResult = preflightBib(broken);
  assert.equal(brokenResult.ok, false);
  assert.ok(brokenResult.errorCount > 0);
  assert.ok(brokenResult.diagnostics.some(diagnostic => diagnostic.code === 'BIB102'));
});

test('preflightBib does not trust stale diagnostics on an edited document', () => {
  const editor = createBibEditor(parseBib('@misc{k, title={x'));
  assert.equal(editor.updateEntry('k', { fields: { year: '2020' } }).ok, true);
  // The document is dirty; its historical diagnostics are not replayed.
  assert.equal(editor.validate().diagnostics.some(item => item.code === 'BIB102'), false);
  const preflight = preflightBib(editor.getDocument());
  assert.equal(preflight.ok, false);
  assert.ok(preflight.errorCount > 0);
});

test('preflightBib validates serializer options and document input', () => {
  const document = parseBib('@misc{a}\n@misc{b}');
  assert.throws(() => preflightBib(document, { eol: 'bogus' }), error => error.code === 'BIB504');
  assert.throws(() => preflightBib({}), error => error.code === 'BIB303');
  const normalized = preflightBib(document, { eol: 'crlf' });
  assert.ok(normalized.text.includes('\r\n'));
});

test('custom cite-like commands remain a documented scanner limitation', () => {
  const scan = scanTexCitations('\\newcommand{\\mycite}[1]{\\cite{#1}}');
  assert.deepEqual(scan.citations.map(citation => citation.command), ['mycite', 'cite']);
  assert.deepEqual(scan.citations[1].keys.map(key => key.key), ['#1']);
});

test('applyCitationRenames validates Map and object replacement keys', () => {
  assert.throws(() => applyCitationRenames('\\cite{a}', new Map([['a', 'bad key']])), error => error.code === 'BIB504');
  assert.equal(applyCitationRenames('\\cite{a}', new Map([['a', 'good_key']])).text, '\\cite{good_key}');
});

test('serializer accepts all documented option values', () => {
  const document = parseBib('@misc{k}');
  for (const options of [
    { eol: 'lf' },
    { eol: 'crlf' },
    { bom: 'preserve' },
    { bom: 'never' },
    { finalNewline: 'preserve' },
    { finalNewline: 'ensure' },
    { finalNewline: 'none' },
    { preserveFormatting: true },
    { preserveFormatting: false },
    { verify: false },
    { verify: 'auto' },
    { verify: true },
  ]) {
    assert.equal(typeof serializeBib(document, options), 'string', JSON.stringify(options));
  }
});
