import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const guide = new URL('../docs/PARSER.md', import.meta.url);
const architecture = new URL('../docs/EDITOR_ARCHITECTURE.md', import.meta.url);
const read = url => readFileSync(url, 'utf8');
const links = text => [...text.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)].map(match => match[1]);

test('parser guide is reachable from the existing architecture document', () => {
  assert.ok(existsSync(guide), 'docs/PARSER.md must exist');
  assert.ok(links(read(architecture)).some(link => new URL(link, architecture).href === guide.href),
    'EDITOR_ARCHITECTURE.md must link to the parser guide');
});

test('parser guide local evidence links resolve, including Markdown anchors', () => {
  const references = links(read(guide));
  assert.ok(references.length > 0, 'guide needs traceable source/test evidence');
  for (const reference of references) {
    assert.ok(!/^[a-z]+:/i.test(reference), 'evidence should be repository-local: ' + reference);
    const url = new URL(reference, guide);
    assert.ok(existsSync(fileURLToPath(url)), 'missing evidence: ' + reference);
    if (url.hash) {
      const anchor = decodeURIComponent(url.hash.slice(1));
      assert.ok(read(url).includes('<a id="' + anchor + '"></a>'), 'missing anchor: ' + reference);
    }
  }
});

test('each syntax matrix row has a support status, boundary, source and test evidence', () => {
  const text = read(guide);
  const section = text.split('<!-- support-matrix:start -->')[1]?.split('<!-- support-matrix:end -->')[0];
  assert.ok(section, 'explicit syntax support matrix required');
  const rows = section.split('\n').filter(line => line.startsWith('|')).slice(2);
  assert.ok(rows.length > 0, 'empty support matrix');
  const allowed = new Set(['完整支持', '部分支持', 'Raw 保留', '暂不支持']);
  const seen = new Set();
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
    assert.equal(cells.length, 5, 'expected syntax/status/boundary/source/tests: ' + row);
    const [syntax, status, boundary, source, tests] = cells;
    assert.ok(syntax && boundary, 'syntax and boundary are required');
    assert.ok(allowed.has(status), 'unknown status: ' + status);
    assert.ok(!seen.has(syntax), 'duplicate syntax: ' + syntax);
    seen.add(syntax);
    assert.ok(links(source).some(link => link.startsWith('../apps/')), 'missing source evidence: ' + syntax);
    assert.ok(links(tests).some(link => link.startsWith('../tests/') && link.endsWith('.test.mjs')),
      'missing executable test evidence: ' + syntax);
  }
});
