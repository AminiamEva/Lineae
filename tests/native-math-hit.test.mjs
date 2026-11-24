import test from 'node:test';
import assert from 'node:assert/strict';
import {hitMathField,hitMathGlyph} from '../apps/web/src/editor/native-math/hit.mjs';

const frame={sessionId:'session-1',sourceRevision:2,layoutVersion:4};
const rect={left:140,top:240,width:1700,height:2200};
const den={owner:10,role:'den',bbox:[20104479,10101063,20104479,10101063],empty:true};

test('hit-test an observed empty denominator in page space at each zoom',()=>{
  for(const zoom of [1,1.5,2]){
    const scale=zoom*(96/72)/65781.76;
    const point={x:rect.left+den.bbox[0]*scale+3,y:rect.top+den.bbox[1]*scale-2};
    assert.deepEqual(hitMathField([den],rect,point,zoom,frame,frame),{owner:10,role:'den'});
    assert.equal(hitMathField([den],rect,{...point,x:point.x+8},zoom,frame,frame),null);
    assert.equal(hitMathField([den],rect,point,zoom,frame,{...frame,sourceRevision:3}),null);
    assert.equal(hitMathField([den],rect,point,zoom,frame,{...frame,sessionId:'session-2'}),null);
    assert.equal(hitMathField([den],rect,point,zoom,frame,{...frame,layoutVersion:5}),null);
  }
});

test('overlapping logical fields cannot silently select a source slot',()=>{
  const scale=(96/72)/65781.76;
  const point={x:rect.left+den.bbox[0]*scale,y:rect.top+den.bbox[1]*scale};
  assert.deepEqual(hitMathField([den,{...den}],rect,point,1,frame,frame),{owner:10,role:'den'});
  assert.equal(hitMathField([den,{...den,role:'num'}],rect,point,1,frame,frame),null);
  assert.equal(hitMathField([{...den,bbox:[NaN,0,0,0]}],rect,point,1,frame,frame),null);
});

test('glyph halves target the adjacent position, not an ambiguous overlapping glyph',()=>{
  const scale=(96/72)/65781.76,glyph={owner:4,bbox:[4000000,6000000,4500000,6500000]};
  const point=x=>({x:rect.left+x*scale,y:rect.top+6250000*scale});
  assert.deepEqual(hitMathGlyph([glyph],rect,point(4100000),1,frame,frame),
    {owner:4,role:'nucleus',after:false});
  assert.deepEqual(hitMathGlyph([glyph],rect,point(4400000),1,frame,frame),
    {owner:4,role:'nucleus',after:true});
  assert.equal(hitMathGlyph([glyph,{...glyph,owner:5}],rect,point(4100000),1,frame,frame),null);
  assert.equal(hitMathGlyph([glyph],rect,point(4100000),1,frame,{...frame,layoutVersion:5}),null);
});
