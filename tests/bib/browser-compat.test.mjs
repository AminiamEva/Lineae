import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as bib from '../../apps/web/bib/index.mjs';
import { fixture } from './helpers.mjs';

const DIRECTORY = join('apps', 'web', 'bib');
const FILES = readdirSync(DIRECTORY).filter(name => name.endsWith('.mjs'));

test('the engine directory contains only ES modules', () => {
  assert.ok(FILES.length >= 9);
  for (const file of FILES) {
    const source = readFileSync(join(DIRECTORY, file), 'utf8');
    assert.ok(!/^\s*(const|let|var)\s+\w+\s*=\s*require\s*\(/m.test(source), file);
  }
});

test('no engine module imports a Node.js builtin', () => {
  for (const file of FILES) {
    const source = readFileSync(join(DIRECTORY, file), 'utf8');
    assert.ok(!/from\s+['"]node:/.test(source), `${file} imports node:`);
    assert.ok(!/from\s+['"](fs|path|crypto|os|url)['"]/.test(source), `${file} imports a Node builtin`);
  }
});

test('no engine module touches browser-only globals', () => {
  const forbidden = [
    /\bwindow\./,
    /\blocalStorage\b/,
    /\bnavigator\./,
    /\bcreateElement\s*\(/,
    /\bquerySelector(?:All)?\s*\(/,
    /\baddEventListener\s*\(/,
    /\bprocess\./,
    /\bBuffer\s*\./,
  ];
  for (const file of FILES) {
    const source = readFileSync(join(DIRECTORY, file), 'utf8');
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(source), `${file} matches ${pattern}`);
    }
  }
});

test('the public entry point exposes the documented API', () => {
  const names = [
    'parseBib', 'parseBibFile', 'serializeBib', 'validateBib', 'createBibEditor',
    'scanTexCitations', 'checkTexCitations', 'applyCitationRenames', 'preflightBib',
    'getEntryValue', 'resolveEntry', 'getEntryField', 'macroScopeAt', 'resolveValue',
    'formatDiagnostic', 'BibError', 'BibParseError', 'BibEditorError',
    'DIAGNOSTIC_CODES', 'SEVERITY', 'MODEL_VERSION',
  ];
  for (const name of names) {
    assert.ok(name in bib, `missing export ${name}`);
  }
  assert.equal(bib.MODEL_VERSION, 1);
  assert.equal(typeof bib.DIAGNOSTIC_CODES.UNTERMINATED_BRACED_VALUE, 'string');
});

test('parseBibFile reads a Blob through the standards-only path', async () => {
  const text = '@misc{blobkey, title = {From a Blob}}';
  const document = await bib.parseBibFile(new Blob([text], { type: 'text/plain' }));
  assert.equal(document.entries[0].key, 'blobkey');
  assert.equal(document.source.filename, null);
  assert.equal(bib.serializeBib(document), text);
});

test('parseBibFile keeps a UTF-8 BOM for fidelity', async () => {
  const text = '\ufeff@misc{k, title = {T}}';
  const document = await bib.parseBibFile(new Blob([text]));
  assert.equal(document.source.hadBom, true);
  assert.equal(bib.serializeBib(document), text);
});

test('parseBibFile rejects invalid UTF-8 instead of silently replacing bytes', async () => {
  const bytes = new Uint8Array([0x40, 0x6d, 0x69, 0x73, 0x63, 0xff]);
  await assert.rejects(
    () => bib.parseBibFile(new Blob([bytes])),
    error => error.code === 'BIB502',
  );
});

test('parseBib rejects non-string sources with a typed error', () => {
  assert.throws(() => bib.parseBib(42), error => error.code === 'BIB501');
});

test('resolveEntry and getEntryValue expose macro-expanded text', () => {
  const document = bib.parseBib(fixture('classic.bib'));
  const knuth = document.entries.find(entry => entry.key === 'knuth1984');
  assert.equal(bib.getEntryValue(knuth, 'journal', document), 'ACM Transactions on Programming Languages');
  const resolved = bib.resolveEntry(knuth, document);
  assert.equal(resolved.key, 'knuth1984');
  assert.equal(resolved.fields.month, 'January');
  assert.equal(resolved.unresolved.length, 0);
});

test('formatDiagnostic renders a caret at the reported position', () => {
  const source = '@misc{k,\n  title={unclosed';
  const document = bib.parseBib(source);
  const diagnostic = document.diagnostics.find(item => item.code === 'BIB102');
  const text = bib.formatDiagnostic(diagnostic, source);
  assert.match(text, /error BIB102 at 2:9/);
  assert.match(text, /2 \|   title=\{unclosed/);
  assert.match(text, /\^/);
});

test('throwOnError turns syntax diagnostics into a BibParseError', () => {
  assert.throws(
    () => bib.parseBib('@misc{k, title={unclosed', { throwOnError: true }),
    error => error.name === 'BibParseError' && error.diagnostics.length > 0 && error.code === 'BIB_PARSE',
  );
});
