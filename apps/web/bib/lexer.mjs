/**
 * BibTeX lexer. Produces a flat token stream plus lexical diagnostics.
 *
 * The lexer knows exactly three structural things: commands (`@type{`/`@type(`),
 * delimited values, and the punctuation that separates fields. It never builds
 * entries; see `parser.mjs`.
 *
 * BibTeX compatibility notes:
 * - Braces are counted literally. A backslash does not escape `{` or `}` in
 *   `.bib` syntax, so `\{` still opens a group. This matches BibTeX.
 * - Inside a quoted value, `"` ends the value only at brace depth zero.
 * - `%` is not a comment character inside an entry; it is reported and skipped
 *   to the end of the line for recovery.
 *
 * @module bib/lexer
 */

import {
  BibError,
  CODES,
  SEVERITY,
  createDiagnostic,
  createLocator,
} from './diagnostics.mjs';

/** Characters that terminate a bare word. */
const WORD_STOP = new Set(['{', '}', '(', ')', ',', '=', '#', '"', '@', '%']);

/** @param {string} char */
function isWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f' || char === '\v';
}

/** @param {string} char */
function isLetter(char) {
  return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z');
}

/** @param {string} char */
function isWordCharacter(char) {
  return isLetter(char) || (char >= '0' && char <= '9') || char === '-' || char === '_' || char === ':';
}

/**
 * @typedef {(
 *   {type:'text', start:number, end:number, raw:string} |
 *   {type:'command', start:number, end:number, name:string, typeRaw:string,
 *    delimiter:'{'|'(', raw:string} |
 *   {type:'comment', start:number, end:number, raw:string} |
 *   {type:'word', start:number, end:number, raw:string, value:string} |
 *   {type:'braced', start:number, end:number, raw:string, value:string, closed:boolean} |
 *   {type:'quoted', start:number, end:number, raw:string, value:string, closed:boolean} |
 *   {type:'equals'|'hash'|'comma', start:number, end:number, raw:string} |
 *   {type:'close', start:number, end:number, raw:string, delimiter:'}'|')'} |
 *   {type:'eof', start:number, end:number, raw:string}
 * )} Token
 */

/**
 * Whether `@` at `offset` begins a command (`@type{` / `@type(`).
 * Anything else (for example an email address inside comment text) is text.
 *
 * @param {string} source
 * @param {number} offset
 * @returns {boolean}
 */
function isCommandStart(source, offset) {
  let index = offset + 1;
  while (index < source.length && (source[index] === ' ' || source[index] === '\t' || source[index] === '\n' || source[index] === '\r')) {
    index += 1;
  }
  if (!isLetter(source[index] ?? '')) return false;
  while (index < source.length && isWordCharacter(source[index])) index += 1;
  while (index < source.length && isWhitespace(source[index])) index += 1;
  return source[index] === '{' || source[index] === '(';
}

/**
 * Tokenize a `.bib` source.
 *
 * @param {string} source
 * @param {{maxDiagnostics?: number}} [options]
 * @returns {{tokens: Token[], diagnostics: import('./diagnostics.mjs').Diagnostic[],
 *   locator: ReturnType<typeof createLocator>}}
 */
export function tokenize(source, options = {}) {
  if (typeof source !== 'string') {
    throw new BibError(CODES.INVALID_SOURCE, 'BibTeX source must be a string.', {
      received: typeof source,
    });
  }
  const locator = createLocator(source);
  const maxDiagnostics = Number.isFinite(options.maxDiagnostics) ? Number(options.maxDiagnostics) : Infinity;
  /** @type {Token[]} */
  const tokens = [];
  /** @type {import('./diagnostics.mjs').Diagnostic[]} */
  const diagnostics = [];

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
        { code, severity, message, start, end, source: 'lexer', ...extra },
        locator,
      ),
    );
  }

  const length = source.length;
  let index = 0;
  let textStart = 0;

  /**
   * Scan a balanced `{...}` value starting at `start` (which must be `{`).
   * @param {number} start
   */
  function scanBraced(start) {
    let depth = 0;
    let cursor = start;
    let closed = false;
    while (cursor < length) {
      const char = source[cursor];
      cursor += 1;
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          closed = true;
          break;
        }
      }
    }
    if (!closed) {
      report(
        CODES.UNTERMINATED_BRACED_VALUE,
        SEVERITY.ERROR,
        `Unterminated braced value: ${depth} closing brace(s) missing.`,
        start,
        length,
        { hint: "Add the missing '}'." },
      );
    }
    const end = cursor;
    tokens.push({
      type: 'braced',
      start,
      end,
      raw: source.slice(start, end),
      value: source.slice(start + 1, closed ? end - 1 : end),
      closed,
    });
    return end;
  }

  /**
   * Scan a `"..."` value starting at `start` (which must be `"`).
   * @param {number} start
   */
  function scanQuoted(start) {
    let depth = 0;
    let cursor = start + 1;
    let closed = false;
    while (cursor < length) {
      const char = source[cursor];
      if (char === '{') {
        depth += 1;
        cursor += 1;
      } else if (char === '}') {
        if (depth === 0) {
          report(
            CODES.UNBALANCED_BRACE_IN_QUOTED,
            SEVERITY.ERROR,
            "Unbalanced '}' inside a quoted value.",
            cursor,
            cursor + 1,
            { hint: 'Brace groups inside quotes must be balanced.' },
          );
          cursor += 1;
        } else {
          depth -= 1;
          cursor += 1;
        }
      } else if (char === '"') {
        if (depth === 0) {
          cursor += 1;
          closed = true;
          break;
        }
        cursor += 1;
      } else {
        cursor += 1;
      }
    }
    if (!closed) {
      report(
        CODES.UNTERMINATED_QUOTED_VALUE,
        SEVERITY.ERROR,
        'Unterminated quoted value.',
        start,
        length,
        { hint: 'Add the closing double quote, or use braces.' },
      );
    }
    const end = cursor;
    tokens.push({
      type: 'quoted',
      start,
      end,
      raw: source.slice(start, end),
      value: source.slice(start + 1, closed ? end - 1 : end),
      closed,
    });
    return end;
  }

  /** Scan a bare word starting at `start`. */
  function scanWord(start) {
    let cursor = start;
    while (cursor < length && !isWhitespace(source[cursor]) && !WORD_STOP.has(source[cursor])) {
      cursor += 1;
    }
    if (cursor === start) {
      // Should not happen: callers handle stop characters explicitly.
      report(CODES.UNEXPECTED_CHARACTER, SEVERITY.ERROR, `Unexpected character ${JSON.stringify(source[start])}.`, start, start + 1);
      return start + 1;
    }
    tokens.push({
      type: 'word',
      start,
      end: cursor,
      raw: source.slice(start, cursor),
      value: source.slice(start, cursor),
    });
    return cursor;
  }

  /** Scan the body of a command until its matching closing delimiter. */
  function scanBody(command) {
    const closeChar = command.delimiter === '{' ? '}' : ')';
    while (index < length) {
      while (index < length && isWhitespace(source[index])) index += 1;
      if (index >= length) break;
      const char = source[index];
      if (char === closeChar) {
        tokens.push({ type: 'close', start: index, end: index + 1, raw: char, delimiter: closeChar });
        index += 1;
        return;
      }
      if (char === ',') {
        tokens.push({ type: 'comma', start: index, end: index + 1, raw: char });
        index += 1;
        continue;
      }
      if (char === '=') {
        tokens.push({ type: 'equals', start: index, end: index + 1, raw: char });
        index += 1;
        continue;
      }
      if (char === '#') {
        tokens.push({ type: 'hash', start: index, end: index + 1, raw: char });
        index += 1;
        continue;
      }
      if (char === '{') {
        index = scanBraced(index);
        continue;
      }
      if (char === '"') {
        index = scanQuoted(index);
        continue;
      }
      if (char === '%') {
        const lineEnd = findLineEnd(index);
        report(
          CODES.PERCENT_IN_ENTRY,
          SEVERITY.WARNING,
          "'%' is not a comment character inside a BibTeX entry; the rest of the line was skipped.",
          index,
          lineEnd,
          { hint: 'Remove the text or move it outside the entry.' },
        );
        index = lineEnd;
        continue;
      }
      if (char === '}' || char === ')') {
        report(
          CODES.MALFORMED_COMMAND,
          SEVERITY.ERROR,
          `Expected '${closeChar}' but found '${char}'.`,
          index,
          index + 1,
          { hint: 'Check that the entry delimiter and the closing delimiter match.' },
        );
        tokens.push({ type: 'close', start: index, end: index + 1, raw: char, delimiter: char });
        index += 1;
        return;
      }
      if (char === '(') {
        report(CODES.UNEXPECTED_CHARACTER, SEVERITY.ERROR, "Unexpected '(' inside an entry.", index, index + 1);
        index += 1;
        continue;
      }
      if (char === '@') {
        report(CODES.UNEXPECTED_CHARACTER, SEVERITY.ERROR, "Unexpected '@' inside an entry.", index, index + 1);
        index += 1;
        continue;
      }
      if (char === ';') {
        // A common typo: `field = {value};`. Keep it as a word so the parser can
        // report a missing comma instead of silently dropping data.
        index = scanWord(index);
        continue;
      }
      index = scanWord(index);
    }
    report(
      CODES.UNTERMINATED_COMMAND,
      SEVERITY.ERROR,
      `Unterminated @${command.typeRaw} command: '${closeChar}' is missing.`,
      command.start,
      length,
      { hint: `Add the missing '${closeChar}'.` },
    );
  }

  /** @param {number} from */
  function findLineEnd(from) {
    let cursor = from;
    while (cursor < length && source[cursor] !== '\n' && source[cursor] !== '\r') cursor += 1;
    return cursor;
  }

  /** Scan the body of `@comment`, which is ignored but preserved verbatim. */
  function scanCommentBody(command) {
    const start = command.start;
    let cursor = command.end;
    if (command.delimiter === '{') {
      let depth = 1;
      while (cursor < length) {
        const char = source[cursor];
        cursor += 1;
        if (char === '{') depth += 1;
        else if (char === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) {
        report(CODES.UNTERMINATED_COMMENT, SEVERITY.ERROR, 'Unterminated @comment block.', start, length);
      }
    } else {
      let parens = 1;
      let braces = 0;
      while (cursor < length) {
        const char = source[cursor];
        cursor += 1;
        if (char === '{') braces += 1;
        else if (char === '}') braces = Math.max(0, braces - 1);
        else if (braces === 0 && char === '(') parens += 1;
        else if (braces === 0 && char === ')') {
          parens -= 1;
          if (parens === 0) break;
        }
      }
      if (parens !== 0) {
        report(CODES.UNTERMINATED_COMMENT, SEVERITY.ERROR, 'Unterminated @comment block.', start, length);
      }
    }
    tokens.push({ type: 'comment', start, end: cursor, raw: source.slice(start, cursor) });
    return cursor;
  }

  while (index < length) {
    if (source[index] === '@' && isCommandStart(source, index)) {
      if (index > textStart) {
        tokens.push({
          type: 'text',
          start: textStart,
          end: index,
          raw: source.slice(textStart, index),
        });
      }
      const commandStart = index;
      index += 1;
      const beforeType = index;
      while (index < length && isWhitespace(source[index])) index += 1;
      if (index > beforeType) {
        report(
          CODES.WHITESPACE_AFTER_AT,
          SEVERITY.INFO,
          'Whitespace between "@" and the command name is tolerated but non-standard.',
          commandStart,
          index,
        );
      }
      const typeStart = index;
      while (index < length && isWordCharacter(source[index])) index += 1;
      const typeRaw = source.slice(typeStart, index);
      while (index < length && isWhitespace(source[index])) index += 1;
      const delimiter = source[index] === '(' ? '(' : '{';
      index += 1;
      const command = {
        type: /** @type {const} */ ('command'),
        start: commandStart,
        end: index,
        name: typeRaw.toLowerCase(),
        typeRaw,
        delimiter,
        raw: source.slice(commandStart, index),
      };
      if (command.name === 'comment') {
        // `@comment` is represented by a single opaque token, never by a
        // command token plus a body, so the parser can copy it verbatim.
        index = scanCommentBody(command);
      } else {
        tokens.push(command);
        scanBody(command);
      }
      textStart = index;
    } else {
      index += 1;
    }
  }

  if (length > textStart) {
    tokens.push({ type: 'text', start: textStart, end: length, raw: source.slice(textStart, length) });
  }
  tokens.push({ type: 'eof', start: length, end: length, raw: '' });

  return { tokens, diagnostics, locator };
}
