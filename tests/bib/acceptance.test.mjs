import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCEPTANCE_CASES } from './acceptance/manifest.mjs';

test('remote bibliography acceptance fixtures are complete and independent', () => {
  for (const testCase of ACCEPTANCE_CASES) {
    assert.equal(existsSync(join(testCase.directory, 'main.tex')), true, testCase.name);
    assert.equal(existsSync(join(testCase.directory, 'refs.bib')), testCase.name !== 'missing-resource', testCase.name);
    const tex = readFileSync(join(testCase.directory, 'main.tex'), 'utf8');
    assert.match(tex, /\\(?:bibliography|addbibresource)/, testCase.name);
  }
});
