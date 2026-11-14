import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanDependencies,resolveMetadata} from '../apps/web/src/project/dependencies.mjs';
test('literal dependency metadata excludes comments and verbatim and records pending macros',()=>{
 const scan=scanDependencies('% \\input{ignored}\n\\documentclass{article}\n\\input{sections/a}\n\\include{missing}\n\\addbibresource{refs.bib}\n\\includegraphics[width=2cm]{image}\n\\input{\\chapterpath}\n\\begin{verbatim}\n\\input{ignored}\n\\end{verbatim}');
 assert.equal(scan.document,true);assert.equal(scan.dependencies.length,5);
 const files=new Map([['sections/a.tex',{id:'a'}],['refs.bib',{id:'bib'}],['image.png',{id:'image',path:'image.png'}]]);
 const resolved=resolveMetadata(files,new Map([['main',scan]]));
 assert.deepEqual(resolved.map(d=>d.status),['resolved','missing','resolved','resolved','pending']);
});
