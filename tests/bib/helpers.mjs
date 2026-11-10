/**
 * Shared helpers for the Bib engine tests. These tests run from the repository
 * root with plain `node --test`; no framework and no build step.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

export const FIXTURE_DIR = join('tests', 'bib', 'fixtures');

/** @param {string} name */
export function fixture(name) {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

/**
 * Rebuild the input from blocks. The result must equal `source.text` for every
 * parsed document (without the BOM, which the document stores separately).
 *
 * @param {import('../../apps/web/bib/model.mjs').BibDocument} document
 */
export function reconstruct(document) {
  const parts = document.blocks.map(block => {
    if (block.kind === 'entry') {
      const entry = document.entries.find(item => item.id === block.entryId);
      return entry.raw;
    }
    if (block.kind === 'string') {
      return document.strings.find(item => item.id === block.stringId).raw;
    }
    if (block.kind === 'preamble') {
      return document.preambles.find(item => item.id === block.preambleId).raw;
    }
    return document.source.text.slice(block.start, block.end);
  });
  return parts.join('');
}

/** @param {Array<{code:string}>} diagnostics */
export function codesOf(diagnostics) {
  return diagnostics.map(diagnostic => diagnostic.code);
}

/** @param {Array<{code:string, severity:string}>} diagnostics @param {string} code */
export function hasCode(diagnostics, code) {
  return diagnostics.some(diagnostic => diagnostic.code === code);
}

/** @param {Array<{code:string, severity:string}>} diagnostics @param {string} code */
export function severityOf(diagnostics, code) {
  return diagnostics.find(diagnostic => diagnostic.code === code)?.severity ?? null;
}

/** @param {{ok:boolean, error?:any}} result */
export function expectOk(result) {
  if (!result.ok) {
    throw new Error(`Expected success, got ${JSON.stringify(result.error)}`);
  }
  return result;
}

/** @param {{ok:boolean, error?:any}} result @param {string} code */
export function expectError(result, code) {
  assert.equal(result.ok, false, 'operation should fail');
  assert.equal(result.error?.code, code);
  return result;
}

/** @param {string} text */
export function lines(text) {
  return text.split(/\r\n|\n|\r/);
}

/** @param {import('../../apps/web/bib/model.mjs').BibDocument} document @param {string} key */
export function entryByKey(document, key) {
  return document.entries.find(entry => entry.key === key) ?? null;
}
