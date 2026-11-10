/**
 * Compile preflight: serialize the current document, re-parse the exact text
 * that would be handed to BibTeX/Biber, and report the latest diagnostics.
 *
 * This deliberately does not trust `document.diagnostics` from an earlier
 * parse of an edited document: after edits, only a fresh re-parse of the
 * serialized output describes what an external tool would read.
 *
 * `preflightBib` proves that the output can be parsed by THIS engine. It is not
 * an external BibTeX/Biber run, not a semantic-equivalence proof and not a
 * PDF layout check.
 *
 * @module bib/preflight
 */

import { assertBibDocument } from './model.mjs';
import { parseBibSource } from './parser.mjs';
import { serializeBib } from './serializer.mjs';

/**
 * @typedef {import('./model.mjs').BibDocument} BibDocument
 * @typedef {import('./diagnostics.mjs').Diagnostic} Diagnostic
 */

/**
 * @param {BibDocument} document
 * @param {{
 *   eol?: 'preserve'|'lf'|'crlf',
 *   bom?: 'preserve'|'never',
 *   finalNewline?: 'preserve'|'ensure'|'none',
 *   preserveFormatting?: boolean,
 *   filename?: string
 * }} [options]
 * @returns {{
 *   ok: boolean,
 *   text: string,
 *   diagnostics: Diagnostic[],
 *   errorCount: number,
 *   warningCount: number,
 *   document: BibDocument
 * }}
 */
export function preflightBib(document, options = {}) {
  const doc = assertBibDocument(document);
  // verify:false is intentional: we need the exact text even when it contains
  // pre-existing errors, so the caller can inspect every diagnostic.
  const text = serializeBib(doc, {
    eol: options.eol,
    bom: options.bom,
    finalNewline: options.finalNewline,
    preserveFormatting: options.preserveFormatting,
    verify: false,
  });
  const reparsed = parseBibSource(text, {
    filename: options.filename ?? doc.source.filename ?? undefined,
  });
  const diagnostics = reparsed.diagnostics;
  let errorCount = 0;
  let warningCount = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error') errorCount += 1;
    else if (diagnostic.severity === 'warning') warningCount += 1;
  }
  return {
    ok: errorCount === 0,
    text,
    diagnostics,
    errorCount,
    warningCount,
    document: reparsed,
  };
}
