import test from 'node:test';
import assert from 'node:assert/strict';
import {luaCjk} from '../apps/web/src/typesetting/lua-jfm.mjs';

const article=String.raw`\documentclass{article}\usepackage{luatexja-fontspec}\setmainjfont[Scale=1,JFM=quanjiao]{FandolSong-Regular.otf}`;
const ctex=String.raw`\documentclass[fontset=fandol]{ctexart}`;
const metric=source=>luaCjk.assess(source,'"FandolSong", serif').metric;
test('Lua article and ctex supply distinct measured kanjiskip at 10 pt',()=>{
  assert.deepEqual(luaCjk.boundary(metric(article),'中','文',655360),{width:0,stretch:26214,shrink:32768,cost:0});
  assert.deepEqual(luaCjk.boundary(metric(ctex),'中','文',655360),{width:0,stretch:30720,shrink:0,cost:0});
});
test('opening and closing punctuation carry half-width boxes, offsets and kinsoku',()=>{
  const name=metric(ctex);
  assert.deepEqual(luaCjk.box(name,'（',20),{width:10,offset:-10});
  assert.deepEqual(luaCjk.box(name,'）',20),{width:10,offset:0});
  assert.equal(luaCjk.boundary(name,'（','文',20).cost,10000);
  assert.equal(luaCjk.boundary(name,'文','）',20).cost,10000);
  assert.deepEqual(luaCjk.boundary(name,'文','（',20),{width:10,stretch:0,shrink:10,cost:0});
});
test('ctex punctuation, Latin and math adjacency use real interscript nodes',()=>{
  const name=metric(ctex);
  for(const neighbor of ['Lineae','$x$']){
    assert.deepEqual(luaCjk.boundary(name,'文',neighbor,20),{width:5,stretch:2,shrink:2,cost:0});
  }
});
test('font and JFM diagnostics expose the usable preview for unmeasured configurations',()=>{
  assert.equal(luaCjk.assess(article.replace('FandolSong-Regular.otf','SimSun'),'FandolSong').supported,false);
  assert.equal(luaCjk.assess(article,'SimSun, FandolSong').supported,false);
  assert.equal(luaCjk.assess(article.replace('quanjiao','custom'),'FandolSong').supported,false);
  assert.equal(luaCjk.assess(ctex+String.raw`\ltjsetparameter{kanjiskip=2pt}`,'FandolSong').supported,false);
  assert.equal(luaCjk.assess(ctex+String.raw`\ifXeTeX\setCJKmainfont{SimSun}\fi`,'FandolSong').supported,true);
});

test('ctex computes kanjiskip stretch for the actual 50 mm measure',()=>{
  // Lua pre_linebreak_filter measured 66,977 sp in this geometry at 10 pt.
  const spPerMm = 72.27 * 65536 / 25.4;
  const pair = luaCjk.boundary(metric(ctex),'中','文',655360,50*spPerMm);
  assert.equal(Math.round(pair.stretch),66977);
  assert.equal(luaCjk.boundary(metric(article),'中','文',655360,50*spPerMm).stretch,26214);
});
