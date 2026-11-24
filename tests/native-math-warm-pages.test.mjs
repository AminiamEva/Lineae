import test from 'node:test';
import assert from 'node:assert/strict';
import {warmRows} from '../apps/web/src/typesetting/rtex/warm-rows.mjs';

const versions={source_revision:3,context_revision:2,engine_generation:1,layout_version:2};
const fragment={page:1,first_line:1,last_line:1,xs:[200],baselines:[300],approximate:false};
const layout={versions,placements:[{par_id:50,fragments:[fragment]}]};
const line={x:1,y:2,items:[['g',1,97,28,1,2,12,0]]};
const update={versions:{...versions,source_revision:4},par_id:50,status:'ok',
  pagination_stale:false,context_stale:false,fragments:[fragment],dl:{lines:[line],other:[]}};
const page=lines=>new Map([[1,{dl:{lines}}]]);

test('an exact unchanged unit translates a real row into page space without modifying raw pages',()=>{
  const old={x:200,y:300,unit:7,items:[['r',200,300,10,10]]};
  const pages=page([old]);
  assert.deepEqual(warmRows(update,layout,pages).get(1).get(0),{line,dx:199,dy:298});
  assert.equal(pages.get(1).dl.lines[0],old);
});

test('warm rows do not overlay ambiguous, outdated, unplaced, or stateful drawing',()=>{
  const old={x:200,y:300,unit:7,items:[['r',200,300,10,10]]};
  assert.equal(warmRows(update,layout,page([old,old])),null);
  assert.equal(warmRows(update,layout,page([old,{...old,y:400}])),null);
  assert.equal(warmRows({...update,context_stale:true},layout,page([old])),null);
  assert.equal(warmRows({...update,versions:{...update.versions,context_revision:3}},layout,page([old])),null);
  assert.equal(warmRows({...update,fragments:[{...fragment,approximate:true}]},layout,page([old])),null);
  assert.equal(warmRows(update,layout,page([{...old,items:[['c',0,1,'0 g']]}])),null);
});
