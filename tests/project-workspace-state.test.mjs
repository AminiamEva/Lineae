import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectWorkspaceState} from '../apps/web/src/project/workspace-state.mjs';
test('opening always selects Document and suspends the standalone state once',()=>{
 const state=new ProjectWorkspaceState(),snapshot={mode:'split',history:[1,2]};state.begin(()=>snapshot);assert.equal(state.modeFor('tex'),'body');state.select('split');state.begin(()=>{throw Error('must not replace suspended standalone')});assert.equal(state.mode,'body');assert.equal(state.end(),snapshot);assert.equal(state.suspended,null);
});
test('project files share a mode while BibTeX cannot change that preference',()=>{
 const state=new ProjectWorkspaceState();state.select('split');assert.equal(state.modeFor('tex'),'split');assert.equal(state.modeFor('bib'),'source');state.select('source','bib');assert.equal(state.modeFor('tex'),'split');state.select('body');assert.equal(state.modeFor('tex'),'body');
});
