# Lineae V2 final acceptance report

Date: 2026-11-14 (Asia/Shanghai)

Verdict: **PASS**

## Scope and identity

The final verification was performed against the existing worktree `Lineae-editor-v2`, branch `feat/latex-editor-workspace-v2`, based on `526ab2ac50fb0b700950a05257c57eba68f7f0fe`. The product changes were present as working-tree changes at the time of acceptance. During PR preparation, the same product tree was revalidated after removing an unrelated worktree-name change from the lockfile metadata.

The worktree was not reset, cleaned, replaced, pushed, merged, deployed, or used to create a pull request.

## Windows execution recovery

The initial browser launch reproduced the environment failure: Playwright pointed at a missing Chromium executable inside an expired Windows sandbox directory. Node remained available, while `npm` and `npx` were not on PATH.

Recovery was completed without reinstalling dependencies:

- The build was invoked through the checked-in `node_modules` command shim.
- `tests/source-eol-browser.cjs` and `tests/editor.cjs` now optionally read `LINEAE_CHROMIUM_EXECUTABLE` while retaining their previous default launch behavior.
- The final browser runs used installed Microsoft Edge `157.0.4341.46` on Windows.

## Verification results

| Area | Result | Evidence |
| --- | --- | --- |
| Production web bundle | PASS | esbuild produced `apps/web/editor.mjs` successfully |
| Complete Node regression | PASS | 349/349; the previous 341 tests plus 8 V2 tests |
| V2 unit tests | PASS | 8/8 |
| Full-area Source workspace | PASS | Browser checks confirm full available width and visible ribbon |
| Editable Split and bidirectional sync | PASS | Rich edit patched the exact source span; shared undo/redo restored both views |
| Source zoom | PASS | 11px–24px bounds, reset shortcut, no source mutation |
| LaTeX completion | PASS | Command, environment, and reference completion; comment/verbatim suppression |
| Symbol/environment pairing | PASS | Braces, parentheses, brackets, `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, environment Enter pairing, and paired deletion |
| Syntax highlighting and diagnostics | PASS | Current browser suite completed with no page exceptions |
| Code folding | PASS | Environment fold created a placeholder without changing source bytes |
| Toolbar insertion and caret/focus | PASS | itemize, enumerate, equation, align, figure, table, and selection wrapping; one-step undo and editor focus verified |
| Lifecycle | PASS | 6/6 restoration/input scenarios; no render after destroy |
| EOL metadata/history | PASS | Dirty state, reset, history, and separator metadata passed |
| Mixed LF/CRLF real export | PASS | Expected and actual: 452 bytes, identical SHA-256, first difference `-1` |
| Complete browser regression | PASS | `Browser regressions passed`; no browser exceptions |
| Responsive screenshots | PASS | Desktop, laptop, tablet, and mobile artifacts generated and visually inspected |

## Mixed-EOL proof

- Expected `.tex`: 452 bytes
- Actual `.tex`: 452 bytes
- Expected SHA-256: `e4015aadd42c20ca1c590e8511bbe43b6c08539f7ee0ba7cb4df6b4825dacd4e`
- Actual SHA-256: `e4015aadd42c20ca1c590e8511bbe43b6c08539f7ee0ba7cb4df6b4825dacd4e`
- Line endings in both: 14 LF and 1 CRLF
- Byte comparison: equal; first difference `-1`

## Evidence location

All artifacts from this final run are under:

`C:\Users\vertin\Documents\ChatGPT\Latex\Lineae-v2-evidence\2026-11-14-final`

The principal desktop Split screenshot is `full\v2-split.png`; the narrow responsive proof is `full\expanded-mobile.png`. The byte-level result is recorded in `lineae-mixed-eol\browser-comparison.json`.

## PR-preparation revalidation

On 2026-11-14, the production bundle, all 349 Node tests, all 57 V2 browser assertions, all six lifecycle scenarios, mixed-EOL export, and the complete browser regression were rerun successfully with the installed Microsoft Edge. The new artifacts are under `C:\Users\vertin\Documents\ChatGPT\Latex\Lineae-v2-evidence\2026-11-14-pr-prep`.

This report does not claim that GitHub Actions has passed for V2. Remote CI must be evaluated from the pull request run for the published feature commit.
