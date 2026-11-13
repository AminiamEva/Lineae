const TEX_POINT_SCALE = 72 / 72.27;

function cssPoints(texPoints) {
  return `${(texPoints * TEX_POINT_SCALE).toFixed(4)}pt`;
}

export function typesetProfile(preamble = '') {
  const match = /\\documentclass(?:\[([^\]]*)\])?\{([^{}]+)\}/.exec(preamble);
  const options = (match?.[1] ?? '').split(',').map(option => option.trim()).filter(Boolean);
  const className = (match?.[2] ?? 'article').trim().toLowerCase();
  const pageNumbers = !/\\pagestyle\s*\{empty\}/.test(preamble);

  if (className === 'ctexart') {
    return {
      className,
      fontSize: '10.5pt',
      lineHeight: '15.75pt',
      paragraphIndent: '21pt',
      pageStyle: pageNumbers ? 'headings' : 'empty',
    };
  }

  const size = options.includes('12pt') ? 12 : options.includes('11pt') ? 11 : 10;
  const baseline = size === 12 ? 14.5 : size === 11 ? 13.6 : 12;
  const indent = size === 12 ? 18 : size === 11 ? 17 : 15;
  return {
    className,
    fontSize: cssPoints(size),
    lineHeight: cssPoints(baseline),
    paragraphIndent: cssPoints(indent),
    pageStyle: pageNumbers ? 'plain' : 'empty',
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
  let furthestBottom = marginTop;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    let top = block.top + translation;
    let bottom = top + block.height;
    let bodyTop = pageIndex * pitch + marginTop;
    let bodyBottom = pageIndex * pitch + pageHeight - marginBottom;
    const next = blocks[index + 1];
    const groupBottom = block.keepWithNext && next ? next.top + next.height + translation : bottom;
    const groupHeight = groupBottom - top;
    const canMove = block.height <= bodyHeight + tolerance && groupHeight <= bodyHeight + tolerance;

    if (canMove && top > bodyTop + tolerance && groupBottom > bodyBottom + tolerance) {
      pageIndex++;
      bodyTop = pageIndex * pitch + marginTop;
      bodyBottom = pageIndex * pitch + pageHeight - marginBottom;
      const space = bodyTop - top;
      translation += space;
      top += space;
      bottom += space;
      breaks.push({ index, space, page: pageIndex + 1 });
    }

    translations[index] = translation;
    furthestBottom = Math.max(furthestBottom, bottom);

    // A single table, image, or paragraph can be taller than the body. Do not
    // split its editable DOM; account for every sheet it visually reaches.
    while (furthestBottom > pageIndex * pitch + pageHeight - marginBottom + tolerance) pageIndex++;
  }

  return { breaks, translations, pageCount: Math.max(1, pageIndex + 1) };
}
