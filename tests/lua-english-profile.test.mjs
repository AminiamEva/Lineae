import assert from 'node:assert/strict';
import test from 'node:test';
import { getTypesettingProfile } from '../apps/web/src/typesetting/engine-profile.mjs';
import { paragraphParameters } from '../apps/web/src/typesetting/paragraph-parameters.mjs';
import { englishHyphenation } from '../apps/web/src/typesetting/english-hyphenation.mjs';

const lua = getTypesettingProfile('lualatex');

test('Lua enables shared English paragraph inputs with measured TeX defaults', () => {
  assert.equal(lua.capabilities.browserLayout, 'supported');
  assert.equal(lua.paragraphParameters, paragraphParameters);
  assert.equal(lua.englishHyphenation, englishHyphenation);
  const opts = lua.paragraphParameters('');
  assert.deepEqual([opts.pretolerance, opts.tolerance, opts.leftHyphenMin, opts.rightHyphenMin], [100, 200, 2, 3]);
});
test('Lua fontspec kern and liga select the same display and metric features', () => {
  const style = source => lua.documentStyle(source).latinFeatures;
  assert.deepEqual(style('\\setmainfont{lmroman10-regular.otf}'), {kerning:'normal',ligatures:'normal'});
  assert.deepEqual(style('\\setmainfont[Ligatures=NoCommon]{lmroman10-regular.otf}'), {kerning:'normal',ligatures:'no-common-ligatures'});
  assert.deepEqual(style('\\defaultfontfeatures{Kerning=Off}\\setmainfont{Latin Modern Roman}[Ligatures=NoCommon]'), {kerning:'none',ligatures:'no-common-ligatures'});
  assert.deepEqual(style('\\ifXeTeX\\setmainfont[Kerning=Off]{Other}\\fi\\setmainfont{Latin Modern Roman}'), {kerning:'normal',ligatures:'normal'});
});

test('explicit spaceskip keeps the measured Latin Modern sentence extra under Lua', async () => {
  const {interwordGlue} = await import('../apps/web/src/typesetting/paragraph-parameters.mjs');
  const em = 10*96/72.27;
  const unit = em/655360;
  const skip = {width:'4pt',stretch:'2pt',shrink:'1pt'};
  const afterSentence = interwordGlue({space:218235*unit,em,skip,factor:3,extra:true,profile:lua});
  assert.ok(Math.abs((afterSentence.width-4*96/72.27)/unit-72745)<1);
  for (const [key, sp] of Object.entries({width:334889,stretch:393216,shrink:21845})) {
    assert.ok(Math.abs(afterSentence[key]/unit-sp)<1,key);
  }
  assert.equal(interwordGlue({space:218235*unit,em,skip,factor:3,extra:true,
    profile:getTypesettingProfile('xelatex')}).width, 4*96/72.27);
});
