import assert from 'node:assert/strict';
import test from 'node:test';
import { createCitationLibrary } from '../../apps/web/src/editor/citation-library.js';
import {
  clearProjectAssets,
  projectAssets,
  readBibliographyMetadata,
  writeBibliographyMetadata,
} from '../../apps/web/src/editor/project-assets.js';
import { buildProjectZip, projectDependencies } from '../../apps/web/src/editor/project-zip.mjs';

function bib(name, source) {
  return new File([source], name, { type: 'text/plain' });
}

test('bibliography state survives export, close, reopen, and re-export', async () => {
  clearProjectAssets();
  const first = createCitationLibrary();
  await first.addFile(bib('refs.bib', '@article{same, title={First}}'));
  await first.addFile(bib('other.bib', '@article{same, title={Second}}'));
  first.setSourcePath('other.bib', 'refs/other.bib');
  first.choose('same', 'refs/other.bib', 0);

  const tex = writeBibliographyMetadata(
    '\\documentclass{article}\n\\addbibresource{refs/other.bib}\n\\begin{document}\n\\cite{same}\n\\end{document}\n',
    first.exportState({ paths: ['refs/other.bib'] }),
  );
  const closed = readBibliographyMetadata(tex);
  assert.equal(closed.sources.length, 2);

  clearProjectAssets();
  const reopened = createCitationLibrary();
  reopened.restoreState(closed);
  assert.deepEqual(reopened.sources.map(source => source.file), ['refs.bib', 'refs/other.bib']);
  assert.equal(reopened.entries[0].title, 'Second');
  assert.equal(reopened.diagnostics(tex).citations.missing.length, 0);

  const assets = new Map(projectAssets());
  const dependencies = projectDependencies(tex);
  const zip = await buildProjectZip([
    ['main.tex', tex],
    ...dependencies.map(path => [path, assets.get(path)]),
  ]);
  const archiveText = new TextDecoder().decode(await zip.arrayBuffer());
  assert.match(archiveText, /refs\/other\.bib/);
  assert.doesNotMatch(archiveText, /First/);
});

test('duplicate imports and same-name paths retain a deterministic chosen source', async () => {
  const library = createCitationLibrary();
  await library.addFile(bib('refs.bib', '@article{same, title={Old}}'));
  await library.addFile(bib('refs.bib', '@article{same, title={New}}'));
  assert.equal(library.sources.length, 1);
  assert.equal(library.entries[0].title, 'New');
  await library.addFile(bib('nested.bib', '@article{same, title={Nested}}'));
  library.setSourcePath('nested.bib', 'refs/refs.bib');
  assert.equal(library.conflicts.get('same').length, 2);
  assert.equal(library.choose('same', 'refs/refs.bib', 0), true);
  assert.equal(library.entries[0].title, 'Nested');
});
