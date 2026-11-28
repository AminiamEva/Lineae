const TEX_POINT_SCALE = 72 / 72.27;

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

function ctexFontset(preamble, options) {
  const fromClass = options.find(option => option.startsWith('fontset='))?.slice('fontset='.length);
  const fromPackage = /\\usepackage\s*\[([^\]]*)\]\s*\{ctex\}/.exec(preamble)?.[1]
    ?.split(',').map(option => option.trim()).find(option => option.startsWith('fontset='))
    ?.slice('fontset='.length);
  return ctexFontsets[(fromClass ?? fromPackage ?? '').trim().toLowerCase()] ?? null;
}

// pdfLaTeX font packages and their corresponding CSS font families.
// These are detected when fontspec commands (\setmainfont etc.) are absent.
const PDFTEX_FONT_PACKAGES = {
  lmodern: { serif: 'Latin Modern Roman', mono: 'Latin Modern Mono' },
  mathpazo: { serif: 'Palatino' },
  mathptmx: { serif: 'Times New Roman' },
  newtxtext: { serif: 'Times New Roman' },
  newtxmath: { serif: 'Times New Roman' },
  libertine: { serif: 'Linux Libertine' },
  libertinus: { serif: 'Libertinus Serif' },
  tgpagella: { serif: 'TeX Gyre Pagella' },
  tgtermes: { serif: 'TeX Gyre Termes' },
  tgbonum: { serif: 'TeX Gyre Bonum' },
  tgscho: { serif: 'TeX Gyre Schola' },
  helvet: { mono: 'Courier' },
  courier: { mono: 'Courier' },
};

function readFonts(preamble, options, activeFonts) {
  const fontset = ctexFontset(preamble, options);
  const cjkFallback = fontset
    ?? (/\\documentclass(?:\[[^\]]*\])?\{ctex|\\usepackage(?:\[[^\]]*\])?\{[^}]*ctex/.test(preamble) ? 'FandolSong' : null);
  // When activeFonts is provided (LuaLaTeX path), use fontspec commands from it.
  if (activeFonts) {
    const family = command => fontFamily(activeFonts[command]);
    return {
      serif: family('setmainfont'),
      mono: family('setmonofont'),
      cjk: family('setCJKmainfont') ?? cjkFallback,
    };
  }
  // XeLaTeX and pdfLaTeX paths: read fontspec commands from preamble.
  const serif = fontFamily(commandArgument(preamble, 'setmainfont'));
  const mono = fontFamily(commandArgument(preamble, 'setmonofont'));
  const cjk = fontFamily(commandArgument(preamble, 'setCJKmainfont'));
  if (serif || mono || cjk) {
    return { serif: serif ?? null, mono: mono ?? null, cjk: cjk ?? cjkFallback };
  }
  // pdfLaTeX uses \usepackage{fontpackage} instead of fontspec.
  // Detect common font packages and map them to CSS font families.
  const clean = preamble.replace(/(?<!\\)%.*/g, '').replace(/\\%/g, '%');
  const used = [...Object.entries(PDFTEX_FONT_PACKAGES)]
    .filter(([name]) => new RegExp('\\\\usepackage(?:\\[[^\\]]*\\])?\\{(?:[^{},]*,\\s*)*' + name + '(?:\\s*,[^{}]*)*\\}').test(clean));
  const fonts = Object.assign({}, ...used.map(([, v]) => v));
  return { serif: fonts.serif ?? null, mono: fonts.mono ?? null, cjk: cjkFallback };
}

function readLinespread(preamble) {
  const spread = /\\linespread\s*\{([\d.]+)\}/.exec(preamble)?.[1]
    ?? /\\renewcommand\s*\{?\s*\\baselinestretch\s*\}?\s*\{([\d.]+)\}/.exec(preamble)?.[1];
  const value = Number.parseFloat(spread ?? '1');
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function readFontsize(preamble) {
  const match = /\\fontsize\s*\{([\d.]+)(?:pt)?\}\s*\{([\d.]+)(?:pt)?\}/.exec(preamble);
  if (!match) return null;
  const size = Number.parseFloat(match[1]);
  const baseline = Number.parseFloat(match[2]);
  return Number.isFinite(size) && Number.isFinite(baseline) ? { size, baseline } : null;
}

export function typesetProfile(preamble = '', activeFonts) {
  const match = /\\documentclass(?:\[([^\]]*)\])?\{([^{}]+)\}/.exec(preamble);
  const options = (match?.[1] ?? '').split(',').map(option => option.trim()).filter(Boolean);
  const className = (match?.[2] ?? 'article').trim().toLowerCase();
  const pageNumbers = !/\\pagestyle\s*\{empty\}/.test(preamble);
  const fonts = readFonts(preamble, options, activeFonts);
  const linespread = readLinespread(preamble);
  const explicit = readFontsize(preamble);

  if (className === 'ctexart') {
    const classSize = options.includes('12pt') ? 12 : options.includes('11pt') ? 11 : options.includes('10pt') ? 10 : null;
    const classBaseline = classSize === 12 ? 14.5 : classSize === 11 ? 13.6 : 12;
    return {
      className,
      engine,
      fontSize: explicit ? cssPoints(explicit.size) : classSize ? cssPoints(classSize) : '10.5pt',
      lineHeight: explicit ? cssPoints(explicit.baseline * linespread)
        : classSize ? cssPoints(classBaseline * linespread)
        // Keep explicitly selected fontsets on their existing calibrated profile.
        : options.some(option=>option.startsWith('fontset=')) ? points(15.75 * linespread)
        : points(10.5 * 1.2 * (/\\(?:linespread|baselinestretch)\b/.test(preamble) ? linespread : 1.3)),
      paragraphIndent: classSize === 12 ? cssPoints(18) : classSize === 11 ? cssPoints(17)
        : classSize === 10 ? cssPoints(15) : '21pt',
      pageStyle: pageNumbers ? 'headings' : 'empty',
      fonts,
    };
  }

  const size = options.includes('12pt') ? 12 : options.includes('11pt') ? 11 : 10;
  const baseline = size === 12 ? 14.5 : size === 11 ? 13.6 : 12;
  const indent = size === 12 ? 18 : size === 11 ? 17 : 15;
  return {
    className,
    engine: 'xelatex',
    fontSize: explicit ? cssPoints(explicit.size) : cssPoints(size),
    lineHeight: cssPoints((explicit?.baseline ?? baseline) * linespread),
    paragraphIndent: cssPoints(indent),
    pageStyle: pageNumbers ? 'plain' : 'empty',
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
