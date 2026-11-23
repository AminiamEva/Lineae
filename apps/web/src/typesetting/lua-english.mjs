import { typesetProfile } from '../../latex/typeset-layout.mjs';
import { fontspecDeclarations } from './font-measurement.mjs';

// Interpret literal common ligature and pair-kerning switches for the main
// Latin font. Let CSS and the font supply their normal values otherwise.
function setLatinFeatures(features, options) {
  for (const option of options.split(/,(?![^{}]*\})/)) {
    const match = /^\s*(Ligatures|Kerning)\s*=\s*\{?([A-Za-z]+)\}?\s*$/.exec(option);
    if (!match) continue;
    const [, category, value] = match;
    if (category === 'Kerning' && ['On','Off'].includes(value)) {
      features.kerning = value === 'Off' ? 'none' : 'normal';
    }
    if (category === 'Ligatures' && ['Common','NoCommon'].includes(value)) {
      features.ligatures = value === 'NoCommon' ? 'no-common-ligatures' : 'normal';
    }
  }
}

export function luaDocumentStyle(preamble = '') {
  const defaults = {kerning:'normal', ligatures:'normal'};
  let latinFeatures = {...defaults};
  for (const declaration of fontspecDeclarations(preamble,'lualatex')) {
    if (declaration.command === 'defaultfontfeatures' && !declaration.options) {
      setLatinFeatures(defaults,declaration.name);
    }
    if (declaration.command === 'setmainfont') {
      latinFeatures = {...defaults};
      setLatinFeatures(latinFeatures,declaration.options);
    }
  }
  return {...typesetProfile(preamble), latinFeatures};
}
