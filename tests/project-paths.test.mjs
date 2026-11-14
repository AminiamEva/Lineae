import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectPath, directoryTree, fileKind} from '../apps/web/src/project/paths.mjs';

test('project paths normalize segments without escaping the root', () => {
  assert.equal(projectPath('../figures/a.png', 'chapters'), 'figures/a.png');
  assert.equal(projectPath('./中文//a.tex'), '中文/a.tex');
  for (const path of ['../a.tex', '/a.tex', 'C:/a.tex', 'a\\b.tex', 'a\0.tex', '.']) {
    assert.throws(() => projectPath(path));
  }
});
test('tree preserves file identity, dirty state, empty directories and resource types', () => {
  const tree = directoryTree([
    {id:'one', path:'main.tex', dirty:true}, {id:'two', path:'chapters/intro.tex'},
    {id:'three', path:'refs.bib'},
  ], ['empty']);
  assert.deepEqual(tree.children.map(node => node.name), ['chapters', 'empty', 'main.tex', 'refs.bib']);
  assert.equal(tree.children[2].fileId, 'one');
  assert.equal(tree.children[2].dirty, true);
  assert.equal(tree.children[0].children[0].fileId, 'two');
  assert.equal(fileKind('figure.PDF'), 'image');
});
