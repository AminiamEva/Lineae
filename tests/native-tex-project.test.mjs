import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeAttachedSnapshot,nativeProjectSnapshot} from '../apps/web/src/typesetting/rtex/project-snapshot.mjs';
import {rasterContains,stagedRaster,stagedRasterPath} from '../apps/web/src/typesetting/rtex/raster-assets.mjs';
import {nativeFontFace} from '../apps/web/src/typesetting/rtex/font-collection.mjs';
import {projectMixedSnapshot,textEdit} from '../apps/web/src/editor/native-text/projection.mjs';

test('native raster commands can only resolve staged PNG and JPEG assets',()=>{
  const path='figures/plot.png';
  const staged=`C:\\Temp\\lineae-native-tex-12345678-${'a'.repeat(32)}-${'b'.repeat(16)}\\figures\\plot.png`;
  const bytes=[137,80,78,71,13,10,26,10];
  const snapshot={files:[{path,bytes},{path:'corrupt.jpg',bytes}]};
  assert.equal(stagedRasterPath(staged),path);
  assert.equal(stagedRaster(snapshot,staged)?.mime,'image/png');
  assert.deepEqual([...stagedRaster(snapshot,`./${path}`).data],bytes);
  for(const reported of ['../figures/plot.png',`C:/${path}`,`/${path}`,`https://example.com/${path}`,'corrupt.jpg']){
    assert.equal(stagedRaster(snapshot,reported),null);
  }
});

test('native image hits follow rotation and scaling from the painter',()=>{
  const image={transform:[0,2,-3,0,50,30],box:[4,5,10,8]};
  assert.equal(rasterContains(image,26,44),true);
  assert.equal(rasterContains(image,36,44),false);
  assert.equal(rasterContains({...image,transform:[0,0,0,0,0,0]},26,44),false);
});

test('native font extraction follows LuaTeX face numbers and rejects malformed offsets',()=>{
  const collection=new Uint8Array(85),view=new DataView(collection.buffer);
  view.setUint32(0,0x74746366);
  view.setUint32(4,0x00010000);
  view.setUint32(8,2);
  for(const [index,offset,tableAt,value] of [[0,20,76,123],[1,48,80,231]]){
    view.setUint32(12+index*4,offset);
    view.setUint32(offset,0x4f54544f);
    view.setUint16(offset+4,1);
    view.setUint32(offset+12,0x6e616d65);
    view.setUint32(offset+20,tableAt);
    view.setUint32(offset+24,4);
    view.setUint32(tableAt,value);
  }
  assert.deepEqual(nativeFontFace(collection,0),nativeFontFace(collection,1));
  const second=new DataView(nativeFontFace(collection,2).buffer);
  assert.equal(second.getUint32(20),28);
  assert.equal(second.getUint32(28),231);
  assert.throws(()=>nativeFontFace(collection,3),/collection face/);
  view.setUint32(68,83);
  assert.throws(()=>nativeFontFace(collection,2),/table range/);
});

test('a standalone snapshot stages only the transitive references already attached',async()=>{
  const root='\\documentclass{article}\n\\input{chapter}\n\\includegraphics{figures/chart}';
  const chapter=new Blob(['\\bibliography{refs}']);
  const attachments=[
    ['chapter.tex',chapter],['figures/chart.png',new Blob([Uint8Array.of(7,8)])],
    ['refs.bib',new Blob(['@article{one}'])],['unrelated.tex',new Blob(['ignore'])],
  ];
  const snapshot=await nativeAttachedSnapshot(root,attachments);
  assert.deepEqual(snapshot.files.map(file=>file.path),['chapter.tex','figures/chart.png','refs.bib']);
  assert.deepEqual(snapshot.files[1].bytes,[7,8]);
  const reordered=await nativeAttachedSnapshot(root+'\nUnrelated edit',attachments.toReversed());
  assert.equal(reordered.dependencySignature,snapshot.dependencySignature);
  assert.notEqual(reordered.signature,snapshot.signature);
  assert.deepEqual((await nativeAttachedSnapshot(root,[])).files,[]);
});

const encode = text => new TextEncoder().encode(text);
const decode = bytes => new TextDecoder('utf-8', {ignoreBOM:true}).decode(new Uint8Array(bytes));

function model(records) {
  const disk = new Map(), reads = [];
  const files = new Map(records.map(([path, draft, saved = draft, kind = path.endsWith('.tex') ? 'tex' : 'resource']) => {
    disk.set(path, typeof saved === 'string' ? encode(saved) : new Uint8Array(saved ?? []));
    return [path, {id:path, path, kind, draft, saved, dirty:draft !== saved, bytes:disk.get(path)}];
  }));
  const project = {files, mainFileId:records[0][0], pendingOperation:Promise.resolve(),
    adapter:{root:'C:\\private\\user\\project', async read(path) {
      reads.push(path);
      if (!disk.has(path)) throw new Error('C:\\private\\user\\project\\' + path);
      return disk.get(path);
    }}};
  return {project, disk, reads};
}

test('preserves nested main path, every unsaved text draft, and original asset bytes without writes', async () => {
  const source = '\ufeff\\documentclass{article}\r\n\\input{../chapters/one}\r\n';
  const {project, reads} = model([
    ['docs/paper.tex', source, 'old main'],
    ['chapters/one.tex', '\\cite{new}', 'old chapter'],
    ['refs/library.bib', '@book{new,title={Draft}}', '@book{old}', 'bib'],
    ['styles/local.sty', '\\newcommand\\draft{yes}', 'old style'],
    ['figures/chart.pdf', null, [0, 255, 13, 10, 128], 'pdf'],
  ]);
  const before = structuredClone([...project.files]);
  const snapshot = await nativeProjectSnapshot(project);
  assert.equal(snapshot.mainFile, 'docs/paper.tex');
  assert.equal(snapshot.source, source);
  assert.deepEqual(snapshot.files.map(file => file.path), [
    'chapters/one.tex', 'docs/paper.tex', 'figures/chart.pdf', 'refs/library.bib', 'styles/local.sty',
  ]);
  for (const file of snapshot.files) {
    const draft = project.files.get(file.path).draft;
    if (typeof draft === 'string') assert.equal(decode(file.bytes), draft);
  }
  assert.deepEqual(snapshot.files.find(file => file.path.endsWith('.pdf')).bytes, [0, 255, 13, 10, 128]);
  assert.deepEqual(reads, ['figures/chart.pdf']);
  assert.deepEqual([...project.files], before);
  assert.ok(!JSON.stringify(snapshot).includes('private'));
});

test('fresh asset reads and dependency edits change a stable order-independent signature', async () => {
  const {project, disk} = model([
    ['main.tex', '\\input{chapter}'],
    ['chapter.tex', 'chapter'],
    ['figure.png', null, [1, 2, 3], 'image'],
  ]);
  const initial = await nativeProjectSnapshot(project);
  project.files = new Map([...project.files].reverse());
  assert.deepEqual(await nativeProjectSnapshot(project), initial);
  project.files.get('chapter.tex').draft = 'unsaved chapter';
  const changed = await nativeProjectSnapshot(project);
  assert.notEqual(changed.signature, initial.signature);
  disk.set('figure.png', new Uint8Array([1, 2, 4]));
  assert.notEqual((await nativeProjectSnapshot(project)).signature, changed.signature);
  project.mainFileId = 'chapter.tex';
  assert.equal((await nativeProjectSnapshot(project)).mainFile, 'chapter.tex');
  assert.notEqual((await nativeProjectSnapshot(project)).signature, changed.signature);
});

test('previewing another complete TeX file changes only the compilation entry',async()=>{
  const root='\\begin{document}\nMain.\n\\end{document}\n';
  const notes='\\begin{document}\nNotes.\n\\end{document}\n';
  const {project}=model([['main.tex',root],['notes/notes.tex',notes]]);
  const original=await nativeProjectSnapshot(project);
  const direct=await nativeProjectSnapshot(project,{entryFileId:'notes/notes.tex'});
  assert.equal(project.mainFileId,'main.tex');
  assert.equal(direct.mainFile,'notes/notes.tex');
  assert.equal(direct.source,notes);
  assert.deepEqual(direct.files,original.files);
  assert.notEqual(direct.dependencySignature,original.dependencySignature);
});

test('a detached fragment inherits the project preamble and keeps its native editing offsets',async()=>{
  const start='\\documentclass{article}\r\n\\usepackage{amsmath}\r\n\\begin{document}\r\n';
  const root=start+'Main.\r\n\\end{document}\r\n',fragment='Notes $x$ and prose.';
  const {project}=model([['main.tex',root],['notes/notes.tex',fragment]]);
  const options={entryFileId:'notes/notes.tex',wrapFragment:true};
  const snapshot=await nativeProjectSnapshot(project,options);
  assert.equal(snapshot.source,start+fragment+'\r\n\\end{document}\r\n');
  assert.equal(decode(snapshot.files.find(file=>file.path==='main.tex').bytes),root);
  const observed=projectMixedSnapshot({...snapshot,editablePaths:new Set(['notes/notes.tex'])});
  const [paragraph]=observed.paragraphs,[formula]=observed.formulas;
  assert.equal(paragraph.source,fragment);
  assert.equal(paragraph.from16,0);
  assert.equal(formula.from16,fragment.indexOf('$')+1);
  assert.equal(formula.filePath,'notes/notes.tex');
  assert.ok(observed.projection.startsWith(start));
  assert.equal(textEdit(observed,{paragraph,from16:0,to16:0,insert:'Draft '}).source,'Draft '+fragment);
  assert.equal(project.files.get('notes/notes.tex').draft,fragment);
  project.files.get('notes/notes.tex').draft='Updated '+fragment;
  const next=await nativeProjectSnapshot(project,options);
  assert.notEqual(snapshot.signature,next.signature);
  assert.equal(snapshot.dependencySignature,next.dependencySignature);
});
test('live typing may use the explicitly refreshed model asset snapshot without disk I/O',async()=>{
  const {project,reads}=model([['main.tex','main'],['image.png',null,[1,2,3],'image']]);
  const first=await nativeProjectSnapshot(project,{useModelAssets:true});
  assert.deepEqual(reads,[]);
  project.files.get('main.tex').draft='changed main source';
  const typed=await nativeProjectSnapshot(project,{useModelAssets:true});
  assert.equal(typed.dependencySignature,first.dependencySignature);
  assert.notEqual(typed.signature,first.signature);
  assert.equal(typed.files.find(file=>file.path==='image.png').bytes,first.files.find(file=>file.path==='image.png').bytes);
  project.files.get('image.png').bytes=new Uint8Array([1,2,4]);
  const second=await nativeProjectSnapshot(project,{useModelAssets:true});
  assert.notEqual(second.signature,first.signature);
});

test('omits VCS, hidden caches, checkpoints and build outputs but retains bibliography and local packages', async () => {
  const {project, reads} = model([
    ['main.tex', 'main'],
    ['.git/config', null, [1]],
    ['.lineae-state-session.json', null, [2]],
    ['nested/.cache/item', null, [3]],
    ['build/main.pdf', null, [4]],
    ['nested/dist/main.js', null, [5]],
    ['node_modules/package/index.js', null, [6]],
    ['main.aux', null, [7]],
    ['main.synctex.gz', null, [8]],
    ['main.run.xml', null, [9]],
    ['refs.bbl', null, [10]],
    ['local.cls', null, [11]],
    ['main.pdf', null, [12]],
  ]);
  assert.deepEqual((await nativeProjectSnapshot(project)).files.map(file => file.path),
    ['local.cls', 'main.pdf', 'main.tex', 'refs.bbl']);
  assert.deepEqual(reads, ['local.cls', 'main.pdf', 'refs.bbl']);
});
test('comprehensive native compilation can retain explicit generated graphics and external-reference inputs',async()=>{
  const {project}=model([['main.tex','main'],['build/diagram.pdf',null,[1]],
    ['external.aux',null,[2]],['.git/config',null,[3]]]);
  assert.deepEqual((await nativeProjectSnapshot(project,{includeGeneratedInputs:true})).files.map(file=>file.path),
    ['build/diagram.pdf','external.aux','main.tex']);
});

test('bounds file count, individual UTF-8 source size and total bytes', async () => {
  const {project} = model([['main.tex', '文'], ['image.png', null, [1, 2, 3]]]);
  await assert.rejects(nativeProjectSnapshot(project, {maxFiles:1}), /too many files/);
  await assert.rejects(nativeProjectSnapshot(project, {maxSourceBytes:2}), /source exceeds/);
  const larger=model([['main.tex','a'],['image.png',null,[1,2,3]]]).project;
  await assert.rejects(nativeProjectSnapshot(larger, {maxFileBytes:2}), /file exceeds/);
  await assert.rejects(nativeProjectSnapshot(project, {maxTotalBytes:5}), /total byte/);
  await assert.rejects(nativeProjectSnapshot(project, {maxFiles:5000}), /Invalid snapshot limit/);
  assert.equal((await nativeProjectSnapshot(project, {maxFiles:2, maxSourceBytes:3, maxTotalBytes:6})).files.length, 2);
});

test('rejects unsafe, noncanonical and case-colliding paths without exposing roots', async () => {
  for (const path of ['../outside.sty', '/private/file', 'C:\\private\\file', 'nested/../file.sty']) {
    const {project, reads} = model([['main.tex', 'main'], [path, null, [1]]]);
    await assert.rejects(nativeProjectSnapshot(project), error => !error.message.includes('private'));
    assert.deepEqual(reads, []);
  }
  const {project} = model([['main.tex', 'main'], ['MAIN.tex', 'duplicate']]);
  await assert.rejects(nativeProjectSnapshot(project), /Duplicate/);
});

test('adapter link/read failures fail closed and redact filesystem error details', async () => {
  const {project, disk} = model([['main.tex', 'main'], ['linked.sty', null, [1]]]);
  disk.delete('linked.sty');
  await assert.rejects(nativeProjectSnapshot(project), {message:'Could not read project snapshot file: linked.sty'});
});

test('waits for existing model operations and rejects edits racing asset reads', async () => {
  const {project} = model([['main.tex', 'before'], ['image.png', null, [1]]]);
  project.pendingOperation = Promise.resolve().then(() => { project.files.get('main.tex').draft = 'after operation'; });
  assert.equal((await nativeProjectSnapshot(project)).source, 'after operation');
  const read = project.adapter.read;
  project.adapter.read = async path => {
    project.files.get('main.tex').draft = 'during read';
    return read(path);
  };
  await assert.rejects(nativeProjectSnapshot(project), /Project changed/);
});

test('requires a selected TeX main and preserves recovered missing-file drafts', async () => {
  const {project, disk} = model([['main.tex', 'recovered'], ['chapter.tex', 'recovered child']]);
  project.files.get('main.tex').missing = true;
  disk.clear();
  assert.equal((await nativeProjectSnapshot(project)).source, 'recovered');
  project.mainFileId = null;
  await assert.rejects(nativeProjectSnapshot(project), /TeX main/);
});

test('rejects membership changes while reading instead of sending a partial project', async () => {
  const {project} = model([['main.tex', 'main'], ['image.png', null, [1]]]);
  const read = project.adapter.read;
  project.adapter.read = async path => {
    project.files.set('added.tex', {id:'added', path:'added.tex', kind:'tex', draft:'added'});
    return read(path);
  };
  await assert.rejects(nativeProjectSnapshot(project), /Project changed/);
});
