import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFixture,matchesEdit,denominator} from './native-math/rtex-probe.mjs';

test('fixture projection leaves the denominator truly empty and maps UTF-16 to UTF-8',()=>{
  for(const prefix of ['Before\n','% 中文 𝔸\r\nBefore\r\n']) {
    const source=prefix+'\\[\\frac{a}{}\\]\r\nAfter\r\n';
    const projected=projectFixture(source);
    assert.ok(projected.text.includes('\\frac{a}{}'));
    assert.equal(source.slice(projected.sourceOffset16-9,projected.sourceOffset16+1),'\\frac{a}{}');
    const changed=Buffer.concat([Buffer.from(projected.text).subarray(0,projected.projectionOffset8),
      Buffer.from('b'),Buffer.from(projected.text).subarray(projected.projectionOffset8)]).toString('utf8');
    assert.equal(changed,projected.text.replace('\\frac{a}{}','\\frac{a}{b}'));
    assert.equal(projected.text.replace('\\begingroup\\attribute65000=10 ','').replace('\\endgroup',''),source);
    if(prefix.includes('𝔸')) assert.ok(projected.projectionOffset8>projected.projectionOffset16);
  }
  assert.throws(()=>projectFixture('unsupported'));
  assert.throws(()=>projectFixture('\\frac{a}{}+\\frac{a}{}'));
});
test('geometry acceptance requires matching edit identity and source revision',()=>{
  const reply={edit_id:7,source_revision:3};
  const update={event:'ParagraphUpdate',edit_id:7,versions:{source_revision:3}};
  assert.equal(matchesEdit(update,reply),true);
  assert.equal(matchesEdit({...update,edit_id:6},reply),false);
  assert.equal(matchesEdit({...update,versions:{source_revision:2}},reply),false);
  assert.equal(matchesEdit({...update,event:'LayoutUpdate'},reply),false);
});
test('empty and filled denominator geometry cannot be substituted for each other',()=>{
  const empty={owner:10,role:'den',empty:true,bbox:[20,30,20,30]};
  const filled={...empty,empty:false,bbox:[20,30,40,50]};
  const dl={math_owners:{fields:[empty,filled]}};
  assert.equal(denominator(dl,true),empty);
  assert.equal(denominator(dl,false),filled);
  assert.throws(()=>denominator({math_owners:{fields:[{...empty,owner:11}]}},true));
  assert.throws(()=>denominator({math_owners:{fields:[{...empty,bbox:[20,30,25,30]}]}},true));
  assert.throws(()=>denominator({math_owners:{fields:[{...filled,bbox:[20,30,20,30]}]}},false));
});
