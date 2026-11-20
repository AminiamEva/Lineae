import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, unlink, rename, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {Project, DirectoryHandleAdapter} from '../apps/web/src/project/project.mjs';
import {projectPath} from '../apps/web/src/project/paths.mjs';
import {RecoveryStore} from '../apps/web/src/project/recovery.mjs';

const encode = value => new TextEncoder().encode(value);
function gate() { let release; return {promise:new Promise(resolve => {release=resolve;}), release:() => release()}; }
async function fixture() {
  await mkdir('test-results/file-tree',{recursive:true});
  const root = await mkdtemp(resolve('test-results/file-tree/模型 中文 '));
  await mkdir(join(root,'第一章'));
  await writeFile(join(root,'main.tex'),'\\documentclass{article}\nMain');
  await writeFile(join(root,'第一章/研究方法.tex'),'Method\r\n');
  const adapter = {root,
    async list() {const entries=[];async function visit(path=''){for(const item of await readdir(join(root,path),{withFileTypes:true})){const name=path?path+'/'+item.name:item.name;entries.push({path:name,kind:item.isDirectory()?'directory':'file'});if(item.isDirectory())await visit(name);}}await visit();return entries;},
    read:async path=>new Uint8Array(await readFile(join(root,path))),
    write:async(path,bytes)=>writeFile(join(root,path),bytes),
    create:async(path,bytes)=>writeFile(join(root,path),bytes,{flag:'wx'}),
    mkdir:async path=>mkdir(join(root,path)),
    remove:async path=>unlink(join(root,path)),
    move:async(from,to)=>rename(join(root,from),join(root,to)),
  };
  return {root,adapter,project:await new Project(adapter,undefined,null).open()};
}

test('reload cannot replace edits made while the disk read is pending', async()=>{
  const {project,adapter,root}=await fixture(), file=project.files.get('第一章/研究方法.tex');
  await writeFile(join(root,file.path),'External');
  const started=gate(), finish=gate(), read=adapter.read;
  adapter.read=async path=>{const bytes=await read(path);started.release();await finish.promise;return bytes;};
  const pending=project.reload(file.id);await started.promise;
  project.edit(file.id,'Typed while reloading');finish.release();
  await assert.rejects(pending,/changed while reloading/);
  assert.equal(file.draft,'Typed while reloading');assert.equal(file.saved,'Method\r\n');
});

test('rename updates editable file kind and dependency metadata without losing drafts or ID',async()=>{
  const {project}=await fixture(), file=project.files.get('第一章/研究方法.tex');
  project.edit(file.id,'\\input{main}');file.session={selection:4};
  await project.move(file.path,'第一章/references.bib');
  assert.equal(project.file(file.id),file);assert.equal(file.kind,'bib');assert.equal(file.draft,'\\input{main}');
  assert.equal(project.scans.has(file.id),false);assert.equal(file.session.selection,4);
  await assert.rejects(project.move(file.path,'第一章/image.png'),/editable and resource/);
  assert.equal(file.path,'第一章/references.bib');
});

test('refresh reconciles external additions and removals while retaining missing dirty sessions',async()=>{
  const {project,root}=await fixture(), file=project.files.get('第一章/研究方法.tex');
  const main=project.file(project.mainFileId);main.session={selection:2};file.session={selection:3};
  project.edit(file.id,'Unsaved draft');project.activate(file.id);
  await rename(join(root,file.path),join(root,'第一章/外部 重命名.tex'));
  await mkdir(join(root,'empty-folder'));await writeFile(join(root,'new.tex'),'New');
  const result=await project.refresh();
  assert.deepEqual(result.missing,[file.id]);assert.equal(file.missing,true);assert.equal(file.draft,'Unsaved draft');
  assert.equal(project.activeFileId,file.id);assert.equal(file.session.selection,3);
  assert.equal(project.file(main.id),main);assert.equal(main.session.selection,2);
  assert.equal(project.directories.includes('empty-folder'),true);
  assert.equal(project.files.get('第一章/外部 重命名.tex').draft,'Method\r\n');
  assert.equal(project.files.get('new.tex').draft,'New');
  await assert.rejects(project.save(file.id),/missing|ENOENT/);
  await unlink(join(root,'new.tex'));await project.refresh();assert.equal(project.files.has('new.tex'),false);
  await writeFile(join(root,file.path),'Returned external');await project.refresh();
  assert.equal(file.missing,false);assert.equal(file.draft,'Unsaved draft');assert.equal(file.saved,'Method\r\n');
  await assert.rejects(project.save(file.id),/changed on disk/);
});

test('refresh updates clean contents but never overwrites concurrent edits or their session',async()=>{
  const {project,adapter,root}=await fixture(), file=project.files.get('第一章/研究方法.tex');
  await writeFile(join(root,file.path),'External');
  let result=await project.refresh();assert.deepEqual(result.changed,[file.id]);assert.equal(file.draft,'External');
  file.session={selection:1};await writeFile(join(root,file.path),'New external');
  const started=gate(), finish=gate(), read=adapter.read;
  adapter.read=async path=>{const bytes=await read(path);if(path===file.path){started.release();await finish.promise;}return bytes;};
  const pending=project.refresh();await started.promise;project.edit(file.id,'Concurrent draft');finish.release();
  result=await pending;assert.deepEqual(result.changed,[]);assert.equal(file.draft,'Concurrent draft');assert.equal(file.saved,'External');
  assert.equal(file.session.selection,1);
});

test('refresh retains a deleted clean active file and main identity until explicitly left',async()=>{
  const {project,root}=await fixture(), file=project.file(project.mainFileId);
  await unlink(join(root,file.path));const result=await project.refresh();
  assert.deepEqual(result.missing,[file.id]);assert.equal(project.activeFileId,file.id);assert.equal(project.mainFileId,file.id);
  assert.equal(file.draft,'\\documentclass{article}\nMain');assert.equal(file.missing,true);
  project.edit(file.id,'Keep editing the missing file');await assert.rejects(project.save(file.id),/missing on disk/);
});

test('queued save and move serialize real disk operations and forward expected bytes',async()=>{
  const {project,adapter,root}=await fixture(), file=project.files.get('第一章/研究方法.tex');
  project.edit(file.id,'Saved then moved');const started=gate(),finish=gate(),write=adapter.write,move=adapter.move;
  adapter.write=async(...args)=>{started.release();await finish.promise;return write(...args);};
  let expected;adapter.move=async(from,to,bytes)=>{expected=bytes;return move(from,to);};
  const saving=project.save(file.id);await started.promise;
  const moving=project.move(file.path,'第一章/moved.tex');finish.release();await Promise.all([saving,moving]);
  assert.equal(await readFile(join(root,file.path),'utf8'),'Saved then moved');assert.deepEqual(expected,encode('Saved then moved'));
  let removedExpected;const remove=adapter.remove;adapter.remove=async(path,bytes)=>{removedExpected=bytes;await remove(path);};
  await project.remove(file.id);assert.deepEqual(removedExpected,encode('Saved then moved'));
});

test('browser project listing ignores native recovery metadata with any casing',async()=>{
  function directory(entries){return {async *entries(){yield* entries;}};}
  const adapter=new DirectoryHandleAdapter(directory([
    ['main.tex',{kind:'file'}],['.lineae-state-one.json',{kind:'file'}],['.LINEAE-archive-two.json',{kind:'file'}],
    ['nested',{kind:'directory',...directory([['.Lineae-save-temp',{kind:'file'}],['child.tex',{kind:'file'}]])}],
  ]));
  assert.deepEqual(await adapter.list(),[{path:'main.tex',kind:'file'},{path:'nested',kind:'directory'},{path:'nested/child.tex',kind:'file'}]);
  assert.throws(()=>projectPath('.LINEAE-state-one.json'),/Reserved/);
});

test('browser create refuses case aliases before opening an existing Windows file for writing',async()=>{
  let opened=0;
  const adapter=new DirectoryHandleAdapter({async *entries(){yield ['main.tex',{kind:'file'}];},async getFileHandle(){opened++;throw new Error('Existing Windows file opened');}});
  await assert.rejects(adapter.create('MAIN.tex',encode('overwrite')),/already exists/);
  assert.equal(opened,0);
});

test('a recovery storage failure after deletion cannot leave a dangling active file',async()=>{
  const {project,root}=await fixture(),file=project.files.get('第一章/研究方法.tex');
  project.activate(file.id);
  project.recovery=new RecoveryStore({removeItem(){throw new Error('storage unavailable');}},'test');
  await project.remove(file.id);
  await assert.rejects(readFile(join(root,file.path)),{code:'ENOENT'});
  assert.equal(project.activeFileId,project.mainFileId);assert.equal(project.files.has(file.path),false);
  assert.match(project.persistenceError,/storage unavailable/);
});

test('typing during deletion preflight aborts deletion before touching the real file',async()=>{
  const {project,adapter,root}=await fixture(),file=project.files.get('第一章/研究方法.tex');
  const started=gate(),finish=gate(),read=adapter.read;
  adapter.read=async path=>{const bytes=await read(path);started.release();await finish.promise;return bytes;};
  const pending=project.remove(file.id);await started.promise;project.edit(file.id,'New typing');finish.release();
  await assert.rejects(pending,/changed while deleting/);assert.equal(await readFile(join(root,file.path),'utf8'),'Method\r\n');
  assert.equal(file.draft,'New typing');assert.equal(project.file(file.id),file);
});

test('typing during committed deletion remains in a missing draft session',async()=>{
  const {project,adapter,root}=await fixture(),file=project.files.get('第一章/研究方法.tex');project.activate(file.id);
  const started=gate(),finish=gate(),remove=adapter.remove;
  adapter.remove=async(...args)=>{await remove(...args);started.release();await finish.promise;};
  const pending=project.remove(file.id);await started.promise;project.edit(file.id,'Do not lose this new text');finish.release();
  assert.deepEqual(await pending,{retained:true});assert.equal(project.activeFileId,file.id);assert.equal(file.missing,true);
  assert.equal(file.draft,'Do not lose this new text');assert.equal(file.dirty,true);
  await assert.rejects(readFile(join(root,file.path)),{code:'ENOENT'});
});

test('confirmed recovery retains missing-path drafts without recreating disk files',async()=>{
  const {project,root}=await fixture();
  const path='第一章/deleted.tex';
  assert.equal(project.restoreDrafts([{path,saved:'Before deletion\r\n',draft:'Recover this draft\r\n'}]),1);
  const file=project.files.get(path);assert.equal(file.missing,true);assert.equal(file.dirty,true);
  assert.equal(file.draft,'Recover this draft\r\n');assert.equal(file.saved,'Before deletion\r\n');
  await assert.rejects(readFile(join(root,path)),{code:'ENOENT'});
  await assert.rejects(project.save(file.id),/missing on disk/);
});

test('missing clean files cannot claim saved and retained missing dependency targets remain missing',async()=>{
  const {project,root}=await fixture(), main=project.file(project.mainFileId), child=project.files.get('第一章/研究方法.tex');
  project.edit(main.id,'\\input{第一章/研究方法}');project.activate(child.id);
  await unlink(join(root,child.path));await project.refresh();
  assert.equal(child.dirty,false);assert.equal(child.missing,true);
  await assert.rejects(project.save(child.id),/missing on disk/);
  assert.equal(project.dependencies[0].status,'missing');
});

test('refresh does not advance a visible file baseline while awaiting another file',async()=>{
  const {project,adapter,root}=await fixture(), main=project.file(project.mainFileId), oldText=main.draft;
  await writeFile(join(root,main.path),'External main revision');
  const started=gate(),finish=gate(),read=adapter.read,list=adapter.list;
  adapter.list=async()=>{const entries=await list();return entries.sort((a,b)=>Number(b.path===main.path)-Number(a.path===main.path));};
  adapter.read=async path=>{const bytes=await read(path);if(path!==main.path){started.release();await finish.promise;}return bytes;};
  const pending=project.refresh();await started.promise;
  // The UI cannot display the refreshed main until refresh() resolves.
  project.edit(main.id,oldText+'\nTyping in the still visible editor');finish.release();
  const result=await pending;assert.equal(result.changed.includes(main.id),false);
  assert.equal(main.saved,oldText);assert.equal(main.draft,oldText+'\nTyping in the still visible editor');
  await assert.rejects(project.save(main.id),/changed on disk/);
  assert.equal(await readFile(join(root,main.path),'utf8'),'External main revision');
});

test('directory moves forward a complete saved-byte manifest including resources and empty directories',async()=>{
  const {project,adapter,root}=await fixture();
  await mkdir(join(root,'第一章/empty'));await writeFile(join(root,'第一章/image.png'),new Uint8Array([0,255,13,10]));await project.refresh();
  const file=project.files.get('第一章/研究方法.tex');project.edit(file.id,'Unsaved text must not enter the disk baseline');
  const move=adapter.move;let manifest;
  adapter.move=async(from,to,bytes,tree)=>{assert.equal(bytes,undefined);manifest=tree;return move(from,to);};
  await project.move('第一章','移动 目录');
  assert.deepEqual(manifest,[
    {path:'第一章',kind:'directory'},
    {path:'第一章/empty',kind:'directory'},
    {path:'第一章/image.png',kind:'file',bytes:[0,255,13,10]},
    {path:'第一章/研究方法.tex',kind:'file',bytes:Array.from(encode('Method\r\n'))},
  ]);
  assert.equal(project.file(file.id),file);assert.equal(file.draft,'Unsaved text must not enter the disk baseline');
});

// This adapter is a real-disk contract test for the native manifest boundary;
// Rust has separate same-process/cross-process tests for its actual guard.
for(const mutation of ['modify','add','delete'])test(`late directory ${mutation} is refused without changing model paths or drafts`,async()=>{
  const {project,adapter,root}=await fixture(),file=project.files.get('第一章/研究方法.tex');
  project.edit(file.id,'Keep draft');project.activate(file.id);file.session={selection:5};
  const started=gate(),finish=gate(),move=adapter.move;
  adapter.move=async(from,to,bytes,tree)=>{
    started.release();await finish.promise;
    if(tree){
      const actual=(await adapter.list()).filter(entry=>entry.path===from || entry.path.startsWith(from+'/')).sort((a,b)=>a.path.localeCompare(b.path));
      const expected=tree.map(({path,kind})=>({path,kind})).sort((a,b)=>a.path.localeCompare(b.path));
      if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Directory changed on disk');
      for(const item of tree)if(item.kind==='file' && !Buffer.from(await adapter.read(item.path)).equals(Buffer.from(item.bytes)))throw new Error('Directory changed on disk');
    }
    return move(from,to);
  };
  const pending=project.move('第一章','moved');await started.promise;
  if(mutation==='modify')await writeFile(join(root,file.path),'Changed outside');
  if(mutation==='add')await writeFile(join(root,'第一章/arrival.tex'),'New outside');
  if(mutation==='delete')await unlink(join(root,file.path));
  finish.release();await assert.rejects(pending,/changed on disk/);
  assert.equal(file.path,'第一章/研究方法.tex');assert.equal(file.draft,'Keep draft');assert.equal(file.session.selection,5);
  assert.equal(project.activeFileId,file.id);assert.equal(project.pathChanges.length,0);
  assert.equal((await stat(join(root,'第一章'))).isDirectory(),true);await assert.rejects(stat(join(root,'moved')),{code:'ENOENT'});
});

test('committed directory reconciliation discovers arrivals without advancing displayed baselines',async()=>{
  const {project,adapter,root}=await fixture(),file=project.files.get('第一章/研究方法.tex'),baseline=file.saved;
  project.activate(file.id);file.session={selection:2};
  const move=adapter.move,read=adapter.read,started=gate(),finish=gate();
  adapter.move=async(from,to)=>{
    await move(from,to);await writeFile(join(root,'moved/研究方法.tex'),'External revision after rename');
    await writeFile(join(root,'moved/zz-arrival.tex'),'Arrived after rename');
    return {reconciliationRequired:true,warning:'Directory changed during move'};
  };
  adapter.read=async path=>{const bytes=await read(path);if(path==='moved/zz-arrival.tex'){started.release();await finish.promise;}return bytes;};
  const pending=project.move('第一章','moved');
  // Older implementations did not reconcile at all; fail promptly on that path.
  await Promise.race([started.promise,pending.then(()=>{throw new Error('No post-move reconciliation');})]);
  project.edit(file.id,baseline+' typing during reconciliation');finish.release();await pending;
  assert.equal(file.path,'moved/研究方法.tex');assert.equal(project.file(file.id),file);assert.equal(file.session.selection,2);
  assert.equal(file.saved,baseline);assert.deepEqual(file.bytes,encode(baseline));assert.equal(file.externalChanged,true);
  assert.equal(file.draft,baseline+' typing during reconciliation');assert.equal(project.files.get('moved/zz-arrival.tex').draft,'Arrived after rename');
  assert.equal(project.pathChanges.at(-1).reconciliationRequired,true);assert.match(project.pathChanges.at(-1).warning,/changed|修改/i);
  await assert.rejects(project.save(file.id),/changed on disk/);
  assert.equal(await readFile(join(root,file.path),'utf8'),'External revision after rename');
});

test('committed directory move retains paths and reports reconciliation failure without false rollback',async()=>{
  const {project,adapter,root}=await fixture(),file=project.files.get('第一章/研究方法.tex'),move=adapter.move;
  project.edit(file.id,'Keep committed move draft');
  adapter.move=async(from,to)=>{await move(from,to);adapter.list=async()=>{throw new Error('Access denied during rescan');};return {reconciliationRequired:true,warning:'Post-move read failed'};};
  const changes=await project.move('第一章','moved');
  assert.equal(changes[0].to,'moved/研究方法.tex');assert.equal(file.path,'moved/研究方法.tex');assert.equal(file.draft,'Keep committed move draft');
  assert.match(project.pathChanges.at(-1).warning,/Access denied during rescan/);
  assert.equal(project.pathChanges.at(-1).reconciliationRequired,true);
  assert.equal(await readFile(join(root,file.path),'utf8'),'Method\r\n');
  await assert.rejects(stat(join(root,'第一章')),{code:'ENOENT'});
});

test('directory post-move deletion retains the dirty active session at its committed path',async()=>{
  const {project,adapter,root}=await fixture(),file=project.files.get('第一章/研究方法.tex'),move=adapter.move;
  project.edit(file.id,'Draft survives external deletion');project.activate(file.id);file.session={selection:7};
  adapter.move=async(from,to)=>{await move(from,to);await unlink(join(root,'moved/研究方法.tex'));return {reconciliationRequired:true,warning:'Child disappeared during move'};};
  await project.move('第一章','moved');
  assert.equal(project.file(file.id),file);assert.equal(file.path,'moved/研究方法.tex');assert.equal(file.missing,true);
  assert.equal(file.draft,'Draft survives external deletion');assert.equal(project.activeFileId,file.id);assert.equal(file.session.selection,7);
  assert.equal(project.pathChanges.at(-1).reconciliationRequired,true);await assert.rejects(project.save(file.id),/missing on disk/);
  await assert.rejects(stat(join(root,file.path)),{code:'ENOENT'});
});
