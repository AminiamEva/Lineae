/**
 * BibTeX serializer.
 *
 * The serializer is deliberately conservative:
 * - An untouched document is returned byte-for-byte (BOM, line endings,
 *   comments, whitespace and unknown content included).
 * - Only entries marked `dirty` are regenerated; untouched fields inside a
 *   dirty entry keep their original source slice.
 * - Field text is never escaped or normalised. It is written verbatim inside
 *   the chosen delimiter; unbalanced braces or control characters are refused
 *   with a `BibError` instead of being silently "fixed".
 *
 * @module bib/serializer
 */

import { BibError, CODES, hasErrors } from './diagnostics.mjs';
import {
  assertBibDocument,
  checkBalancedBraces,
  hasUnsafeControlCharacters,
} from './model.mjs';
import { parseBibSource } from './parser.mjs';

/**
 * @typedef {import('./model.mjs').BibDocument} BibDocument
 * @typedef {import('./model.mjs').BibEntry} BibEntry
 * @typedef {import('./model.mjs').BibField} BibField
 * @typedef {import('./model.mjs').BibValue} BibValue
 */

/**
 * Serialize a document back to BibTeX text.
 *
 * @param {BibDocument} document
 * @param {{
 *   eol?: 'preserve'|'lf'|'crlf',
 *   bom?: 'preserve'|'never',
 *   finalNewline?: 'preserve'|'ensure'|'none',
 *   preserveFormatting?: boolean,
 *   verify?: boolean|'auto'
 * }} [options]
 * @returns {string}
 */
export function serializeBib(document, options = {}) {
  const doc = assertBibDocument(document);
  const settings = options ?? {};
  const eolOption = settings.eol ?? 'preserve';
  if (!['preserve', 'lf', 'crlf'].includes(eolOption)) {
    throw new BibError(CODES.INVALID_ARGUMENT, `Unsupported eol option: ${eolOption}`);
  }
  if (settings.bom !== undefined && !['preserve', 'never'].includes(settings.bom)) {
    throw new BibError(CODES.INVALID_ARGUMENT, `Unsupported bom option: ${settings.bom}`);
  }
  if (settings.finalNewline !== undefined && !['preserve', 'ensure', 'none'].includes(settings.finalNewline)) {
    throw new BibError(CODES.INVALID_ARGUMENT, `Unsupported finalNewline option: ${settings.finalNewline}`);
  }
  if (settings.preserveFormatting !== undefined && typeof settings.preserveFormatting !== 'boolean') {
    throw new BibError(CODES.INVALID_ARGUMENT, 'preserveFormatting must be a boolean.');
  }
  if (settings.verify !== undefined && settings.verify !== true && settings.verify !== false && settings.verify !== 'auto') {
    throw new BibError(CODES.INVALID_ARGUMENT, `Unsupported verify option: ${settings.verify}`);
  }
  const eol = eolOption === 'lf' ? '\n' : eolOption === 'crlf' ? '\r\n' : doc.source.eol;
  const preserveFormatting = settings.preserveFormatting !== false;

  let body;
  if (!doc.dirty && preserveFormatting) {
    body = doc.source.text;
  } else {
    body = serializeBlocks(doc, eol, preserveFormatting);
  }

  if (eolOption !== 'preserve' && eol !== doc.source.eol) {
    body = normalizeEol(body, eol);
  }

  if (settings.finalNewline === 'ensure') {
    if (body.length > 0 && !body.endsWith('\n') && !body.endsWith('\r')) body += eol;
  } else if (settings.finalNewline === 'none') {
    body = body.replace(/(\r\n|\n|\r)$/, '');
  }

  const bom = settings.bom === 'never' ? '' : doc.source.bom;
  const output = bom + body;

  const shouldVerify =
    settings.verify === true ||
    (settings.verify !== false && doc.dirty && doc.stats.errorCount === 0);
  if (shouldVerify) {
    const reparsed = parseBibSource(body, { filename: doc.source.filename ?? undefined });
    if (hasErrors(reparsed.diagnostics)) {
      throw new BibError(
        CODES.SERIALIZED_OUTPUT_INVALID,
        'Serialized BibTeX failed to re-parse cleanly; refusing to return it.',
        { diagnostics: reparsed.diagnostics },
      );
    }
  }
  return output;
}

/**
 * @param {string} text
 * @param {string} eol
 */
export function normalizeEol(text, eol) {
  return text.replace(/\r\n|\r|\n/g, '\n').replace(/\n/g, eol);
}

/**
 * @param {BibDocument} document
 * @param {string} eol
 * @param {boolean} preserveFormatting
 */
function serializeBlocks(document, eol, preserveFormatting) {
  /** @type {Map<string, BibEntry>} */
  const entryById = new Map(document.entries.map(entry => [entry.id, entry]));
  const parts = [];
  for (const block of document.blocks) {
    if (block.kind === 'entry') {
      const entry = entryById.get(block.entryId);
      if (!entry) {
        throw new BibError(
          CODES.INVALID_DOCUMENT,
          `Document block references missing entry "${block.entryId}".`,
          { entryId: block.entryId },
        );
      }
      const prefix = block.prefix ?? '';
      parts.push(prefix + (entry.dirty || !preserveFormatting
        ? formatEntry(entry, document, eol)
        : document.source.text.slice(entry.start, entry.end)));
      continue;
    }
    parts.push(document.source.text.slice(block.start, block.end));
  }
  return parts.join('');
}

/**
 * Regenerate a single entry using the formatting template captured at parse
 * time (delimiter, indentation, `=` spacing, trailing comma).
 *
 * @param {BibEntry} entry
 * @param {BibDocument} document
 * @param {string} eol
 */
export function formatEntry(entry, document, eol = document.source.eol) {
  const format = entry.format ?? {};
  const delimiter = format.delimiter === '(' ? '(' : '{';
  const close = delimiter === '(' ? ')' : '}';
  const type = entry.typeRaw || entry.type;
  const key = entry.keyRaw || entry.key;
  const multiline = format.multiline !== false;
  const indent = format.indent ?? '  ';
  const equals = format.equals ?? ' = ';
  const trailingComma = format.trailingComma !== false;
  const closeIndent = format.closeIndent ?? '';

  /** @type {string[]} */
  const fields = entry.fields.map(field => formatField(field, entry, equals, document));
  const header = `@${type}${delimiter}${key}`;

  if (fields.length === 0) {
    return header + (trailingComma ? ',' : '') + close;
  }
  if (multiline) {
    return (
      header +
      ',' +
      eol +
      indent +
      fields.join(',' + eol + indent) +
      (trailingComma ? ',' : '') +
      eol +
      closeIndent +
      close
    );
  }
  return header + ', ' + fields.join(', ') + (trailingComma ? ',' : '') + close;
}

/**
 * @param {BibField} field
 * @param {BibEntry} entry
 * @param {string} equals
 * @param {BibDocument} document
 */
function formatField(field, entry, equals, document) {
  if (field.unparsed) {
    return field.raw || `${field.nameRaw || field.name}${equals}{}`;
  }
  if (!field.dirty && field.raw) return field.raw;
  const name = field.nameRaw || field.name;
  const gap = typeof field.equalsSpacing === 'string' && /^[ \t]*=[ \t]*$/.test(field.equalsSpacing)
    ? field.equalsSpacing
    : equals;
  return name + gap + formatValue(field.value, entry, field.name);
}

/**
 * @param {BibValue|null} value
 * @param {BibEntry} entry
 * @param {string} fieldName
 */
function formatValue(value, entry, fieldName) {
  if (!value || !Array.isArray(value.parts) || value.parts.length === 0) return '{}';
  return value.parts.map(part => formatPart(part, entry, fieldName)).join(' # ');
}

/**
 * @param {import('./model.mjs').ValuePart} part
 * @param {BibEntry} entry
 * @param {string} fieldName
 */
function formatPart(part, entry, fieldName) {
  if (part.kind === 'braced' || part.kind === 'quoted') {
    assertSafeText(part.value, entry, fieldName);
    if (part.kind === 'braced') return `{${part.value}}`;
    if (containsTopLevelQuote(part.value)) return `{${part.value}}`;
    return `"${part.value}"`;
  }
  if (part.kind === 'number') {
    assertSafeText(part.value, entry, fieldName);
    return /^\d+$/.test(part.value) ? part.value : `{${part.value}}`;
  }
  if (part.kind === 'macro') {
    return part.nameRaw ?? part.name ?? '';
  }
  return '{}';
}

/**
 * @param {string} text
 * @param {BibEntry} entry
 * @param {string} fieldName
 */
function assertSafeText(text, entry, fieldName) {
  if (hasUnsafeControlCharacters(text)) {
    throw new BibError(
      CODES.UNSAFE_FIELD_VALUE,
      `Field "${fieldName}" of "${entry.key}" contains a control character.`,
      { entryKey: entry.key, fieldName },
    );
  }
  const balance = checkBalancedBraces(text);
  if (!balance.ok) {
    throw new BibError(
      CODES.UNSAFE_FIELD_VALUE,
      `Field "${fieldName}" of "${entry.key}" has unbalanced braces; refusing to serialize.`,
      { entryKey: entry.key, fieldName, index: balance.index },
    );
  }
}

/** @param {string} text */
function containsTopLevelQuote(text) {
  let depth = 0;
  for (const char of text) {
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
    else if (char === '"' && depth === 0) return true;
  }
  return false;
}
