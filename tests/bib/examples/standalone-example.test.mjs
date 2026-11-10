import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDemo } from './bib-backend-demo.mjs';

test('the standalone demo completes the whole workflow with public APIs only', () => {
  const result = runDemo();
  assert.equal(result.parsed, 6);
  assert.deepEqual(result.searched, ['turing1950']);
  assert.equal(result.added, 'shannon1948');
  assert.equal(result.updatedYear, '2025');
  assert.equal(result.removed, 'turing1950');
  assert.equal(result.exportedEntries, 6);
  assert.equal(result.missingCitations, 0);
  assert.equal(result.preflightOk, true);
  assert.equal(result.destroyBlocked, true);
  assert.ok(result.bibText.includes('@article{shannon1948,'));
  assert.ok(result.bibText.includes('year        = {2025}'));
  assert.ok(!result.bibText.includes('turing1950'));
  assert.ok(result.bibText.includes('customfield = {keep-me}'));
});

test('the demo imports only the public entry point, never internal modules', () => {
  const source = readFileSync(join('tests', 'bib', 'examples', 'bib-backend-demo.mjs'), 'utf8');
  const engineImports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(engineImports.filter(specifier => specifier.includes('apps/web/bib')), [
    '../../../apps/web/bib/index.mjs',
  ]);
  for (const forbidden of ['lexer.mjs', 'parser.mjs', 'serializer.mjs', 'editor.mjs', 'validator.mjs', 'model.mjs']) {
    assert.ok(!source.includes(forbidden), `demo must not import ${forbidden}`);
  }
  assert.ok(!engineImports.some(specifier => /@tiptap|prosemirror|mathlive/i.test(specifier)));
  assert.ok(!/\bwindow\.|localStorage|globalThis\.document/.test(source));
});
