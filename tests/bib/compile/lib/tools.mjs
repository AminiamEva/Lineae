/**
 * Toolchain discovery and process execution for the compile/visual harnesses.
 *
 * External output is redirected to files instead of pipes: this works in
 * restricted sandboxes as well as on normal developer machines, and keeps full
 * logs for failed compilations.
 */

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  analyzeLayout,
  parseBbox,
  parseFonts,
  parsePdfInfo,
  parsePgm,
} from '../../pdf/visual-lib.mjs';

const TOOL_NAMES = ['xelatex', 'bibtex', 'biber', 'pdfinfo', 'pdftotext', 'pdffonts', 'pdftoppm'];

/**
 * @param {{extraPaths?: string[], cwd?: string}} [options]
 */
export function createToolchain(options = {}) {
  const extraPaths = (options.extraPaths ?? []).filter(Boolean);
  const env = {
    ...process.env,
    PATH: [...extraPaths, process.env.PATH ?? ''].filter(Boolean).join(delimiter),
    SOURCE_DATE_EPOCH: '0',
    FORCE_SOURCE_DATE: '1',
  };
  const work = join(tmpdir(), `lineae-bib-tools-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });

  /** @param {string} name */
  function probe(name) {
    const candidates = process.platform === 'win32' ? [`${name}.exe`, name] : [name];
    for (const candidate of candidates) {
      try {
        const result = spawnSync(candidate, name === 'pdftoppm' || name === 'pdfinfo' || name === 'pdffonts' || name === 'pdftotext' ? ['-v'] : ['--version'], {
          env,
          stdio: 'ignore',
          timeout: 20000,
        });
        if (!result.error && result.status === 0) return candidate;
      } catch {
        // tool not runnable here
      }
    }
    return null;
  }

  /** @type {Record<string, string|null>} */
  const commands = {};
  for (const name of TOOL_NAMES) commands[name] = probe(name);

  /**
   * Capture stdout+stderr of a command through a temporary file.
   * @param {string} command
   * @param {string[]} args
   */
  function capture(command, args) {
    const output = join(work, `capture-${Math.random().toString(36).slice(2)}.txt`);
    writeFileSync(output, '');
    const fd = openSync(output, 'a');
    try {
      const result = spawnSync(command, args, {
        env,
        stdio: ['ignore', fd, fd],
        timeout: 60000,
      });
      return { status: result.status, output: readFileSync(output, 'utf8'), error: result.error ?? null };
    } finally {
      closeSync(fd);
    }
  }

  /**
   * Run a command with its output appended to a log file.
   * @param {string} command
   * @param {string[]} args
   * @param {{cwd?: string, logPath: string, timeout?: number}} runOptions
   */
  function run(command, args, runOptions) {
    const logPath = runOptions.logPath;
    mkdirSync(join(logPath, '..'), { recursive: true });
    writeFileSync(logPath, `${readFileSyncSafe(logPath)}$ ${command} ${args.join(' ')}\n`);
    const fd = openSync(logPath, 'a');
    let result;
    try {
      result = spawnSync(command, args, {
        cwd: runOptions.cwd,
        env,
        stdio: ['ignore', fd, fd],
        timeout: runOptions.timeout ?? 240000,
      });
    } finally {
      closeSync(fd);
    }
    const status = result.status;
    writeFileSync(logPath, `${readFileSyncSafe(logPath)}exit=${status ?? 'null'}${result.error ? ` error=${result.error.message}` : ''}\n`);
    return { status, error: result.error ?? null };
  }

  /** @param {string} directory @param {string} backend @param {string} logPath */
  function compileProject(directory, backend, logPath) {
    if (!commands.xelatex) throw new Error('xelatex is not available');
    const backendCommand = backend === 'bibtex' ? commands.bibtex : commands.biber;
    if (!backendCommand) throw new Error(`${backend} is not available`);
    const common = ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', 'main.tex'];
    const steps = [
      ['xelatex', common],
      [backendCommand, ['main']],
      ['xelatex', common],
      ['xelatex', common],
    ];
    for (const [command, args] of steps) {
      const result = run(command, args, { cwd: directory, logPath });
      if (result.error || result.status !== 0) {
        const log = readFileSync(logPath, 'utf8');
        throw new Error(`${command} failed in ${directory}\n${tail(log, 40)}`);
      }
    }
  }

  /** @param {string} directory */
  function readPdfInfo(directory) {
    if (!commands.pdfinfo) return null;
    const result = capture(commands.pdfinfo, [join(directory, 'main.pdf')]);
    if (result.status !== 0) return null;
    return { raw: result.output, parsed: parsePdfInfo(result.output) };
  }

  /** @param {string} directory */
  function readPdfText(directory) {
    if (!commands.pdftotext) return null;
    const result = run(commands.pdftotext, ['-layout', 'main.pdf', 'main.txt'], {
      cwd: directory,
      logPath: join(directory, 'pdftotext.log'),
    });
    if (result.status !== 0) return null;
    return readFileSync(join(directory, 'main.txt'), 'utf8');
  }

  /** @param {string} directory */
  function readPdfBbox(directory) {
    if (!commands.pdftotext) return null;
    const result = run(commands.pdftotext, ['-bbox-layout', 'main.pdf', 'main.bbox.html'], {
      cwd: directory,
      logPath: join(directory, 'pdftotext-bbox.log'),
    });
    if (result.status !== 0) return null;
    const xml = readFileSync(join(directory, 'main.bbox.html'), 'utf8');
    return { xml, parsed: parseBbox(xml) };
  }

  /** @param {string} directory */
  function readPdfFonts(directory) {
    if (!commands.pdffonts) return null;
    const result = capture(commands.pdffonts, [join(directory, 'main.pdf')]);
    if (result.status !== 0) return null;
    return { raw: result.output, parsed: parseFonts(result.output) };
  }

  /** @param {string} directory @param {number} [dpi] */
  function readPdfImages(directory, dpi = 150) {
    if (!commands.pdftoppm) return null;
    for (const file of readdirSync(directory)) {
      if (/^page-\d+\.pgm$/.test(file)) rmSync(join(directory, file));
    }
    const result = run(commands.pdftoppm, ['-r', String(dpi), '-gray', 'main.pdf', 'page'], {
      cwd: directory,
      logPath: join(directory, 'pdftoppm.log'),
    });
    if (result.status !== 0) return null;
    const pages = readdirSync(directory)
      .filter(file => /^page-\d+\.pgm$/.test(file))
      .sort((left, right) => {
        const a = Number(left.match(/(\d+)/)?.[1] ?? 0);
        const b = Number(right.match(/(\d+)/)?.[1] ?? 0);
        return a - b;
      })
      .map(file => parsePgm(readFileSync(join(directory, file))));
    return pages;
  }

  /** @param {string} directory */
  function analyzeDocument(directory) {
    const info = readPdfInfo(directory);
    const text = readPdfText(directory);
    const bbox = readPdfBbox(directory);
    const fonts = readPdfFonts(directory);
    const images = readPdfImages(directory);
    return {
      info,
      text,
      bbox,
      fonts,
      images,
      layout: bbox ? analyzeLayout(bbox.parsed) : null,
    };
  }

  /** Read the generated .bbl file. */
  function readBbl(directory) {
    const path = join(directory, 'main.bbl');
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  }

  function versions() {
    /** @type {Record<string, string|null>} */
    const result = {};
    for (const name of TOOL_NAMES) {
      const command = commands[name];
      if (!command) {
        result[name] = null;
        continue;
      }
      const output = capture(command, name.startsWith('pdf') ? ['-v'] : ['--version']);
      const line = output.output.split(/\r?\n/).map(item => item.trim()).find(Boolean) ?? '';
      result[name] = line || null;
    }
    return { commands, versions: result };
  }

  function cleanup() {
    rmSync(work, { recursive: true, force: true });
  }

  return {
    commands,
    env,
    run,
    capture,
    compileProject,
    analyzeDocument,
    readBbl,
    readPdfInfo,
    readPdfText,
    readPdfBbox,
    readPdfFonts,
    readPdfImages,
    versions,
    cleanup,
    has: {
      xelatex: Boolean(commands.xelatex),
      bibtex: Boolean(commands.bibtex),
      biber: Boolean(commands.biber),
      pdfinfo: Boolean(commands.pdfinfo),
      pdftotext: Boolean(commands.pdftotext),
      pdffonts: Boolean(commands.pdffonts),
      pdftoppm: Boolean(commands.pdftoppm),
    },
  };
}

/** @param {string} path */
function readFileSyncSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** @param {string} text @param {number} count */
export function tail(text, count = 40) {
  return text.split(/\r?\n/).slice(-count).join('\n');
}
