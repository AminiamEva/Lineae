#!/usr/bin/env node
/**
 * L3/L4 harness for REAL EDITS.
 *
 * For every case in `cases.mjs`:
 *   1. parse the base bibliography through the public parser;
 *   2. apply the edit through the public Editor API;
 *   3. validate and serialize through the public API;
 *   4. check independently authored `.bib` expectations;
 *   5. compile the edited project with XeLaTeX + BibTeX/Biber;
 *   6. compare `.bbl`, PDF text, page count, fonts, layout metrics and rendered
 *      page images against the baseline.
 *
 * It also compiles the untouched parse -> serialize round-trip and requires
 * byte-identical rendering (no visual change).
 *
 * Without a TeX toolchain it performs the engine-level expectations only and
 * exits 2 with UNVERIFIED. It never turns a missing tool into a pass.
 *
 * Usage:
 *   node tests/bib/compile/run-editor-compile.mjs \
 *     --tex-bin=<dir containing xelatex/bibtex/biber> \
 *     --poppler-bin=<dir containing pdfinfo/pdftotext/pdffonts/pdftoppm> \
 *     [--json] [--keep] [--dpi=150]
 *
 * Exit codes: 0 all layers verified and passing, 1 a check failed,
 *             2 toolchain/layer unavailable (UNVERIFIED).
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createBibEditor,
  parseBib,
  preflightBib,
  serializeBib,
  validateBib,
} from '../../../apps/web/bib/index.mjs';
import { createToolchain } from './lib/tools.mjs';
import {
  compareFonts,
  compareLayout,
  comparePageImages,
  normalizeText,
} from '../pdf/visual-lib.mjs';
import {
  CASES,
  applyCase,
  applyTexTransform,
  checkBibExpectations,
  checkOutputExpectations,
  checkSemanticInvariants,
  loadBaseBib,
  loadTemplate,
} from './cases.mjs';

const argv = process.argv.slice(2);
/** @param {string} name */
function option(name) {
  const prefix = `--${name}=`;
  const item = argv.find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}
const TEX_BIN = option('tex-bin') ?? process.env.LINEAE_TEX_BIN ?? '';
const POPPLER_BIN = option('poppler-bin') ?? process.env.LINEAE_POPPLER_BIN ?? '';
const DPI = Number(option('dpi') ?? 150);
const JSON_OUTPUT = argv.includes('--json');
const KEEP = argv.includes('--keep');
const OUT_PATH = option('out');

const toolchain = createToolchain({ extraPaths: [TEX_BIN, POPPLER_BIN].filter(Boolean) });
const work = mkdtempSync(join(tmpdir(), 'lineae-editor-compile-'));
const baseBib = loadBaseBib();
const baseDocument = parseBib(baseBib);
const results = [];
/** @type {any[]} */
const roundTrips = [];
let engineFailures = 0;

/** @param {string} backend */
function profileFor(backend) {
  return backend === 'bibtex' ? 'bibtex' : 'biblatex';
}

/** @param {string} backend */
function backendAvailable(backend) {
  return Boolean(toolchain.commands.xelatex && (backend === 'bibtex' ? toolchain.commands.bibtex : toolchain.commands.biber));
}

/** @param {string} name */
function projectDirectory(name) {
  const directory = join(work, name);
  mkdirSync(directory, { recursive: true });
  return directory;
}

/** @param {string} directory @param {string} backend @param {string} bibText @param {string} texText */
function writeProject(directory, backend, bibText, texText) {
  writeFileSync(join(directory, 'refs.bib'), bibText);
  writeFileSync(join(directory, 'main.tex'), texText);
  if (backend === 'biblatex') writeFileSync(join(directory, 'refs.bib'), bibText);
}

/**
 * @param {string} name
 * @param {string} backend
 * @param {string} bibText
 * @param {string} texText
 */
function compileProject(name, backend, bibText, texText) {
  const directory = projectDirectory(name);
  writeProject(directory, backend, bibText, texText);
  const logPath = join(directory, 'compile.log');
  writeFileSync(logPath, '');
  try {
    toolchain.compileProject(directory, backend, logPath);
    return {
      directory,
      ok: true,
      analysis: toolchain.analyzeDocument(directory),
      bbl: toolchain.readBbl(directory),
      log: readFileSync(logPath, 'utf8'),
    };
  } catch (error) {
    return {
      directory,
      ok: false,
      error: error.message,
      log: readFileSync(logPath, 'utf8'),
    };
  }
}

/**
 * Compile a project only if the backend is available; otherwise return an
 * UNVERIFIED marker.
 * @param {string} name
 * @param {string} backend
 * @param {string} bibText
 * @param {string} texText
 */
function compileIfAvailable(name, backend, bibText, texText) {
  if (!backendAvailable(backend)) {
    return { ok: false, unverified: true, reason: `${backend} is not available` };
  }
  return compileProject(name, backend, bibText, texText);
}

/**
 * Compare baseline and candidate documents across every available layer.
 * `null` means that layer could not be verified.
 *
 * @param {{ok:boolean, analysis?:any, bbl?:string}} baseline
 * @param {{ok:boolean, analysis?:any, bbl?:string}} candidate
 * @param {{mode:'identical'|'changed', layout:'same'|'compatible'}} expectations
 */
function compareDocuments(baseline, candidate, expectations) {
  const checks = {};
  if (!baseline.ok || !candidate.ok) {
    return { checks: { compile: false }, failure: candidate.error ?? baseline.error ?? 'compilation failed' };
  }
  const left = baseline.analysis;
  const right = candidate.analysis;
  const both = key => Boolean(left[key] && right[key]);

  checks.pageCount = both('info')
    ? {
        ok: expectations.pageCount === 'same'
          ? left.info.parsed.pages === right.info.parsed.pages
          : true,
        value: [left.info.parsed.pages, right.info.parsed.pages],
      }
    : null;

  checks.text = both('text')
    ? {
        ok: expectations.mode === 'changed' ? true : normalizeText(left.text) === normalizeText(right.text),
        value: null,
      }
    : null;

  checks.fonts = both('fonts')
    ? (() => {
        const comparison = compareFonts(left.fonts.parsed, right.fonts.parsed);
        return { ok: comparison.same, value: comparison };
      })()
    : null;

  checks.layout = both('layout')
    ? (() => {
        const comparison = compareLayout(left.layout, right.layout, { mode: expectations.layout });
        return { ok: comparison.sameStructure, value: comparison };
      })()
    : null;

  checks.visual = both('images')
    ? (() => {
        const comparison = comparePageImages(left.images, right.images);
        if (expectations.mode === 'identical') {
          return { ok: comparison.identical, value: comparison };
        }
        const changed = comparison.overallRatio > 0 || !comparison.pageCountSame;
        const bounded = comparison.maxPageRatio === null || comparison.maxPageRatio < 0.6;
        return { ok: changed && bounded, value: comparison };
      })()
    : null;

  return { checks };
}

// ---------------------------------------------------------------------------
// Engine-level dry run: always executed, even without TeX.
// ---------------------------------------------------------------------------
for (const testCase of CASES) {
  for (const backend of testCase.backends) {
    const editor = createBibEditor(baseDocument, { profile: profileFor(backend) });
    const entryCountBefore = editor.getEntries().length;
    const errors = [];
    try {
      applyCase(editor, testCase.id);
      const document = editor.getDocument();
      if (editor.getEntries().length !== testCase.entryCount) {
        errors.push(`entry count ${editor.getEntries().length} != ${testCase.entryCount}`);
      }
      const report = validateBib(document, { profile: profileFor(backend) });
      if (!report.ok) errors.push(...report.diagnostics.filter(item => item.severity === 'error').map(item => `${item.code}: ${item.message}`));
      const preflight = preflightBib(document);
      if (!preflight.ok) {
        errors.push(...preflight.diagnostics
          .filter(item => item.severity === 'error')
          .map(item => `preflight ${item.code}: ${item.message}`));
      }
      const bibText = preflight.text;
      errors.push(...checkBibExpectations(bibText, testCase));
      const reparsed = preflight.document;
      if (reparsed.entries.length !== testCase.entryCount) errors.push('serialized .bib lost entries');
      errors.push(...checkSemanticInvariants(document, reparsed));
      const tex = applyTexTransform(testCase, loadTemplate(backend));
      errors.push(...checkOutputExpectations({ tex }, testCase));
      if (editor.getEntries().length !== entryCountBefore) {
        // Expected for add/remove; just recorded via entry count above.
      }
      editor.destroy();
    } catch (error) {
      errors.push(error.message);
    }
    if (errors.length) engineFailures += 1;
    results.push({
      case: testCase.id,
      backend,
      title: testCase.title,
      engine: { ok: errors.length === 0, errors },
      compile: null,
      checks: {},
      status: errors.length ? 'FAIL' : 'UNVERIFIED',
    });
  }
}

if (!toolchain.commands.xelatex) {
  console.log('UNVERIFIED: xelatex is not installed or cannot be executed.');
  console.log('Engine-level edit expectations were executed; no TeX compilation was performed.');
  console.log('Provide --tex-bin and --poppler-bin to run L3/L4.');
} else {
  // -------------------------------------------------------------------------
  // Baseline and untouched round-trip, per backend.
  // -------------------------------------------------------------------------
  /** @type {Map<string, any>} */
  const baselineByBackend = new Map();

  for (const backend of ['bibtex', 'biblatex']) {
    if (!backendAvailable(backend)) {
      roundTrips.push({ backend, status: 'UNVERIFIED', reason: `${backend} is not available` });
      continue;
    }
    const template = loadTemplate(backend);
    const baseline = compileProject(`baseline-${backend}`, backend, baseBib, template);
    if (!baseline.ok) {
      roundTrips.push({ backend, status: 'FAIL', reason: baseline.error });
      continue;
    }
    baselineByBackend.set(backend, baseline);

    const roundTripBib = serializeBib(baseDocument);
    if (roundTripBib !== baseBib) {
      roundTrips.push({ backend, status: 'FAIL', reason: 'round-trip changed bytes' });
      continue;
    }
    const roundTrip = compileProject(`roundtrip-${backend}`, backend, roundTripBib, template);
    if (!roundTrip.ok) {
      roundTrips.push({ backend, status: 'FAIL', reason: roundTrip.error });
      continue;
    }
    const comparison = compareDocuments(baseline, roundTrip, {
      mode: 'identical',
      layout: 'same',
      pageCount: 'same',
    });
    const failed = Object.entries(comparison.checks).filter(([, value]) => value && value.ok === false);
    const unverified = Object.entries(comparison.checks).filter(([, value]) => value === null);
    roundTrips.push({
      backend,
      status: failed.length ? 'FAIL' : unverified.length ? 'PARTIAL' : 'PASS',
      checks: comparison.checks,
      failures: failed.map(([name]) => name),
      unverified: unverified.map(([name]) => name),
    });
  }

  // -------------------------------------------------------------------------
  // Every edited case.
  // -------------------------------------------------------------------------
  for (const result of results) {
    if (result.engine.ok === false) {
      result.compile = { ok: false, reason: 'engine expectations failed' };
      continue;
    }
    const testCase = CASES.find(item => item.id === result.case);
    const backend = result.backend;
    if (!backendAvailable(backend)) {
      result.status = 'UNVERIFIED';
      result.compile = { ok: false, unverified: true, reason: `${backend} is not available` };
      continue;
    }
    const baseline = baselineByBackend.get(backend);
    if (!baseline) {
      result.status = 'UNVERIFIED';
      result.compile = { ok: false, unverified: true, reason: 'baseline compilation failed' };
      continue;
    }

    const editor = createBibEditor(baseDocument, { profile: profileFor(backend) });
    applyCase(editor, testCase.id);
    const preflight = preflightBib(editor.getDocument());
    const bibText = preflight.text;
    const texText = applyTexTransform(testCase, loadTemplate(backend));
    editor.destroy();
    if (!preflight.ok) {
      result.status = 'FAIL';
      result.compile = {
        ok: false,
        error: `preflight rejected serialized output: ${preflight.diagnostics
          .filter(item => item.severity === 'error')
          .map(item => item.code)
          .join(',')}`,
      };
      continue;
    }

    const compiled = compileProject(`case-${testCase.id}-${backend}`, backend, bibText, texText);
    result.compile = { ok: compiled.ok, error: compiled.error ?? null };
    if (!compiled.ok) {
      result.status = 'FAIL';
      continue;
    }
    const outputErrors = checkOutputExpectations(
      { bbl: compiled.bbl, pdfText: compiled.analysis.text, tex: texText },
      testCase,
    );
    const comparison = compareDocuments(baseline, compiled, {
      mode: testCase.expected.pdfIdenticalToBaseline ? 'identical' : 'changed',
      layout: testCase.expected.layout ?? 'same',
      pageCount: testCase.expected.pageCount ?? 'any',
    });
    result.checks = {
      output: { ok: outputErrors.length === 0, errors: outputErrors },
      ...comparison.checks,
    };
    const failures = Object.entries(result.checks)
      .filter(([, value]) => value && value.ok === false)
      .map(([name]) => name);
    const unverified = Object.entries(result.checks)
      .filter(([, value]) => value === null)
      .map(([name]) => name);
    result.status = failures.length ? 'FAIL' : unverified.length ? 'PARTIAL' : 'PASS';
    result.failures = failures;
    result.unverified = unverified;
  }
}

const summary = {
  pass: results.filter(item => item.status === 'PASS').length,
  fail: results.filter(item => item.status === 'FAIL').length,
  partial: results.filter(item => item.status === 'PARTIAL').length,
  unverified: results.filter(item => item.status === 'UNVERIFIED').length,
  roundTrips,
};
const report = {
  environment: {
    node: process.version,
    platform: process.platform,
    tools: toolchain.versions(),
  },
  workDirectory: work,
  layerStatus: {
    engine: engineFailures === 0 ? 'PASS' : 'FAIL',
    l3: toolchain.commands.xelatex ? (summary.fail ? 'FAIL' : 'PASS') : 'UNVERIFIED',
    l4: toolchain.commands.pdftoppm && toolchain.commands.pdftotext && toolchain.commands.pdffonts && toolchain.commands.pdfinfo
      ? (summary.fail || summary.partial ? 'FAIL' : 'PASS')
      : 'UNVERIFIED',
  },
  summary,
  cases: results,
  roundTrips,
};

if (OUT_PATH) {
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report written to ${OUT_PATH}`);
}

if (JSON_OUTPUT) console.log(JSON.stringify(report, null, 2));
else {  console.log(`Work directory: ${work}`);
  console.log(`Tools: xelatex=${toolchain.commands.xelatex ?? 'missing'} bibtex=${toolchain.commands.bibtex ?? 'missing'} biber=${toolchain.commands.biber ?? 'missing'} pdftoppm=${toolchain.commands.pdftoppm ?? 'missing'}`);
  console.log('\nEngine-level expectations:');
  for (const result of results) {
    console.log(`  ${result.status.padEnd(10)} ${result.case}/${result.backend} ${result.engine.ok ? '' : result.engine.errors.join('; ')}`);
  }
  console.log('\nRound-trip visual checks:');
  for (const item of roundTrips) console.log(`  ${item.status.padEnd(10)} ${item.backend} ${item.failures?.join(',') ?? item.reason ?? ''}`);
  if (toolchain.commands.xelatex) {
    console.log('\nEdited-case checks:');
    for (const result of results) {
      const detail = result.status === 'FAIL'
        ? (result.failures ?? []).join(',')
        : result.status === 'PARTIAL'
          ? `unverified: ${(result.unverified ?? []).join(',')}`
          : '';
      console.log(`  ${result.status.padEnd(10)} ${result.case}/${result.backend} ${detail}`);
    }
  }
  console.log('\nSummary:', summary);
  if (!toolchain.commands.xelatex) {
    console.log('UNVERIFIED: TeX compilation and PDF visual comparison were not performed.');
  }
}

const failed = results.some(item => item.status === 'FAIL') || roundTrips.some(item => item.status === 'FAIL') || engineFailures > 0;
const fullyVerified = toolchain.commands.xelatex
  && results.length > 0
  && results.every(item => item.status === 'PASS')
  && roundTrips.every(item => item.status === 'PASS');
if (failed) process.exitCode = 1;
else if (!fullyVerified) process.exitCode = 2;

if (!KEEP && !JSON_OUTPUT) {
  rmSync(work, { recursive: true, force: true });
} else if (!JSON_OUTPUT) {
  console.log(`Kept work directory: ${work}`);
}
