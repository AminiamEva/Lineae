import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, unlink, rename, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {Project, DirectoryHandleAdapter} from '../apps/web/src/project/project.mjs';

// File System Access-shaped handles backed by actual OS files. This exercises
// the production adapter against filesystem failures, not an in-memory map.
function directoryHandle(path) {
  return {kind:'directory',
    async *entries() {
      for (const entry of await readdir(path,{withFileTypes:true})) {
        yield [entry.name,entry.isDirectory()?directoryHandle(join(path,entry.name)):{kind:'file'}];
      }
    },
    async getDirectoryHandle(name,{create=false}={}) {
      const child = join(path,name); if(create) await mkdir(child); else await readdir(child);
      return directoryHandle(child);
    },
    async getFileHandle(name,{create=false}={}) {
      const file = join(path,name);
      if(create) await writeFile(file,'',{flag:'wx'}); else await readFile(file);
      return {async getFile() { const bytes=await readFile(file); return {arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}; },
        async createWritable() { let pending; return {async write(value){pending=value;},async close(){await writeFile(file,pending);},async abort(){}}; }};
    },
    async removeEntry(name,{recursive=false}={}) { if(recursive)await rm(join(path,name),{recursive:true});else await unlink(join(path,name)); },
  };
}
test('production adapter reads and writes a real directory and rejects external conflicts and missing files', async () => {
  await mkdir('test-results/phase1',{recursive:true});
  const root = await mkdtemp(resolve('test-results/phase1/disk-'));
  const original='\uFEFF中文\r\nline two\nlast\r';
  await writeFile(join(root,'main.tex'),original);
  const adapter=new DirectoryHandleAdapter(directoryHandle(root));
  adapter.move=async (from,to)=>{try{await readFile(join(root,to));throw new Error('Target exists');}catch(error){if(error.code!=='ENOENT')throw error;}await rename(join(root,from),join(root,to));};
  const project=await new Project(adapter).open();
  const main=project.file(project.mainFileId);
  assert.equal(main.draft, original);
  project.edit(main.id,original+'more'); await project.save(main.id);
  assert.equal(await readFile(join(root,'main.tex'),'utf8'),original+'more');
  await project.mkdir('sections');
  const child=await project.create('sections/child.tex','Child\r\n');
  assert.equal(await readFile(join(root,child.path),'utf8'),'Child\r\n');
  project.edit(main.id,original+'more\n\\input{sections/child}\n');
  project.edit(child.id,'Unsaved 中文\r\n'); project.activate(child.id);
  child.session={selection:3};
  await project.move('sections/child.tex','sections/renamed.tex');
  project.rewriteMovedReferences();
  assert.match(main.draft,/\\input\{sections\/renamed\}/);
  assert.equal(project.file(child.id),child); assert.equal(child.dirty,true);
  assert.equal(child.session.selection,3);
  await project.mkdir('destination');
  await project.move('sections','destination/章节 空格');
  project.rewriteMovedReferences();
  assert.match(main.draft,/\\input\{destination\/章节 空格\/renamed\}/);
  assert.equal(child.path,'destination/章节 空格/renamed.tex');
  await project.save(child.id);
  assert.equal(await readFile(join(root,child.path),'utf8'),'Unsaved 中文\r\n');
  await assert.rejects(project.move('destination','destination/inside'),/itself/);
  await assert.rejects(project.move(child.path,'main.tex'),/exists/);
  await assert.rejects(project.create('main.tex','overwrite'),/exists/);
  project.edit(main.id,'draft'); await writeFile(join(root,'main.tex'),'external');
  await assert.rejects(project.save(main.id),/changed on disk/);
  assert.equal(await readFile(join(root,'main.tex'),'utf8'),'external');
  await project.remove(child.id);
  await assert.rejects(readFile(join(root,'sections/child.tex')),/ENOENT/);
  await project.mkdir('trash');const trash=await project.create('trash/a.tex','trash');await project.mkdir('trash/empty');
  project.setMain(trash.id);await assert.rejects(project.removeDirectory('trash'),/main document/);project.setMain(main.id);
  await project.removeDirectory('trash');
  await assert.rejects(readdir(join(root,'trash')),/ENOENT/);
  assert.equal(project.directories.some(path=>path.startsWith('trash')),false);
  const missing=await project.create('missing.tex','test');
  await unlink(join(root,'missing.tex')); project.edit(missing.id,'draft');
  await assert.rejects(project.save(missing.id),/ENOENT/);
  assert.equal(missing.dirty,true);
  const reopened=await new Project(adapter).open();
  assert.equal(reopened.file(reopened.mainFileId).draft,'external');
  assert.equal(reopened.treeVisible,false);
});
