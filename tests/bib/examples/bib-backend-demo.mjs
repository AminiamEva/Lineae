#!/usr/bin/env node
/**
 * Standalone demonstration of the Bib backend.
 *
 * It imports ONLY the public entry point (`apps/web/bib/index.mjs`), plus Node's
 * standard library to read a local `.bib` file. No UI, no Tiptap, no ProseMirror,
 * no main application code, no internal module imports.
 *
 * Run:
 *   node tests/bib/examples/bib-backend-demo.mjs
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkTexCitations,
  createBibEditor,
  parseBib,
  preflightBib,
} from '../../../apps/web/bib/index.mjs';

/**
 * @returns {{
 *   parsed: number,
 *   searched: string[],
 *   added: string,
 *   updatedYear: string,
 *   removed: string,
 *   exportedEntries: number,
 *   missingCitations: number,
 *   destroyBlocked: boolean,
 *   bibText: string
 * }}
 */
export function runDemo() {
  const fixture = join('tests', 'bib', 'compile', 'fixtures', 'base.bib');
  const source = readFileSync(fixture, 'utf8');

  // 1. Import and parse.
  const document = parseBib(source, { filename: 'base.bib' });

  // 2. Open the editor.
  const editor = createBibEditor(document, { profile: 'biblatex' });

  // 3. Search.
  const search = editor.searchEntries('Turing');
  const searched = search.results.map(entry => entry.key);

  // 4. Add.
  const added = editor.addEntry({
    key: 'shannon1948',
    type: 'article',
    fields: {
      author: 'Shannon, Claude E.',
      title: 'A Mathematical Theory of Communication',
      journal: 'Bell System Technical Journal',
      year: '1948',
    },
  });
  if (!added.ok) throw new Error(`addEntry failed: ${added.error.code}`);

  // 5. Update.
  const updated = editor.updateEntry('knuth1984', { fields: { year: '2025' } });
  if (!updated.ok) throw new Error(`updateEntry failed: ${updated.error.code}`);

  // 6. Remove.
  const removed = editor.removeEntry('turing1950');
  if (!removed.ok) throw new Error(`removeEntry failed: ${removed.error.code}`);

  // 7. Check citations in a .tex fragment.
  const tex = 'See \\cite{knuth1984,shannon1948}.';
  const citations = checkTexCitations(tex, editor.getDocument());

  // 8. Export, but only after the compile preflight accepts the exact bytes.
  const preflight = preflightBib(editor.getDocument());
  if (!preflight.ok) {
    throw new Error(`preflight failed: ${preflight.diagnostics.map(item => item.code).join(',')}`);
  }
  const bibText = preflight.text;

  // 9. Destroy.
  editor.destroy();
  let destroyBlocked = false;
  try {
    editor.getEntries();
  } catch (error) {
    destroyBlocked = error.code === 'BIB406';
  }

  return {
    parsed: document.entries.length,
    searched,
    added: added.entry.key,
    updatedYear: '2025',
    removed: removed.entry.key,
    exportedEntries: parseBib(bibText).entries.length,
    missingCitations: citations.missing.length,
    preflightOk: preflight.ok,
    destroyBlocked,
    bibText,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runDemo();
    const { bibText, ...summary } = result;
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\nExported .bib (${bibText.length} characters):`);
    console.log(bibText);
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}
