import test from 'node:test';
import assert from 'node:assert/strict';
import {macosReleasePlan,releasePlan} from '../apps/desktop/scripts/validate-release.mjs';
const versions={desktop:'0.2.0',tauri:'0.2.0',cargo:'0.2.0',lock:'0.2.0'};
test('an unsigned formal release requires a deliberate request',()=>{
 assert.throws(()=>releasePlan({tag:'v0.2.0',versions}),/certificate/);
 assert.deepEqual(releasePlan({tag:'v0.2.0',versions,allowUnsigned:true}),{version:'0.2.0',requested:true,tag:'v0.2.0',prerelease:false,unsigned:true});
 assert.equal(releasePlan({tag:'v0.2.0',versions,hasCertificate:true}).unsigned,false);
});
test('release metadata cannot mislabel or bypass checks',()=>{
 assert.throws(()=>releasePlan({tag:'v0.2.0',versions:{...versions,cargo:'0.1.1'},allowUnsigned:true}),/manifests/);
 assert.throws(()=>releasePlan({tag:'v0.3.0',versions,allowUnsigned:true}),/application version/);
 assert.throws(()=>releasePlan({tag:'v0.2.0;bad',versions,allowUnsigned:true}),/Invalid release tag/);
 assert.throws(()=>releasePlan({tag:'v0.2.0',versions,allowUnsigned:true,checksOnly:true}),/checks-only/);
 assert.equal(releasePlan({versions,checksOnly:true}).requested,false);
});
test('preview releases retain their existing unsigned policy',()=>{
 const preview=Object.fromEntries(Object.keys(versions).map(key=>[key,'0.2.0-preview.1']));
 assert.equal(releasePlan({tag:'v0.2.0-preview.1',versions:preview}).prerelease,true);
});

test('macOS only publishes matching pushed tags and never publishes a manual build',()=>{
 const plan=(event,ref)=>macosReleasePlan({event,ref,versions});
 assert.equal(plan('workflow_dispatch','refs/tags/v0.2.0').requested,false);
 assert.equal(plan('push','refs/heads/main').requested,false);
 assert.deepEqual(plan('push','refs/tags/v0.2.0'),{version:'0.2.0',requested:true,tag:'v0.2.0',prerelease:false});
 assert.throws(()=>plan('push','refs/tags/v0.2.1'),/v0.2.1 does not match application version 0.2.0/);
 assert.throws(()=>plan('push','refs/tags/vbogus'),/Invalid release tag/);
});
