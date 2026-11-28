import {luaCjk} from './lua-jfm.mjs';
import {luaDocumentStyle} from './lua-english.mjs';
import {typesetProfile} from '../../latex/typeset-layout.mjs';
import {ctexIntercharStretch, paragraphParameters, usesCtex} from './paragraph-parameters.mjs';
import {englishHyphenation} from './english-hyphenation.mjs';
import {fandolPairs} from './fandol-pairs.mjs';
import {fandolPunctuation} from './fandol-punctuation.mjs';

function pdfDocumentStyle(preamble) {
  const profile = typesetProfile(preamble);
  return { ...profile, engine: 'pdflatex' };
}

const pdf = Object.freeze({
  engine:'pdflatex',version:1,
  capabilities:Object.freeze({resolution:'supported', browserLayout:'supported', cjk:'basic-fallback', english:'supported'}),
  documentStyle:pdfDocumentStyle, englishHyphenation,
  paragraphParameters,
  cjk:Object.freeze({
    family:'FandolSong', pairs:fandolPairs, punctuation:fandolPunctuation,
    intercharStretch() { return 0; },
    supports() { return false; },
    assess() { return { supported: true }; },
  }),
});

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

export function getTypesettingProfile(resolvedEngine) {
  if (resolvedEngine === 'xelatex') return xe;
  if (resolvedEngine === 'lualatex') return lua;
  if (resolvedEngine === 'pdflatex') return pdf;
  throw new TypeError('A resolved typesetting engine is required');
}
