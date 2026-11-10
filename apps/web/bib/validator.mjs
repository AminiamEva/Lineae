/**
 * Semantic validation for BibTeX databases.
 *
 * Validation never changes the document. It combines the diagnostics produced
 * while parsing (lexer + parser, only for documents that have not been edited)
 * with checks that need the whole database: duplicate keys, undefined macros,
 * missing cross-references and required fields.
 *
 * Profiles:
 * - `generic`  — conservative, syntax + integrity only (default).
 * - `bibtex`   — classic BibTeX/BibTeX8 expectations.
 * - `biblatex` — BibLaTeX + Biber expectations (duplicate keys are fatal).
 *
 * @module bib/validator
 */

import {
  BibError,
  CODES,
  SEVERITY,
  createDiagnostic,
  createLocator,
  sortDiagnostics,
} from './diagnostics.mjs';
import { parseBibSource } from './parser.mjs';
import {
  REFERENCE_FIELDS,
  assertBibDocument,
  deepFreeze,
  getEntryField,
  macroScopeAt,
  resolveValue,
  splitKeyList,
  validateKey,
} from './model.mjs';

/** @typedef {import('./model.mjs').BibDocument} BibDocument */
/** @typedef {import('./diagnostics.mjs').Diagnostic} Diagnostic */

const BIBTEX_TYPES = new Set([
  'article', 'book', 'booklet', 'conference', 'inbook', 'incollection',
  'inproceedings', 'manual', 'mastersthesis', 'misc', 'phdthesis',
  'proceedings', 'techreport', 'unpublished',
]);

const BIBLATEX_TYPES = new Set([
  ...BIBTEX_TYPES,
  'online', 'dataset', 'software', 'thesis', 'report', 'collection', 'mvbook',
  'mvcollection', 'mvproceedings', 'reference', 'inreference', 'periodical',
  'suppbook', 'suppcollection', 'suppperiodical', 'patent', 'image', 'audio',
  'video', 'movie', 'music', 'artwork', 'performance', 'standard',
  'legislation', 'jurisdiction', 'legal', 'letter', 'review', 'commentary',
  'xdata', 'set',
]);

/** Required fields per type. Each inner array lists alternatives. */
const REQUIRED_FIELDS = {
  article: [['author'], ['title'], ['journal', 'journaltitle'], ['year', 'date']],
  book: [['author', 'editor'], ['title'], ['publisher'], ['year', 'date']],
  inbook: [['author', 'editor'], ['title'], ['booktitle'], ['publisher'], ['year', 'date']],
  incollection: [['author'], ['title'], ['booktitle'], ['publisher'], ['year', 'date']],
  inproceedings: [['author'], ['title'], ['booktitle'], ['year', 'date']],
  conference: [['author'], ['title'], ['booktitle'], ['year', 'date']],
  proceedings: [['title'], ['year', 'date']],
  phdthesis: [['author'], ['title'], ['school'], ['year', 'date']],
  mastersthesis: [['author'], ['title'], ['school'], ['year', 'date']],
  techreport: [['author'], ['title'], ['institution'], ['year', 'date']],
  manual: [['title']],
  booklet: [['title']],
  unpublished: [['author'], ['title'], ['note']],
  online: [['title'], ['url']],
  dataset: [['title']],
  software: [['title']],
  thesis: [['author'], ['title'], ['school', 'institution'], ['year', 'date']],
  report: [['author'], ['title'], ['institution'], ['year', 'date']],
  collection: [['editor'], ['title'], ['year', 'date']],
  patent: [['author', 'holder'], ['title'], ['number'], ['year', 'date']],
  set: [['entryset']],
};

/**
 * @param {string|BibDocument} input
 * @param {{profile?: 'generic'|'bibtex'|'biblatex'|'biber', strict?: boolean,
 *   filename?: string, maxDiagnostics?: number}} [options]
 */
export function validateBib(input, options = {}) {
  const profile = normalizeProfile(options.profile);
  /** @type {BibDocument} */
  let document;
  if (typeof input === 'string') {
    document = parseBibSource(input, {
      filename: options.filename,
      maxDiagnostics: options.maxDiagnostics,
    });
  } else {
    document = assertBibDocument(input);
  }
  return validateDocument(document, { ...options, profile });
}

/**
 * @param {BibDocument} document
 * @param {{profile?: 'generic'|'bibtex'|'biblatex', strict?: boolean}} [options]
 * @returns {Readonly<Record<string, any>>}
 */
export function validateDocument(document, options = {}) {
  const profile = normalizeProfile(options.profile);
  const strict = Boolean(options.strict);
  const locator = createLocator(document.source.text);
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const maxDiagnostics = Number.isFinite(options.maxDiagnostics) ? Number(options.maxDiagnostics) : Infinity;

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
    diagnostics.push(createDiagnostic({ code, severity, message, start, end, source: 'validator', ...extra }, locator));
  }

  // Parsing diagnostics stay attached to the original source. After an edit,
  // offsets no longer describe the current model, so only structural checks run.
  if (!document.dirty) {
    for (const diagnostic of document.diagnostics) diagnostics.push(diagnostic);
  }

  // Duplicate / invalid keys.
  /** @type {Map<string, import('./model.mjs').BibEntry>} */
  const firstByKey = new Map();
  const duplicateKeys = [];
  for (const entry of document.entries) {
    if (!entry.key) {
      report(
        CODES.EMPTY_KEY,
        SEVERITY.ERROR,
        `Entry @${entry.type} has an empty key.`,
        entry.start,
        Math.min(entry.end, entry.start + 40),
        { entryKey: entry.key, hint: 'Every entry needs a unique citation key.' },
      );
    } else {
      const valid = validateKey(entry.key);
      if (!valid.ok) {
        report(
          CODES.INVALID_KEY_SYNTAX,
          SEVERITY.ERROR,
          `Entry key "${entry.key}" contains characters that BibTeX/Biber do not accept.`,
          entry.start,
          Math.min(entry.end, entry.start + 60),
          { entryKey: entry.key, hint: 'Avoid whitespace and , { } ( ) " # % = @ \\ in keys.' },
        );
      }
      const existing = firstByKey.get(entry.key);
      if (existing) {
        duplicateKeys.push(entry.key);
        report(
          CODES.DUPLICATE_KEY,
          profile === 'biblatex' ? SEVERITY.ERROR : SEVERITY.WARNING,
          `Duplicate entry key "${entry.key}"; BibTeX keeps the first entry, Biber rejects the database.`,
          entry.start,
          Math.min(entry.end, entry.start + 40),
          {
            entryKey: entry.key,
            related: [{ message: 'First entry with this key.', start: existing.start, end: existing.end }],
          },
        );
      } else {
        firstByKey.set(entry.key, entry);
      }
    }

    // Duplicate fields can also appear in an edited (dirty) document.
    const seenFields = new Set();
    for (const field of entry.fields) {
      if (seenFields.has(field.name) && document.dirty) {
        report(
          CODES.DUPLICATE_FIELD,
          SEVERITY.WARNING,
          `Duplicate field "${field.nameRaw}" in entry "${entry.key}".`,
          field.start,
          field.end,
          { entryKey: entry.key, fieldName: field.name },
        );
      }
      seenFields.add(field.name);
    }
  }

  // Undefined macros and macro cycles.
  for (const definition of document.strings) {
    const scope = macroScopeAt(document, definition.start);
    const resolved = resolveValue(definition.value, scope);
    for (const item of dedupeUnresolved(resolved.unresolved)) {
      report(
        item.reason === 'cycle' ? CODES.MACRO_CYCLE : CODES.UNDEFINED_MACRO,
        SEVERITY.ERROR,
        item.reason === 'cycle'
          ? `Macro "${item.name}" is defined in terms of itself.`
          : `Macro "${item.name}" is used before it is defined.`,
        definition.start,
        definition.end,
        { hint: 'Define the macro with @string{...} before it is used.' },
      );
    }
  }

  for (const entry of document.entries) {
    const scope = macroScopeAt(document, entry.start);
    for (const field of entry.fields) {
      if (field.duplicate || field.unparsed || !field.value) continue;
      const resolved = resolveValue(field.value, scope);
      for (const item of dedupeUnresolved(resolved.unresolved)) {
        const part = field.value.parts.find(part => part.kind === 'macro' && String(part.name).toLowerCase() === item.name.toLowerCase());
        report(
          item.reason === 'cycle' ? CODES.MACRO_CYCLE : CODES.UNDEFINED_MACRO,
          SEVERITY.ERROR,
          item.reason === 'cycle'
            ? `Macro "${item.name}" forms a cycle while resolving "${entry.key}.${field.name}".`
            : `Undefined macro "${item.name}" in "${entry.key}.${field.name}".`,
          part?.start ?? field.start,
          part?.end ?? field.end,
          {
            entryKey: entry.key,
            fieldName: field.name,
            hint: 'Use braces or quotes for literal text, or define the macro with @string.',
          },
        );
      }
    }
  }

  // Entry types.
  for (const entry of document.entries) {
    if (profile === 'bibtex') {
      if (entry.type === 'conference') {
        report(
          CODES.CONFERENCE_ALIAS,
          SEVERITY.INFO,
          '@conference is an alias understood by standard BibTeX styles; @inproceedings is more portable.',
          entry.start,
          entry.start + Math.min(entry.end - entry.start, 24),
          { entryKey: entry.key },
        );
      } else if (!BIBTEX_TYPES.has(entry.type)) {
        report(
          CODES.UNKNOWN_ENTRY_TYPE,
          SEVERITY.WARNING,
          `Entry type "@${entry.typeRaw}" is not a classic BibTeX type; styles may ignore it.`,
          entry.start,
          entry.start + Math.min(entry.end - entry.start, 24),
          { entryKey: entry.key },
        );
      }
    } else if (profile === 'biblatex' && !BIBLATEX_TYPES.has(entry.type)) {
      report(
        CODES.UNKNOWN_ENTRY_TYPE,
        SEVERITY.WARNING,
        `Entry type "@${entry.typeRaw}" is not a standard BibLaTeX type.`,
        entry.start,
        entry.start + Math.min(entry.end - entry.start, 24),
        { entryKey: entry.key },
      );
    }
  }

  // Required fields. Fields may be inherited from `crossref` (BibTeX) or
  // `xdata` (BibLaTeX), so check the effective field set, not just the entry.
  for (const entry of document.entries) {
    const required = REQUIRED_FIELDS[entry.type];
    if (!required) continue;
    const effective = effectiveFields(entry, document, firstByKey);
    for (const alternatives of required) {
      const present = alternatives.some(name => (effective.get(name) ?? '').trim() !== '');
      if (!present) {
        report(
          CODES.MISSING_REQUIRED_FIELD,
          strict ? SEVERITY.ERROR : SEVERITY.WARNING,
          `Entry "${entry.key}" (@${entry.type}) is missing ${alternatives.join(' or ')}.`,
          entry.start,
          Math.min(entry.end, entry.start + 60),
          {
            entryKey: entry.key,
            fieldName: alternatives[0],
            hint: 'A bibliography style may reject or render this entry incompletely.',
          },
        );
      }
    }
  }

  // Cross-references between entries.
  for (const entry of document.entries) {
    const scope = macroScopeAt(document, entry.start);
    for (const fieldName of REFERENCE_FIELDS) {
      const field = getEntryField(entry, fieldName);
      if (!field || !field.value) continue;
      const text = resolveValue(field.value, scope).text;
      const keys = fieldName === 'crossref' ? [text.trim()].filter(Boolean) : splitKeyList(text);
      for (const key of keys) {
        if (!firstByKey.has(key)) {
          report(
            CODES.MISSING_REFERENCE_TARGET,
            SEVERITY.WARNING,
            `"${entry.key}.${fieldName}" refers to missing entry "${key}".`,
            field.start,
            field.end,
            { entryKey: entry.key, fieldName, hint: 'Add the target entry or fix the key.' },
          );
        }
      }
    }
  }

  // Redefined string macros.
  const stringNames = new Set();
  for (const definition of document.strings) {
    if (stringNames.has(definition.name)) {
      report(
        CODES.STRING_REDEFINITION,
        SEVERITY.INFO,
        `Macro "${definition.nameRaw}" is redefined; later definitions win for following entries.`,
        definition.start,
        definition.end,
      );
    }
    stringNames.add(definition.name);
  }

  const sorted = dedupeDiagnostics(sortDiagnostics(diagnostics));
  const counts = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of sorted) counts[diagnostic.severity] += 1;

  return deepFreeze({
    ok: counts.error === 0,
    profile,
    strict,
    errorCount: counts.error,
    warningCount: counts.warning,
    infoCount: counts.info,
    diagnostics: sorted,
    summary: {
      entryCount: document.entries.length,
      keyCount: firstByKey.size,
      duplicateKeys: [...new Set(duplicateKeys)],
      stringCount: document.strings.length,
      preambleCount: document.preambles.length,
      blockCount: document.blocks.length,
      dirty: document.dirty,
    },
  });
}

/**
 * Effective field texts for required-field checks, following `crossref` and
 * `xdata` inheritance (child fields win). Bounded to five levels and cycle-safe.
 *
 * @param {import('./model.mjs').BibEntry} entry
 * @param {BibDocument} document
 * @param {Map<string, import('./model.mjs').BibEntry>} byKey
 * @returns {Map<string,string>}
 */
function effectiveFields(entry, document, byKey) {
  /** @type {Map<string,string>} */
  const fields = new Map();
  /** @param {import('./model.mjs').BibEntry} source @param {boolean} aliasTitle */
  function add(source, aliasTitle = false) {
    for (const field of source.fields) {
      if (field.duplicate || field.unparsed || !field.value) continue;
      const text = resolveValue(field.value, macroScopeAt(document, source.start)).text;
      if (!fields.has(field.name)) fields.set(field.name, text);
      // BibTeX's crossref inheritance maps the proceedings/book title to the
      // child's booktitle.
      if (aliasTitle && field.name === 'title' && !fields.has('booktitle')) {
        fields.set('booktitle', text);
      }
    }
  }
  add(entry);
  const visited = new Set([entry.id]);
  let queue = [entry];
  for (let depth = 0; depth < 5 && queue.length; depth += 1) {
    /** @type {import('./model.mjs').BibEntry[]} */
    const next = [];
    for (const current of queue) {
      const scope = macroScopeAt(document, current.start);
      /** @type {Array<{key:string, aliasTitle:boolean}>} */
      const targets = [];
      const crossref = getEntryField(current, 'crossref');
      if (crossref?.value) {
        const key = resolveValue(crossref.value, scope).text.trim();
        if (key) targets.push({ key, aliasTitle: true });
      }
      const xdata = getEntryField(current, 'xdata');
      if (xdata?.value) {
        for (const key of splitKeyList(resolveValue(xdata.value, scope).text)) {
          targets.push({ key, aliasTitle: false });
        }
      }
      for (const targetInfo of targets) {
        const target = byKey.get(targetInfo.key);
        if (!target || visited.has(target.id)) continue;
        visited.add(target.id);
        add(target, targetInfo.aliasTitle);
        next.push(target);
      }
    }
    queue = next;
  }
  return fields;
}

/** @param {string|undefined} profile */
function normalizeProfile(profile) {
  if (profile === undefined || profile === null) return 'generic';
  if (profile === 'biber') return 'biblatex';
  if (profile === 'generic' || profile === 'bibtex' || profile === 'biblatex') return profile;
  throw new BibError(CODES.INVALID_ARGUMENT, `Unknown validation profile: ${profile}`, {
    profile,
    supported: ['generic', 'bibtex', 'biblatex', 'biber'],
  });
}

/** @param {Array<{name:string, reason:string}>} unresolved */
function dedupeUnresolved(unresolved) {
  const seen = new Set();
  const result = [];
  for (const item of unresolved) {
    const key = item.reason + ':' + item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/** @param {Diagnostic[]} diagnostics */
function dedupeDiagnostics(diagnostics) {
  const seen = new Set();
  const result = [];
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.location.start.offset,
      diagnostic.location.end.offset,
      diagnostic.entryKey ?? '',
      diagnostic.fieldName ?? '',
      diagnostic.message,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}
