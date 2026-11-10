/**
 * Independent expectations for the editor -> serialized bib -> TeX compilation
 * matrix.
 *
 * The expected strings below were written from the intended bibliography
 * content, NOT generated from serializer output. The harness checks them
 * against the exported `.bib`, the generated `.bbl` and the PDF text.
 *
 * Every case starts from `fixtures/base.bib` and mutates it through the public
 * Editor API only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyCitationRenames, resolveEntry } from '../../../apps/web/bib/index.mjs';

export const FIXTURE_DIR = join('tests', 'bib', 'compile', 'fixtures');

export const TEMPLATES = {
  bibtex: 'main-bibtex.tex',
  biblatex: 'main-biblatex.tex',
};

/** @param {string} name */
export function fixture(name) {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

export function loadBaseBib() {
  return fixture('base.bib');
}

export function loadTemplate(backend) {
  return fixture(TEMPLATES[backend]);
}

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   backends: Array<'bibtex'|'biblatex'>,
 *   entryCount: number,
 *   edit: (editor: any) => any,
 *   tex?: (tex: string) => string,
 *   expected: {
 *     bibContains?: string[],
 *     bibNotContains?: string[],
 *     bblContains?: string[],
 *     bblNotContains?: string[],
 *     pdfContains?: string[],
 *     pdfNotContains?: string[],
 *     pdfIdenticalToBaseline?: boolean,
 *     texContains?: string[],
 *     pageCount?: 'same'|'any',
 *     visual?: 'identical'|'changed',
 *     layout?: 'same'|'compatible'
 *   }
 * }} CompileCase
 */

/** @type {CompileCase[]} */
export const CASES = [
  {
    id: 'author',
    title: '修改作者',
    backends: ['bibtex', 'biblatex'],
    entryCount: 6,
    edit: editor => editor.updateEntry('knuth1984', {
      fields: { author: 'Turing, Alan M. and Church, Alonzo' },
    }),
    expected: {
      bibContains: ['Turing, Alan M.', 'Church, Alonzo'],
      bibNotContains: ['Knuth, Donald E.'],
      bblContains: ['Turing', 'Church'],
      bblNotContains: ['Knuth'],
      pdfContains: ['Turing', 'Church'],
      pdfNotContains: ['Knuth'],
      pdfIdenticalToBaseline: false,
      pageCount: 'same',
      visual: 'changed',
      layout: 'same',
    },
  },
  {
    id: 'title',
    title: '修改标题',
    backends: ['bibtex', 'biblatex'],
    entryCount: 6,
    edit: editor => editor.updateEntry('knuth1984', {
      fields: { title: 'Selected Papers on Analysis of Algorithms' },
    }),
    expected: {
      bibContains: ['Selected Papers on Analysis of Algorithms'],
      bibNotContains: ['The {\\TeX}book'],
      bblContainsCI: ['selected papers on analysis of algorithms'],
      bblNotContainsCI: ['texbook'],
      pdfContainsCI: ['selected papers', 'algorithms'],
      pdfNotContainsCI: ['texbook'],
      pdfIdenticalToBaseline: false,
      pageCount: 'same',
      visual: 'changed',
      layout: 'same',
    },
  },
  {
    id: 'year',
    title: '修改年份',
    backends: ['bibtex', 'biblatex'],
    entryCount: 6,
    edit: editor => editor.updateEntry('knuth1984', { fields: { year: '2025' } }),
    expected: {
      bibContains: ['year        = {2025}'],
      bibNotContains: ['year        = {1984}'],
      bblContains: ['2025'],
      pdfContains: ['2025'],
      pdfIdenticalToBaseline: false,
      pageCount: 'same',
      visual: 'changed',
      layout: 'same',
    },
  },
  {
    id: 'doi',
    title: '修改 DOI（BibLaTeX 打印 DOI）',
    backends: ['biblatex'],
    entryCount: 6,
    edit: editor => editor.updateEntry('knuth1984', {
      fields: { doi: '10.1000/new.2025' },
    }),
    expected: {
      bibContains: ['doi         = {10.1000/new.2025}'],
      bibNotContains: ['10.5555/knuth.1984'],
      bblContains: ['10.1000/new.2025'],
      bblNotContains: ['10.5555/knuth.1984'],
      pdfContains: ['10.1000/new.2025'],
      pdfNotContains: ['10.5555/knuth.1984'],
      pdfIdenticalToBaseline: false,
      pageCount: 'same',
      visual: 'changed',
      layout: 'same',
    },
  },
  {
    id: 'key',
    title: '修改 citation key（同步 \\cite）',
    backends: ['bibtex', 'biblatex'],
    entryCount: 6,
    edit: editor => editor.renameEntry('knuth1984', 'knuth84'),
    tex: tex => applyCitationRenames(tex, { knuth1984: 'knuth84' }).text,
    expected: {
      bibContains: ['@article{knuth84,'],
      bibNotContains: ['knuth1984'],
      bblContains: ['knuth84'],
      texContains: ['\\cite{knuth84}'],
      pdfIdenticalToBaseline: true,
      pageCount: 'same',
      visual: 'identical',
      layout: 'same',
    },
  },
  {
    id: 'add',
    title: '新增文献',
    backends: ['bibtex', 'biblatex'],
    entryCount: 7,
    edit: editor => editor.addEntry({
      key: 'shannon1948',
      type: 'article',
      fields: {
        author: 'Shannon, Claude E.',
        title: 'A Mathematical Theory of Communication',
        journal: 'Bell System Technical Journal',
        year: '1948',
        volume: '27',
        pages: '379--423',
      },
    }),
    expected: {
      bibContains: ['@article{shannon1948,', 'Shannon, Claude E.'],
      bblContains: ['Shannon'],
      pdfContains: ['Shannon'],
      pdfContainsCI: ['mathematical theory'],
      pdfIdenticalToBaseline: false,
      pageCount: 'any',
      visual: 'changed',
      layout: 'compatible',
    },
  },
  {
    id: 'remove',
    title: '删除文献',
    backends: ['bibtex', 'biblatex'],
    entryCount: 5,
    edit: editor => editor.removeEntry('turing1950'),
    expected: {
      bibNotContains: ['turing1950'],
      bblNotContains: ['Turing'],
      pdfNotContains: ['Turing'],
      pdfIdenticalToBaseline: false,
      pageCount: 'any',
      visual: 'changed',
      layout: 'compatible',
    },
  },
  {
    id: 'crossref',
    title: '修改 crossref',
    backends: ['bibtex', 'biblatex'],
    entryCount: 6,
    edit: editor => editor.updateEntry('child2020', {
      fields: { crossref: 'parentB' },
    }),
    tex: tex => tex.replace('\\nocite{*}', '\\nocite{knuth1984,child2020}'),
    expected: {
      bibContains: ['crossref  = {parentB}'],
      bblContains: ['Springer', 'Berlin'],
      bblNotContains: ['New York'],
      pdfContains: ['Springer', 'Berlin'],
      pdfNotContains: ['New York'],
      pdfIdenticalToBaseline: false,
      pageCount: 'same',
      visual: 'changed',
      layout: 'same',
    },
  },
  {
    id: 'macro',
    title: '修改使用 @string 宏的字段',
    backends: ['bibtex', 'biblatex'],
    entryCount: 6,
    edit: editor => editor.updateEntry('knuth1984', {
      fields: { journal: 'Journal of Testing' },
    }),
    expected: {
      bibContains: ['journal     = {Journal of Testing}'],
      bibNotContains: ['journal     = acmtrans'],
      bblContains: ['Journal of Testing'],
      bblNotContains: ['ACM Transactions'],
      pdfContains: ['Journal of Testing'],
      pdfNotContains: ['ACM Transactions'],
      pdfIdenticalToBaseline: false,
      pageCount: 'same',
      visual: 'changed',
      layout: 'same',
    },
  },
  {
    id: 'unknown',
    title: '保留并修改未知字段',
    backends: ['bibtex', 'biblatex'],
    entryCount: 6,
    edit: editor => editor.updateEntry('knuth1984', {
      fields: {
        customfield: 'keep-me-updated',
        newfield: 'added-value',
      },
    }),
    expected: {
      bibContains: ['customfield = {keep-me-updated}', 'newfield', 'added-value'],
      pdfIdenticalToBaseline: true,
      pageCount: 'same',
      visual: 'identical',
      layout: 'same',
    },
  },
];

/** @param {string} id */
export function getCase(id) {
  const testCase = CASES.find(item => item.id === id);
  if (!testCase) throw new Error(`Unknown compile case: ${id}`);
  return testCase;
}

/**
 * Apply a case through the public Editor API.
 * @param {import('../../../apps/web/bib/index.mjs').BibEditor} editor
 * @param {string} id
 */
export function applyCase(editor, id) {
  const testCase = getCase(id);
  const result = testCase.edit(editor);
  if (!result || result.ok !== true) {
    throw new Error(`Case "${id}" edit failed: ${JSON.stringify(result?.error ?? result)}`);
  }
  return result;
}

/**
 * Apply a case's `.tex` transformation, if any.
 * @param {CompileCase} testCase
 * @param {string} tex
 */
export function applyTexTransform(testCase, tex) {
  return typeof testCase.tex === 'function' ? testCase.tex(tex) : tex;
}

/**
 * Check literal expectations against the exported `.bib` text. Returns a list
 * of human-readable errors; empty means OK.
 *
 * @param {string} bibText
 * @param {CompileCase} testCase
 */
export function checkBibExpectations(bibText, testCase) {
  const errors = [];
  for (const needle of testCase.expected.bibContains ?? []) {
    if (!bibText.includes(needle)) errors.push(`missing in .bib: ${needle}`);
  }
  for (const needle of testCase.expected.bibNotContains ?? []) {
    if (bibText.includes(needle)) errors.push(`unexpected in .bib: ${needle}`);
  }
  return errors;
}

/**
 * Check literal expectations against `.bbl`, PDF text and `.tex` text.
 *
 * @param {{bbl?: string, pdfText?: string, tex?: string}} actual
 * @param {CompileCase} testCase
 */
export function checkOutputExpectations(actual, testCase) {
  const errors = [];
  const check = (haystack, needles, label, present) => {
    if (haystack === undefined) return;
    for (const needle of needles ?? []) {
      const found = haystack.includes(needle);
      if (found !== present) errors.push(`${present ? 'missing' : 'unexpected'} in ${label}: ${needle}`);
    }
  };
  check(actual.bbl, testCase.expected.bblContains, '.bbl', true);
  check(actual.bbl, testCase.expected.bblNotContains, '.bbl', false);
  check(actual.pdfText, testCase.expected.pdfContains, 'PDF text', true);
  check(actual.pdfText, testCase.expected.pdfNotContains, 'PDF text', false);
  const checkCI = (haystack, needles, label, present) => {
    if (haystack === undefined) return;
    const lower = haystack.toLowerCase();
    for (const needle of needles ?? []) {
      const found = lower.includes(needle.toLowerCase());
      if (found !== present) errors.push(`${present ? 'missing' : 'unexpected'} in ${label} (case-insensitive): ${needle}`);
    }
  };
  checkCI(actual.bbl, testCase.expected.bblContainsCI, '.bbl', true);
  checkCI(actual.bbl, testCase.expected.bblNotContainsCI, '.bbl', false);
  checkCI(actual.pdfText, testCase.expected.pdfContainsCI, 'PDF text', true);
  checkCI(actual.pdfText, testCase.expected.pdfNotContainsCI, 'PDF text', false);
  check(actual.tex, testCase.expected.texContains, '.tex', true);
  return errors;
}

/**
 * Independent semantic comparison between the edited document and the
 * re-parsed serialized document. This catches data loss that a syntax-only
 * re-parse check (serializer `verify`) would miss.
 *
 * @param {any} editedDocument
 * @param {any} reparsedDocument
 */
export function checkSemanticInvariants(editedDocument, reparsedDocument) {
  const errors = [];
  const left = editedDocument.entries;
  const right = reparsedDocument.entries;
  if (left.length !== right.length) {
    errors.push(`entry count changed: ${left.length} -> ${right.length}`);
    return errors;
  }
  for (let index = 0; index < left.length; index += 1) {
    const before = resolveEntry(left[index], editedDocument);
    const after = resolveEntry(right[index], reparsedDocument);
    if (before.key !== after.key) errors.push(`key changed at ${index}: ${before.key} -> ${after.key}`);
    if (before.type !== after.type) errors.push(`type changed at ${index}: ${before.type} -> ${after.type}`);
    const names = [...new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])].sort();
    for (const name of names) {
      if (before.fields[name] !== after.fields[name]) {
        errors.push(`field ${name} changed at ${index}: ${JSON.stringify(before.fields[name])} -> ${JSON.stringify(after.fields[name])}`);
      }
    }
    if (before.unresolved.length !== after.unresolved.length) {
      errors.push(`unresolved macro count changed at ${index}`);
    }
  }
  return errors;
}
