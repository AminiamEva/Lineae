import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Project} from '../apps/web/src/project/project.mjs';
test('main choice and identities survive reopen and move without saving drafts to disk',async()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const disk=new Map([['paper.tex','\\documentclass{article}'],['appendix.tex','Appendix']]);
 const encoder=new TextEncoder();const adapter={root:'C:/state-test',list:async()=>[...disk.keys()].map(path=>({path,kind:'file'})),read:async path=>encoder.encode(disk.get(path)),move:async(from,to)=>{disk.set(to,disk.get(from));disk.delete(from);}};
 const first=await new Project(adapter,undefined,storage).open();const appendix=first.files.get('appendix.tex');
 first.setMain(appendix.id);first.edit(appendix.id,'Draft');await first.move('appendix.tex','renamed.tex');
 const next=await new Project(adapter,undefined,storage).open();
 assert.equal(next.mainFileId,appendix.id);assert.equal(next.files.get('renamed.tex').id,appendix.id);
 assert.equal(next.file(next.mainFileId).saved,'Appendix');
 assert.equal(next.restoreDrafts(next.recovery.read()),1);assert.equal(next.file(next.mainFileId).draft,'Draft');
});
test('unreadable disk checkpoint is retained while project source can still open',async()=>{
 let writes=0;const encoder=new TextEncoder();
 const adapter={root:'C:/corrupt',list:async()=>[{path:'main.tex',kind:'file'}],read:async()=>encoder.encode('Text'),loadState:async()=>{throw new Error('corrupt JSON');},checkpoint:async()=>{writes++;}};
 const project=await new Project(adapter,undefined,null).open();await project.pendingCheckpoint;
 assert.equal(project.file(project.mainFileId).draft,'Text');assert.match(project.persistenceError,/retained/);assert.equal(writes,0);
});
