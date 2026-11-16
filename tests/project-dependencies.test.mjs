import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dependencyMatchesPath,dependencySpelling,scanDependencies,resolveMetadata} from '../apps/web/src/project/dependencies.mjs';
test('literal dependency metadata excludes comments and verbatim and records pending macros',()=>{
 const scan=scanDependencies('% \\input{ignored}\n\\documentclass{article}\n\\input{sections/a}\n\\include{missing}\n\\addbibresource{refs.bib}\n\\includegraphics[width=2cm]{image}\n\\input{\\chapterpath}\n\\begin{verbatim}\n\\input{ignored}\n\\end{verbatim}');
 assert.equal(scan.document,true);assert.equal(scan.dependencies.length,5);
 const files=new Map([['sections/a.tex',{id:'a'}],['refs.bib',{id:'bib'}],['image.png',{id:'image',path:'image.png'}]]);
 const resolved=resolveMetadata(files,new Map([['main',scan]]));
  assert.deepEqual(resolved.map(d=>d.status),['resolved','missing','resolved','resolved','pending']);
});
test('dependency ranges and spellings support safe path rewrites',()=>{
  const source='\\input{./sections/a}\n\\includegraphics{figures/plot}\n\\bibliography{ refs , archive/old }';
  const dependencies=scanDependencies(source).dependencies;
  assert.deepEqual(dependencies.map(item=>source.slice(item.from,item.to)),['./sections/a','figures/plot','refs','archive/old']);
  assert.equal(dependencyMatchesPath('input','./sections/a','sections/a.tex'),true);
  assert.equal(dependencySpelling('input','./sections/a','chapters/intro.tex'),'./chapters/intro');
  assert.equal(dependencyMatchesPath('includegraphics','figures/plot','figures/plot.png'),true);
  assert.equal(dependencySpelling('includegraphics','figures/plot','assets/chart.pdf'),'assets/chart');
  assert.equal(dependencySpelling('bibliography','refs','sources/library.bib'),'sources/library');
});
