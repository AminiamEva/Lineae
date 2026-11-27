// Step 1 regression set: the Chinese baseline plus the PR #50 tests and the
// table/pagination suites that the later layout steps must not regress.
import { spawnSync } from 'node:child_process';

const commands = [
  ['node', ['--test', 'tests/chinese-baseline.test.mjs']],
  ['node', ['--test', 'tests/chinese-profile.test.mjs']],
  ['node', ['--test', 'tests/chinese-layout-profile.test.mjs']],
  ['node', ['--test', 'tests/toc-model.test.mjs']],
  ['node', ['tests/toc-page-browser.cjs']],
  ['node', ['tests/chinese-heading-browser.cjs']],
  ['node', ['tests/chinese-book-heading-browser.cjs']],
  ['node', ['tests/chinese-abstract-proof-browser.cjs']],
  ['node', ['tests/chinese-browser-baseline.cjs']],
  ['node', ['tests/enable-ctex-browser.cjs']],
  ['node', ['tests/ctex-save-browser.cjs']],
  ['node', ['--test', 'tests/tikz-labels.test.mjs']],
  ['node', ['tests/tikz-editor-browser.cjs']],
  ['node', ['tests/tikz-studio-browser.cjs']],
  ['node', ['tests/table-pagination-selection-browser.cjs']],
  ['node', ['tests/table-scroll-browser.cjs']],
  ['node', ['tests/table-toolbar-scroll-browser.cjs']],
  ['node', ['tests/table-reflow-browser.cjs']],
  ['node', ['tests/pagination-idempotency-browser.cjs']],
  ['node', ['--test', 'tests/typeset-layout.test.mjs']],
  ['node', ['--test', 'tests/table-floats.test.mjs']],
];

let failed = 0;
for (const [command, args] of commands) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    failed++;
    console.error(`FAILED: ${command} ${args.join(' ')}`);
  }
}
if (failed) {
  console.error(`${failed} regression command(s) failed`);
  process.exit(1);
}
console.log('All Chinese/PR #50 regression commands passed');
