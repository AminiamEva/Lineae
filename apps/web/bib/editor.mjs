/**
 * Bib Editor Engine — the stateful, transaction-style editing layer.
 *
 * Mutations are planned against an immutable document, validated completely,
 * and only then committed. A failed operation never leaves a partial change.
 * Events are emitted after a successful commit only.
 *
 * Undo/redo is intentionally not implemented: the main application already owns
 * an editor history, and bibliography edits are small, transactional data
 * operations. Callers can keep documents returned by `getDocument()` if they
 * want their own snapshots.
 *
 * @module bib/editor
 */

import {
  BibEditorError,
  BibError,
  CODES,
} from './diagnostics.mjs';
import { defaultEntryFormat, parseBibSource } from './parser.mjs';
import { serializeBib } from './serializer.mjs';
import { validateDocument } from './validator.mjs';
import {
  REFERENCE_FIELDS,
  assertBibDocument,
  computeStats,
  createValueFromText,
  deepFreeze,
  findEntryByKey,
  getEntryField,
  macroScopeAt,
  normalizeSearchText,
  replaceKeyInList,
  resolveEntryValues,
  resolveValue,
  splitKeyList,
  validateEntryType,
  validateFieldName,
  validateKey,
} from './model.mjs';
import { scanTexCitations } from './tex-citations.mjs';

/** @typedef {import('./model.mjs').BibDocument} BibDocument */
/** @typedef {import('./model.mjs').BibEntry} BibEntry */
/** @typedef {import('./model.mjs').BibField} BibField */

const DEFAULT_SEARCH_FIELDS = [
  'author', 'editor', 'title', 'year', 'date', 'journal', 'journaltitle',
  'booktitle', 'publisher', 'school', 'institution', 'doi', 'url',
];

/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
function failure(code, message, details = {}) {
  return { ok: false, error: { code, message, details } };
}

/** @param {BibDocument} document */
function indexFirstKeys(document) {
  /** @type {Map<string, BibEntry>} */
  const map = new Map();
  for (const entry of document.entries) {
    if (!map.has(entry.key)) map.set(entry.key, entry);
  }
  return map;
}

/** @param {BibDocument} document */
function nextEntryId(document) {
  let maximum = 0;
  for (const entry of document.entries) {
    const match = /^e(\d+)$/.exec(entry.id);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return `e${maximum + 1}`;
}

/**
 * Resolve one entry by key and optional source-order occurrence.
 *
 * A unique key needs no occurrence. A duplicated key is ambiguous unless the
 * caller explicitly chooses an occurrence (0-based, source order).
 *
 * @param {BibDocument} document
 * @param {string} key
 * @param {unknown} occurrence
 * @returns {{ok:true, entry:BibEntry, occurrence:number, matches:BibEntry[]}
 *   | {ok:false, error:any}}
 */
function resolveTarget(document, key, occurrence) {
  const matches = document.entries.filter(entry => entry.key === key);
  if (matches.length === 0) {
    return failure(CODES.ENTRY_NOT_FOUND, `Entry "${key}" does not exist.`, { key });
  }
  if (occurrence === undefined) {
    if (matches.length > 1) {
      return failure(
        CODES.AMBIGUOUS_KEY,
        `Entry key "${key}" is ambiguous (${matches.length} entries). Pass options.occurrence to choose one.`,
        {
          key,
          count: matches.length,
          occurrences: Array.from({ length: matches.length }, (_, index) => index),
          hint: 'occurrence is 0-based and follows source order; getEntry() still returns the first entry.',
        },
      );
    }
    return { ok: true, entry: matches[0], occurrence: 0, matches };
  }
  if (!Number.isInteger(occurrence) || occurrence < 0) {
    return failure(CODES.EDITOR_INVALID_ARGUMENT, 'options.occurrence must be a non-negative integer.', {
      occurrence,
    });
  }
  if (occurrence >= matches.length) {
    return failure(CODES.ENTRY_NOT_FOUND, `No entry "${key}" at occurrence ${occurrence}.`, {
      key,
      occurrence,
      count: matches.length,
      occurrences: Array.from({ length: matches.length }, (_, index) => index),
    });
  }
  return { ok: true, entry: matches[occurrence], occurrence, matches };
}

/**
 * Current serialized text, used only to choose a paragraph separator for new
 * entries. Falls back to the source text if serialization is unavailable.
 *
 * @param {BibDocument} document
 */
function currentText(document) {
  try {
    return serializeBib(document, { verify: false });
  } catch {
    return document.source.text;
  }
}

/** @param {BibDocument} document */
function separatorPrefix(document) {
  const text = currentText(document);
  const eol = document.source.eol;
  if (!text) return '';
  if (/\r\n\r\n$|\n\n$|\r\r$/.test(text)) return '';
  if (/[\r\n]$/.test(text)) return eol;
  return eol + eol;
}

/**
 * @param {BibDocument} document
 * @param {{entries:BibEntry[], blocks:BibDocument['blocks']}} changes
 * @returns {BibDocument}
 */
function replaceDocumentParts(document, { entries, blocks }) {
  return {
    ...document,
    entries,
    blocks,
    dirty: true,
  };
}

/**
 * @param {BibDocument} document
 * @param {unknown} input
 * @returns {{ok:true, document:BibDocument, entry:BibEntry} | {ok:false, error:any}}
 */
function planAdd(document, input) {
  if (!input || typeof input !== 'object') {
    return failure(CODES.EDITOR_INVALID_ENTRY, 'addEntry expects an object.');
  }
  const candidate = /** @type {Record<string, any>} */ (input);
  const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
  if (!key) {
    return failure(CODES.EDITOR_INVALID_KEY, 'Entry key is required.');
  }
  const keyCheck = validateKey(key);
  if (!keyCheck.ok) {
    return failure(CODES.EDITOR_INVALID_KEY, `Invalid entry key "${key}".`, { reason: keyCheck.reason, match: keyCheck.match });
  }
  if (findEntryByKey(document, key)) {
    return failure(CODES.EDITOR_DUPLICATE_KEY, `Entry key "${key}" already exists.`, { key });
  }
  const type = candidate.type === undefined ? 'misc' : String(candidate.type).trim();
  if (!validateEntryType(type)) {
    return failure(CODES.EDITOR_INVALID_ENTRY, `Invalid entry type "${type}".`, { type });
  }
  const normalized = normalizeNewFields(candidate.fields);
  if (!normalized.ok) return normalized;

  const entry = {
    id: nextEntryId(document),
    type: type.toLowerCase(),
    typeRaw: type,
    key,
    keyRaw: key,
    fields: normalized.fields,
    raw: '',
    start: -1,
    end: -1,
    dirty: true,
    format: defaultEntryFormat('{'),
  };
  const block = {
    kind: /** @type {const} */ ('entry'),
    entryId: entry.id,
    start: -1,
    end: -1,
    prefix: separatorPrefix(document),
  };
  return {
    ok: true,
    document: replaceDocumentParts(document, {
      entries: [...document.entries, entry],
      blocks: [...document.blocks, block],
    }),
    entry,
  };
}

/**
 * @param {unknown} fields
 * @returns {{ok:true, fields:BibField[]} | {ok:false, error:any}}
 */
function normalizeNewFields(fields) {
  /** @type {Array<{name:string, value:unknown}>} */
  const pairs = [];
  if (fields === undefined || fields === null) {
    // no fields
  } else if (Array.isArray(fields)) {
    for (const item of fields) {
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') {
        return failure(CODES.EDITOR_INVALID_ENTRY, 'Each field must be {name, value}.');
      }
      pairs.push({ name: item.name, value: item.value });
    }
  } else if (typeof fields === 'object') {
    for (const [name, value] of Object.entries(fields)) pairs.push({ name, value });
  } else {
    return failure(CODES.EDITOR_INVALID_ENTRY, 'fields must be an object or an array.');
  }

  /** @type {BibField[]} */
  const built = [];
  const seen = new Set();
  for (const pair of pairs) {
    const rawName = pair.name.trim();
    if (!validateFieldName(rawName)) {
      return failure(CODES.EDITOR_INVALID_FIELD, `Invalid field name "${pair.name}".`, { field: pair.name });
    }
    const name = rawName.toLowerCase();
    if (seen.has(name)) {
      return failure(CODES.EDITOR_INVALID_FIELD, `Duplicate field "${rawName}" in entry input.`, { field: rawName });
    }
    seen.add(name);
    const parsed = parseFieldInput(pair.value);
    if (!parsed.ok) return parsed;
    const created = createValueFromText(parsed.text, { delimiter: parsed.delimiter });
    if (!created.ok) {
      return failure(CODES.EDITOR_INVALID_FIELD, created.error.message, {
        field: rawName,
        index: created.error.index,
      });
    }
    built.push({
      name,
      nameRaw: rawName,
      nameEnd: 0,
      value: created.value,
      raw: '',
      start: -1,
      end: -1,
      dirty: true,
      duplicate: false,
      unparsed: false,
    });
  }
  return { ok: true, fields: built };
}

/**
 * @param {unknown} value
 * @returns {{ok:true, text:string, delimiter?:'braced'|'quoted'|'number'} | {ok:false, error:any}}
 */
function parseFieldInput(value) {
  if (typeof value === 'string') return { ok: true, text: value };
  if (value && typeof value === 'object' && typeof /** @type {any} */ (value).text === 'string') {
    const delimiter = /** @type {any} */ (value).delimiter;
    if (delimiter !== undefined && !['braced', 'quoted', 'number'].includes(delimiter)) {
      return failure(CODES.EDITOR_INVALID_FIELD, `Invalid value delimiter "${delimiter}".`, { delimiter });
    }
    return { ok: true, text: /** @type {any} */ (value).text, delimiter };
  }
  return failure(CODES.EDITOR_INVALID_FIELD, 'Field values must be strings or {text, delimiter}.');
}

/**
 * @param {BibDocument} document
 * @param {string} key
 * @param {unknown} patch
 * @param {{occurrence?: number}} [options]
 * @returns {{ok:true, document:BibDocument, entry:BibEntry, changed:boolean, changedFields:Array<{name:string, action:string}>, occurrence:number, keyCount:number} | {ok:false, error:any}}
 */
function planUpdate(document, key, patch, options = {}) {
  const target = resolveTarget(document, key, options.occurrence);
  if (!target.ok) return target;
  const entry = target.entry;
  if (!patch || typeof patch !== 'object') {
    return failure(CODES.EDITOR_INVALID_ARGUMENT, 'updateEntry expects a patch object.');
  }
  const input = /** @type {Record<string, any>} */ (patch);
  if (input.key !== undefined) {
    return failure(CODES.EDITOR_INVALID_ARGUMENT, 'Use renameEntry() to change a key.', {
      hint: 'updateEntry() never changes citation keys.',
    });
  }

  let type = entry.type;
  let typeRaw = entry.typeRaw;
  let changed = false;
  if (input.type !== undefined) {
    const nextType = String(input.type).trim();
    if (!validateEntryType(nextType)) {
      return failure(CODES.EDITOR_INVALID_ENTRY, `Invalid entry type "${nextType}".`, { type: nextType });
    }
    if (nextType.toLowerCase() !== entry.type || nextType !== entry.typeRaw) {
      type = nextType.toLowerCase();
      typeRaw = nextType;
      changed = true;
    }
  }

  /** @type {BibField[]} */
  let fields = input.replaceFields === true ? [] : entry.fields.slice();
  const changedFields = [];
  if (input.replaceFields === true && entry.fields.length > 0) changed = true;
  const patchFields = input.fields;
  if (patchFields !== undefined) {
    if (!patchFields || typeof patchFields !== 'object') {
      return failure(CODES.EDITOR_INVALID_FIELD, 'patch.fields must be an object.');
    }
    for (const [rawName, value] of Object.entries(patchFields)) {
      const name = String(rawName).trim();
      if (!validateFieldName(name)) {
        return failure(CODES.EDITOR_INVALID_FIELD, `Invalid field name "${rawName}".`, { field: rawName });
      }
      const lower = name.toLowerCase();
      const occurrences = fields.filter(field => field.name === lower);
      if (value === null) {
        if (occurrences.length) {
          fields = fields.filter(field => field.name !== lower);
          changedFields.push({ name: lower, action: 'removed' });
          changed = true;
        }
        continue;
      }
      const parsed = parseFieldInput(value);
      if (!parsed.ok) return parsed;
      const created = createValueFromText(parsed.text, {
        delimiter: parsed.delimiter,
        previous: occurrences[0]?.value ?? null,
      });
      if (!created.ok) {
        return failure(CODES.EDITOR_INVALID_FIELD, created.error.message, {
          entryKey: entry.key,
          field: lower,
          index: created.error.index,
        });
      }
      if (occurrences.length) {
        fields = fields.map(field => (
          field.name === lower
            ? { ...field, value: created.value, dirty: true, unparsed: false }
            : field
        ));
        changedFields.push({ name: lower, action: 'updated' });
      } else {
        fields.push({
          name: lower,
          nameRaw: name,
          nameEnd: 0,
          value: created.value,
          raw: '',
          start: -1,
          end: -1,
          dirty: true,
          duplicate: false,
          unparsed: false,
        });
        changedFields.push({ name: lower, action: 'added' });
      }
      changed = true;
    }
  }

  if (!changed) {
    return {
      ok: true,
      document,
      entry,
      changed: false,
      changedFields,
      occurrence: target.occurrence,
      keyCount: target.matches.length,
    };
  }
  const nextEntry = { ...entry, type, typeRaw, fields, dirty: true };
  const entries = document.entries.map(item => (item.id === entry.id ? nextEntry : item));
  return {
    ok: true,
    document: replaceDocumentParts(document, { entries, blocks: document.blocks }),
    entry: nextEntry,
    changed: true,
    changedFields,
    occurrence: target.occurrence,
    keyCount: target.matches.length,
  };
}

/**
 * @param {BibDocument} document
 * @param {string} key
 * @param {{occurrence?: number}} [options]
 * @returns {{ok:true, document:BibDocument, entry:BibEntry, danglingReferences:Array<{entryKey:string, field:string}>, occurrence:number, remainingWithKey:number} | {ok:false, error:any}}
 */
function planRemove(document, key, options = {}) {
  const target = resolveTarget(document, key, options.occurrence);
  if (!target.ok) return target;
  const entry = target.entry;
  const remainingWithKey = target.matches.length - 1;
  /** @type {Array<{entryKey:string, field:string}>} */
  const danglingReferences = [];
  // If another entry still owns this key, references to the key remain
  // resolvable and are not dangling.
  if (remainingWithKey === 0) {
    for (const other of document.entries) {
      if (other.id === entry.id) continue;
      for (const fieldName of REFERENCE_FIELDS) {
        const field = getEntryField(other, fieldName);
        if (!field || !field.value) continue;
        const text = resolveValue(field.value, macroScopeAt(document, other.start)).text;
        const keys = fieldName === 'crossref' ? [text.trim()].filter(Boolean) : splitKeyList(text);
        if (keys.includes(key)) danglingReferences.push({ entryKey: other.key, field: fieldName });
      }
    }
  }
  return {
    ok: true,
    document: replaceDocumentParts(document, {
      entries: document.entries.filter(item => item.id !== entry.id),
      blocks: document.blocks.filter(block => block.kind !== 'entry' || block.entryId !== entry.id),
    }),
    entry,
    danglingReferences,
    occurrence: target.occurrence,
    remainingWithKey,
  };
}

/**
 * @param {BibDocument} document
 * @param {string} oldKey
 * @param {string} newKey
 * @param {{texSource?: string, occurrence?: number}} [options]
 */
function planRename(document, oldKey, newKey, options = {}) {
  const target = resolveTarget(document, oldKey, options.occurrence);
  if (!target.ok) return target;
  const entry = target.entry;
  const ambiguous = target.matches.length > 1;
  const ambiguity = ambiguous
    ? {
        key: oldKey,
        count: target.matches.length,
        occurrences: Array.from({ length: target.matches.length }, (_, index) => index),
      }
    : null;
  const occurrence = target.occurrence;
  const trimmed = typeof newKey === 'string' ? newKey.trim() : '';
  if (!trimmed) {
    return failure(CODES.EDITOR_INVALID_KEY, 'New entry key is required.', { key: newKey });
  }
  const keyCheck = validateKey(trimmed);
  if (!keyCheck.ok) {
    return failure(CODES.EDITOR_INVALID_KEY, `Invalid entry key "${trimmed}".`, {
      reason: keyCheck.reason,
      match: keyCheck.match,
    });
  }
  if (trimmed === oldKey) {
    return {
      ok: true,
      document,
      entry,
      changed: false,
      updatedReferences: [],
      externalReferences: [],
      ambiguous,
      ambiguity,
      occurrence,
      referencesSkipped: ambiguous,
      externalReferencesAmbiguous: false,
    };
  }
  const existing = findEntryByKey(document, trimmed);
  if (existing) {
    return failure(CODES.EDITOR_DUPLICATE_KEY, `Entry key "${trimmed}" already exists.`, { key: trimmed });
  }

  const renamedEntry = { ...entry, key: trimmed, keyRaw: trimmed, dirty: true };
  /** @type {Array<{entryKey:string, field:string, count:number}>} */
  const updatedReferences = [];
  /** @type {BibEntry[]} */
  const entries = [];
  for (const item of document.entries) {
    if (item.id === entry.id) {
      entries.push(renamedEntry);
      continue;
    }
    if (ambiguous) {
      // The old key designates more than one entry; rewriting crossref/xdata/
      // entryset/related would silently pick one. Leave them untouched and
      // report the ambiguity instead.
      entries.push(item);
      continue;
    }
    let changed = false;
    const fields = item.fields.map(field => {
      if (!REFERENCE_FIELDS.includes(field.name) || field.duplicate || field.unparsed || !field.value) {
        return field;
      }
      const text = resolveValue(field.value, macroScopeAt(document, item.start)).text;
      let nextText = null;
      let count = 0;
      if (field.name === 'crossref') {
        if (text.trim() === oldKey) {
          nextText = trimmed;
          count = 1;
        }
      } else {
        const replaced = replaceKeyInList(text, oldKey, trimmed);
        if (replaced.count > 0) {
          nextText = replaced.text;
          count = replaced.count;
        }
      }
      if (!count || nextText === null) return field;
      const created = createValueFromText(nextText, { previous: field.value });
      if (!created.ok) {
        throw new BibError(CODES.EDITOR_INVALID_FIELD, created.error.message, {
          entryKey: item.key,
          field: field.name,
        });
      }
      changed = true;
      updatedReferences.push({ entryKey: item.key, field: field.name, count });
      return { ...field, value: created.value, dirty: true };
    });
    entries.push(changed ? { ...item, fields, dirty: true } : item);
  }

  /** @type {Array<{command:string, key:string, start:number}>} */
  const externalReferences = [];
  if (typeof options.texSource === 'string') {
    const scan = scanTexCitations(options.texSource);
    for (const citation of scan.citations) {
      for (const key of citation.keys) {
        if (key.key === oldKey) {
          externalReferences.push({ command: citation.command, key: key.key, start: key.start });
        }
      }
    }
  }

  return {
    ok: true,
    document: replaceDocumentParts(document, { entries, blocks: document.blocks }),
    entry: renamedEntry,
    changed: true,
    updatedReferences,
    externalReferences,
    ambiguous,
    ambiguity,
    occurrence,
    referencesSkipped: ambiguous,
    externalReferencesAmbiguous: ambiguous && externalReferences.length > 0,
  };
}

/**
 * Backend bibliography editor. Create with `createBibEditor()`; the class is
 * exported for JSDoc/type-checking only.
 */
export class BibEditor {
  /**
   * @param {BibDocument} document
   * @param {{profile?: 'generic'|'bibtex'|'biblatex', strict?: boolean,
   *   onListenerError?: (error: unknown) => void}} [options]
   */
  constructor(document, options = {}) {
    this.document = assertBibDocument(document);
    this.options = { ...options };
    this.destroyed = false;
    /** @type {Set<(event: any) => void>} */
    this.listeners = new Set();
    this.byKey = indexFirstKeys(this.document);
    this.revision = this.document.revision ?? 0;
  }

  /** @throws {BibEditorError} */
  assertAlive() {
    if (this.destroyed) {
      throw new BibEditorError(CODES.EDITOR_DESTROYED, 'This BibEditor has been destroyed.');
    }
  }

  /** @returns {BibDocument} */
  getDocument() {
    this.assertAlive();
    return this.document;
  }

  /** @returns {ReadonlyArray<BibEntry>} */
  getEntries() {
    this.assertAlive();
    return this.document.entries;
  }

  /** @param {string} key @returns {BibEntry|null} */
  getEntry(key) {
    this.assertAlive();
    if (typeof key !== 'string') return null;
    return this.byKey.get(key) ?? null;
  }

  /**
   * @param {{key:string, type?:string, fields?:Record<string, unknown>|Array<{name:string, value:unknown}>}} input
   */
  addEntry(input) {
    this.assertAlive();
    const plan = planAdd(this.document, input);
    if (!plan.ok) return plan;
    return this.commit(plan.document, [{ type: 'add', key: plan.entry.key }], {
      ok: true,
      entry: plan.entry,
      revision: this.revision + 1,
    });
  }

  /**
   * @param {string} key
   * @param {{type?:string, fields?:Record<string, unknown>, replaceFields?:boolean}} patch
   * @param {{occurrence?:number}} [options]
   */
  updateEntry(key, patch, options = {}) {
    this.assertAlive();
    const plan = planUpdate(this.document, key, patch, options);
    if (!plan.ok) return plan;
    if (!plan.changed) {
      return {
        ok: true,
        entry: plan.entry,
        revision: this.revision,
        changedFields: [],
        occurrence: plan.occurrence,
        keyCount: plan.keyCount,
      };
    }
    return this.commit(plan.document, [{ type: 'update', key, occurrence: plan.occurrence, changedFields: plan.changedFields }], {
      ok: true,
      entry: plan.entry,
      changedFields: plan.changedFields,
      occurrence: plan.occurrence,
      keyCount: plan.keyCount,
      revision: this.revision + 1,
    });
  }

  /**
   * @param {string} key
   * @param {{occurrence?:number}} [options]
   */
  removeEntry(key, options = {}) {
    this.assertAlive();
    const plan = planRemove(this.document, key, options);
    if (!plan.ok) return plan;
    return this.commit(plan.document, [{ type: 'remove', key, occurrence: plan.occurrence }], {
      ok: true,
      entry: plan.entry,
      danglingReferences: plan.danglingReferences,
      occurrence: plan.occurrence,
      remainingWithKey: plan.remainingWithKey,
      revision: this.revision + 1,
    });
  }

  /**
   * @param {string} oldKey
   * @param {string} newKey
   * @param {{texSource?:string}} [options]
   */
  renameEntry(oldKey, newKey, options = {}) {
    this.assertAlive();
    /** @type {any} */
    let plan;
    try {
      plan = planRename(this.document, oldKey, newKey, options);
    } catch (error) {
      if (error instanceof BibError) {
        return failure(error.code, error.message, error.details);
      }
      throw error;
    }
    if (!plan.ok) return plan;
    if (!plan.changed) {
      return {
        ok: true,
        entry: plan.entry,
        updatedReferences: [],
        externalReferences: [],
        ambiguous: plan.ambiguous,
        ambiguity: plan.ambiguity,
        occurrence: plan.occurrence,
        referencesSkipped: plan.referencesSkipped,
        externalReferencesAmbiguous: plan.externalReferencesAmbiguous,
        revision: this.revision,
      };
    }
    return this.commit(
      plan.document,
      [{ type: 'rename', key: plan.entry.key, previousKey: oldKey, occurrence: plan.occurrence }],
      {
        ok: true,
        entry: plan.entry,
        updatedReferences: plan.updatedReferences,
        externalReferences: plan.externalReferences,
        ambiguous: plan.ambiguous,
        ambiguity: plan.ambiguity,
        occurrence: plan.occurrence,
        referencesSkipped: plan.referencesSkipped,
        externalReferencesAmbiguous: plan.externalReferencesAmbiguous,
        revision: this.revision + 1,
      },
    );
  }

  /**
   * @param {{key:string, type?:string, fields?:Record<string, unknown>|Array<{name:string, value:unknown}>}[]} inputs
   * @param {{onConflict?: 'error'|'skip'}} [options]
   */
  importEntries(inputs, options = {}) {
    this.assertAlive();
    if (!Array.isArray(inputs)) {
      return failure(CODES.EDITOR_INVALID_ARGUMENT, 'importEntries expects an array.');
    }
    const onConflict = options.onConflict ?? 'error';
    let working = this.document;
    /** @type {BibEntry[]} */
    const added = [];
    /** @type {string[]} */
    const skipped = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const plan = planAdd(working, inputs[index]);
      if (!plan.ok) {
        if (onConflict === 'skip' && plan.error.code === CODES.EDITOR_DUPLICATE_KEY) {
          skipped.push(plan.error.details?.key ?? '');
          continue;
        }
        return failure(CODES.EDITOR_BATCH_FAILED, 'Batch import failed; no entries were added.', {
          index,
          error: plan.error,
        });
      }
      working = plan.document;
      added.push(plan.entry);
    }
    if (!added.length) {
      return { ok: true, entries: [], skipped, revision: this.revision, count: 0 };
    }
    return this.commit(
      working,
      added.map(entry => ({ type: 'add', key: entry.key })),
      {
        ok: true,
        entries: added,
        skipped,
        count: added.length,
        revision: this.revision + 1,
      },
    );
  }

  /** @param {Array<{key:string, patch:object}>} patches */
  updateEntries(patches) {
    this.assertAlive();
    if (!Array.isArray(patches)) {
      return failure(CODES.EDITOR_INVALID_ARGUMENT, 'updateEntries expects an array of {key, patch}.');
    }
    let working = this.document;
    /** @type {BibEntry[]} */
    const updated = [];
    /** @type {Array<{type:string, key:string, changedFields:any[]}>} */
    const actions = [];
    for (let index = 0; index < patches.length; index += 1) {
      const item = patches[index];
      if (!item || typeof item !== 'object' || typeof item.key !== 'string') {
        return failure(CODES.EDITOR_BATCH_FAILED, 'Batch update failed; no entries were changed.', {
          index,
          error: { code: CODES.EDITOR_INVALID_ARGUMENT, message: 'Each item must be {key, patch}.' },
        });
      }
      const plan = planUpdate(working, item.key, item.patch);
      if (!plan.ok) {
        return failure(CODES.EDITOR_BATCH_FAILED, 'Batch update failed; no entries were changed.', {
          index,
          error: plan.error,
        });
      }
      if (!plan.changed) continue;
      working = plan.document;
      updated.push(plan.entry);
      actions.push({ type: 'update', key: item.key, changedFields: plan.changedFields });
    }
    if (!updated.length) {
      return { ok: true, entries: [], revision: this.revision, count: 0 };
    }
    return this.commit(working, actions, {
      ok: true,
      entries: updated,
      count: updated.length,
      revision: this.revision + 1,
    });
  }

  /**
   * @param {string} query
   * @param {{fields?:string[], caseSensitive?:boolean, limit?:number}} [options]
   * @returns {{results:BibEntry[], total:number, truncated:boolean}}
   */
  searchEntries(query, options = {}) {
    this.assertAlive();
    const text = typeof query === 'string' ? query.trim() : '';
    const fields = Array.isArray(options.fields) && options.fields.length
      ? options.fields.map(name => String(name).toLowerCase())
      : DEFAULT_SEARCH_FIELDS;
    const caseSensitive = Boolean(options.caseSensitive);
    const limit = Number.isFinite(options.limit) ? Number(options.limit) : 100;
    const needle = caseSensitive ? text.normalize('NFC') : normalizeSearchText(text);
    const matches = (haystack) => {
      if (!haystack) return false;
      const value = caseSensitive ? String(haystack).normalize('NFC') : normalizeSearchText(haystack);
      return value.includes(needle);
    };
    /** @type {BibEntry[]} */
    const results = [];
    let total = 0;
    for (const entry of this.document.entries) {
      let hit = matches(entry.key) || matches(entry.type);
      if (!hit && text) {
        const resolved = resolveEntryValues(entry, this.document);
        for (const fieldName of fields) {
          if (matches(resolved.fields[fieldName])) {
            hit = true;
            break;
          }
        }
      }
      if (!hit && !text) hit = true;
      if (!hit) continue;
      total += 1;
      if (results.length < limit) results.push(entry);
    }
    return { results, total, truncated: total > results.length };
  }

  /**
   * @param {{profile?: 'generic'|'bibtex'|'biblatex', strict?: boolean}} [options]
   */
  validate(options = {}) {
    this.assertAlive();
    return validateDocument(this.document, {
      profile: options.profile ?? this.options.profile,
      strict: options.strict ?? this.options.strict,
    });
  }

  /** @param {Parameters<typeof serializeBib>[1]} [options] */
  toBibTeX(options = {}) {
    this.assertAlive();
    return serializeBib(this.document, options);
  }

  /**
   * @param {(event: {type:string, revision:number, actions:any[], document:BibDocument}) => void} listener
   * @returns {() => void} unsubscribe
   */
  subscribe(listener) {
    this.assertAlive();
    if (typeof listener !== 'function') {
      throw new BibEditorError(CODES.EDITOR_INVALID_ARGUMENT, 'subscribe() expects a function.');
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit({
      type: 'destroyed',
      revision: this.revision,
      actions: [],
      document: this.document,
    });
    this.listeners.clear();
  }

  /**
   * @param {BibDocument} nextDocument
   * @param {any[]} actions
   * @param {Record<string, unknown>} result
   */
  commit(nextDocument, actions, result) {
    const revision = this.revision + 1;
    const next = {
      ...nextDocument,
      revision,
      dirty: true,
      stats: computeStats(nextDocument),
    };
    deepFreeze(next);
    this.document = next;
    this.revision = revision;
    this.byKey = indexFirstKeys(next);
    const event = {
      type: 'change',
      revision,
      actions,
      document: next,
    };
    this.emit(event);
    return { ...result, revision };
  }

  /** @param {{type:string, revision:number, actions:any[], document:BibDocument}} event */
  emit(event) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        if (typeof this.options.onListenerError === 'function') {
          this.options.onListenerError(error);
        } else if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('BibEditor listener failed:', error);
        }
      }
    }
  }
}

/**
 * Create a Bib Editor Engine from a parsed document or a `.bib` string.
 *
 * @param {BibDocument|string} input
 * @param {{profile?: 'generic'|'bibtex'|'biblatex', strict?: boolean,
 *   parse?: {filename?: string, maxDiagnostics?: number},
 *   onListenerError?: (error: unknown) => void}} [options]
 * @returns {BibEditor}
 */
export function createBibEditor(input, options = {}) {
  const document = typeof input === 'string'
    ? parseBibSource(input, options.parse ?? {})
    : assertBibDocument(input);
  return new BibEditor(document, options);
}
