/**
 * BibTeX parser. Consumes the token stream from `lexer.mjs` and builds a
 * lossless `BibDocument`.
 *
 * Design goals:
 * - Every byte of the input is covered by exactly one block, so an untouched
 *   document serializes back to the exact original text.
 * - A malformed entry never discards the rest of the database; recovery keeps
 *   the original bytes inside a `broken` block when no structure can be built.
 * - Field values keep their original delimiters and raw text. Macro expansion
 *   is a read-only operation performed by `model.mjs`.
 *
 * @module bib/parser
 */

import { tokenize } from './lexer.mjs';
import {
  CODES,
  SEVERITY,
  countSeverities,
  createDiagnostic,
  sortDiagnostics,
} from './diagnostics.mjs';
import { deepFreeze } from './model.mjs';

/** @typedef {import('./lexer.mjs').Token} Token */
/** @typedef {import('./model.mjs').BibDocument} BibDocument */

/** Default layout for a newly created entry. */
export function defaultEntryFormat(delimiter = '{') {
  return {
    delimiter,
    multiline: true,
    indent: '  ',
    equals: ' = ',
    trailingComma: true,
    closeIndent: '',
  };
}

/**
 * Parse a `.bib` string into a `BibDocument`.
 *
 * @param {string} source
 * @param {{filename?: string|null, maxDiagnostics?: number}} [options]
 * @returns {BibDocument}
 */
export function parseBibSource(source, options = {}) {
  const hadBom = source.charCodeAt(0) === 0xfeff;
  // The BOM is kept aside so every offset indexes the same string that blocks
  // slice from. `serializeBib` puts it back.
  if (hadBom) source = source.slice(1);
  const lexed = tokenize(source, options);
  const { tokens, locator } = lexed;
  /** @type {import('./diagnostics.mjs').Diagnostic[]} */
  const diagnostics = [...lexed.diagnostics];
  const maxDiagnostics = Number.isFinite(options.maxDiagnostics) ? Number(options.maxDiagnostics) : Infinity;

  /** @type {BibDocument['blocks']} */
  const blocks = [];
  /** @type {BibDocument['entries']} */
  const entries = [];
  /** @type {BibDocument['strings']} */
  const strings = [];
  /** @type {BibDocument['preambles']} */
  const preambles = [];

  let cursor = 0;
  let entrySequence = 0;
  let stringSequence = 0;
  let preambleSequence = 0;

  const peek = () => tokens[cursor];
  const advance = () => tokens[cursor++];

  /**
   * @param {string} code
   * @param {import('./diagnostics.mjs').Severity} severity
   * @param {string} message
   * @param {number} start
   * @param {number} end
   * @param {Record<string, unknown>} [extra]
   */
  function report(code, severity, message, start, end, extra = {}) {
    if (diagnostics.length >= maxDiagnostics) return;
    diagnostics.push(
      createDiagnostic(
        { code, severity, message, start, end, source: 'parser', ...extra },
        locator,
      ),
    );
  }

  /** Consume tokens until (and including) the next close delimiter or EOF. */
  function skipToClose() {
    let end = source.length;
    while (true) {
      const token = peek();
      if (!token || token.type === 'eof') {
        end = source.length;
        break;
      }
      cursor += 1;
      if (token.type === 'close') {
        end = token.end;
        break;
      }
    }
    return end;
  }

  /** Consume tokens until the next comma / close / EOF without consuming it. */
  function syncToBoundary() {
    while (true) {
      const token = peek();
      if (!token || token.type === 'eof' || token.type === 'comma' || token.type === 'close') return;
      cursor += 1;
    }
  }

  /** @param {Token} token */
  function partFromToken(token) {
    if (token.type === 'braced' || token.type === 'quoted') {
      return {
        kind: token.type,
        raw: token.raw,
        value: token.value,
        start: token.start,
        end: token.end,
      };
    }
    if (/^\d+$/.test(token.raw)) {
      return { kind: 'number', raw: token.raw, value: token.raw, start: token.start, end: token.end };
    }
    return {
      kind: 'macro',
      raw: token.raw,
      name: token.raw,
      nameRaw: token.raw,
      start: token.start,
      end: token.end,
    };
  }

  /** @param {Token} token */
  function isValuePart(token) {
    return token.type === 'braced' || token.type === 'quoted' || token.type === 'word';
  }

  /** Parse `{...} # "..." # macro` into a value object, or null. */
  function parseValue() {
    /** @type {Array<Record<string, unknown>>} */
    const parts = [];
    let start = null;
    let end = null;
    while (true) {
      const token = peek();
      if (!isValuePart(token)) break;
      if (start === null) start = token.start;
      parts.push(partFromToken(token));
      end = token.end;
      cursor += 1;
      if (peek().type === 'hash') {
        cursor += 1;
        if (!isValuePart(peek())) {
          report(
            CODES.DANGLING_CONCATENATION,
            SEVERITY.ERROR,
            "'#' is not followed by a value.",
            token.end,
            peek().start,
            { hint: 'Remove the trailing # or add a value after it.' },
          );
          break;
        }
        continue;
      }
      break;
    }
    if (parts.length === 0) return null;
    return {
      kind: parts.length > 1 ? 'concat' : /** @type {string} */ (parts[0].kind),
      parts,
      raw: source.slice(start, end),
      start,
      end,
    };
  }

  /** Parse one `name = value` field starting at the name token. */
  function parseField(entryKey) {
    const nameToken = advance();
    const name = nameToken.raw.toLowerCase();
    /** @type {Record<string, unknown>} */
    const field = {
      name,
      nameRaw: nameToken.raw,
      nameEnd: nameToken.end,
      value: null,
      raw: '',
      start: nameToken.start,
      end: nameToken.end,
      dirty: false,
      duplicate: false,
      unparsed: false,
    };
    if (peek().type !== 'equals') {
      report(
        CODES.MISSING_EQUALS,
        SEVERITY.ERROR,
        `Missing '=' after field name "${nameToken.raw}".`,
        nameToken.start,
        nameToken.end,
        { entryKey, fieldName: name, hint: "BibTeX fields are written 'name = value'." },
      );
      field.unparsed = true;
      field.end = peek().start;
      field.raw = source.slice(field.start, field.end);
      return field;
    }
    cursor += 1;
    const value = parseValue();
    if (!value) {
      report(
        CODES.MISSING_VALUE,
        SEVERITY.ERROR,
        `Field "${nameToken.raw}" has no value.`,
        nameToken.start,
        peek().start,
        { entryKey, fieldName: name, hint: 'Provide a braced, quoted, numeric or macro value.' },
      );
      field.unparsed = true;
      field.end = peek().start;
      field.raw = source.slice(field.start, field.end);
      return field;
    }
    field.value = value;
    field.end = value.end;
    field.raw = source.slice(field.start, field.end);
    const gap = source.slice(nameToken.end, value.start);
    if (/^[ \t]*=[ \t]*$/.test(gap)) field.equalsSpacing = gap;
    const next = peek();
    if (next.type === 'comma') {
      cursor += 1;
    } else if (next.type !== 'close' && next.type !== 'eof') {
      report(
        CODES.MISSING_COMMA,
        SEVERITY.ERROR,
        `Missing ',' after field "${nameToken.raw}".`,
        value.end,
        next.start,
        { entryKey, fieldName: name, hint: 'Separate fields with a comma.' },
      );
    }
    return field;
  }

  /** Infer the layout template used to rewrite an entry when it is edited. */
  function inferFormat(entry, delimiter, closeStart) {
    const raw = entry.raw;
    const multiline = /[\r\n]/.test(raw);
    let indent = '  ';
    const indentMatch = raw.match(/[\r\n]([ \t]+)[^\s]/);
    if (indentMatch) indent = indentMatch[1];
    let equals = ' = ';
    const first = entry.fields.find(field => field.value && !field.unparsed);
    if (first) {
      const gap = source.slice(first.nameEnd, first.value.start);
      if (/^[ \t]*=[ \t]*$/.test(gap)) equals = gap;
    }
    let trailingComma = false;
    let closeIndent = '';
    if (closeStart >= 0) {
      const tail = source.slice(entry.start, closeStart);
      trailingComma = /,[ \t\r\n]*$/.test(tail);
      const closeMatch = tail.match(/[\r\n]([ \t]*)$/);
      if (closeMatch) closeIndent = closeMatch[1];
    }
    return { delimiter, multiline, indent, equals, trailingComma, closeIndent };
  }

  /** Mark duplicate fields (first occurrence wins, as in BibTeX). */
  function markDuplicateFields(entry) {
    const seen = new Set();
    for (const field of entry.fields) {
      if (seen.has(field.name)) {
        field.duplicate = true;
        report(
          CODES.DUPLICATE_FIELD,
          SEVERITY.WARNING,
          `Duplicate field "${field.nameRaw}" in entry "${entry.key}"; BibTeX keeps the first one.`,
          field.start,
          field.end,
          { entryKey: entry.key, fieldName: field.name },
        );
      } else {
        seen.add(field.name);
      }
    }
  }

  /** Parse a normal `@type{key, field = value, ...}` entry. */
  function parseEntry(command) {
    const entry = {
      id: `e${++entrySequence}`,
      type: command.name,
      typeRaw: command.typeRaw,
      key: '',
      keyRaw: '',
      fields: /** @type {any[]} */ ([]),
      raw: '',
      start: command.start,
      end: command.start,
      dirty: false,
      format: defaultEntryFormat(command.delimiter),
    };
    advance(); // command token

    const keyToken = peek();
    if (keyToken.type === 'word') {
      entry.key = keyToken.raw;
      entry.keyRaw = keyToken.raw;
      advance();
    } else if (keyToken.type === 'braced') {
      report(
        CODES.MISSING_KEY,
        SEVERITY.ERROR,
        'Entry key must not be braced.',
        keyToken.start,
        keyToken.end,
        { entryKey: keyToken.value, hint: 'Write @type{key, ...} without braces around the key.' },
      );
      entry.key = keyToken.value;
      entry.keyRaw = keyToken.value;
      advance();
    } else {
      report(
        CODES.MISSING_KEY,
        SEVERITY.ERROR,
        `Entry "@${command.typeRaw}" has no key.`,
        command.start,
        command.end,
        { hint: 'Add a citation key before the first comma.' },
      );
    }

    let closed = false;
    let closeStart = -1;
    let end = source.length;

    const afterKey = peek();
    if (afterKey.type === 'comma') {
      advance();
    } else if (afterKey.type === 'close') {
      closeStart = afterKey.start;
      end = afterKey.end;
      advance();
      closed = true;
    } else if (afterKey.type === 'eof') {
      end = source.length;
    } else {
      report(
        CODES.MISSING_COMMA,
        SEVERITY.ERROR,
        `Missing ',' after the key of entry "${entry.key}".`,
        afterKey.start,
        afterKey.end,
        { entryKey: entry.key },
      );
      syncToBoundary();
      if (peek().type === 'comma') advance();
    }

    while (!closed) {
      // Tolerate stray commas between fields.
      while (peek().type === 'comma') advance();
      const token = peek();
      if (token.type === 'close') {
        closeStart = token.start;
        end = token.end;
        advance();
        closed = true;
        break;
      }
      if (token.type === 'eof') {
        end = source.length;
        break;
      }
      if (token.type !== 'word') {
        report(
          CODES.UNEXPECTED_TOKEN,
          SEVERITY.ERROR,
          `Unexpected token in entry "${entry.key}".`,
          token.start,
          token.end,
          { entryKey: entry.key, hint: 'Expected a field name.' },
        );
        syncToBoundary();
        if (peek().type === 'comma') advance();
        continue;
      }
      entry.fields.push(parseField(entry.key));
    }

    entry.end = end;
    entry.raw = source.slice(entry.start, end);
    entry.format = inferFormat(entry, command.delimiter, closeStart);
    markDuplicateFields(entry);
    if (entry.fields.length === 0) {
      report(
        CODES.EMPTY_ENTRY,
        SEVERITY.INFO,
        `Entry "${entry.key}" has no fields.`,
        entry.start,
        end,
        { entryKey: entry.key },
      );
    }
    entries.push(entry);
    blocks.push({ kind: 'entry', entryId: entry.id, start: entry.start, end });
  }

  /** Parse a `@string{name = value}` definition. */
  function parseString(command) {
    advance(); // command token
    const nameToken = peek();
    if (nameToken.type !== 'word') {
      report(
        CODES.MALFORMED_COMMAND,
        SEVERITY.ERROR,
        '@string requires a macro name.',
        command.start,
        command.end,
        { hint: 'Write @string{name = "value"}.' },
      );
      const end = skipToClose();
      blocks.push({ kind: 'broken', start: command.start, end });
      return;
    }
    advance();
    if (peek().type !== 'equals') {
      report(
        CODES.MALFORMED_COMMAND,
        SEVERITY.ERROR,
        `@string "${nameToken.raw}" is missing '='.`,
        nameToken.start,
        peek().start,
      );
      const end = skipToClose();
      blocks.push({ kind: 'broken', start: command.start, end });
      return;
    }
    advance();
    const value = parseValue();
    if (!value) {
      report(
        CODES.MALFORMED_COMMAND,
        SEVERITY.ERROR,
        `@string "${nameToken.raw}" has no value.`,
        nameToken.start,
        peek().start,
      );
      const end = skipToClose();
      blocks.push({ kind: 'broken', start: command.start, end });
      return;
    }
    const close = peek();
    let end;
    if (close.type === 'close') {
      end = close.end;
      advance();
    } else {
      end = source.length;
    }
    const definition = {
      id: `s${++stringSequence}`,
      name: nameToken.raw.toLowerCase(),
      nameRaw: nameToken.raw,
      value,
      raw: source.slice(command.start, end),
      start: command.start,
      end,
    };
    strings.push(definition);
    blocks.push({ kind: 'string', stringId: definition.id, start: command.start, end });
  }

  /** Parse a `@preamble{value # value}` block. */
  function parsePreamble(command) {
    advance(); // command token
    const value = parseValue();
    if (!value) {
      report(
        CODES.MALFORMED_COMMAND,
        SEVERITY.ERROR,
        '@preamble has no value.',
        command.start,
        command.end,
        { hint: 'Write @preamble{"..."}.' },
      );
      const end = skipToClose();
      blocks.push({ kind: 'broken', start: command.start, end });
      return;
    }
    const close = peek();
    let end;
    if (close.type === 'close') {
      end = close.end;
      advance();
    } else {
      end = source.length;
    }
    const preamble = {
      id: `p${++preambleSequence}`,
      value,
      raw: source.slice(command.start, end),
      start: command.start,
      end,
    };
    preambles.push(preamble);
    blocks.push({ kind: 'preamble', preambleId: preamble.id, start: command.start, end });
  }

  while (peek().type !== 'eof') {
    const token = peek();
    if (token.type === 'text') {
      blocks.push({ kind: 'text', start: token.start, end: token.end });
      advance();
    } else if (token.type === 'comment') {
      blocks.push({ kind: 'comment', start: token.start, end: token.end });
      advance();
    } else if (token.type === 'command') {
      if (token.name === 'string') parseString(token);
      else if (token.name === 'preamble') parsePreamble(token);
      else parseEntry(token);
    } else {
      report(
        CODES.UNEXPECTED_TOKEN,
        SEVERITY.ERROR,
        `Unexpected token "${token.type}" at the top level.`,
        token.start,
        token.end,
      );
      blocks.push({ kind: 'text', start: token.start, end: token.end });
      advance();
    }
  }

  // Defensive: guarantee that blocks partition the source in order. The parser
  // is sequential, so this normally only fills leading/trailing gaps.
  /** @type {BibDocument['blocks']} */
  const ordered = [];
  let covered = 0;
  for (const block of blocks) {
    if (block.start > covered) ordered.push({ kind: 'text', start: covered, end: block.start });
    if (block.start < covered) continue; // never expected; never duplicate bytes
    ordered.push(block);
    covered = block.end;
  }
  if (covered < source.length) {
    ordered.push({ kind: 'text', start: covered, end: source.length });
  }

  const allDiagnostics = sortDiagnostics(diagnostics);
  const counts = countSeverities(allDiagnostics);
  const eol = detectEol(source);

  /** @type {BibDocument} */
  const document = {
    format: 'bibtex',
    modelVersion: 1,
    source: {
      text: source,
      eol,
      hadBom,
      bom: hadBom ? '\ufeff' : '',
      filename: options.filename ?? null,
    },
    blocks: ordered,
    entries,
    strings,
    preambles,
    diagnostics: allDiagnostics,
    stats: {
      entryCount: entries.length,
      stringCount: strings.length,
      preambleCount: preambles.length,
      errorCount: counts.error,
      warningCount: counts.warning,
      infoCount: counts.info,
    },
    dirty: false,
    revision: 0,
  };
  return deepFreeze(document);
}

/** @param {string} source */
export function detectEol(source) {
  const crlf = source.indexOf('\r\n');
  const lf = source.indexOf('\n');
  const cr = source.indexOf('\r');
  if (crlf >= 0 && (lf < 0 || crlf <= lf)) return '\r\n';
  if (lf >= 0) return '\n';
  if (cr >= 0) return '\r';
  return '\n';
}
