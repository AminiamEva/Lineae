import test from 'node:test';
import assert from 'node:assert/strict';
import {includeEdges,addReference,removeReference,setReferenceKind,moveReference,wouldCycle} from '../apps/web/src/project/include-operations.mjs';
test('include actions preserve authored text and trailing document boundary',()=>{
 const text='\\documentclass{article}\r\n\\begin{document}\r\n% keep\r\n\\input{a}\r\nMiddle.\r\n\\include{b}\r\n\\end{document}\r\n';
 const added=addReference(text,'c.tex','input');
 assert.ok(added.indexOf('\\input{c}')<added.indexOf('\\end{document}'));
 assert.equal(added.replace(/\r\n/g,'').includes('\n'),false);
 assert.deepEqual(includeEdges(moveReference(text,1,0)).map(e=>e.path),['b','a']);
 assert.match(moveReference(text,1,0),/% keep\r\n\\include\{b\}\r\nMiddle\./);
 assert.deepEqual(includeEdges(removeReference(text,0)).map(e=>e.path),['b']);
 assert.match(setReferenceKind(text,0,'include'),/\\include\{a\}/);
 assert.throws(()=>addReference(text,'bad%path.tex'));
});
test('include cycle detection follows literal references and ignores comments',()=>{
 const files=new Map([['main',{id:'main',path:'main.tex',kind:'tex',draft:'\\input{a}'}],['a',{id:'a',path:'a.tex',kind:'tex',draft:'% \\input{main}\nHello'}]]);
 const project={files,file:id=>files.get(id)};
 assert.equal(wouldCycle(project,'main','a'),false);
 files.get('a').draft='\\input{main}';assert.equal(wouldCycle(project,'main','a'),true);
});
