import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Project} from '../apps/web/src/project/project.mjs';

function fixture() {
  const encoder = new TextEncoder();
  const disk = new Map([['main.tex', encoder.encode('a\r\nb\nc\r\n')], ['part.tex', encoder.encode('child')]]);
  const adapter = {
    async list() { return [...disk.keys()].map(path => ({path, kind:'file'})); },
    async read(path) { return disk.get(path).slice(); },
    async write(path, bytes) { disk.set(path, bytes.slice()); },
  };
  return {disk, adapter};
}
test('file switches preserve unsaved drafts and exact mixed line endings', async () => {
  const {adapter,disk} = fixture();
  const project = await new Project(adapter).open();
  assert.equal(project.treeVisible, false);
  const main = project.file(project.mainFileId), child = project.files.get('part.tex');
  project.edit(main.id, main.draft + 'new');
  project.activate(child.id);
  project.edit(child.id, 'changed child');
  project.activate(main.id);
  assert.equal(main.draft, 'a\r\nb\nc\r\nnew');
  await project.save(main.id);
  assert.equal(new TextDecoder().decode(disk.get('main.tex')), main.draft);
  assert.equal(main.dirty, false);
  assert.equal(child.dirty, true);
});
test('external changes and write failures preserve drafts', async () => {
  const {adapter,disk} = fixture();
  const project = await new Project(adapter).open();
  const file = project.file(project.mainFileId);
  project.edit(file.id, 'draft');
  disk.set('main.tex', new TextEncoder().encode('external'));
  await assert.rejects(project.save(file.id), /changed on disk/);
  assert.equal(file.dirty, true);
  assert.equal(new TextDecoder().decode(disk.get('main.tex')), 'external');
  disk.set('main.tex', file.bytes);
  adapter.write = async () => { throw new Error('Permission denied'); };
  await assert.rejects(project.save(file.id), /Permission denied/);
  assert.equal(file.draft, 'draft');
  assert.equal(file.dirty, true);
});
