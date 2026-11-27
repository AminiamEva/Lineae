import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStep, compile } from '../bib/compile/lib/tex-runner.mjs';

function workspace(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'lineae tex '));
  t.after(() => rmSync(cwd, {recursive:true, force:true}));
  return { cwd, logPath:join(cwd, 'compile.log') };
}

test('nonzero exit, literal arguments and both streams survive', async t => {
  const work = workspace(t);
  const literal = 'a b; $(echo unexpected)';
  const result = await runStep(process.execPath, ['-e',
    'console.log(process.argv[1]); console.error("failed input"); process.exit(7)', literal], work);
  assert.equal(result.status, 7);
  assert.equal(readFileSync(result.stdout, 'utf8').trim(), literal);
  assert.match(readFileSync(result.stderr, 'utf8'), /failed input/);
  assert.match(readFileSync(work.logPath, 'utf8'), /"status":7/);
});
test('timeout is distinct from ordinary nonzero exit', async t => {
  const work = workspace(t);
  const result = await runStep(process.execPath, ['-e','setInterval(()=>{},10000)'], {...work, timeout:200});
  assert.equal(result.status, 124);
  assert.equal(result.timedOut, true);
});
test('reject unsupported engine and driver before invoking TeX', async t => {
  const work = workspace(t);
  for (const options of [{engine:'x -shell-escape'}, {driver:'sh'}]) {
    await assert.rejects(compile({...work, ...options}), /unsupported/i);
  }
});

test('a stale PDF cannot satisfy a new compilation', async t => {
  const work = workspace(t);
  writeFileSync(join(work.cwd, 'main.pdf'), '%PDF-1.7');
  await assert.rejects(compile(work), /fresh compilation directory/);
});
