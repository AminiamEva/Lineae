/**
 * Optional helpers for the `.tex` side of citations.
 *
 * These functions are read-only text analysis: they locate `\cite` family
 * commands, bibliography resources and key tokens so the main program can
 * decide what to do. The engine never edits `.tex` files on its own; it only
 * returns a rename plan (`applyCitationRenames`) with exact offsets replaced.
 *
 * @module bib/tex-citations
 */

import { BibError, CODES } from './diagnostics.mjs';
import { isBibDocument, validateKey } from './model.mjs';

/**
 * @typedef {{key:string, start:number, end:number}} CitationKey
 * @typedef {{command:string, start:number, end:number, keys:CitationKey[]}} Citation
 * @typedef {{command:string, path:string, start:number, end:number}} Resource
 */

/**
 * Replace LaTeX comments with spaces while preserving offsets and newlines.
 * A `%` preceded by an odd number of backslashes is escaped and kept.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripTexComments(source) {
  const characters = source.split('');
  let index = 0;
  while (index < characters.length) {
    if (characters[index] === '%' && !isEscaped(source, index)) {
      let cursor = index;
      while (cursor < characters.length && source[cursor] !== '\n' && source[cursor] !== '\r') {
        characters[cursor] = ' ';
        cursor += 1;
      }
      index = cursor;
      continue;
    }
    index += 1;
  }
  return characters.join('');
}

/** @param {string} source @param {number} index */
function isEscaped(source, index) {
  let backslashes = 0;
  let cursor = index - 1;
  while (cursor >= 0 && source[cursor] === '\\') {
    backslashes += 1;
    cursor -= 1;
  }
  return backslashes % 2 === 1;
}

/**
 * Find the matching closing delimiter, skipping backslash-escaped characters.
 *
 * @param {string} source
 * @param {number} openIndex index of the opening delimiter
 * @param {string} open
 * @param {string} close
 * @returns {number} index just after the closing delimiter, or -1
 */
function findBalanced(source, openIndex, open, close) {
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return -1;
}

/**
 * Split a citation group such as `a, b , c` into key tokens with absolute
 * offsets. Commas inside braces do not split.
 *
 * @param {string} source
 * @param {number} contentStart
 * @param {number} contentEnd
 * @returns {CitationKey[]}
 */
function splitKeys(source, contentStart, contentEnd) {
  /** @type {CitationKey[]} */
  const keys = [];
  let segmentStart = contentStart;
  let depth = 0;
  for (let index = contentStart; index <= contentEnd; index += 1) {
    const char = index < contentEnd ? source[index] : ',';
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      const raw = source.slice(segmentStart, index);
      const leading = raw.match(/^\s*/)?.[0].length ?? 0;
      const trailing = raw.match(/\s*$/)?.[0].length ?? 0;
      const key = raw.trim();
      if (key) {
        keys.push({
          key,
          start: segmentStart + leading,
          end: index - trailing,
        });
      }
      segmentStart = index + 1;
    }
  }
  return keys;
}

const CITATION_COMMAND = /\\([A-Za-z]*cite[A-Za-z]*)(\*?)(?![A-Za-z])/g;
const BIBLIOGRAPHY_COMMAND = /\\bibliography\s*\{([^{}]*)\}/g;
const STYLE_COMMAND = /\\bibliographystyle\s*\{([^{}]*)\}/g;
const RESOURCE_COMMAND = /\\(addbibresource|addglobalbib|addsectionbib)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g;
const PRINT_COMMAND = /\\printbibliography\b/g;

/**
 * Scan a `.tex` source for citation commands and bibliography declarations.
 *
 * Supported citation commands: any `\...cite...` command (for example `\cite`,
 * `\citep`, `\citet`, `\parencite`, `\textcite`, `\autocite`, `\footcite`,
 * `\nocite`), including starred variants and plural `\cites` forms with
 * several brace groups. Optional `[...]` arguments are skipped.
 *
 * @param {string} texSource
 * @returns {{citations: Citation[], bibliography: Resource[],
 *   bibliographyStyle: {style:string, start:number, end:number}|null,
 *   resources: Resource[], printBibliography: Array<{start:number,end:number}>,
 *   nociteAll: boolean, maskedSource: string}}
 */
export function scanTexCitations(texSource) {
  if (typeof texSource !== 'string') {
    throw new BibError(CODES.INVALID_ARGUMENT, 'TeX source must be a string.');
  }
  const masked = stripTexComments(texSource);
  /** @type {Citation[]} */
  const citations = [];

  CITATION_COMMAND.lastIndex = 0;
  let match;
  while ((match = CITATION_COMMAND.exec(masked))) {
    const command = match[1] + match[2];
    if (command.replace(/\*$/, '').toLowerCase() === 'citestyle') continue;
    const plural = command.replace(/\*$/, '').endsWith('s');
    const commandStart = match.index;
    let cursor = commandStart + match[0].length;
    let commandEnd = cursor;
    /** @type {CitationKey[]} */
    const keys = [];
    while (true) {
      cursor = skipSpaces(masked, cursor);
      if (masked[cursor] === '[') {
        const after = findBalanced(masked, cursor, '[', ']');
        if (after < 0) break;
        cursor = after;
        commandEnd = cursor;
        continue;
      }
      if (masked[cursor] === '{') {
        const after = findBalanced(masked, cursor, '{', '}');
        if (after < 0) break;
        keys.push(...splitKeys(masked, cursor + 1, after - 1));
        cursor = after;
        commandEnd = cursor;
        // Plural commands accept further groups; singular commands stop.
        if (!plural || command === 'nocite') break;
        continue;
      }
      break;
    }
    if (keys.length || commandEnd > commandStart) {
      citations.push({
        command,
        start: commandStart,
        end: commandEnd,
        keys,
      });
    }
  }

  /** @type {Resource[]} */
  const bibliography = [];
  BIBLIOGRAPHY_COMMAND.lastIndex = 0;
  while ((match = BIBLIOGRAPHY_COMMAND.exec(masked))) {
    const contentStart = match.index + match[0].indexOf('{') + 1;
    let searchFrom = 0;
    for (const name of match[1].split(',')) {
      const trimmed = name.trim();
      if (trimmed) {
        const rawIndex = match[1].indexOf(name, searchFrom);
        bibliography.push({
          command: 'bibliography',
          path: trimmed,
          start: contentStart + rawIndex + (name.length - name.trimStart().length),
          end: contentStart + rawIndex + (name.length - name.trimStart().length) + trimmed.length,
        });
      }
      searchFrom += name.length + 1;
    }
  }

  let bibliographyStyle = null;
  STYLE_COMMAND.lastIndex = 0;
  const styleMatch = STYLE_COMMAND.exec(masked);
  if (styleMatch) {
    const brace = styleMatch[0].indexOf('{');
    const start = styleMatch.index + brace + 1;
    bibliographyStyle = { style: styleMatch[1].trim(), start, end: start + styleMatch[1].length };
  }

  /** @type {Resource[]} */
  const resources = [];
  RESOURCE_COMMAND.lastIndex = 0;
  while ((match = RESOURCE_COMMAND.exec(masked))) {
    const optionalEnd = match[0].lastIndexOf(']');
    const brace = match[0].indexOf('{', optionalEnd >= 0 ? optionalEnd + 1 : 0);
    const start = match.index + (brace >= 0 ? brace + 1 : match[0].length);
    resources.push({
      command: match[1],
      path: match[2].trim(),
      start,
      end: start + match[2].length,
    });
  }

  /** @type {Array<{start:number,end:number}>} */
  const printBibliography = [];
  PRINT_COMMAND.lastIndex = 0;
  while ((match = PRINT_COMMAND.exec(masked))) {
    printBibliography.push({ start: match.index, end: match.index + match[0].length });
  }

  const nociteAll = citations.some(citation => citation.command === 'nocite' && citation.keys.some(key => key.key === '*'));
  return { citations, bibliography, bibliographyStyle, resources, printBibliography, nociteAll, maskedSource: masked };
}

/** @param {string} source @param {number} index */
function skipSpaces(source, index) {
  let cursor = index;
  while (cursor < source.length && (source[cursor] === ' ' || source[cursor] === '\t' || source[cursor] === '\n' || source[cursor] === '\r')) {
    cursor += 1;
  }
  return cursor;
}

/**
 * Compare the citation keys used in a `.tex` file with a parsed bibliography.
 *
 * @param {string} texSource
 * @param {import('./model.mjs').BibDocument|{entries:Array<{key:string}>}} bib
 * @returns {{cited:string[], missing:Array<{key:string, command:string, start:number}>,
 *   uncited:string[], nociteAll:boolean, citationCount:number}}
 */
export function checkTexCitations(texSource, bib) {
  const scan = scanTexCitations(texSource);
  /** @type {Set<string>} */
  const available = new Set();
  if (isBibDocument(bib) || (bib && Array.isArray(/** @type {any} */ (bib).entries))) {
    for (const entry of /** @type {any} */ (bib).entries) available.add(entry.key);
  } else {
    throw new BibError(CODES.INVALID_ARGUMENT, 'checkTexCitations expects a BibDocument.');
  }
  const citedSet = new Set();
  const missing = [];
  let citationCount = 0;
  for (const citation of scan.citations) {
    for (const key of citation.keys) {
      citationCount += 1;
      if (key.key === '*') continue;
      citedSet.add(key.key);
      if (!available.has(key.key)) {
        missing.push({ key: key.key, command: citation.command, start: key.start });
      }
    }
  }
  const cited = [...citedSet];
  const uncited = [...available].filter(key => !citedSet.has(key));
  return { cited, missing, uncited, nociteAll: scan.nociteAll, citationCount };
}

/**
 * Build a `.tex` source with citation keys renamed. Only the exact key token
 * ranges found by the scanner are replaced; everything else is untouched.
 *
 * @param {string} texSource
 * @param {Record<string,string>|Map<string,string>} renames old key -> new key
 * @returns {{text:string, replaced:Array<{oldKey:string,newKey:string,start:number,end:number}>,
 *   unresolved:string[], count:number}}
 */
export function applyCitationRenames(texSource, renames) {
  if (typeof texSource !== 'string') {
    throw new BibError(CODES.INVALID_ARGUMENT, 'TeX source must be a string.');
  }
  const mapping = renames instanceof Map ? renames : new Map(Object.entries(renames ?? {}));
  for (const [oldKey, newKey] of mapping) {
    if (typeof newKey !== 'string' || !newKey) {
      throw new BibError(CODES.INVALID_ARGUMENT, `Invalid replacement key for "${oldKey}".`, {
        oldKey,
        newKey,
      });
    }
    const check = validateKey(newKey);
    if (!check.ok) {
      throw new BibError(CODES.INVALID_ARGUMENT, `Replacement key "${newKey}" for "${oldKey}" is not a valid citation key.`, {
        oldKey,
        newKey,
        reason: check.reason,
        match: check.match,
      });
    }
  }
  const scan = scanTexCitations(texSource);
  const replacements = [];
  const used = new Set();
  for (const citation of scan.citations) {
    for (const key of citation.keys) {
      if (!mapping.has(key.key)) continue;
      const newKey = mapping.get(key.key);
      if (typeof newKey !== 'string' || !newKey) {
        throw new BibError(CODES.INVALID_ARGUMENT, `Invalid replacement key for "${key.key}".`);
      }
      replacements.push({ oldKey: key.key, newKey, start: key.start, end: key.end });
      used.add(key.key);
    }
  }
  replacements.sort((left, right) => right.start - left.start);
  let text = texSource;
  for (const replacement of replacements) {
    text = text.slice(0, replacement.start) + replacement.newKey + text.slice(replacement.end);
  }
  const unresolved = [...mapping.keys()].filter(key => !used.has(key));
  return {
    text,
    replaced: replacements.reverse(),
    unresolved,
    count: replacements.length,
  };
}
