import test from 'node:test';
import assert from 'node:assert/strict';
import {optimumParagraph} from '../apps/web/src/typesetting/optimum-paragraph.mjs';
const box=width=>({type:'box',width}),glue=()=>({type:'glue',width:3,stretch:2,shrink:1}),end=()=>[{type:'glue',width:0,stretch:1e10,shrink:0},{type:'penalty',width:0,cost:-10000}];
test('global optimum chooses an earlier break to avoid a bad following line',()=>{
 const items=[box(20),glue(),box(20),glue(),box(8),glue(),box(32),glue(),box(12),glue(),box(12),...end()];
 const plan=optimumParagraph(items,55);assert.ok(plan);assert.ok(plan.lines.length>1);
 assert.ok(plan.lines.every(line=>line.ratio>=-1));assert.equal(plan.lines.at(-1).ratio,0);
});
test('hyphenated alternatives and first-line indentation are evaluated globally',()=>{
 const items=[box(15),{type:'penalty',width:3,cost:50,hyphen:true},box(15),glue(),box(20),glue(),box(20),...end()];
 const plan=optimumParagraph(items,line=>line===0?20:50,{pretolerance:-1,tolerance:10000});assert.ok(plan);assert.ok(plan.lines[0].hyphen);assert.equal(plan.lines[0].width,20);
});
test('nonbreaking boxes do not silently use greedy wrapping',()=>{
 assert.equal(optimumParagraph([box(100),...end()],30),null);
});
test('negative punctuation kerns can restore a fit after an overwide candidate',()=>{
 const plan=optimumParagraph([box(50),{type:'glue',width:-30,stretch:0,shrink:0},box(10),...end()],40);
 assert.ok(plan);assert.equal(plan.lines.length,1);assert.equal(plan.lines[0].natural,30);
});
