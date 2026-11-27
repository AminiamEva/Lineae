const TEX_POINT_SCALE = 72 / 72.27;
import { resolveChineseProfile } from './chinese-profile.mjs';

function cssPoints(texPoints) {
  return `${(texPoints * TEX_POINT_SCALE).toFixed(4)}pt`;
}

function points(value) {
  return `${Number.parseFloat(value.toFixed(4))}pt`;
}

const ctexFontsets = {
  fandol: 'FandolSong',
  windows: 'SimSun',
  mac: 'Songti SC',
  ubuntu: 'Noto Serif CJK SC',
  adobe: 'Source Han Serif SC',
};
// ctex maps CJK bold (i.e. heading) text to the hei/sans family.
const ctexHeiFontsets = {
  fandol: 'FandolHei',
  windows: 'SimHei',
  mac: 'Heiti SC',
  ubuntu: 'Noto Sans CJK SC',
  adobe: 'Source Han Sans SC',
};

// fontspec accepts either a family name or a font file name. Map the Latin
// Modern files that ship with TeX distributions back to their family name so
// the editor uses the installed system font instead of a file path.
function fontFamily(raw) {
  if (!raw) return null;
  let name = raw.trim().replace(/^["']+|["']+$/g, '').replace(/^\{|\}$/g, '').trim();
  name = name.replace(/^.*[\\/]/, '');
  const base = name.replace(/\.(?:otf|ttf|ttc|woff2?)$/i, '');
  if (/^lmroman/i.test(base)) return 'Latin Modern Roman';
  if (/^lmmono/i.test(base)) return 'Latin Modern Mono';
  if (/^lmsans/i.test(base)) return 'Latin Modern Sans';
  return base.replace(/-(?:regular|bold|italic|bolditalic|medium|light|book)$/i, '')
    .replace(/[_-]+/g, ' ').trim() || null;
}

function commandArgument(source, command) {
  const match = new RegExp('\\\\' + command + '\\s*(?:\\[[^\\]]*\\]\\s*)?\\{([^{}]*)\\}').exec(source);
  return match?.[1] ?? null;
}

function ctexFontsetOption(preamble, options) {
  const fromClass = options.find(option => option.startsWith('fontset='))?.slice('fontset='.length);
  const fromPackage = /\\usepackage\s*\[([^\]]*)\]\s*\{ctex\}/.exec(preamble)?.[1]
    ?.split(',').map(option => option.trim()).find(option => option.startsWith('fontset='))
    ?.slice('fontset='.length);
  return (fromClass ?? fromPackage ?? '').trim().toLowerCase() || null;
}

function splitFontOptions(text) {
  const parts = [];
  let depth = 0, start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '{') depth++;
    else if (char === '}') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function stripOptionBraces(value) {
  const text = String(value ?? '').trim();
  return text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1).trim() : text;
}

function fontOptions(source, command) {
  const match = new RegExp('\\\\' + command + '\\s*\\[([^\\]]*)\\]\\s*\\{').exec(source);
  const options = {};
  if (!match) return options;
  for (const part of splitFontOptions(match[1])) {
    const equal = part.indexOf('=');
    if (equal < 0) options[part.trim()] = true;
    else options[part.slice(0, equal).trim()] = stripOptionBraces(part.slice(equal + 1));
  }
  return options;
}

function readFonts(preamble, options, activeFonts) {
  const family = command => fontFamily(activeFonts ? activeFonts[command] : commandArgument(preamble, command));
  const fontsetValue = ctexFontsetOption(preamble, options);
  const fontset = fontsetValue ? ctexFontsets[fontsetValue] ?? null : null;
  const cjkOptions = fontOptions(preamble, 'setCJKmainfont');
  const hasCtex = /\\documentclass(?:\[[^\]]*\])?\{ctex|\\usepackage(?:\[[^\]]*\])?\{[^}]*ctex/.test(preamble);
  // fontset=none must not be overridden by the ctex Fandol default.
  const cjkFallback = fontsetValue === 'none' ? null : hasCtex ? 'FandolSong' : null;
  const heiFallback = fontsetValue === 'none' ? null : ctexHeiFontsets[fontsetValue] ?? (hasCtex ? 'FandolHei' : null);
  return {
    serif: family('setmainfont'),
    mono: family('setmonofont'),
    cjk: family('setCJKmainfont') ?? fontset ?? cjkFallback,
    cjkBold: fontFamily(cjkOptions.BoldFont),
    cjkItalic: fontFamily(cjkOptions.ItalicFont),
    cjkBoldItalic: fontFamily(cjkOptions.BoldItalicFont),
    cjkFeatures: cjkOptions,
    // Heading CJK face: explicit sans family, then the main font's BoldFont
    // (ctex's bold face), then the fontset's hei family.
    cjkHei: family('setCJKsansfont') ?? fontFamily(cjkOptions.BoldFont) ?? heiFallback,
    fontset: fontsetValue,
  };
}

function readLinespread(preamble) {
  const spread = /\\linespread\s*\{([\d.]+)\}/.exec(preamble)?.[1]
    ?? /\\renewcommand\s*\{?\s*\\baselinestretch\s*\}?\s*\{([\d.]+)\}/.exec(preamble)?.[1];
  if (spread === undefined) return null;
  const value = Number.parseFloat(spread);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readBaselineskip(preamble) {
  const match = /\\baselineskip\s*=\s*([\d.]+)(?:pt)?/.exec(preamble)
    ?? /\\setlength\s*\{\s*\\baselineskip\s*\}\s*\{([\d.]+)(?:pt)?\}/.exec(preamble);
  const value = Number.parseFloat(match?.[1] ?? '');
  return Number.isFinite(value) ? value : null;
}

function readFontsize(preamble) {
  const match = /\\fontsize\s*\{([\d.]+)(?:pt)?\}\s*\{([\d.]+)(?:pt)?\}/.exec(preamble);
  if (!match) return null;
  const size = Number.parseFloat(match[1]);
  const baseline = Number.parseFloat(match[2]);
  return Number.isFinite(size) && Number.isFinite(baseline) ? { size, baseline } : null;
}

// ctex zihao sizes are declared in big points; convert to TeX points so the
// existing cssPoints mapping produces the matching CSS size.
const BP_TO_TEX = 72.27 / 72;
const ZIHAO_TEX = {
  8: 5 * BP_TO_TEX, 7: 5.5 * BP_TO_TEX, '-6': 6.5 * BP_TO_TEX, 6: 7.5 * BP_TO_TEX,
  '-5': 9 * BP_TO_TEX, 5: 10.5 * BP_TO_TEX, '-4': 12 * BP_TO_TEX, 4: 14 * BP_TO_TEX,
  '-3': 15 * BP_TO_TEX, 3: 16 * BP_TO_TEX, '-2': 18 * BP_TO_TEX, 2: 22 * BP_TO_TEX,
  '-1': 24 * BP_TO_TEX, 1: 26 * BP_TO_TEX, '-0': 36 * BP_TO_TEX, 0: 42 * BP_TO_TEX,
};
const STANDARD_BASELINE = { 10: 12, 11: 13.6, 12: 14.5 };
const STANDARD_INDENT = { 10: 15, 11: 17, 12: 18 };

export function typesetProfile(preamble = '', activeFonts) {
  const match = /\\documentclass(?:\[([^\]]*)\])?\{([^{}]+)\}/.exec(preamble);
  const options = (match?.[1] ?? '').split(',').map(option => option.trim()).filter(Boolean);
  const rawClassName = (match?.[2] ?? 'article').trim().toLowerCase();
  const className = rawClassName;
  const chinese = resolveChineseProfile({ preamble });
  const baseClassName = chinese.enabled ? chinese.baseClassName : rawClassName;
  const fonts = readFonts(preamble, options, activeFonts);
  const explicitSpread = readLinespread(preamble);
  const chineseScheme = chinese.scheme === 'chinese';
  const linespread = explicitSpread ?? (chineseScheme ? 1.3 : 1);
  const pageNumbers = !/\\pagestyle\s*\{empty\}/.test(preamble);
  const explicit = readFontsize(preamble);
  const baselineskip = readBaselineskip(preamble);
  const classSize = options.includes('12pt') ? 12 : options.includes('11pt') ? 11 : options.includes('10pt') ? 10 : null;
  const effectiveClassSize = classSize ?? 10;
  const standardBaseline = STANDARD_BASELINE[effectiveClassSize] ?? 12;
  const standardIndent = STANDARD_INDENT[effectiveClassSize] ?? 15;
  const zihao = chinese.zihao == null ? null : String(chinese.zihao).trim();
  const zihaoFalse = zihao !== null && /^(?:false|none)$/i.test(zihao);
  const zihaoSize = zihao && !zihaoFalse && chinese.zihaoExplicit ? ZIHAO_TEX[zihao] ?? null : null;

  let size, baseline, indent;
  if (explicit) {
    size = explicit.size;
    baseline = explicit.baseline * linespread;
    indent = chineseScheme ? (chinese.autoindent ? size * 2 : standardIndent) : standardIndent;
  } else if (chineseScheme) {
    if (zihaoSize !== null) {
      size = zihaoSize;
      baseline = size * 1.2 * linespread;
    } else if (zihaoFalse || classSize !== null) {
      size = effectiveClassSize;
      baseline = standardBaseline * linespread;
    } else {
      size = ZIHAO_TEX[5];
      baseline = size * 1.2 * linespread;
    }
    indent = chinese.autoindent ? size * 2 : standardIndent;
  } else if (zihaoSize !== null) {
    size = zihaoSize;
    baseline = size * 1.2 * linespread;
    indent = standardIndent;
  } else {
    size = effectiveClassSize;
    baseline = standardBaseline * linespread;
    indent = standardIndent;
  }
  if (baselineskip) baseline = baselineskip;

  const pagestyle = [...preamble.matchAll(/\\pagestyle\s*\{([^}]*)\}/g)].at(-1)?.[1]?.trim();
  return {
    className: baseClassName,
    rawClassName,
    baseClassName,
    fontSize: cssPoints(size),
    lineHeight: cssPoints(baseline),
    paragraphIndent: cssPoints(indent),
    pageStyle: pagestyle || (chineseScheme ? 'headings' : 'plain'),
    indentFirst: chineseScheme ? chinese.autoindent : /\\usepackage(?:\[[^\]]*\])?\{[^}]*indentfirst\b/.test(preamble),
    fonts,
  };
}

export function planPagination(blocks, { pageHeight, pageGap, marginTop, marginBottom }) {
  if (![pageHeight, pageGap, marginTop, marginBottom].every(Number.isFinite) || pageHeight <= marginTop + marginBottom) {
    throw new TypeError('Invalid page geometry');
  }

  const translations = Array(blocks.length).fill(0);
  const breaks = [];
  const pitch = pageHeight + pageGap;
  const bodyHeight = pageHeight - marginTop - marginBottom;
  // CSS line boxes include half-leading below the glyphs. TeX's page builder
  // admits the final baseline according to the glyph depth instead, which is
  // about 2.7 CSS px for the 10/12 pt article profile.
  const tolerance = 3;
  let translation = 0;
  let pageIndex = 0;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    let top = block.top + translation;
    let bottom = top + block.height;
    const pageStart=marginTop+(block.pageStartAdjustment??0);
    let bodyTop = pageIndex * pitch + pageStart;
    let bodyBottom = pageIndex * pitch + pageHeight - marginBottom;
    const next = blocks[index + 1];
    let groupBottom = block.keepWithNext && next ? next.top + next.height + translation : bottom;
    const groupHeight = groupBottom - top;
    const canMove = block.height <= bodyHeight + tolerance && groupHeight <= bodyHeight + tolerance;

    if (block.forceBreak) {
      let nextPage = pageIndex + 1;
      if(block.forceBreak==='odd'&&nextPage%2!==0)nextPage++;
      const nextTop = nextPage * pitch + marginTop;
      if (top < nextTop - tolerance) {
        const space = nextTop - top;
        translation += space;
        top += space;
        bottom += space;
        groupBottom += space;
      }
      pageIndex = Math.max(pageIndex, nextPage);
      bodyTop = pageIndex * pitch + pageStart;
      bodyBottom = pageIndex * pitch + pageHeight - marginBottom;
      const space = bodyTop - top;
      translation += space;
      top += space;
      bottom += space;
      groupBottom += space;
      breaks.push({ index, space, page: pageIndex + 1 });
    }

    // After an oversized block, resume at the next body rather than placing
    // the following block in the page gap.
    if (top < bodyTop - tolerance) {
      const space = bodyTop - top;
      translation += space;
      top += space;
      bottom += space;
      groupBottom += space;
    }

    if ((canMove || block.atomicTable) && top > bodyTop + tolerance && groupBottom > bodyBottom + tolerance) {
      // Move a keep-with-previous chain as a unit when it fits on the next
      // page. This covers display formulas and the first two lines of a
      // paragraph without changing the editable document.
      let breakIndex = index;
      let anchorTop = top;
      if (block.keepWithPrevious && index > 0) {
        let candidate = index - 1;
        while (candidate > 0 && blocks[candidate - 1].keepWithNext) candidate--;
        const candidateTop = blocks[candidate].top + translations[candidate];
        if (candidateTop > bodyTop + tolerance &&
            groupBottom - candidateTop <= bodyHeight + tolerance) {
          breakIndex = candidate;
          anchorTop = candidateTop;
        }
      }
      pageIndex++;
      bodyTop = pageIndex * pitch + (blocks[breakIndex].pageStartAdjustment??0) + marginTop;
      bodyBottom = pageIndex * pitch + pageHeight - marginBottom;
      const space = bodyTop - anchorTop;
      translation += space;
      for (let moved = breakIndex; moved < index; moved++) translations[moved] += space;
      top += space;
      bottom += space;
      breaks.push({ index: breakIndex, space, page: pageIndex + 1 });
    }

    translations[index] = translation;

    // A single table, image, or paragraph can be taller than the body. Do not
    // split its editable DOM; account for every sheet it visually reaches.
    if (block.atomicTable && block.height > bodyHeight + tolerance && next) {
      // An overfull tabular occupies one sheet. Its overflow stays editable in
      // the table viewport; the following block starts on the following sheet.
      pageIndex++;
      translation=pageIndex*pitch+marginTop-next.top;
      continue;
    }
    if (block.atomicTable) continue;
    while (bottom > pageIndex * pitch + pageHeight - marginBottom + tolerance) pageIndex++;
  }

  return { breaks, translations, pageCount: Math.max(1, pageIndex + 1) };
}

export function planTableRows(rows, {
  top, pageHeight, pageGap, marginTop, marginBottom,
  headerHeight = 0, repeatHeader = true, lastRowDepth = 0, pageInset = 0, sections = null,
}) {
  if (!rows.length) return { breaks:[], extra:0, pageCount:1 };
  const pitch = pageHeight + pageGap;
  const bodyHeight = pageHeight - marginTop - marginBottom;
  const tolerance = .5;
  const breaks = [];
  let extra = 0;
  let pageIndex = Math.max(0, Math.floor(top / pitch));
  let bodyBottom = pageIndex * pitch + pageHeight - marginBottom;

  const copies=[];
  const firstHead=sections?.firsthead ?? sections?.head;
  const finalFoot=sections?.lastfoot ?? sections?.foot;
  const copy=(section,y)=>{if(section?.height)copies.push({section:section.kind,top:y});};
  const atTop=Math.abs(top-(pageIndex*pitch+marginTop))<tolerance;
  let firstPadding=(atTop?pageInset:0)+(firstHead?.height??0);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    let rowTop = top + row.top + extra;
    let rowBottom = rowTop + row.height - lastRowDepth;
    const foot=index===rows.length-1?finalFoot:sections?.foot;
    const reserve=(foot?.height??0)+(index===0?firstPadding:0);
    if (rowBottom + reserve > bodyBottom + tolerance && row.height <= bodyHeight + tolerance) {
      if(index)copy(sections?.foot,rowTop);
      const nextPage = pageIndex + 1;
      const bodyTop = nextPage * pitch + marginTop;
      const section=index===0?firstHead:sections?.head;
      const header = pageInset+(section?.height ?? (repeatHeader && index>0?headerHeight:0));
      copy(section,bodyTop+pageInset);
      firstPadding=0;
      const padding = Math.max(0, bodyTop + header - rowTop);
      if (padding > .01) {
        breaks.push({ row:index, padding, headerTop:bodyTop });
        extra += padding;
        pageIndex = nextPage;
        bodyBottom = pageIndex * pitch + pageHeight - marginBottom;
        rowTop += padding;
        rowBottom += padding;
      }
    }
    if(index===0 && firstPadding){
      copy(firstHead,top+(atTop?pageInset:0));
      breaks.push({row:0,padding:firstPadding});
      extra+=firstPadding;
      rowBottom+=firstPadding;
    }
    if(index===rows.length-1 && finalFoot?.height){
      copy(finalFoot,rowBottom+lastRowDepth);
      extra+=finalFoot.height;
    }
    while (rowBottom > pageIndex * pitch + pageHeight - marginBottom + tolerance) pageIndex++;
  }
  return { breaks, extra, ...(sections?{copies}:{}), pageCount: Math.max(1, pageIndex + 1) };
}
