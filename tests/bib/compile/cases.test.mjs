import test from 'node:test';
import assert from 'node:assert/strict';
import { createBibEditor, parseBib, preflightBib, serializeBib, validateBib } from '../../../apps/web/bib/index.mjs';
import {
  CASES,
  applyCase,
  applyTexTransform,
  checkBibExpectations,
  checkOutputExpectations,
  checkSemanticInvariants,
  loadBaseBib,
  loadTemplate,
} from './cases.mjs';

const baseBib = loadBaseBib();
const baseDocument = parseBib(baseBib);

for (const testCase of CASES) {
  test(`editor case "${testCase.id}" produces the independently expected .bib`, () => {
    for (const backend of testCase.backends) {
      const profile = backend === 'bibtex' ? 'bibtex' : 'biblatex';
      const editor = createBibEditor(baseDocument, { profile });
      const before = editor.getEntries().length;
      const result = applyCase(editor, testCase.id);
      assert.equal(result.ok, true);
      assert.equal(editor.getEntries().length, testCase.entryCount);

      const report = validateBib(editor.getDocument(), { profile });
      assert.equal(report.ok, true, `${testCase.id}/${backend}: ${report.diagnostics.map(item => item.code)}`);

      const bib = preflightBib(editor.getDocument());
      assert.equal(bib.ok, true, `${testCase.id}/${backend} preflight: ${bib.diagnostics.map(item => item.code)}`);
      assert.deepEqual(checkBibExpectations(bib.text, testCase), [], `${testCase.id}/${backend}`);

      const reparsed = bib.document;
      assert.equal(reparsed.stats.errorCount, 0, `${testCase.id}/${backend} output must re-parse`);
      assert.equal(reparsed.entries.length, testCase.entryCount);
      assert.deepEqual(
        checkSemanticInvariants(editor.getDocument(), reparsed),
        [],
        `${testCase.id}/${backend} lost semantics`,
      );

      const tex = applyTexTransform(testCase, loadTemplate(backend));
      assert.deepEqual(checkOutputExpectations({ tex }, testCase), [], `${testCase.id}/${backend} .tex`);

      // The edit must not mutate the shared baseline document.
      assert.equal(editor.getEntries().length, testCase.entryCount);
      assert.equal(before, 6);
      editor.destroy();
    }
  });
}

test('the base fixture starts from six entries and a clean parse', () => {
  assert.equal(baseDocument.entries.length, 6);
  assert.equal(baseDocument.stats.errorCount, 0);
  assert.equal(serializeBib(baseDocument), baseBib);
});

test('every case has at least one backend and an independent expectation', () => {
  assert.equal(CASES.length, 10);
  for (const testCase of CASES) {
    assert.ok(testCase.backends.length >= 1);
    assert.ok(testCase.expected);
    assert.equal(typeof testCase.edit, 'function');
  }
});
