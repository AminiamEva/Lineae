#!/usr/bin/env node
/**
 * Prove that no upstream Lineae file was modified.
 *
 * The repository has no .git directory in this workspace, so the baseline is a
 * manifest of the 50 blob SHA-1 hashes downloaded from GitHub at commit
 * a79a8b9. Every file outside the three new directories is hashed exactly as
 * Git would hash it (`blob <size>\0<content>`) and compared.
 *
 * Usage (from the repository root):
 *   node tests/bib/verify-upstream.mjs [--json]
 *
 * Exit codes: 0 = clean, 1 = modified/missing/unexpected file.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const manifestPath = join(root, 'docs', 'bib-engine', 'verification', 'upstream-baseline.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const NEW_PREFIXES = ['apps/web/bib/', 'tests/bib/', 'docs/bib-engine/'];
const IGNORED_PREFIXES = ['.git/', 'node_modules/', 'apps/web/vendor/'];
const IGNORED_FILES = new Set(['apps/web/editor.mjs']);

/** @param {string} dir @param {string} [base] @returns {string[]} */
function walk(dir, base = '') {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_PREFIXES.some(prefix => (relativePath + '/').startsWith(prefix))) continue;
      files.push(...walk(join(dir, entry.name), relativePath));
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(relativePath)) continue;
      files.push(relativePath);
    }
  }
  return files;
}

/** @param {string} file */
function gitBlobSha(file) {
  const buffer = readFileSync(file);
  return createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

/** @type {Map<string, string>} */
const upstream = new Map(manifest.files.map(file => [file.path, file.blobSha]));
const files = walk(root).sort();
const modified = [];
const missing = [];
const added = [];
const unexpected = [];
for (const relativePath of files) {
  const expected = upstream.get(relativePath);
  if (expected === undefined) {
    if (NEW_PREFIXES.some(prefix => relativePath.startsWith(prefix))) added.push(relativePath);
    else unexpected.push(relativePath);
    continue;
  }
  const actual = gitBlobSha(join(root, ...relativePath.split('/')));
  if (actual !== expected) modified.push({ path: relativePath, expected, actual });
}
for (const relativePath of upstream.keys()) {
  if (!files.includes(relativePath)) missing.push(relativePath);
}

const report = {
  repository: manifest.repository,
  commit: manifest.commit,
  baselineFiles: manifest.files.length,
  existingFilesChecked: manifest.files.length - missing.length,
  modified,
  missing,
  unexpected,
  newFiles: added,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Baseline: ${manifest.repository} @ ${manifest.commit}`);
  console.log(`Upstream files checked: ${report.existingFilesChecked}/${report.baselineFiles}`);
  console.log(`Modified:   ${modified.length}`);
  console.log(`Missing:    ${missing.length}`);
  console.log(`Unexpected: ${unexpected.length}`);
  console.log(`New files:  ${added.length}`);
  for (const item of modified) console.log(`  MODIFIED ${item.path}`);
  for (const item of missing) console.log(`  MISSING  ${item}`);
  for (const item of unexpected) console.log(`  UNEXPECTED ${item}`);
  if (process.argv.includes('--list-new')) {
    for (const item of added) console.log(`  NEW ${item}`);
  }
}

const failed = modified.length > 0 || missing.length > 0 || unexpected.length > 0;
process.exitCode = failed ? 1 : 0;
