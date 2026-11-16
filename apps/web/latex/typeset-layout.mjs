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

function readFonts(preamble, options) {
  const fontset = ctexFontset(preamble, options);
  return {
    serif: fontFamily(commandArgument(preamble, 'setmainfont')),
    mono: fontFamily(commandArgument(preamble, 'setmonofont')),
    cjk: fontFamily(commandArgument(preamble, 'setCJKmainfont')) ?? fontset ?? null,
  };
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

export function typesetProfile(preamble = '') {
  const match = /\\documentclass(?:\[([^\]]*)\])?\{([^{}]+)\}/.exec(preamble);
  const options = (match?.[1] ?? '').split(',').map(option => option.trim()).filter(Boolean);
  const className = (match?.[2] ?? 'article').trim().toLowerCase();
  const pageNumbers = !/\\pagestyle\s*\{empty\}/.test(preamble);
  const fonts = readFonts(preamble, options);
  const linespread = readLinespread(preamble);
  const explicit = readFontsize(preamble);

  if (className === 'ctexart') {
    const classSize = options.includes('12pt') ? 12 : options.includes('11pt') ? 11 : options.includes('10pt') ? 10 : null;
    const classBaseline = classSize === 12 ? 14.5 : classSize === 11 ? 13.6 : 12;
    return {
      className,
      fontSize: explicit ? cssPoints(explicit.size) : classSize ? cssPoints(classSize) : '10.5pt',
      lineHeight: explicit ? cssPoints(explicit.baseline * linespread)
        : classSize ? cssPoints(classBaseline * linespread) : points(15.75 * linespread),
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
    let bodyTop = pageIndex * pitch + marginTop;
    let bodyBottom = pageIndex * pitch + pageHeight - marginBottom;
    const next = blocks[index + 1];
    let groupBottom = block.keepWithNext && next ? next.top + next.height + translation : bottom;
    const groupHeight = groupBottom - top;
    const canMove = block.height <= bodyHeight + tolerance && groupHeight <= bodyHeight + tolerance;

    // After an oversized block, resume at the next body rather than placing
    // the following block in the page gap.
    if (top < bodyTop - tolerance) {
      const space = bodyTop - top;
      translation += space;
      top += space;
      bottom += space;
      groupBottom += space;
    }

    if (canMove && top > bodyTop + tolerance && groupBottom > bodyBottom + tolerance) {
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
      bodyTop = pageIndex * pitch + marginTop;
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
    while (bottom > pageIndex * pitch + pageHeight - marginBottom + tolerance) pageIndex++;
  }

  return { breaks, translations, pageCount: Math.max(1, pageIndex + 1) };
}

export function planTableRows(rows, {
  top, pageHeight, pageGap, marginTop, marginBottom,
  headerHeight = 0, repeatHeader = true,
}) {
  if (!rows.length) return { breaks:[], extra:0, pageCount:1 };
  const pitch = pageHeight + pageGap;
  const bodyHeight = pageHeight - marginTop - marginBottom;
  const tolerance = .5;
  const breaks = [];
  let extra = 0;
  let pageIndex = Math.max(0, Math.floor(top / pitch));
  let bodyBottom = pageIndex * pitch + pageHeight - marginBottom;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    let rowTop = top + row.top + extra;
    let rowBottom = rowTop + row.height;
    if (rowBottom > bodyBottom + tolerance && row.height <= bodyHeight + tolerance) {
      const nextPage = pageIndex + 1;
      const bodyTop = nextPage * pitch + marginTop;
      const header = repeatHeader && index > 0 ? headerHeight : 0;
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
    while (rowBottom > pageIndex * pitch + pageHeight - marginBottom + tolerance) pageIndex++;
  }
  return { breaks, extra, pageCount: Math.max(1, pageIndex + 1) };
}
