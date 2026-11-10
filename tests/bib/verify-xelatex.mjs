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

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBib, serializeBib } from '../../apps/web/bib/index.mjs';

const KEEP = process.argv.includes('--keep');
const CASES = [
  { name: 'bibtex', backend: 'bibtex', directory: join('tests', 'bib', 'xelatex', 'bibtex') },
  { name: 'biblatex', backend: 'biber', directory: join('tests', 'bib', 'xelatex', 'biblatex') },
];

/** @param {string} name */
function resolveTool(name) {
  const candidates = process.platform === 'win32' ? [`${name}.exe`, name] : [name];
  // Poppler tools use -v; TeX tools use --version.
  const versionFlag = name.startsWith('pdf') ? '-v' : '--version';
  for (const candidate of candidates) {
    try {
      const probe = spawnSync(candidate, [versionFlag], { stdio: 'ignore', timeout: 15000 });
      if (!probe.error && probe.status === 0) return candidate;
    } catch {
      // fall through: a sandbox can deny spawning entirely
    }
  }
  return null;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} logPath
 */
function run(command, args, cwd, logPath) {
  const log = readFileSync(logPath, 'utf8');
  const result = spawnSync(command, args, {
    cwd,
    timeout: 180000,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  writeFileSync(logPath, log + `\n$ ${command} ${args.join(' ')}\nexit=${result.status ?? 'null'}\n`);
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.error?.message ?? result.status})`);
  }
}

/** @param {string} file */
function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

/** @param {string} directory @param {string} backend @param {string} logPath */
function compile(directory, backend, logPath) {
  const xelatex = TOOLS.xelatex;
  run(xelatex, ['-interaction=nonstopmode', '-halt-on-error', 'main.tex'], directory, logPath);
  if (backend === 'bibtex') run(TOOLS.bibtex, ['main'], directory, logPath);
  else run(TOOLS.biber, ['main'], directory, logPath);
  run(xelatex, ['-interaction=nonstopmode', '-halt-on-error', 'main.tex'], directory, logPath);
  run(xelatex, ['-interaction=nonstopmode', '-halt-on-error', 'main.tex'], directory, logPath);
}

const TOOLS = {
  xelatex: resolveTool('xelatex'),
  bibtex: resolveTool('bibtex'),
  biber: resolveTool('biber'),
  pdftotext: resolveTool('pdftotext'),
};

if (!TOOLS.xelatex) {
  console.log('UNVERIFIED: xelatex is not installed or cannot be executed in this environment.');
  console.log('L3 (BibTeX/Biber) and L4 (PDF text) verification were NOT performed.');
  console.log('Install a TeX distribution that provides xelatex, bibtex and biber, then run:');
  console.log('  node tests/bib/verify-xelatex.mjs');
  process.exitCode = 2;
} else {
  const work = mkdtempSync(join(tmpdir(), 'lineae-bib-xelatex-'));
  console.log(`Work directory: ${work}`);
  let failures = 0;
  let skipped = 0;
  try {
    for (const testCase of CASES) {
      const backendTool = testCase.backend === 'bibtex' ? TOOLS.bibtex : TOOLS.biber;
      console.log(`\n=== ${testCase.name} (${testCase.backend}) ===`);
      if (!backendTool) {
        console.log(`UNVERIFIED: ${testCase.backend} is not installed; case skipped.`);
        skipped += 1;
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
      mkdirSync(original, { recursive: true });
      mkdirSync(round, { recursive: true });
      for (const directory of [original, round]) {
        copyFileSync(join(testCase.directory, 'main.tex'), join(directory, 'main.tex'));
      }
      writeFileSync(join(original, 'refs.bib'), refsSource);
      writeFileSync(join(round, 'refs.bib'), roundTrip);
      for (const directory of [original, round]) {
        const logPath = join(directory, 'compile.log');
        writeFileSync(logPath, '');
        compile(directory, testCase.backend, logPath);
      }
      const bblOriginal = normalize(readFileSync(join(original, 'main.bbl'), 'utf8'));
      const bblRound = normalize(readFileSync(join(round, 'main.bbl'), 'utf8'));
      if (bblOriginal !== bblRound) {
        console.error('FAIL: .bbl differs after round-trip.');
        failures += 1;
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
          continue;
        }
        console.log('PASS: .bbl and PDF text are identical.');
      } else {
        console.log('PASS: .bbl is identical (pdftotext not installed; PDF text comparison skipped).');
      }
    }
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    failures += 1;
  } finally {
    if (!KEEP) rmSync(work, { recursive: true, force: true });
    else console.log(`Kept work directory: ${work}`);
  }
  if (failures > 0) process.exitCode = 1;
  else if (skipped === CASES.length) process.exitCode = 2;
  else {
    if (skipped > 0) console.log(`\n${skipped} case(s) UNVERIFIED.`);
    console.log('\nXeLaTeX bibliography verification finished.');
  }
}
