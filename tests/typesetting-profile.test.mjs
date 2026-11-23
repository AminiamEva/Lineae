import test from 'node:test';
import assert from 'node:assert/strict';
import {getTypesettingProfile} from '../apps/web/src/typesetting/engine-profile.mjs';
import {fandolPairs} from '../apps/web/src/typesetting/fandol-pairs.mjs';
import {fandolPunctuation} from '../apps/web/src/typesetting/fandol-punctuation.mjs';
test('Xe uses original measured objects and parser',()=>{
  const p=getTypesettingProfile('xelatex');
  assert.equal(p.cjk.pairs,fandolPairs);
  assert.equal(p.cjk.punctuation,fandolPunctuation);
  assert.equal(p.paragraphParameters('\\tolerance=456').tolerance,456);
  assert.equal(p.documentStyle('\\documentclass{ctexart}').fonts.cjk,'FandolSong');
});
test('Lua exposes pending capabilities without borrowing Xe data or layout',()=>{
  const p=getTypesettingProfile('lualatex');
  assert.equal(p.engine,'lualatex');assert.equal(p.capabilities.resolution,'supported');
  assert.equal(p.capabilities.cjk,'pending-calibration');assert.equal(p.cjk,null);
  assert.equal(p.paragraphParameters,null);assert.equal(p.documentStyle,null);
});
test('conflict or auto cannot silently obtain a layout',()=>{
  assert.throws(()=>getTypesettingProfile(null),TypeError);
  assert.throws(()=>getTypesettingProfile('auto'),TypeError);
});
