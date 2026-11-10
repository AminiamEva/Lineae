/**
 * Dependency-free PDF verification helpers.
 *
 * Nothing in this file invokes an external program: it parses the text output
 * of pdfinfo/pdffonts, the XML of `pdftotext -bbox-layout`, and the PGM pages
 * produced by `pdftoppm`. Keeping the analysis pure makes it unit-testable on a
 * machine without a TeX toolchain.
 */

/** @param {string} text */
export function normalizeText(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parse a binary PGM (P5) image.
 * @param {Uint8Array|Buffer} input
 * @returns {{width:number,height:number,max:number,data:Uint8Array}}
 */
export function parsePgm(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let offset = 0;
  /** @returns {string} */
  function token() {
    // Skip whitespace and comments.
    while (offset < bytes.length) {
      const byte = bytes[offset];
      if (byte === 35) {
        while (offset < bytes.length && bytes[offset] !== 10 && bytes[offset] !== 13) offset += 1;
        continue;
      }
      if (byte === 32 || byte === 9 || byte === 10 || byte === 13) {
        offset += 1;
        continue;
      }
      break;
    }
    const start = offset;
    while (offset < bytes.length) {
      const byte = bytes[offset];
      if (byte === 32 || byte === 9 || byte === 10 || byte === 13) break;
      offset += 1;
    }
    if (start === offset) throw new Error('Unexpected end of PGM header.');
    return String.fromCharCode(...bytes.subarray(start, offset));
  }

  const magic = token();
  if (magic !== 'P5') throw new Error(`Unsupported PGM magic: ${magic}`);
  const width = Number(token());
  const height = Number(token());
  const max = Number(token());
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid PGM dimensions.');
  }
  if (!Number.isInteger(max) || max <= 0 || max > 255) {
    throw new Error(`Unsupported PGM maxval: ${max}`);
  }
  if (bytes[offset] === 13 && bytes[offset + 1] === 10) offset += 2;
  else offset += 1;
  const expected = width * height;
  const data = bytes.subarray(offset, offset + expected);
  if (data.length !== expected) {
    throw new Error(`Truncated PGM data: ${data.length} of ${expected} pixels.`);
  }
  return { width, height, max, data };
}

/**
 * Compare two PGM images. A pixel counts as changed when the absolute channel
 * difference exceeds `threshold` (anti-aliasing tolerance).
 *
 * @param {{width:number,height:number,data:Uint8Array}} left
 * @param {{width:number,height:number,data:Uint8Array}} right
 * @param {{threshold?:number}} [options]
 */
export function compareImages(left, right, options = {}) {
  const threshold = Number.isFinite(options.threshold) ? Number(options.threshold) : 8;
  const sameSize = left.width === right.width && left.height === right.height;
  if (!sameSize) {
    return {
      sameSize: false,
      width: [left.width, right.width],
      height: [left.height, right.height],
      pixels: 0,
      changed: null,
      ratio: null,
      meanAbsoluteDifference: null,
      boundingBox: null,
    };
  }
  const total = left.width * left.height;
  let changed = 0;
  let sum = 0;
  let minX = left.width;
  let minY = left.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < total; index += 1) {
    const difference = Math.abs(left.data[index] - right.data[index]);
    sum += difference;
    if (difference > threshold) {
      changed += 1;
      const x = index % left.width;
      const y = Math.floor(index / left.width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    sameSize: true,
    width: left.width,
    height: left.height,
    pixels: total,
    changed,
    ratio: changed / total,
    meanAbsoluteDifference: sum / total,
    boundingBox: changed ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
  };
}

/** @param {string} text */
export function parsePdfInfo(text) {
  /** @type {Record<string,string>} */
  const fields = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z ]*?):\s*(.*)$/);
    if (match) fields[match[1].trim()] = match[2].trim();
  }
  const pages = Number(fields.Pages);
  let pageSize = null;
  const sizeMatch = (fields['Page size'] ?? '').match(/([\d.]+)\s*x\s*([\d.]+)/);
  if (sizeMatch) pageSize = { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) };
  return {
    fields,
    pages: Number.isFinite(pages) ? pages : null,
    pageSize,
    pdfVersion: fields['PDF version'] ?? null,
    producer: fields.Producer ?? null,
    creator: fields.Creator ?? null,
    encrypted: /^yes/i.test(fields.Encrypted ?? ''),
  };
}

/**
 * Parse pdffonts output. Object IDs and subset prefixes are ignored so that two
 * compilations of the same document compare equal.
 *
 * @param {string} text
 */
export function parseFonts(text) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex(line => /^name\s+type\s+encoding/i.test(line.trim()));
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^-+$/.test(trimmed.replace(/\s+/g, ''))) continue;
    // Drop the two trailing object numbers; collapse the rest.
    const withoutIds = trimmed.replace(/\s+\d+\s+\d+$/, '');
    const columns = withoutIds.split(/\s{2,}/).map(column => column.trim()).filter(Boolean);
    const name = (columns[0] ?? '').replace(/^[A-Z]{6}\+/, '');
    rows.push({
      name,
      raw: withoutIds.replace(/\s+/g, ' '),
      type: columns[1] ?? '',
      emb: columns[3] ?? '',
      sub: columns[4] ?? '',
      uni: columns[5] ?? '',
    });
  }
  return rows;
}

/**
 * Compare font lists by name and embedding flags.
 * @param {Array<{name:string,raw:string}>} left
 * @param {Array<{name:string,raw:string}>} right
 */
export function compareFonts(left, right) {
  const normalize = rows => rows.map(row => row.raw.replace(/[A-Z]{6}\+/g, '')).sort();
  const a = normalize(left);
  const b = normalize(right);
  const missing = a.filter(row => !b.includes(row));
  const extra = b.filter(row => !a.includes(row));
  return { same: missing.length === 0 && extra.length === 0, missing, extra, count: [left.length, right.length] };
}

const XML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** @param {string} value */
function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => XML_ENTITIES[name]);
}

/** @param {string} attrs */
function parseAttributes(attrs) {
  /** @type {Record<string,string>} */
  const result = {};
  for (const match of attrs.matchAll(/([A-Za-z]+)="([^"]*)"/g)) {
    result[match[1]] = match[2];
  }
  return result;
}

/**
 * Parse `pdftotext -bbox-layout` output.
 * @param {string} xml
 */
export function parseBbox(xml) {
  const pages = [];
  for (const pageMatch of String(xml).matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const pageAttrs = parseAttributes(pageMatch[1]);
    const lines = [];
    for (const lineMatch of pageMatch[2].matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/g)) {
      const lineAttrs = parseAttributes(lineMatch[1]);
      const words = [];
      for (const wordMatch of lineMatch[2].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)) {
        const wordAttrs = parseAttributes(wordMatch[1]);
        const text = decodeXml(wordMatch[2]).trim();
        if (!text) continue;
        words.push({
          text,
          xMin: Number(wordAttrs.xMin),
          yMin: Number(wordAttrs.yMin),
          xMax: Number(wordAttrs.xMax),
          yMax: Number(wordAttrs.yMax),
        });
      }
      if (!words.length) continue;
      lines.push({
        text: words.map(word => word.text).join(' '),
        xMin: Number(lineAttrs.xMin),
        yMin: Number(lineAttrs.yMin),
        xMax: Number(lineAttrs.xMax),
        yMax: Number(lineAttrs.yMax),
        words,
      });
    }
    pages.push({
      width: Number(pageAttrs.width),
      height: Number(pageAttrs.height),
      lines,
    });
  }
  return { pages };
}

/** @param {number[]} values */
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Structural layout metrics used by the L4 checks:
 * page count, line count, line spacing, bibliography start page and the
 * hanging-indent pattern of reference labels.
 *
 * @param {{pages: Array<{lines: Array<{text:string,xMin:number,yMin:number}>}>}} bbox
 */
export function analyzeLayout(bbox) {
  const pages = bbox.pages.length;
  const allLines = bbox.pages.flatMap((page, pageIndex) => page.lines.map(line => ({ ...line, pageIndex })));
  /** @type {number[]} */
  const gaps = [];
  for (const page of bbox.pages) {
    const ys = [...new Set(page.lines.map(line => Math.round(line.yMin * 100) / 100))].sort((left, right) => left - right);
    for (let index = 1; index < ys.length; index += 1) {
      const gap = ys[index] - ys[index - 1];
      if (gap > 1) gaps.push(gap);
    }
  }
  let referenceLineIndex = allLines.findIndex(line => /^references\s*$/i.test(line.text.trim()));
  if (referenceLineIndex < 0) {
    referenceLineIndex = allLines.findIndex(line => /^references\b/i.test(line.text.trim()));
  }
  const referenceStartPage = referenceLineIndex >= 0 ? allLines[referenceLineIndex].pageIndex : null;
  const referenceLines = referenceLineIndex >= 0 ? allLines.slice(referenceLineIndex + 1) : [];
  /** @type {Array<{label:string,labelX:number,continuationX:number|null}>} */
  const hanging = [];
  for (let index = 0; index < referenceLines.length; index += 1) {
    const line = referenceLines[index];
    const label = line.text.match(/^\[(\d+)\]/);
    if (!label) continue;
    const next = referenceLines[index + 1];
    // A following label starts the next entry, not a continuation line.
    const continuationX = next && !/^\[\d+\]/.test(next.text) ? next.xMin : null;
    hanging.push({
      label: label[1],
      labelX: line.xMin,
      continuationX,
    });
  }
  const hangingViolations = hanging.filter(item => item.continuationX !== null && item.continuationX <= item.labelX + 1);
  const labelXs = hanging.map(item => Math.round(item.labelX * 10) / 10);
  const sortedGaps = [...gaps].sort((left, right) => left - right);
  const gapAt = fraction => (sortedGaps.length
    ? sortedGaps[Math.min(sortedGaps.length - 1, Math.floor(sortedGaps.length * fraction))]
    : null);
  return {
    pages,
    totalLines: allLines.length,
    pageLineCounts: bbox.pages.map(page => page.lines.length),
    medianLineGap: median(gaps),
    minLineGap: sortedGaps.length ? sortedGaps[0] : null,
    lineGapP25: gapAt(0.25),
    lineGapSamples: gaps.length,
    referenceStartPage,
    referenceLineCount: referenceLines.length,
    hangingIndentSamples: hanging.length,
    hangingIndentViolations: hangingViolations.length,
    referenceLabelXs: [...new Set(labelXs)],
  };
}

/**
 * Compare two layout metric objects.
 *
 * @param {ReturnType<typeof analyzeLayout>} left
 * @param {ReturnType<typeof analyzeLayout>} right
 * @param {{gapTolerance?:number, mode?:'same'|'compatible'}} [options]
 */
export function compareLayout(left, right, options = {}) {
  const gapTolerance = Number.isFinite(options.gapTolerance) ? Number(options.gapTolerance) : 1;
  const mode = options.mode ?? 'same';
  const pageCountSame = left.pages === right.pages;
  // Body line spacing is best represented by the smallest line gap: larger
  // gaps are paragraph/item separation and legitimately change when entries
  // are added or removed.
  const gapDelta = left.minLineGap !== null && right.minLineGap !== null
    ? Math.abs(left.minLineGap - right.minLineGap)
    : null;
  const referencePageSame = left.referenceStartPage === right.referenceStartPage;
  const hangingOk = left.hangingIndentSamples > 0
    && right.hangingIndentSamples > 0
    && left.hangingIndentViolations === 0
    && right.hangingIndentViolations === 0;
  const compatible = hangingOk && (gapDelta === null || gapDelta <= gapTolerance);
  const same = compatible && pageCountSame && referencePageSame;
  return {
    mode,
    pageCountSame,
    gapDelta,
    referencePageSame,
    hangingOk,
    sameStructure: mode === 'same' ? same : compatible,
    left,
    right,
  };
}

/**
 * Compare rendered page images.
 * @param {Array<{width:number,height:number,data:Uint8Array}>} leftPages
 * @param {Array<{width:number,height:number,data:Uint8Array}>} rightPages
 * @param {{threshold?:number}} [options]
 */
export function comparePageImages(leftPages, rightPages, options = {}) {
  const pages = Math.max(leftPages.length, rightPages.length);
  const pageResults = [];
  let changedPixels = 0;
  let totalPixels = 0;
  let maxRatio = 0;
  for (let index = 0; index < pages; index += 1) {
    const left = leftPages[index];
    const right = rightPages[index];
    if (!left || !right) {
      pageResults.push({ page: index + 1, missingSide: !left ? 'left' : 'right' });
      continue;
    }
    const comparison = compareImages(left, right, options);
    pageResults.push({ page: index + 1, ...comparison });
    if (comparison.sameSize) {
      changedPixels += comparison.changed ?? 0;
      totalPixels += comparison.pixels ?? 0;
      maxRatio = Math.max(maxRatio, comparison.ratio ?? 0);
    }
  }
  return {
    pageCount: [leftPages.length, rightPages.length],
    pageCountSame: leftPages.length === rightPages.length,
    pages: pageResults,
    changedPixels,
    totalPixels,
    overallRatio: totalPixels ? changedPixels / totalPixels : null,
    maxPageRatio: maxRatio,
    identical: leftPages.length === rightPages.length && changedPixels === 0 && pageResults.every(page => !page.missingSide && page.sameSize),
  };
}
