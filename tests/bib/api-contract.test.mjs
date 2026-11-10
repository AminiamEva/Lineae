import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BibEditorError,
  BibError,
  BibParseError,
  DIAGNOSTIC_CODES,
  MODEL_VERSION,
  SEVERITY,
  applyCitationRenames,
  checkTexCitations,
  createBibEditor,
  formatDiagnostic,
  getEntryValue,
  parseBib,
  parseBibFile,
  preflightBib,
  resolveEntry,
  scanTexCitations,
  serializeBib,
  validateBib,
} from '../../apps/web/bib/index.mjs';

test('the public entry point exports the documented surface', () => {
  assert.equal(MODEL_VERSION, 1);
  assert.deepEqual({ ...SEVERITY }, { ERROR: 'error', WARNING: 'warning', INFO: 'info' });
  assert.equal(typeof parseBib, 'function');
  assert.equal(typeof parseBibFile, 'function');
  assert.equal(typeof serializeBib, 'function');
  assert.equal(typeof validateBib, 'function');
  assert.equal(typeof createBibEditor, 'function');
  assert.equal(typeof scanTexCitations, 'function');
  assert.equal(typeof checkTexCitations, 'function');
  assert.equal(typeof applyCitationRenames, 'function');
  assert.equal(typeof preflightBib, 'function');
  assert.equal(typeof getEntryValue, 'function');
  assert.equal(typeof resolveEntry, 'function');
  assert.equal(typeof formatDiagnostic, 'function');
  assert.ok(new BibError('X', 'x') instanceof Error);
  assert.ok(new BibParseError('x', []) instanceof BibError);
  assert.ok(new BibEditorError('X', 'x') instanceof BibError);
});

test('diagnostic codes are unique and follow the BIBxxx shape', () => {
  const values = Object.values(DIAGNOSTIC_CODES);
  assert.equal(new Set(values).size, values.length);
  for (const code of values) assert.match(code, /^BIB\d{3}$/);
});

test('parseBib rejects non-strings and honours throwOnError', () => {
  assert.throws(() => parseBib(42), error => error.code === 'BIB501');
  assert.throws(
    () => parseBib('@misc{k, title={x}', { throwOnError: true }),
    error => error instanceof BibParseError && error.code === 'BIB_PARSE' && error.diagnostics.length > 0,
  );
  const quiet = parseBib('@misc{k, title={x}');
  assert.ok(quiet.diagnostics.length > 0);
  assert.equal(quiet.entries.length, 1);
});

test('parseBib honours maxDiagnostics without losing entries', () => {
  const source = '@misc{a, x=}\n@misc{b, y=}';
  const document = parseBib(source, { maxDiagnostics: 1 });
  assert.equal(document.diagnostics.length, 1);
  assert.equal(document.entries.length, 2);
});

test('parseBibFile rejects non-Blob input and invalid UTF-8', async () => {
  await assert.rejects(() => parseBibFile('path.bib'), error => error.code === 'BIB503');
  await assert.rejects(
    () => parseBibFile(new Blob([new Uint8Array([0x40, 0xff])])),
    error => error.code === 'BIB502',
  );
});

test('serializeBib validates documents, EOL options and unsafe values', () => {
  assert.throws(() => serializeBib(null), error => error.code === 'BIB303');
  const document = parseBib('@misc{k}');
  assert.throws(() => serializeBib(document, { eol: 'bogus' }), error => error.code === 'BIB504');
  assert.throws(
    () => serializeBib({
      ...document,
      entries: [{
        ...document.entries[0],
        fields: [{
          name: 'title',
          nameRaw: 'title',
          value: {
            kind: 'braced',
            parts: [{ kind: 'braced', value: 'a{b', raw: '{a{b}', start: null, end: null }],
            raw: '{a{b}',
            start: null,
            end: null,
          },
          raw: 'title = {a{b}',
          start: -1,
          end: -1,
          dirty: true,
          duplicate: false,
          unparsed: false,
        }],
        dirty: true,
      }],
      dirty: true,
    }),
    error => error.code === 'BIB301',
  );
});

test('serializer verify has a documented boundary for already-broken input', () => {
  const broken = parseBib('@misc{k, title={x}');
  assert.equal(serializeBib(broken), '@misc{k, title={x}');
  assert.equal(serializeBib(broken, { verify: 'auto' }), '@misc{k, title={x}');
  // `verify: true` forces a re-read even for an untouched broken document.
  assert.throws(() => serializeBib(broken, { verify: true }), error => error.code === 'BIB302');
});

test('invalid serializer options are rejected with BIB504', () => {
  const document = parseBib('@misc{k}');
  for (const options of [
    { bom: 'bogus' },
    { finalNewline: 'bogus' },
    { verify: 'yes' },
    { preserveFormatting: 'yes' },
  ]) {
    assert.throws(() => serializeBib(document, options), error => error.code === 'BIB504', JSON.stringify(options));
  }
});

test('validateBib rejects unknown profiles and freezes its report', () => {
  assert.throws(() => validateBib('@misc{k}', { profile: 'bogus' }), error => error.code === 'BIB504');
  const report = validateBib('@misc{k}');
  assert.equal(Object.isFrozen(report), true);
  assert.equal(report.profile, 'generic');
});

test('createBibEditor validates its input and exposes lifecycle errors', () => {
  assert.throws(() => createBibEditor({}), error => error.code === 'BIB303');
  const editor = createBibEditor('@misc{k}');
  assert.throws(() => editor.subscribe(42), error => error.code === 'BIB408');
  assert.equal(editor.getEntry(42), null);
  assert.equal(editor.toBibTeX(), '@misc{k}');
  editor.destroy();
  assert.throws(() => editor.getDocument(), error => error.code === 'BIB406');
});

test('all documented editor error codes are reachable', () => {
  const editor = createBibEditor('@misc{a, title={A}}\n@misc{b, title={B}}');
  assert.equal(editor.addEntry({ key: 'a' }).error.code, 'BIB402');
  assert.equal(editor.addEntry({ key: '' }).error.code, 'BIB403');
  assert.equal(editor.addEntry({ key: 'c', type: '1bad' }).error.code, 'BIB404');
  assert.equal(editor.addEntry({ key: 'd', fields: { 'bad name': 'x' } }).error.code, 'BIB405');
  assert.equal(editor.updateEntry('missing', { fields: { title: 'x' } }).error.code, 'BIB401');
  assert.equal(editor.updateEntry('a', { key: 'z' }).error.code, 'BIB408');
  assert.equal(editor.removeEntry('missing').error.code, 'BIB401');
  assert.equal(editor.renameEntry('missing', 'z').error.code, 'BIB401');
  assert.equal(editor.renameEntry('a', 'b').error.code, 'BIB402');
  assert.equal(editor.importEntries('nope').error.code, 'BIB408');
  assert.equal(editor.updateEntries('nope').error.code, 'BIB408');
  assert.equal(editor.importEntries([{ key: 'x' }, { key: 'a' }]).error.code, 'BIB407');
  assert.equal(editor.updateEntries([{ key: 'a', patch: { fields: { title: 'x' } } }, { key: 'missing', patch: {} }]).error.code, 'BIB407');
  editor.destroy();
});

test('duplicate keys require an explicit occurrence for mutations', () => {
  const editor = createBibEditor('@misc{k, title={A}}\n@misc{k, title={B}}');
  assert.equal(editor.getEntries().length, 2);
  assert.equal(editor.getEntry('k').fields[0].value.parts[0].value, 'A');
  assert.equal(editor.updateEntry('k', { fields: { title: 'X' } }).error.code, 'BIB409');
  assert.equal(editor.removeEntry('k').error.code, 'BIB409');
  assert.equal(editor.renameEntry('k', 'k2').error.code, 'BIB409');
  const removed = editor.removeEntry('k', { occurrence: 1 });
  assert.equal(removed.ok, true);
  assert.equal(editor.getEntries().length, 1);
  assert.equal(editor.getEntry('k').fields[0].value.parts[0].value, 'A');
  assert.equal(editor.removeEntry('k').ok, true);
  assert.equal(editor.getEntry('k'), null);
});

test('duplicate fields are all updated by updateEntry, as documented', () => {
  const editor = createBibEditor('@misc{k, title={A}, title={B}, year={2020}}');
  const result = editor.updateEntry('k', { fields: { title: 'New' } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.changedFields, [{ name: 'title', action: 'updated' }]);
  const titles = editor.getEntry('k').fields.filter(field => field.name === 'title');
  assert.equal(titles.length, 2);
  assert.equal(titles[0].value.parts[0].value, 'New');
  assert.equal(titles[1].value.parts[0].value, 'New');
  assert.equal(editor.validate().diagnostics.some(item => item.code === 'BIB116'), true);
});

test('tex citation scanner treats commands inside \\newcommand bodies as citations', () => {
  const scan = scanTexCitations('\\newcommand{\\mycite}[1]{\\cite{#1}}');
  const commands = scan.citations.map(citation => citation.command);
  assert.deepEqual(commands, ['mycite', 'cite']);
  // Known limitation: macro-definition bodies are not distinguished from usage.
  assert.deepEqual(scan.citations[1].keys.map(key => key.key), ['#1']);
});

test('applyCitationRenames rejects syntactically invalid replacement keys', () => {
  assert.throws(() => applyCitationRenames('\\cite{a}', { a: 'bad key' }), error => error.code === 'BIB504');
  assert.throws(() => applyCitationRenames('\\cite{a}', { a: '' }), error => error.code === 'BIB504');
  assert.equal(applyCitationRenames('\\cite{a}', { a: 'good-key' }).text, '\\cite{good-key}');
});

test('\\nocite{*} reports nociteAll but still lists entries as uncited', () => {
  const result = checkTexCitations('\\nocite{*}', parseBib('@misc{a}\n@misc{b}'));
  assert.equal(result.nociteAll, true);
  assert.deepEqual(result.uncited, ['a', 'b']);
  assert.equal(result.citationCount, 1);
});

test('query helpers and diagnostics format for missing values', () => {
  const document = parseBib('@misc{k, title={T}}');
  assert.equal(getEntryValue(document.entries[0], 'missing', document), null);
  assert.deepEqual(resolveEntry(document.entries[0], document).fields, { title: 'T' });
  const diagnostic = document.diagnostics[0] ?? parseBib('@misc{k, title={x}').diagnostics[0];
  assert.match(formatDiagnostic(diagnostic, 'line one\nline two'), /error BIB\d{3}/);
});

test('scanTexCitations rejects non-string input', () => {
  assert.throws(() => scanTexCitations(42), error => error.code === 'BIB504');
});
