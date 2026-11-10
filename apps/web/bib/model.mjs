/**
 * Data-model helpers for the Bib engine: querying, macro resolution, semantic
 * snapshots, key validation and small pure utilities.
 *
 * This module never parses or serializes. It works on the frozen, plain-JSON
 * `BibDocument` produced by `parser.mjs` and mutated by `editor.mjs`.
 *
 * @module bib/model
 */

import { BibError, CODES } from './diagnostics.mjs';

/** Model version stored in every document. */
export const MODEL_VERSION = 1;

/**
 * @typedef {import('./diagnostics.mjs').Diagnostic} Diagnostic
 * @typedef {{kind:'braced', raw:string, value:string, start:number|null, end:number|null}
 *   | {kind:'quoted', raw:string, value:string, start:number|null, end:number|null}
 *   | {kind:'number', raw:string, value:string, start:number|null, end:number|null}
 *   | {kind:'macro', raw:string, name:string, nameRaw:string, start:number|null, end:number|null}} ValuePart
 * @typedef {{kind:string, parts:ValuePart[], raw:string, start:number|null, end:number|null}} BibValue
 * @typedef {{name:string, nameRaw:string, nameEnd?:number, value:BibValue|null, raw:string,
 *   start:number|null, end:number|null, dirty:boolean, duplicate:boolean, unparsed:boolean}} BibField
 * @typedef {{id:string, type:string, typeRaw:string, key:string, keyRaw:string,
 *   fields:BibField[], raw:string, start:number, end:number, dirty:boolean,
 *   format:{delimiter:'{'|'(', multiline:boolean, indent:string, equals:string,
 *     trailingComma:boolean, closeIndent:string}}} BibEntry
 * @typedef {{id:string, name:string, nameRaw:string, value:BibValue, raw:string,
 *   start:number, end:number}} StringDefinition
 * @typedef {{id:string, value:BibValue, raw:string, start:number, end:number}} Preamble
 * @typedef {{kind:'text'|'comment'|'broken', start:number, end:number}
 *   | {kind:'entry', entryId:string, start:number, end:number, prefix?:string}
 *   | {kind:'string', stringId:string, start:number, end:number}
 *   | {kind:'preamble', preambleId:string, start:number, end:number}} Block
 * @typedef {{format:'bibtex', modelVersion:number,
 *   source:{text:string, eol:string, hadBom:boolean, bom:string, filename:string|null},
 *   blocks:Block[], entries:BibEntry[], strings:StringDefinition[], preambles:Preamble[],
 *   diagnostics:Diagnostic[], stats:{entryCount:number,stringCount:number,preambleCount:number,
 *     errorCount:number,warningCount:number,infoCount:number},
 *   dirty:boolean, revision:number}} BibDocument
 */

/** Field names whose values hold citation keys. */
export const REFERENCE_FIELDS = Object.freeze(['crossref', 'xdata', 'entryset', 'related']);

/** Standard BibTeX month macros. They can be overridden by `@string`. */
export const BUILTIN_MONTHS = Object.freeze({
  jan: 'January',
  feb: 'February',
  mar: 'March',
  apr: 'April',
  may: 'May',
  jun: 'June',
  jul: 'July',
  aug: 'August',
  sep: 'September',
  oct: 'October',
  nov: 'November',
  dec: 'December',
});

/**
 * Recursively freeze a plain-data structure.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(/** @type {any} */ (value)[key]);
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {value is BibDocument}
 */
export function isBibDocument(value) {
  if (!value || typeof value !== 'object') return false;
  const document = /** @type {any} */ (value);
  return (
    document.format === 'bibtex' &&
    typeof document.modelVersion === 'number' &&
    document.source &&
    typeof document.source.text === 'string' &&
    Array.isArray(document.blocks) &&
    Array.isArray(document.entries) &&
    Array.isArray(document.strings) &&
    Array.isArray(document.diagnostics)
  );
}

/**
 * First non-shadowed field with the given name (case-insensitive), as BibTeX
 * sees it: the first occurrence wins, later duplicates are ignored.
 *
 * @param {BibEntry} entry
 * @param {string} name
 * @returns {BibField|null}
 */
export function getEntryField(entry, name) {
  const wanted = String(name).toLowerCase();
  for (const field of entry.fields) {
    if (field.name === wanted && !field.duplicate) return field;
  }
  return null;
}

/**
 * Find an entry by key. Keys are case-sensitive, as in BibTeX/Biber.
 *
 * @param {BibDocument} document
 * @param {string} key
 * @returns {BibEntry|null}
 */
export function findEntryByKey(document, key) {
  for (const entry of document.entries) {
    if (entry.key === key) return entry;
  }
  return null;
}

/** @param {string} text */
function literalValue(text) {
  return {
    kind: 'quoted',
    parts: [{ kind: 'quoted', raw: `"${text}"`, value: text, start: null, end: null }],
    raw: `"${text}"`,
    start: null,
    end: null,
  };
}

/**
 * Macro definitions visible at a source offset. Strings defined later in the
 * file are not visible, matching BibTeX's sequential processing. Built-in month
 * macros are included first and can be overridden by `@string`.
 *
 * @param {BibDocument} document
 * @param {number} offset
 * @returns {Map<string, BibValue>}
 */
export function macroScopeAt(document, offset) {
  /** @type {Map<string, BibValue>} */
  const scope = new Map();
  for (const [name, text] of Object.entries(BUILTIN_MONTHS)) {
    scope.set(name, literalValue(text));
  }
  for (const definition of document.strings) {
    if (definition.start >= offset) break;
    scope.set(definition.name.toLowerCase(), definition.value);
  }
  return scope;
}

/**
 * Resolve a value into text. Undefined or cyclic macros are left as their
 * source spelling and reported in `unresolved`; this function never throws.
 *
 * @param {BibValue|null|undefined} value
 * @param {Map<string, BibValue>} scope
 * @returns {{text:string, unresolved:Array<{name:string, reason:'undefined'|'cycle'>}}}
 */
export function resolveValue(value, scope) {
  if (!value || !Array.isArray(value.parts)) return { text: '', unresolved: [] };
  /**
   * @param {ValuePart[]} parts
   * @param {Set<string>} seen
   * @param {number} depth
   */
  function resolveParts(parts, seen, depth) {
    let text = '';
    /** @type {Array<{name:string, reason:'undefined'|'cycle'}>} */
    const unresolved = [];
    for (const part of parts) {
      if (part.kind === 'braced' || part.kind === 'quoted' || part.kind === 'number') {
        text += part.value;
        continue;
      }
      if (part.kind !== 'macro') continue;
      const name = part.nameRaw ?? part.name ?? '';
      const key = String(name).toLowerCase();
      const spelling = String(name);
      if (seen.has(key)) {
        unresolved.push({ name: spelling, reason: 'cycle' });
        text += spelling;
        continue;
      }
      const definition = scope.get(key);
      if (!definition || depth >= 32) {
        unresolved.push({ name: spelling, reason: 'undefined' });
        text += spelling;
        continue;
      }
      seen.add(key);
      const nested = resolveParts(definition.parts, seen, depth + 1);
      seen.delete(key);
      text += nested.text;
      unresolved.push(...nested.unresolved);
    }
    return { text, unresolved };
  }
  return resolveParts(value.parts, new Set(), 0);
}

/**
 * Resolved text of one field, or null when the field is absent/unparsed.
 *
 * @param {BibEntry} entry
 * @param {string} name
 * @param {BibDocument} document
 * @returns {string|null}
 */
export function resolveField(entry, name, document) {
  const field = getEntryField(entry, name);
  if (!field || !field.value) return null;
  return resolveValue(field.value, macroScopeAt(document, entry.start)).text;
}

/**
 * Resolve every visible field of an entry. Duplicate (shadowed) fields and
 * unparsed fields are skipped, because BibTeX ignores them.
 *
 * @param {BibEntry} entry
 * @param {BibDocument} document
 * @returns {{key:string, type:string, fields:Record<string,string>,
 *   unresolved:Array<{name:string, reason:'undefined'|'cycle', field:string}>}}
 */
export function resolveEntryValues(entry, document) {
  const scope = macroScopeAt(document, entry.start);
  /** @type {Record<string,string>} */
  const fields = {};
  /** @type {Array<{name:string, reason:'undefined'|'cycle', field:string}>} */
  const unresolved = [];
  for (const field of entry.fields) {
    if (field.duplicate || field.unparsed || !field.value) continue;
    const resolved = resolveValue(field.value, scope);
    fields[field.name] = resolved.text;
    for (const item of resolved.unresolved) {
      unresolved.push({ ...item, field: field.name });
    }
  }
  return { key: entry.key, type: entry.type, fields, unresolved };
}

/**
 * Order-preserving, macro-expanded view of a document. Two documents have the
 * same snapshot iff citation semantics are unchanged. This is the primary
 * round-trip assertion used by the tests.
 *
 * @param {BibDocument} document
 * @returns {Record<string, unknown>}
 */
export function semanticSnapshot(document) {
  return {
    preambles: document.preambles.map(preamble => ({
      value: resolveValue(preamble.value, macroScopeAt(document, preamble.start)).text,
    })),
    strings: document.strings.map(definition => ({
      name: definition.name,
      value: resolveValue(definition.value, macroScopeAt(document, definition.start)).text,
    })),
    entries: document.entries.map(entry => {
      const scope = macroScopeAt(document, entry.start);
      return {
        key: entry.key,
        type: entry.type,
        fields: entry.fields.map(field => ({
          name: field.name,
          value: field.value ? resolveValue(field.value, scope).text : null,
          unparsed: Boolean(field.unparsed),
          raw: field.unparsed ? field.raw : null,
        })),
      };
    }),
  };
}

/**
 * @param {{entries:BibEntry[], strings:StringDefinition[], preambles:Preamble[],
 *   diagnostics:Diagnostic[]}} document
 */
export function computeStats(document) {
  const stats = {
    entryCount: document.entries.length,
    stringCount: document.strings.length,
    preambleCount: document.preambles.length,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
  };
  for (const diagnostic of document.diagnostics) {
    if (diagnostic.severity === 'error') stats.errorCount += 1;
    else if (diagnostic.severity === 'warning') stats.warningCount += 1;
    else if (diagnostic.severity === 'info') stats.infoCount += 1;
  }
  return stats;
}

/**
 * Brace balance check using BibTeX rules (backslash does not escape braces).
 *
 * @param {string} text
 * @returns {{ok:true, index:-1}|{ok:false, index:number, reason:'unexpected-closing'|'unclosed'}}
 */
export function checkBalancedBraces(text) {
  const source = String(text);
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth < 0) return { ok: false, index, reason: 'unexpected-closing' };
    }
  }
  if (depth !== 0) return { ok: false, index: source.length, reason: 'unclosed' };
  return { ok: true, index: -1 };
}

/**
 * Reject NUL and other C0 controls that no BibTeX backend accepts in a value.
 * Tab, CR and LF are allowed.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasUnsafeControlCharacters(text) {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(String(text));
}

/** @param {string} text */
function hasTopLevelQuote(text) {
  let depth = 0;
  for (const char of text) {
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
    else if (char === '"' && depth === 0) return true;
  }
  return false;
}

/**
 * Build a value from caller-provided LaTeX text.
 *
 * The text is stored verbatim. Callers are responsible for LaTeX escaping
 * (`\&`, `\%`, ...); this engine never rewrites bibliography content.
 *
 * @param {string} text
 * @param {{delimiter?: 'braced'|'quoted'|'number', previous?: BibValue|null}} [options]
 * @returns {{ok:true, value:BibValue}|{ok:false, error:{code:string, message:string, index:number}}}
 */
export function createValueFromText(text, options = {}) {
  const source = String(text ?? '');
  if (hasUnsafeControlCharacters(source)) {
    return {
      ok: false,
      error: {
        code: CODES.UNSAFE_FIELD_VALUE,
        message: 'Field value contains a control character that BibTeX cannot represent.',
        index: -1,
      },
    };
  }
  const balance = checkBalancedBraces(source);
  if (!balance.ok) {
    return {
      ok: false,
      error: {
        code: CODES.UNSAFE_FIELD_VALUE,
        message:
          balance.reason === 'unclosed'
            ? 'Field value has unclosed braces.'
            : "Field value has more '}' than '{'.",
        index: balance.index,
      },
    };
  }
  let delimiter = options.delimiter ?? null;
  if (!delimiter) {
    const previous = options.previous;
    const previousPart = previous?.parts?.length === 1 ? previous.parts[0] : null;
    delimiter = previousPart?.kind === 'quoted' ? 'quoted' : previousPart?.kind === 'number' ? 'number' : 'braced';
  }
  if (delimiter === 'number' && !/^\d+$/.test(source)) delimiter = 'braced';
  if (delimiter === 'quoted' && hasTopLevelQuote(source)) delimiter = 'braced';
  if (delimiter === 'quoted') {
    return {
      ok: true,
      value: {
        kind: 'quoted',
        parts: [{ kind: 'quoted', raw: `"${source}"`, value: source, start: null, end: null }],
        raw: `"${source}"`,
        start: null,
        end: null,
      },
    };
  }
  if (delimiter === 'number') {
    return {
      ok: true,
      value: {
        kind: 'number',
        parts: [{ kind: 'number', raw: source, value: source, start: null, end: null }],
        raw: source,
        start: null,
        end: null,
      },
    };
  }
  return {
    ok: true,
    value: {
      kind: 'braced',
      parts: [{ kind: 'braced', raw: `{${source}}`, value: source, start: null, end: null }],
      raw: `{${source}}`,
      start: null,
      end: null,
    },
  };
}

/**
 * Validate a citation key against the characters both BibTeX and Biber accept
 * reliably.
 *
 * @param {unknown} key
 * @returns {{ok:true}|{ok:false, reason:'empty'|'not-a-string'|'invalid-characters', match?:string}}
 */
export function validateKey(key) {
  if (typeof key !== 'string') return { ok: false, reason: 'not-a-string' };
  if (key.length === 0) return { ok: false, reason: 'empty' };
  const match = key.match(/[\s,{}()"#%=@\\]/);
  if (match) return { ok: false, reason: 'invalid-characters', match: match[0] };
  return { ok: true };
}

/** @param {unknown} type */
export function validateEntryType(type) {
  return typeof type === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(type);
}

/** @param {unknown} name */
export function validateFieldName(name) {
  return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_:.+-]*$/.test(name);
}

/**
 * Split a comma-separated key list (crossref lists, entryset, related).
 * @param {string} text
 * @returns {string[]}
 */
export function splitKeyList(text) {
  return String(text)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Replace one key in a comma-separated list, preserving surrounding whitespace
 * and separators. Returns the original string when nothing matched.
 *
 * @param {string} text
 * @param {string} oldKey
 * @param {string} newKey
 * @returns {{text:string, count:number}}
 */
export function replaceKeyInList(text, oldKey, newKey) {
  const parts = String(text).split(',');
  let count = 0;
  const replaced = parts.map(part => {
    if (part.trim() !== oldKey) return part;
    const leading = part.match(/^\s*/)?.[0] ?? '';
    const trailing = part.match(/\s*$/)?.[0] ?? '';
    count += 1;
    return leading + newKey + trailing;
  });
  return { text: count ? replaced.join(',') : String(text), count };
}

/**
 * Normalise text for case-insensitive search (NFC + lower case).
 * @param {string} text
 */
export function normalizeSearchText(text) {
  return String(text ?? '').normalize('NFC').toLowerCase();
}

/**
 * Guard used by public entry points.
 * @param {unknown} document
 * @returns {BibDocument}
 */
export function assertBibDocument(document) {
  if (!isBibDocument(document)) {
    throw new BibError(CODES.INVALID_DOCUMENT, 'Expected a BibDocument produced by parseBib().');
  }
  return /** @type {BibDocument} */ (document);
}
