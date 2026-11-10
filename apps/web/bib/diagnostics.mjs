/**
 * Diagnostics, source locations and error types for the Lineae Bib engine.
 *
 * This module is environment agnostic: no DOM, no Node APIs, no side effects.
 *
 * @module bib/diagnostics
 */

/**
 * @typedef {'error'|'warning'|'info'} Severity
 */

/** @type {{ERROR: 'error', WARNING: 'warning', INFO: 'info'}} */
export const SEVERITY = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
});

/**
 * Stable diagnostic codes. Codes never change meaning once released.
 *
 * Lexer 100-199, parser 110-199 overlap is avoided: lexer 101-109,
 * parser 111-129, semantic validation 201-229, serializer 301-309,
 * editor 401-419, public input 501-509.
 */
export const CODES = Object.freeze({
  // Lexer
  UNEXPECTED_CHARACTER: 'BIB101',
  UNTERMINATED_BRACED_VALUE: 'BIB102',
  UNTERMINATED_QUOTED_VALUE: 'BIB103',
  UNTERMINATED_COMMENT: 'BIB104',
  UNTERMINATED_COMMAND: 'BIB105',
  MALFORMED_COMMAND: 'BIB106',
  WHITESPACE_AFTER_AT: 'BIB107',
  PERCENT_IN_ENTRY: 'BIB108',
  UNBALANCED_BRACE_IN_QUOTED: 'BIB109',

  // Parser
  MISSING_KEY: 'BIB111',
  INVALID_KEY: 'BIB112',
  MISSING_EQUALS: 'BIB113',
  MISSING_VALUE: 'BIB114',
  MISSING_COMMA: 'BIB115',
  DUPLICATE_FIELD: 'BIB116',
  DUPLICATE_KEY: 'BIB117',
  UNEXPECTED_TOKEN: 'BIB118',
  EMPTY_ENTRY: 'BIB119',
  INVALID_ENTRY_TYPE: 'BIB120',
  INVALID_FIELD_NAME: 'BIB121',
  BROKEN_COMMAND: 'BIB122',
  STRING_REDEFINITION: 'BIB123',
  DANGLING_CONCATENATION: 'BIB124',

  // Semantic validation
  UNDEFINED_MACRO: 'BIB201',
  MACRO_CYCLE: 'BIB202',
  UNKNOWN_ENTRY_TYPE: 'BIB203',
  MISSING_REQUIRED_FIELD: 'BIB204',
  MISSING_REFERENCE_TARGET: 'BIB205',
  EMPTY_KEY: 'BIB206',
  STRAY_TEXT: 'BIB207',
  CONFERENCE_ALIAS: 'BIB208',
  MONTH_STYLE_FIELD: 'BIB209',
  INVALID_KEY_SYNTAX: 'BIB210',

  // Serializer
  UNSAFE_FIELD_VALUE: 'BIB301',
  SERIALIZED_OUTPUT_INVALID: 'BIB302',
  INVALID_DOCUMENT: 'BIB303',

  // Editor
  ENTRY_NOT_FOUND: 'BIB401',
  EDITOR_DUPLICATE_KEY: 'BIB402',
  EDITOR_INVALID_KEY: 'BIB403',
  EDITOR_INVALID_ENTRY: 'BIB404',
  EDITOR_INVALID_FIELD: 'BIB405',
  EDITOR_DESTROYED: 'BIB406',
  EDITOR_BATCH_FAILED: 'BIB407',
  EDITOR_INVALID_ARGUMENT: 'BIB408',
  AMBIGUOUS_KEY: 'BIB409',

  // Public input
  INVALID_SOURCE: 'BIB501',
  INVALID_ENCODING: 'BIB502',
  INVALID_FILE: 'BIB503',
  INVALID_ARGUMENT: 'BIB504',
});

/**
 * An error thrown for misuse (wrong types, destroyed editor, unsafe
 * serialization). Data problems inside a `.bib` file are reported as
 * diagnostics instead, never thrown by default.
 */
export class BibError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BibError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

/** Error thrown when `parseBib(..., { throwOnError: true })` meets syntax errors. */
export class BibParseError extends BibError {
  /**
   * @param {string} message
   * @param {import('./diagnostics.mjs').Diagnostic[]} diagnostics
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, diagnostics, details = {}) {
    super('BIB_PARSE', message, { ...details, diagnostics });
    this.name = 'BibParseError';
    this.diagnostics = diagnostics;
  }
}

/** Error thrown for editor lifecycle or programming errors. */
export class BibEditorError extends BibError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'BibEditorError';
  }
}

/**
 * @typedef {{offset: number, line: number, column: number}} Position
 * @typedef {{start: Position, end: Position}} DiagnosticLocation
 * @typedef {{
 *   code: string,
 *   severity: Severity,
 *   message: string,
 *   source: string,
 *   entryKey: string|null,
 *   fieldName: string|null,
 *   hint: string|null,
 *   related: Array<{message: string, location: DiagnosticLocation}>|null,
 *   location: DiagnosticLocation
 * }} Diagnostic
 */

/**
 * Build a line/column locator for a source string. Positions are 1-based;
 * offsets are 0-based and point between characters (as `String#slice`).
 *
 * @param {string} text
 * @returns {{lineStarts: number[], locationAt(offset: number): Position}}
 */
export function createLocator(text) {
  /** @type {number[]} */
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    if (char === 10) lineStarts.push(index + 1);
    else if (char === 13) {
      if (text.charCodeAt(index + 1) === 10) index += 1;
      lineStarts.push(index + 1);
    }
  }
  return {
    lineStarts,
    locationAt(offset) {
      const clamped = Math.max(0, Math.min(Number(offset) || 0, text.length));
      let low = 0;
      let high = lineStarts.length - 1;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (lineStarts[middle] <= clamped) low = middle;
        else high = middle - 1;
      }
      return { offset: clamped, line: low + 1, column: clamped - lineStarts[low] + 1 };
    },
  };
}

/**
 * Create a diagnostic. `start`/`end` are offsets into the source.
 *
 * @param {{
 *   code: string,
 *   severity: Severity,
 *   message: string,
 *   start?: number,
 *   end?: number,
 *   source?: string,
 *   entryKey?: string|null,
 *   fieldName?: string|null,
 *   hint?: string|null,
 *   related?: Array<{message: string, start: number, end: number}>|null
 * }} input
 * @param {{locationAt(offset: number): Position}|null} [locator]
 * @returns {Diagnostic}
 */
export function createDiagnostic(input, locator = null) {
  const start = Number.isFinite(input.start) ? Number(input.start) : 0;
  const end = Number.isFinite(input.end) ? Number(input.end) : start;
  const location = locator
    ? { start: locator.locationAt(start), end: locator.locationAt(end) }
    : {
        start: { offset: start, line: 0, column: 0 },
        end: { offset: end, line: 0, column: 0 },
      };
  const related = Array.isArray(input.related)
    ? input.related.map(entry => ({
        message: entry.message,
        location: locator
          ? { start: locator.locationAt(entry.start), end: locator.locationAt(entry.end) }
          : {
              start: { offset: entry.start, line: 0, column: 0 },
              end: { offset: entry.end, line: 0, column: 0 },
            },
      }))
    : null;
  return {
    code: input.code,
    severity: input.severity,
    message: input.message,
    source: input.source ?? 'parser',
    entryKey: input.entryKey ?? null,
    fieldName: input.fieldName ?? null,
    hint: input.hint ?? null,
    related,
    location,
  };
}

/**
 * @param {Diagnostic[]} diagnostics
 * @returns {{error: number, warning: number, info: number, total: number}}
 */
export function countSeverities(diagnostics) {
  const counts = { error: 0, warning: 0, info: 0, total: 0 };
  for (const diagnostic of diagnostics) {
    const key = diagnostic.severity;
    if (key in counts) counts[key] += 1;
    counts.total += 1;
  }
  return counts;
}

/**
 * @param {Diagnostic[]} diagnostics
 * @returns {boolean}
 */
export function hasErrors(diagnostics) {
  return diagnostics.some(diagnostic => diagnostic.severity === SEVERITY.ERROR);
}

/**
 * Stable sort by source offset, then by code.
 *
 * @param {Diagnostic[]} diagnostics
 * @returns {Diagnostic[]}
 */
export function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort((left, right) => {
    const offset = left.location.start.offset - right.location.start.offset;
    if (offset !== 0) return offset;
    return left.code.localeCompare(right.code);
  });
}

/**
 * Render a diagnostic with its source line and a caret. Useful in CLI tools
 * and test failure messages; the UI may render `diagnostic` fields directly.
 *
 * @param {Diagnostic} diagnostic
 * @param {string} [sourceText]
 * @returns {string}
 */
export function formatDiagnostic(diagnostic, sourceText = '') {
  const position = diagnostic.location.start;
  const header = `${diagnostic.severity} ${diagnostic.code} at ${position.line}:${position.column}: ${diagnostic.message}`;
  if (!sourceText) return header;
  const lines = sourceText.split(/\r\n|\n|\r/);
  const line = lines[position.line - 1];
  if (line === undefined) return header;
  const gutter = String(position.line);
  const caretPad = ' '.repeat(gutter.length + 3 + Math.max(0, position.column - 1));
  return `${header}\n${gutter} | ${line}\n${caretPad}^`;
}
