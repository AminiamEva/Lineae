import {getTypesettingProfile} from '../apps/web/src/typesetting/engine-profile.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {texDimension} from '../apps/web/src/typesetting/paragraph-parameters.mjs';
const {paragraphParameters} = getTypesettingProfile('xelatex');

test('TeX dimensions distinguish TeX pt from CSS bp and preserve glue orders',()=>{
 assert.equal(texDimension('1in'),96);assert.equal(texDimension('72.27pt'),96);assert.equal(texDimension('72bp'),96);assert.equal(texDimension('2em',14),28);
 const p=paragraphParameters('\\spaceskip=4pt plus 2pt minus 1pt\n\\tolerance=500\n% \\tolerance=1');
 assert.equal(p.tolerance,500);assert.deepEqual(p.spaceSkip,{width:'4pt',stretch:'2pt',shrink:'1pt'});
});
test('hyphenation exceptions and minima are explicit layout inputs',()=>{
 const p=paragraphParameters('\\hyphenation{op-ti-mi-za-tion type-set-ting} \\lefthyphenmin=3');
 assert.deepEqual(p.exceptions.get('optimization'),['op','ti','mi','za','tion']);assert.equal(p.leftHyphenMin,3);
});