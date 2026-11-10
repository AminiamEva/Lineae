import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBib, validateBib } from '../../apps/web/bib/index.mjs';
import { createBibEditor } from '../../apps/web/bib/editor.mjs';
import { fixture, hasCode, severityOf } from './helpers.mjs';

const parseFixture = name => parseBib(fixture(name));

test('clean fixtures validate in every profile', () => {
  for (const name of ['classic.bib', 'crossref.bib', 'biblatex.bib']) {
    const document = parseFixture(name);
    for (const profile of ['generic', 'bibtex', 'biblatex']) {
      const report = validateBib(document, { profile });
      assert.equal(report.ok, true, `${name} ${profile}`);
      assert.equal(report.errorCount, 0, `${name} ${profile}: ${report.diagnostics.map(item => item.code)}`);
    }
  }
  const biblatex = validateBib(parseFixture('biblatex.bib'), { profile: 'biblatex' });
  assert.equal(biblatex.warningCount, 0);
  assert.deepEqual(biblatex.summary.duplicateKeys, []);
});

test('classic BibTeX entry types outside the classic set are reported only in the bibtex profile', () => {
  const document = parseFixture('biblatex.bib');
  const bibtex = validateBib(document, { profile: 'bibtex' });
  assert.equal(bibtex.diagnostics.filter(item => item.code === 'BIB203').length, 5);
  const biblatex = validateBib(document, { profile: 'biblatex' });
  assert.equal(hasCode(biblatex.diagnostics, 'BIB203'), false);
});

test('duplicate keys are preserved and reported with profile-dependent severity', () => {
  const document = parseFixture('messy.bib');
  for (const [profile, severity] of [['generic', 'warning'], ['bibtex', 'warning'], ['biblatex', 'error']]) {
    const report = validateBib(document, { profile });
    assert.equal(hasCode(report.diagnostics, 'BIB117'), true, profile);
    assert.equal(severityOf(report.diagnostics, 'BIB117'), severity, profile);
  }
  const report = validateBib(document);
  assert.deepEqual(report.summary.duplicateKeys, ['dup']);
});

test('duplicate fields are reported as a warning once', () => {
  const report = validateBib(parseFixture('messy.bib'));
  const duplicates = report.diagnostics.filter(item => item.code === 'BIB116');
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].severity, 'warning');
  assert.equal(duplicates[0].entryKey, 'dupf');
  assert.equal(duplicates[0].fieldName, 'title');
});

test('undefined macros are errors', () => {
  const report = validateBib('@misc{k, journal = acm, note = {ok}}');
  const diagnostic = report.diagnostics.find(item => item.code === 'BIB201');
  assert.ok(diagnostic);
  assert.equal(diagnostic.severity, 'error');
  assert.equal(diagnostic.entryKey, 'k');
  assert.equal(diagnostic.fieldName, 'journal');
  assert.equal(report.ok, false);
});

test('a macro used before its definition is reported at the definition', () => {
  const source = '@string{a = b}\n@string{b = "B"}\n@misc{k, note = a}';
  const report = validateBib(source);
  assert.equal(hasCode(report.diagnostics, 'BIB201'), true);
  assert.equal(report.ok, false);
});

test('macro cycles are reported', () => {
  const source = '@string{a = b}\n@string{b = a}\n@misc{k, note = a}';
  const report = validateBib(source);
  assert.equal(hasCode(report.diagnostics, 'BIB202'), true);
  assert.equal(report.ok, false);
});

test('month macros and @string concatenation are not reported as undefined', () => {
  const report = validateBib(fixture('classic.bib'), { profile: 'bibtex' });
  assert.equal(hasCode(report.diagnostics, 'BIB201'), false);
});

test('missing crossref targets are warnings', () => {
  const source = '@inproceedings{k, author = {A}, title = {T}, booktitle = {B}, year = {2020}, crossref = {missing}}';
  const report = validateBib(source);
  const diagnostic = report.diagnostics.find(item => item.code === 'BIB205');
  assert.ok(diagnostic);
  assert.equal(diagnostic.severity, 'warning');
  assert.equal(report.ok, true);
});

test('required fields inherited through crossref are not reported as missing', () => {
  const report = validateBib(parseFixture('crossref.bib'));
  assert.equal(hasCode(report.diagnostics, 'BIB204'), false);
});

test('missing required fields warn by default and error in strict mode', () => {
  const source = '@article{k, title = {Only a title}}';
  const report = validateBib(source);
  assert.equal(hasCode(report.diagnostics, 'BIB204'), true);
  assert.equal(severityOf(report.diagnostics, 'BIB204'), 'warning');
  assert.equal(report.ok, true);
  const strict = validateBib(source, { strict: true });
  assert.equal(severityOf(strict.diagnostics, 'BIB204'), 'error');
  assert.equal(strict.ok, false);
});

test('@conference is an informational alias in the bibtex profile', () => {
  const source = '@conference{k, author = {A}, title = {T}, booktitle = {B}, year = {2020}}';
  const report = validateBib(source, { profile: 'bibtex' });
  assert.equal(severityOf(report.diagnostics, 'BIB208'), 'info');
  assert.equal(report.ok, true);
});

test('invalid and empty keys are structural errors', () => {
  const document = parseBib('@misc{ok, title = {T}}');
  const entry = document.entries[0];
  const invalidKeyDocument = {
    ...document,
    entries: [{ ...entry, key: 'bad key' }],
    dirty: true,
  };
  const invalid = validateBib(invalidKeyDocument);
  assert.equal(severityOf(invalid.diagnostics, 'BIB210'), 'error');
  assert.equal(invalid.ok, false);
  const emptyKeyDocument = {
    ...document,
    entries: [{ ...entry, key: '' }],
    dirty: true,
  };
  const empty = validateBib(emptyKeyDocument);
  assert.equal(severityOf(empty.diagnostics, 'BIB206'), 'error');
  assert.equal(empty.ok, false);
});

test('validateBib accepts source text and the biber alias', () => {
  const report = validateBib('@misc{k, title={T}}', { profile: 'biber' });
  assert.equal(report.profile, 'biblatex');
});

test('an unknown profile is rejected', () => {
  assert.throws(() => validateBib('@misc{k}', { profile: 'nonsense' }), error => error.code === 'BIB504');
});

test('the report is frozen and carries counts and a summary', () => {
  const report = validateBib(parseFixture('messy.bib'));
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.diagnostics), true);
  assert.equal(report.errorCount + report.warningCount + report.infoCount, report.diagnostics.length);
  assert.equal(report.summary.entryCount, 8);
  assert.equal(report.summary.blockCount > 0, true);
});

test('after an edit stale parse diagnostics are not replayed', () => {
  const editor = createBibEditor(fixture('messy.bib'));
  const before = editor.validate();
  assert.equal(hasCode(before.diagnostics, 'BIB115'), true);
  const result = editor.updateEntry('dupf', { fields: { title: 'Single title' } });
  assert.equal(result.ok, true);
  const after = editor.validate();
  assert.equal(hasCode(after.diagnostics, 'BIB115'), false);
  assert.equal(hasCode(after.diagnostics, 'BIB116') || hasCode(after.diagnostics, 'BIB117'), true);
});
