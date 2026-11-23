import {groupEnd, sourceStructure} from '../../latex/source-structure.mjs';

const declarations = new Set(['setmainfont','setsansfont','setmonofont','setCJKmainfont','setmainjfont','defaultfontfeatures']);
const engines = new Map([['\\ifXeTeX','xelatex'],['\\ifLuaTeX','lualatex'],['\\ifxetex','xelatex'],['\\ifluatex','lualatex']]);

// Only literal, top-level declarations in an active engine branch. Keep the
// original fontspec name (including its file extension) and balanced options.
export function fontspecDeclarations(source, engine) {
  const result = [], branches = [];
  for (const {kind, topLevel, value, end} of sourceStructure(source)) {
    if (kind === 'begin' && value === '\\begin{document}') break;
    if (kind !== 'command' || !topLevel) continue;
    if (/^\\if/.test(value) && value !== '\\ifthenelse') {
      branches.push(engines.has(value) ? engines.get(value) === engine : null);
      continue;
    }
    if (value === '\\else' && branches.length) {
      if (branches.at(-1) !== null) branches[branches.length-1] = !branches.at(-1);
      continue;
    }
    if (value === '\\fi') { branches.pop(); continue; }
    const command = value.slice(1);
    if (!declarations.has(command) || branches.some(active => !active)) continue;
    let pos = end;
    function argument(open) {
      while (/\s/.test(source[pos] ?? 'x')) pos++;
      if (source[pos] !== open) return null;
      const next = groupEnd(source,pos);
      if (next < 0) return null;
      const text = source.slice(pos+1,next-1).trim();
      pos = next;
      return text;
    }
    const before = argument('['), name = argument('{');
    if (name !== null) result.push({command,name,options:[before,argument('[')].filter(Boolean).join(',')});
  }
  return result;
}

export function createFontMeasurement(context, fontFaces = [], document = null) {
  const widths = new Map(), canvasFonts = new Map(), faceIds = new WeakMap();
  let sequence = 0, namespace, lastPreamble, lastEngine, declared, fixedLatinFace, probe;
  function clear() {
    widths.clear();
    canvasFonts.clear();
  }
  function select(profile, preamble) {
    if (preamble !== lastPreamble || profile.engine !== lastEngine) {
      declared = fontspecDeclarations(preamble,profile.engine);
      const face = declared.filter(d=>d.command === 'setmainfont').at(-1)?.name;
      fixedLatinFace = /^(?:lmroman\d+-regular\.otf|Latin Modern Roman)$/i.test(face ?? '');
      lastPreamble = preamble;
      lastEngine = profile.engine;
    }
    // A FontFace can be replaced by another file with identical CSS descriptors.
    const faces = Array.from(fontFaces, face => {
      if (!faceIds.has(face)) faceIds.set(face,++sequence);
      return [faceIds.get(face),face.status,face.family,face.style,face.weight,face.stretch,
        face.unicodeRange,face.featureSettings,face.variationSettings];
    });
    const next = JSON.stringify([profile.engine,profile.version,declared,faces]);
    if (namespace !== next) {clear(); namespace = next;}
  }
  function canvasWidth(text,font) {
    let measurement = canvasFonts.get(font);
    if (!measurement) {
      context.font=font;
      const native=context.font;
      // Preserve subpixel advances on rasterizers that round at body sizes.
      const rounded=['i','W',' '].every(probe=>Number.isInteger(context.measureText(probe).width));
      const enlarged=rounded?native.replace(/([\d.]+)px/,(_,size)=>Number(size)*64+'px'):native;
      measurement={font:enlarged,scale:enlarged===native?1:64};
      canvasFonts.set(font,measurement);
    }
    context.font=measurement.font;
    return context.measureText(text).width/measurement.scale;
  }
  function measure(text,style,font = style.font || [style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ')) {
    const {letterSpacing, fontFeatureSettings, fontKerning, fontVariantLigatures, fontVariationSettings} = style;
    const id = JSON.stringify([font,letterSpacing,fontFeatureSettings,fontKerning,fontVariantLigatures,fontVariationSettings,text]);
    if (widths.has(id)) return widths.get(id);
    if (lastEngine === 'lualatex') context.fontKerning = fontKerning || 'auto';
    else if (context.fontKerning !== 'auto') context.fontKerning = 'auto';
    let advance;
    // Canvas has no general OpenType feature-settings API. Let the same browser
    // shaper measure an unwrapped inline for styles with explicit overrides.
    if (document && (fontKerning === 'none' ||
        [fontFeatureSettings,fontVariantLigatures,fontVariationSettings].some(value => value && value !== 'normal'))) {
      if (!probe) {
        probe=document.createElement('span');
        probe.setAttribute('aria-hidden','true');
        probe.style.cssText='position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;white-space:pre;width:max-content;padding:0;border:0;letter-spacing:0;word-spacing:0;';
        document.body.append(probe);
      }
      Object.assign(probe.style,{font,fontFeatureSettings,fontKerning,fontVariantLigatures,fontVariationSettings});
      // LayoutUnit rounds to 1/64 CSS px. Retain subpixel OpenType advances
      // before summing many shaped fragments at the target optical size.
      const scale = lastEngine === 'lualatex' && fontVariationSettings === 'normal' && fixedLatinFace ? 64 : 1;
      if (scale !== 1) probe.style.fontSize = (parseFloat(style.fontSize)*scale) + 'px';
      probe.textContent=text;
      advance=probe.getBoundingClientRect().width/scale;
    } else {
      advance=canvasWidth(text,font);
    }
    const width=advance+Math.max(0,text.length-1)*(parseFloat(letterSpacing)||0);
    if (widths.size>10000) widths.clear();
    widths.set(id,width);
    return width;
  }
  return {select,clear,measure};
}
