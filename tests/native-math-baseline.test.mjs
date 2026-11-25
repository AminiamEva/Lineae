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
  assert.equal(baseline.engines.rtex.nativeEditing.status,'vertical_slice');
  for(const entry of baseline.engines.rtex.nativeEditing.entryPoints) assert.ok(readFileSync(entry).length,entry);
  assert.match(baseline.engines.rtex.nativeEditing.ipc,/lineae-native-tex/);
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

test('the migration record identifies reproducible evidence and keeps device gates explicit',()=>{
  const migration=JSON.parse(readFileSync('docs/native-tex/parity.json','utf8'));
  const features=migration.features;
  assert.equal(new Set(features.map(feature=>feature.id)).size,features.length);
  for(const feature of features){
    for(const path of [...feature.entryPoints,...feature.tests])assert.ok(readFileSync(path).length,path);
    assert.ok(feature.evidence.length,feature.id);
    for(const evidence of feature.evidence)assert.match(evidence,/\/actions\/runs\/\d+$/);
  }
  const {pages,engineBaseline}=migration.latency;
  assert.match(engineBaseline.revision,/^[0-9a-f]{40}$/);
  for(const platform of ['macOS arm64','Windows x64','Ubuntu x64']){
    const samples=engineBaseline.samples.filter(sample=>sample.platform===platform);
    assert.deepEqual(samples.map(sample=>sample.pages),pages);
    for(const sample of samples){
      assert.equal(sample.sampleCount,1000);
      assert.ok(sample.p50Ms>0&&sample.p50Ms<=sample.p95Ms&&sample.p95Ms<=sample.p99Ms);
    }
  }
  assert.ok(migration.acceptance.pending.some(item=>item.includes('physical device')));
});
