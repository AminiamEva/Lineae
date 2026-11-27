// Step 1 baseline generator: compile the Chinese fixtures with XeLaTeX twice,
// extract machine-readable coordinates from the PDF (pdftotext -bbox), the TOC
// entries from .toc, and the LIENAE probe lines from .log.
//
// Run: node tests/chinese-xelatex.spec.mjs [--fixture name]
// Output: tests/fixtures/chinese/expected/<name>.json and _meta.json
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fixturesDir = join(root, 'tests', 'fixtures', 'chinese');
const expectedDir = join(fixturesDir, 'expected');
const buildRoot = join(fixturesDir, 'build');

const CONVERSION = {
  pdfPtToCssPx: 96 / 72,
  cssPxPerTexPt: 96 / 72.27,
  texPtPerCssPx: 72.27 / 96,
};

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function tryRun(command, args, options = {}) {
  try { return run(command, args, options); } catch { return null; }
}

function hasCommand(command, args) {
  try { execFileSync(command, args, { stdio: 'ignore' }); return true; }
  catch (error) { return error.code !== 'ENOENT' && error.code !== 'EACCES'; }
}

function kpse(which) {
  const value = tryRun('kpsewhich', [which]);
  return value ? value.trim() : null;
}

function sha256File(path) {
  if (!path || !existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function decodeXml(text) {
  return String(text)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function attributes(source) {
  return Object.fromEntries([...source.matchAll(/([A-Za-z]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}

function groupLines(words) {
  const lines = [];
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let line = lines.find(candidate => Math.abs(candidate.y - word.y) < Math.max(2, word.h * 0.4));
    if (!line) {
      line = { y: word.y, baseline: word.y + word.h, x: word.x, xMax: word.x + word.w, texts: [] };
      lines.push(line);
    }
    line.y = Math.min(line.y, word.y);
    line.baseline = Math.max(line.baseline, word.y + word.h);
    line.x = Math.min(line.x, word.x);
    line.xMax = Math.max(line.xMax, word.x + word.w);
    line.texts.push(word.text);
  }
  return lines
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(line => ({ y: Number(line.y.toFixed(3)), baseline: Number(line.baseline.toFixed(3)), x: Number(line.x.toFixed(3)), xMax: Number(line.xMax.toFixed(3)), text: line.texts.join('') }));
}

function parseBbox(xhtml) {
  const pages = [];
  for (const page of xhtml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const pageAttrs = attributes(page[1]);
    const words = [];
    for (const word of page[2].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)) {
      const attrs = attributes(word[1]);
      const x = Number(attrs.xMin), y = Number(attrs.yMin);
      const xMax = Number(attrs.xMax), yMax = Number(attrs.yMax);
      words.push({
        text: decodeXml(word[2]),
        x: Number(x.toFixed(3)), y: Number(y.toFixed(3)),
        w: Number((xMax - x).toFixed(3)), h: Number((yMax - y).toFixed(3)),
      });
    }
    pages.push({ width: Number(pageAttrs.width), height: Number(pageAttrs.height), words, lines: groupLines(words) });
  }
  return pages;
}

function balanced(text, start) {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (char === '\\') { index++; continue; }
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return { content: text.slice(start + 1, index), end: index + 1 };
    }
  }
  return { content: text.slice(start + 1), end: text.length };
}

function stripTex(value) {
  return String(value)
    .replace(/\\numberline\s*\{[^}]*\}/g, '')
    .replace(/\\hspace\*?\s*\{[^}]*\}/g, '')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseToc(text) {
  const entries = [];
  let index = 0;
  while ((index = text.indexOf('\\contentsline', index)) >= 0) {
    let cursor = index + '\\contentsline'.length;
    const skip = () => { while (cursor < text.length && /\s/.test(text[cursor])) cursor++; };
    skip();
    if (text[cursor] !== '{') { index = cursor; continue; }
    const level = balanced(text, cursor); cursor = level.end;
    skip();
    if (text[cursor] !== '{') { index = cursor; continue; }
    const title = balanced(text, cursor); cursor = title.end;
    skip();
    let page = '';
    if (text[cursor] === '{') { const group = balanced(text, cursor); page = group.content; cursor = group.end; }
    skip();
    let anchor = '';
    if (text[cursor] === '{') { const group = balanced(text, cursor); anchor = group.content; cursor = group.end; }
    const rawTitle = title.content;
    const numberMatch = /^\\numberline\s*\{([^}]*)\}([\s\S]*)$/.exec(rawTitle.trim());
    const partMatch = numberMatch ? null : /^([IVXLCDM]+)\\hspace\s*\*?\s*\{[^}]*\}([\s\S]*)$/.exec(rawTitle.trim());
    const number = numberMatch ? numberMatch[1].trim() : partMatch ? partMatch[1].trim() : '';
    const heading = numberMatch ? numberMatch[2] : partMatch ? partMatch[2] : rawTitle;
    entries.push({
      level: level.content.trim(),
      number,
      title: heading.trim(),
      plain: stripTex(heading),
      page: page.trim(),
      anchor: anchor.trim(),
      rawTitle,
    });
    index = cursor;
  }
  return entries;
}

function parseTocParameters(path) {
  if (!path || !existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const levels = {};
  for (const match of text.matchAll(/\\l@([a-zA-Z]+)[^\n]*?\\@dottedtocline\{(\d+)\}\{([\d.]+)em\}\{([\d.]+)em\}/g)) {
    levels[match[1]] = { depth: Number(match[2]), indent: Number(match[3]), numwidth: Number(match[4]), dotted: true };
  }
  for (const match of text.matchAll(/\\newcommand\*?\\l@(section|chapter|part)\b/g)) {
    if (!levels[match[1]]) levels[match[1]] = { dotted: false };
  }
  return { path, levels };
}

function parseLog(log) {
  const probes = {};
  for (const line of log.split(/\r?\n/)) {
    const match = /^LIENAE[-\s]+(.+)$/.exec(line.trim());
    if (!match) continue;
    const split = match[1].indexOf('=');
    if (split < 0) continue;
    probes[match[1].slice(0, split).trim()] = match[1].slice(split + 1).trim();
  }
  return {
    probes,
    missing: [...log.matchAll(/Missing character: There is no (.*?) in font/g)].map(match => match[1]),
    overfull: (log.match(/Overfull \\hbox/g) || []).length,
    underfull: (log.match(/Underfull \\hbox/g) || []).length,
  };
}

function compileOne(texPath) {
  const name = basename(texPath, '.tex');
  const outDir = join(buildRoot, name);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  copyFileSync(texPath, join(outDir, `${name}.tex`));
  for (let pass = 1; pass <= 2; pass++) {
    try {
      run('xelatex', ['-interaction=nonstopmode', '-halt-on-error', `${name}.tex`], { cwd: outDir });
    } catch (error) {
      const output = `${error.stdout || ''}\n${error.stderr || ''}`;
      return { name, ok: false, error: output.slice(-4000) };
    }
  }
  const pdf = join(outDir, `${name}.pdf`);
  if (!existsSync(pdf)) return { name, ok: false, error: 'no PDF produced' };
  const bboxPath = join(outDir, `${name}.bbox.xhtml`);
  run('pdftotext', ['-bbox', pdf, bboxPath]);
  const pages = parseBbox(readFileSync(bboxPath, 'utf8'));
  const tocPath = join(outDir, `${name}.toc`);
  const toc = existsSync(tocPath) ? parseToc(readFileSync(tocPath, 'utf8')) : [];
  const logPath = join(outDir, `${name}.log`);
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  const diagnostics = parseLog(log);
  return {
    name,
    ok: true,
    sourceHash: sha256File(texPath),
    pages,
    toc,
    probes: diagnostics.probes,
    diagnostics: { missing: diagnostics.missing, overfull: diagnostics.overfull, underfull: diagnostics.underfull },
  };
}

function main() {
  const args = process.argv.slice(2);
  const fixtureArg = args.indexOf('--fixture');
  const only = fixtureArg >= 0 ? args[fixtureArg + 1] : null;
  if (!hasCommand('xelatex', ['--version'])) {
    console.error('xelatex not found; install a fixed TeX Live with ctex/xeCJK.');
    process.exit(1);
  }
  if (!hasCommand('pdftotext', ['-v'])) {
    console.error('pdftotext not found; install poppler-utils.');
    process.exit(1);
  }
  mkdirSync(expectedDir, { recursive: true });
  mkdirSync(buildRoot, { recursive: true });
  const fixtures = readdirSync(fixturesDir)
    .filter(file => file.endsWith('.tex') && (!only || file === `${only}.tex`))
    .sort();
  const meta = {
    generatedBy: 'tests/chinese-xelatex.spec.mjs',
    xetex: (tryRun('xelatex', ['--version']) || '').split(/\r?\n/).slice(0, 2).join(' ').trim(),
    kpathsea: (tryRun('kpsewhich', ['--version']) || '').split(/\r?\n/)[0].trim(),
    paths: {
      ctex: kpse('ctex.sty'),
      xeCJK: kpse('xeCJK.sty'),
      ctexart: kpse('ctexart.cls'),
      article: kpse('article.cls'),
      book: kpse('book.cls'),
      report: kpse('report.cls'),
      fandolSongRegular: kpse('FandolSong-Regular.otf'),
    },
    hashes: {},
    conversion: CONVERSION,
    fixtures: [],
  };
  for (const [key, path] of Object.entries(meta.paths)) meta.hashes[key] = sha256File(path);
  meta.tocParameters = {
    article: parseTocParameters(meta.paths.article),
    book: parseTocParameters(meta.paths.book),
    report: parseTocParameters(meta.paths.report),
  };
  for (const file of fixtures) {
    process.stdout.write(`[chinese] ${file} ... `);
    const result = compileOne(join(fixturesDir, file));
    if (!result.ok) {
      console.log('FAILED');
      console.error(result.error);
      writeFileSync(join(expectedDir, `${basename(file, '.tex')}.json`), JSON.stringify(result, null, 1) + '\n', 'utf8');
      meta.fixtures.push({ name: result.name, ok: false });
      continue;
    }
    writeFileSync(join(expectedDir, `${result.name}.json`), JSON.stringify(result, null, 1) + '\n', 'utf8');
    meta.fixtures.push({
      name: result.name,
      ok: true,
      sourceHash: result.sourceHash,
      pages: result.pages.length,
      words: result.pages.reduce((sum, page) => sum + page.words.length, 0),
      tocEntries: result.toc.length,
      probes: Object.keys(result.probes).length,
    });
    console.log(`ok (${result.pages.length}p, ${result.pages.reduce((sum, page) => sum + page.words.length, 0)} words, ${result.toc.length} toc)`);
  }
  if (!only) writeFileSync(join(expectedDir, '_meta.json'), JSON.stringify(meta, null, 1) + '\n', 'utf8');
  console.log(`[chinese] wrote ${expectedDir}`);
}

main();
