import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Project} from '../apps/web/src/project/project.mjs';
import {RecoveryStore} from '../apps/web/src/project/recovery.mjs';
test('restart restores exact drafts and keeps the old disk baseline for conflict detection',async()=>{
 const data=new Map();const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const encoder=new TextEncoder();let disk=encoder.encode('原文\r\n');
 const adapter={list:async()=>[{path:'main.tex',kind:'file'}],read:async()=>disk.slice(),write:async(path,bytes)=>{disk=bytes;}};
 const first=await new Project(adapter).open();first.recovery=new RecoveryStore(storage,'C:/中文 project');
 first.edit(first.mainFileId,'草稿\r\nLF\n');
 // Simulate a fresh application instance after a crash and external modification.
 disk=encoder.encode('external');
 const restarted=await new Project(adapter).open();restarted.recovery=new RecoveryStore(storage,'C:/中文 project');
 assert.equal(restarted.restoreDrafts(restarted.recovery.read()),1);
 assert.equal(restarted.file(restarted.mainFileId).draft,'草稿\r\nLF\n');
 await assert.rejects(restarted.save(restarted.mainFileId),/changed on disk/);
 assert.equal(new TextDecoder().decode(disk),'external');
 assert.equal(restarted.recovery.read().length,1);
});
test('checkpoint failures surface and a successful save clears recovered drafts',async()=>{
 const storage={getItem:()=>null,setItem:()=>{throw new Error('quota');},removeItem:()=>{}};
 const journal=new RecoveryStore(storage,'root');
 assert.throws(()=>journal.checkpoint([{dirty:true,path:'a',saved:'old',draft:'new'}]),/quota/);
 let cleared=false;storage.removeItem=()=>{cleared=true;};journal.checkpoint([]);assert.ok(cleared);
});
