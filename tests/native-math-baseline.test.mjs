import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';

const baseline=JSON.parse(readFileSync('docs/native-tex/baseline.json','utf8'));
test('native math baseline retains both JS implementations and gates unverified native geometry',()=>{
  assert.equal(baseline.engines.xelatexJs.policy,'retain');
  assert.equal(baseline.engines.luaJs.policy,'retain');
  assert.equal(baseline.engines.luaJs.sourceReference,null);
  assert.deepEqual(baseline.engines.rtex.geometryEvidence.cases,['lf','unicode-crlf']);
  for(const entry of baseline.engines.xelatexJs.entryPoints) assert.ok(readFileSync(entry).length,entry);
  assert.deepEqual(baseline.platforms,['x86_64-pc-windows-msvc','aarch64-apple-darwin']);
  assert.equal(baseline.buildPolicy,'remote_only');
});
test('the native math fixture changes only one denominator letter',()=>{
  const {fixture}=baseline;
  const before=readFileSync(fixture.before,'utf8'),after=readFileSync(fixture.after,'utf8');
  const start=before.indexOf(fixture.formulaBefore);
  assert.ok(start>=0);
  assert.equal(before.indexOf(fixture.formulaBefore,start+1),-1);
  const {from16,to16,insert}=fixture.patch;
  assert.equal(fixture.formulaBefore.slice(0,from16)+insert+fixture.formulaBefore.slice(to16),fixture.formulaAfter);
  assert.equal(before.slice(0,start+from16)+insert+before.slice(start+to16),after);
  assert.equal(after.slice(0,start+from16)+after.slice(start+from16+insert.length),before);
  assert.equal(fixture.rights,'redistributable');
});
test('desktop preview is opt-in, waits for both platforms and does not require Linux',()=>{
  const workflow=parse(readFileSync('.github/workflows/macos-release.yml','utf8'));
  assert.equal(workflow.on.workflow_dispatch.inputs.publish_preview.default,false);
  assert.deepEqual(workflow.jobs.preview.needs,['web','build','windows','native']);
  assert.match(workflow.jobs.preview.if,/workflow_dispatch.*inputs.publish_preview/);
  assert.match(workflow.jobs.linux.if,/!inputs.publish_preview/);
  assert.deepEqual(workflow.jobs.release.needs,['web','build','windows','linux']);
  assert.match(workflow.jobs.release.if,/github.event_name == 'push'/);
});
