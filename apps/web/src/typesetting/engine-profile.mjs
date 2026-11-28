import {luaCjk} from './lua-jfm.mjs';
import {luaDocumentStyle} from './lua-english.mjs';
import {typesetProfile} from '../../latex/typeset-layout.mjs';
import {ctexIntercharStretch, paragraphParameters, usesCtex} from './paragraph-parameters.mjs';
import {englishHyphenation} from './english-hyphenation.mjs';
import {fandolPairs} from './fandol-pairs.mjs';
import {fandolPunctuation} from './fandol-punctuation.mjs';

const xe = Object.freeze({
  engine:'xelatex',version:2,
  capabilities:Object.freeze({resolution:'supported', browserLayout:'supported', cjk:'fandol-quanjiao', english:'supported'}),
  documentStyle:typesetProfile, englishHyphenation,
  paragraphParameters(preamble) {
    const options = paragraphParameters(preamble);
    options.ctexDefaultStretch = usesCtex(preamble) && !/\blinestretch\s*=/.test(preamble);
    return options;
  },
  cjk:Object.freeze({
    family:'FandolSong', pairs:fandolPairs, punctuation:fandolPunctuation,
    intercharStretch(options, lineWidth, em, baseline) {
      return options.ctexDefaultStretch ? ctexIntercharStretch(lineWidth, em) : baseline * .08;
    },
    supports(options,family) {
      return options.cjkPunctStyle === 'quanjiao' && !options.cjkCustomGlue && family.includes(this.family);
    },
  }),
});
const lua = Object.freeze({
  engine:'lualatex',version:3,
  capabilities:Object.freeze({resolution:'supported', browserLayout:'supported',
    cjk:'measured-fandol-jfm', english:'latin-modern-controlled'}),
  documentStyle:luaDocumentStyle, paragraphParameters, englishHyphenation, cjk:luaCjk,
  texFinalPass:true,
});

function pdfDocumentStyle(preamble, activeFonts) {
  return typesetProfile(preamble, activeFonts, 'pdflatex');
}
const pdf = Object.freeze({
  engine:'pdflatex',version:2,
  capabilities:Object.freeze({resolution:'supported', browserLayout:'supported', cjk:'fandol-quanjiao', english:'supported'}),
  documentStyle:pdfDocumentStyle, englishHyphenation,
  paragraphParameters(preamble) {
    const options = paragraphParameters(preamble);
    options.ctexDefaultStretch = usesCtex(preamble) && !/\blinestretch\s*=/.test(preamble);
    return options;
  },
  cjk:Object.freeze({
    family:'FandolSong', pairs:fandolPairs, punctuation:fandolPunctuation,
    intercharStretch(options, lineWidth, em, baseline) {
      return options.ctexDefaultStretch ? ctexIntercharStretch(lineWidth, em) : baseline * .08;
    },
    supports(options,family) {
      return options.cjkPunctStyle === 'quanjiao' && !options.cjkCustomGlue && family.includes(this.family);
    },
  }),
});

export function getTypesettingProfile(resolvedEngine) {
  if (resolvedEngine === 'xelatex') return xe;
  if (resolvedEngine === 'pdflatex') return pdf;
  if (resolvedEngine === 'lualatex') return lua;
  throw new TypeError('A resolved typesetting engine is required');
}
