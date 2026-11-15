import test from 'node:test';
import assert from 'node:assert/strict';
import {foldPagePlan} from '../apps/web/src/project/fold-layout.mjs';
const geometry={pageHeight:1000,pageGap:20,marginTop:100,marginBottom:100,pageCount:3};
test('folding from page one halfway through page three retains boundary areas and original page numbers',()=>{
 const plan=foldPagePlan([{from:450,to:2600,path:'child.tex'}],geometry);
 assert.deepEqual(plan.pageNumbers,[1,3]);assert.deepEqual(plan.skipped,[1]);
 assert.deepEqual(plan.placeholders,[{path:'child.tex',page:1,top:450,height:450},{path:'child.tex',page:3,top:1120,height:460}]);
 assert.equal(plan.height,2020);assert.equal(plan.shift(2700),1020);assert.equal(plan.shift(200),0);
});
test('one-page folding retains the whole page and overlaps do not skip pages twice',()=>{
 const one=foldPagePlan([{from:200,to:700,path:'one'}],geometry);assert.deepEqual(one.skipped,[]);
 const nested=foldPagePlan([{from:450,to:2600,path:'a'},{from:500,to:2500,path:'b'}],geometry);
 assert.deepEqual(nested.skipped,[1]);assert.equal(nested.height,2020);assert.equal(nested.placeholders.length,2);
});
