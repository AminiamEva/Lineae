/**
 * Lineae Bib backend engine — public entry point.
 *
 * Everything the main application needs is exported here. Internal modules
 * (`lexer.mjs`, `parser.mjs`, `model.mjs`, `serializer.mjs`, `validator.mjs`,
 * `editor.mjs`, `tex-citations.mjs`) are implementation details and may change.
 *
 * The engine is dependency-free, DOM-free and Node-free: the same ES module
 * runs in the browser and in Node.js.
 *
 * @module bib
 */

import {
  BibError,
  BibEditorError,
  BibParseError,
  CODES,
  SEVERITY,
  formatDiagnostic,
} from './diagnostics.mjs';
import { parseBibSource } from './parser.mjs';
import { serializeBib } from './serializer.mjs';
import { preflightBib } from './preflight.mjs';
import { validateBib } from './validator.mjs';
import { BibEditor, createBibEditor } from './editor.mjs';
import {
  applyCitationRenames,
  checkTexCitations,
  scanTexCitations,
} from './tex-citations.mjs';
import {
  MODEL_VERSION,
  getEntryField,
  macroScopeAt,
  resolveEntryValues,
  resolveField,
  resolveValue,
} from './model.mjs';

/** @typedef {import('./model.mjs').BibDocument} BibDocument */
/** @typedef {import('./model.mjs').BibEntry} BibEntry */
/** @typedef {import('./model.mjs').BibField} BibField */
/** @typedef {import('./model.mjs').BibValue} BibValue */
/** @typedef {import('./diagnostics.mjs').Diagnostic} Diagnostic */

/**
 * Parse BibTeX source.
 *
 * Data errors are reported as `document.diagnostics`; this function only throws
 * for invalid arguments or when `throwOnError` is requested.
 *
 * @param {string} source
 * @param {{filename?: string|null, maxDiagnostics?: number, throwOnError?: boolean}} [options]
 * @returns {BibDocument}
 * @throws {BibError|BibParseError}
 */
export function parseBib(source, options = {}) {
  if (typeof source !== 'string') {
    throw new BibError(CODES.INVALID_SOURCE, 'parseBib() expects a string.', {
      received: typeof source,
    });
  }
  const document = parseBibSource(source, options);
  if (options.throwOnError) {
    const errors = document.diagnostics.filter(diagnostic => diagnostic.severity === SEVERITY.ERROR);
    if (errors.length) {
      throw new BibParseError(
        `BibTeX source has ${errors.length} syntax error(s).`,
        errors,
        { filename: document.source.filename },
      );
    }
  }
  return document;
}

/**
 * Parse a browser `File`/`Blob` (strict UTF-8). Node.js callers should read the
 * file with `fs.readFile` and call `parseBib`.
 *
 * @param {Blob & {name?: string}} file
 * @param {{filename?: string|null, maxDiagnostics?: number, throwOnError?: boolean}} [options]
 * @returns {Promise<BibDocument>}
 * @throws {BibError}
 */
export async function parseBibFile(file, options = {}) {
  if (!file || typeof file !== 'object' || typeof (/** @type {any} */ (file).arrayBuffer) !== 'function') {
    throw new BibError(CODES.INVALID_FILE, 'parseBibFile() expects a File or Blob.');
  }
  const buffer = await file.arrayBuffer();
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new BibError(CODES.INVALID_ENCODING, 'The bibliography file is not valid UTF-8.', {
      filename: options.filename ?? /** @type {any} */ (file).name ?? null,
    });
  }
  return parseBib(text, {
    ...options,
    filename: options.filename ?? /** @type {any} */ (file).name ?? null,
  });
}

/**
 * Serialize a document back to BibTeX. An untouched document is returned
 * byte-for-byte; edited entries are regenerated with a minimal diff.
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
export { serializeBib, validateBib, createBibEditor, BibEditor, scanTexCitations, checkTexCitations, applyCitationRenames, preflightBib };

/**
 * Resolved (macro-expanded) text of one field, or null.
 *
 * @param {BibEntry} entry
 * @param {string} fieldName
 * @param {BibDocument} document
 * @returns {string|null}
 */
export function getEntryValue(entry, fieldName, document) {
  if (!entry || !document) return null;
  return resolveField(entry, fieldName, document);
}

/**
 * Resolved view of an entry: `{key, type, fields, unresolved}`.
 *
 * @param {BibEntry} entry
 * @param {BibDocument} document
 * @returns {{key:string, type:string, fields:Record<string,string>,
 *   unresolved:Array<{name:string, reason:'undefined'|'cycle', field:string}>}}
 */
export function resolveEntry(entry, document) {
  return resolveEntryValues(entry, document);
}

/** Raw, unresolved value object of a field (for advanced UI editing). */
export { getEntryField, macroScopeAt, resolveValue, formatDiagnostic };

/** Stable diagnostic codes. */
export const DIAGNOSTIC_CODES = CODES;
export { SEVERITY, MODEL_VERSION };
export { BibError, BibEditorError, BibParseError };
