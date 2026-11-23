import {luaDocumentStyle} from './lua-english.mjs';
import {typesetProfile} from '../../latex/typeset-layout.mjs';
import {paragraphParameters} from './paragraph-parameters.mjs';
import {englishHyphenation} from './english-hyphenation.mjs';
import {fandolPairs} from './fandol-pairs.mjs';
import {fandolPunctuation} from './fandol-punctuation.mjs';

const xe = Object.freeze({
  engine:'xelatex',version:1,
  capabilities:Object.freeze({resolution:'supported', browserLayout:'supported', cjk:'fandol-quanjiao', english:'supported'}),
  documentStyle:typesetProfile, paragraphParameters, englishHyphenation,
  cjk:Object.freeze({
    family:'FandolSong', pairs:fandolPairs, punctuation:fandolPunctuation,
    lineStretch:.08,
    supports(options,family) {
      return options.cjkPunctStyle === 'quanjiao' && !options.cjkCustomGlue && family.includes(this.family);
    },
  }),
});
const lua = Object.freeze({
  engine:'lualatex',version:2,
  capabilities:Object.freeze({resolution:'supported', browserLayout:'supported',
    cjk:'pending-calibration', english:'latin-modern-preview'}),
  documentStyle:luaDocumentStyle, paragraphParameters, englishHyphenation, cjk:null,
});

export function getTypesettingProfile(resolvedEngine) {
  if (resolvedEngine === 'xelatex') return xe;
  if (resolvedEngine === 'lualatex') return lua;
  throw new TypeError('A resolved typesetting engine is required');
}
