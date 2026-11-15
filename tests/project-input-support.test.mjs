import test from 'node:test';
import assert from 'node:assert/strict';
import {projectInputSource} from '../apps/web/src/project/input-support.mjs';
const root='\\documentclass{article}\n\\begin{document}\n\\input{child}\n\\end{document}\n';
function project(draft){const files=new Map([['main.tex',{id:'main',path:'main.tex',draft:root,kind:'tex'}],['child.tex',{id:'child',path:'child.tex',draft,kind:'tex'}]]);return {files,file:id=>[...files.values()].find(file=>file.id===id)};}
test('complete child templates add a real source package once while preserving child bytes',()=>{
 const child='\\documentclass{article}\n\\begin{document}\nChild.\n\\end{document}\n',p=project(child);
 const next=projectInputSource(p,'main',root);
 assert.equal(next,root.replace('\\begin{document}','\\usepackage{docmute}\n\\begin{document}'));
 assert.equal(projectInputSource(p,'main',next),next);assert.equal(p.file('child').draft,child);
});
test('fragment children and unresolved paths do not alter the root preamble',()=>{
 assert.equal(projectInputSource(project('Fragment.'),'main',root),root);
 assert.equal(projectInputSource(project('Fragment.'),'main',root.replace('child','missing')),root.replace('child','missing'));
});

test('complete templates through fragment descendants are detected without changing those files',()=>{
 const p=project('\\input{leaf}\n');
 const leaf='\\documentclass{article}\n\\begin{document}\nLeaf.\n\\end{document}\n';
 p.files.set('leaf.tex',{id:'leaf',path:'leaf.tex',draft:leaf,kind:'tex'});
 const next=projectInputSource(p,'main',root);
 assert.ok(next.includes('\\usepackage{docmute}'));assert.equal(p.file('leaf').draft,leaf);
});
