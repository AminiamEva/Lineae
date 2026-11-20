import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('./fixtures/tex-compat/',import.meta.url));
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const manifest=JSON.parse(decode(await readFile(path.join(root,'manifest.json'))));
const expected={
  text:['text-paragraphs','text-escaped','text-emphasis','text-comments','text-unicode'],
  headings:['headings-levels','headings-starred','headings-short-title','headings-label-ref','headings-toc'],
  lists:['lists-itemize','lists-enumerate','lists-nested','lists-description','lists-paragraphs'],
  tables:['tables-basic','tables-alignment','tables-multicolumn','tables-booktabs','tables-paragraph-cell'],
  math:['math-inline-display','math-displaystyle','math-scripts','math-relations','math-operators'],
  matrices:['matrices-single','matrices-rectangular','matrices-empty-cells','matrices-delimiters','matrices-nested'],
  environments:['environments-align','environments-align-star','environments-cases','environments-theorem','environments-proof'],
  macros:['macros-newcommand','macros-optional','macros-renewcommand','macros-local-scope','macros-preservation'],
};
const nonempty=value=>assert.ok(typeof value==='string'&&value.trim());
test('manifest has exactly the independent ordered acceptance list',()=>{
  assert.deepEqual(Object.keys(manifest).sort(),['fixtures','version']);
  assert.equal(manifest.version,1);assert.ok(Array.isArray(manifest.fixtures));
  assert.equal(manifest.fixtures.length,40);
  assert.deepEqual(manifest.fixtures.map(f=>f.id),Object.values(expected).flat());
  assert.equal(new Set(manifest.fixtures.map(f=>f.id)).size,40);
});
test('metadata, safe paths, strict UTF-8, document markers and preservation',async()=>{
  const actualRoot=await realpath(root);
  for(const f of manifest.fixtures){
    assert.deepEqual(Object.keys(f).sort(),['category','engine','expected','file','id','labels','packages','passes','preserve']);
    assert.ok(Object.hasOwn(expected,f.category));assert.ok(expected[f.category].includes(f.id));
    assert.equal(f.file,`${f.category}/${f.id}.tex`);
    assert.ok(!f.file.includes('..')&&!f.file.includes('\\')&&!path.isAbsolute(f.file));
    const actual=await realpath(path.join(root,f.file));
    const relative=path.relative(actualRoot,actual);
    assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    assert.ok(['pdflatex','xelatex'].includes(f.engine));assert.ok([1,2].includes(f.passes));
    if(f.id==='text-unicode')assert.equal(f.engine,'xelatex');
    if(['headings-label-ref','headings-toc','headings-short-title'].includes(f.id))assert.equal(f.passes,2);
    assert.ok(Array.isArray(f.packages));assert.equal(new Set(f.packages).size,f.packages.length);
    for(const name of f.packages)assert.match(name,/^[A-Za-z][A-Za-z0-9-]*$/);
    for(const key of ['labels','expected'])assert.deepEqual(Object.keys(f[key]).sort(),['en','zh']);
    for(const language of ['zh','en']){
      nonempty(f.labels[language]);assert.ok(Array.isArray(f.expected[language])&&f.expected[language].length>=2);
      f.expected[language].forEach(nonempty);
    }
    const source=decode(await readFile(actual));
    assert.equal(source.split('\\begin{document}').length-1,1);
    assert.equal(source.split('\\end{document}').length-1,1);
    assert.ok(source.indexOf('\\begin{document}')<source.indexOf('\\end{document}'));
    assert.ok(Array.isArray(f.preserve)&&f.preserve.length>=2);
    for(const fragment of f.preserve){nonempty(fragment);assert.ok(source.includes(fragment),`${f.id}: missing ${JSON.stringify(fragment)}`);}
  }
});
test('all TeX files are registered and all registered files exist',async()=>{
  async function walk(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())result.push(...await walk(full));else if(entry.name.endsWith('.tex'))result.push(path.relative(root,full).split(path.sep).join('/'));
  }return result;}
  assert.deepEqual((await walk(root)).sort(),manifest.fixtures.map(f=>f.file).sort());
});
