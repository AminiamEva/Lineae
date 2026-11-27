#!/usr/bin/env node
/**
 * L3/L4 verification: compile the representative `.tex` projects twice — once
 * with the original `refs.bib`, once with the engine's parse -> serialize
 * round-trip — and compare the generated `.bbl` (and PDF text when pdftotext is
 * available).
 *
 * This script is deliberately separate from the unit test suite. When the TeX
 * toolchain is missing it prints UNVERIFIED and exits with code 2; it never
 * reports a pass it did not observe.
 *
 * Usage (from the repository root):
 *   node tests/bib/verify-xelatex.mjs [--keep]
 *
 * Exit codes: 0 verified, 1 mismatch/failure, 2 toolchain unavailable.
 */

import { createToolchain } from './compile/lib/tools.mjs';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseBib, serializeBib } from '../../apps/web/bib/index.mjs';
import { ACCEPTANCE_CASES } from './acceptance/manifest.mjs';

const KEEP = process.argv.includes('--keep');
const ACCEPTANCE = process.argv.includes('--acceptance');
const OUT_ARG = process.argv.find(value => value.startsWith('--out='));
const OUT_DIR = OUT_ARG ? resolve(OUT_ARG.slice('--out='.length)) : null;
const CASES = [
  { name: 'bibtex', backend: 'bibtex', directory: join('tests', 'bib', 'xelatex', 'bibtex') },
  { name: 'biblatex', backend: 'biber', directory: join('tests', 'bib', 'xelatex', 'biblatex') },
];

/** @param {string} file */
function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'xelatex';
const driver = process.argv.find(arg => arg.startsWith('--driver='))?.slice(9) ?? 'latexmk';

const toolchain = createToolchain({ engine, driver });
const TOOLS = toolchain.commands;
process.on('exit', () => toolchain.cleanup());

if (!TOOLS[engine] || (driver === 'latexmk' && !TOOLS.latexmk)) {
  console.log('BLOCKED: unavailable compiler or driver: ' + engine + ' / ' + driver);
  console.log('L3 (BibTeX/Biber) and L4 (PDF text) verification were NOT performed.');
  console.log('Install a TeX distribution that provides xelatex, bibtex and biber, then run:');
  console.log('  node tests/bib/verify-xelatex.mjs');
  process.exitCode = 2;
} else {
  if (OUT_DIR) mkdirSync(OUT_DIR, { recursive: true });
  const work = OUT_DIR
    ? (readdirSync(OUT_DIR).length ? mkdtempSync(join(OUT_DIR, 'run-')) : OUT_DIR)
    : mkdtempSync(join(tmpdir(), 'lineae-bib-'));
  console.log(`Work directory: ${work}`);
  let failures = 0;
  let skipped = 0;
  const { versions } = toolchain.versions();
  const report = {
    engine, driver,
    tools: Object.fromEntries(Object.entries(TOOLS).map(([name, command]) =>
      [name, { command, version: versions[name] }])),
    cases: [],
    browserPreview: 'not-run: browser preview has no TeX layout engine',
  };
  try {
    for (const testCase of CASES) {
      const backendTool = testCase.backend === 'bibtex' ? TOOLS.bibtex : TOOLS.biber;
      console.log(`\n=== ${testCase.name} (${testCase.backend}) ===`);
      if (!backendTool) {
        console.log(`BLOCKED: ${testCase.backend} is not installed; case skipped.`);
        skipped += 1;
        report.cases.push({ name: testCase.name, status: 'BLOCKED', reason: `${testCase.backend} missing` });
        continue;
      }
      const refsPath = join(testCase.directory, 'refs.bib');
      const refsSource = readFileSync(refsPath, 'utf8');
      const roundTrip = serializeBib(parseBib(refsSource));
      if (roundTrip !== refsSource) {
        console.error('FAIL: round-trip changed the .bib bytes.');
        failures += 1;
        continue;
      }
      const original = join(work, `${testCase.name}-original`);
      const round = join(work, `${testCase.name}-roundtrip`);
      mkdirSync(original);
      mkdirSync(round);
      for (const directory of [original, round]) {
        copyFileSync(join(testCase.directory, 'main.tex'), join(directory, 'main.tex'));
      }
      writeFileSync(join(original, 'refs.bib'), refsSource);
      writeFileSync(join(round, 'refs.bib'), roundTrip);
      for (const directory of [original, round]) {
        const logPath = join(directory, 'compile.log');
        writeFileSync(logPath, '');
        await toolchain.compileProject(directory, testCase.backend, logPath);
      }
      const bblOriginal = normalize(readFileSync(join(original, 'main.bbl'), 'utf8'));
      const bblRound = normalize(readFileSync(join(round, 'main.bbl'), 'utf8'));
      if (bblOriginal !== bblRound) {
        console.error('FAIL: .bbl differs after round-trip.');
        failures += 1;
        report.cases.push({ name: testCase.name, status: 'FAIL', reason: '.bbl differs after round-trip' });
        continue;
      }
      if (TOOLS.pdftotext) {
        for (const directory of [original, round]) {
          const result = spawnSync(TOOLS.pdftotext, ['main.pdf', 'main.txt'], {
            cwd: directory,
            stdio: 'ignore',
            timeout: 60000,
          });
          if (result.error || result.status !== 0) {
            console.error('FAIL: pdftotext failed.');
            failures += 1;
            break;
          }
        }
        const textOriginal = normalize(readFileSync(join(original, 'main.txt'), 'utf8'));
        const textRound = normalize(readFileSync(join(round, 'main.txt'), 'utf8'));
        if (textOriginal !== textRound) {
          console.error('FAIL: PDF text differs after round-trip.');
          failures += 1;
          report.cases.push({ name: testCase.name, status: 'FAIL', reason: 'PDF text differs after round-trip' });
          continue;
        }
        console.log('PASS: .bbl and PDF text are identical.');
        report.cases.push({ name: testCase.name, status: 'PASS', backend: testCase.backend, output: work });
      } else {
        console.log('BLOCKED: .bbl matches; pdftotext unavailable.');
        skipped += 1;
        report.cases.push({ name: testCase.name, status: 'BLOCKED', backend: testCase.backend, output: work, pdfText: 'skipped' });
      }
    }
    if (ACCEPTANCE) {
      for (const testCase of ACCEPTANCE_CASES) {
        const directory = join(work, 'acceptance', testCase.name);
        mkdirSync(directory, { recursive: true });
        cpSync(testCase.directory, directory, { recursive: true });
        if (testCase.newline === 'crlf') {
          for (const name of ['main.tex', 'refs.bib']) {
            const file = join(directory, name);
            writeFileSync(file, readFileSync(file, 'utf8').replace(/\r\n|\n/g, '\r\n'));
          }
        }
        const logPath = join(directory, 'compile.log');
        writeFileSync(logPath, '');
        try {
          await toolchain.compileProject(directory, testCase.backend, logPath);
          if (testCase.expectedFailure) {
            failures += 1;
            report.cases.push({ name: testCase.name, status: 'FAIL', reason: 'expected a nonzero compiler exit', output: directory });
          } else {
            const pdfText = TOOLS.pdftotext
              ? spawnSync(TOOLS.pdftotext, ['main.pdf', '-'], { cwd: directory, encoding: 'utf8' }).stdout
              : '';
            const missing = (testCase.expectedText ?? []).filter(text => !pdfText.includes(text));
            if (missing.length) {
              failures += 1;
              report.cases.push({ name: testCase.name, status: 'FAIL', reason: `PDF text missing: ${missing.join(', ')}`, output: directory });
            } else {
              report.cases.push({ name: testCase.name, status: 'PASS', backend: testCase.backend, output: directory });
            }
          }
        } catch (error) {
          const backendLog = join(directory, 'main.blg');
          const diagnostic = existsSync(backendLog) ? readFileSync(backendLog, 'utf8') : '';
          if (testCase.expectedFailure && error.status > 0 && testCase.expectedFailure.test(diagnostic)) {
            report.cases.push({ name: testCase.name, status: 'PASS', expected: 'failure', output: directory });
          } else {
            failures += 1;
            report.cases.push({ name: testCase.name, status: 'FAIL', reason: error.message, output: directory });
          }
        }
      }
    }
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    failures += 1;
  } finally {
    if (OUT_DIR || KEEP || failures) {
      writeFileSync(join(work, 'acceptance-report.json'), JSON.stringify(report, null, 2));
      console.log(`Kept work directory: ${work}`);
    }
    if (!failures && !KEEP && !OUT_DIR) rmSync(work, { recursive: true, force: true });
  }
  if (failures > 0) process.exitCode = 1;
  else if (skipped > 0) process.exitCode = 2;
  else {
    console.log(engine + ' bibliography verification finished.');
  }
}
