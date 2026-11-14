# File Tree bug bash — 2026-11-14

This audit changes project reliability, not the math, bibliography, typography or
release roadmap. Findings below were reproduced with tests before their fixes.
The tree remains hidden on project open, and its toggle remains the first control
in the bottom status bar.

## Baseline and workspace protection

- Checkout: `C:\Users\vertin\.codex\worktrees\lineae-v3-project\Lineae-source-editor-pr`.
- Branch: `feat/project-multipage-bibliography`; initial HEAD `8755aa5`; initially clean.
- GitHub API confirmed PR #16 had already been merged. `origin/main` was
  `5dabdc2`; its tree matched initial HEAD exactly. No duplicate PR was created.
- The original `Lineae-editor-v21`, font/zoom checkout and other branches were
  not modified. No reset, rebase, force push, branch deletion, release or PR merge.
- The pre-existing project browser regression passed. It did not exercise
  input accepted during asynchronous mutations or stable tree DOM identity.
- Repair commits: `a032c69` (native mutation safety), `628d812` (model, explorer
  and editor sessions). A separate documentation/CI commit carries this report
  and evidence. Delivery uses the same remote feature branch; PR #16 remains
  merged and is not presented as a new open review for these fixes.

## Architecture reviewed

This application uses direct DOM modules, not React. React state/keys/unmount
checks therefore do not apply. `Project` owns file IDs, paths, disk baselines,
drafts, dependency metadata and recovery. `directoryTree()` derives hierarchy;
the explorer owns visibility/expansion and invokes project operations. Browser
handles and the native bridge implement filesystem operations. Rust authorizes
the root, validates paths, checks byte baselines and performs native mutations.

`main.js` supplies the explorer's session boundary. CodeMirror's immutable state
preserves selection, undo and exact source; ProseMirror renders/edits the Split
projection. The same CodeMirror view is reused. Tree state changes do not create
an editor or subscribe additional editor listeners. The explorer is installed
once for the application lifetime; closing a project drops its model/session
references and restores the suspended standalone editor.

Repairs keep those boundaries: project mutations are serialized, disk refresh
reads are staged before synchronous reconciliation, input continues to update
drafts during I/O, and switching editor sessions has a separate capture guard.
Tree DOM is rebuilt only when topology changes. Ordinary edits update labels and
active state on existing rows; detached `details` events cannot change expansion.

## Reproduced bugs and fixes

All rows are **fixed and automated-regression verified** unless qualified below.
`model` means `tests/project-tree-integrity.test.mjs`; `tree E2E` means
`tests/file-tree-browser.cjs`; `sessions E2E` means `tests/file-tree-sessions.cjs`.

| ID | Severity | Reproduction and actual behavior | Expected behavior / root cause / repair | Regression |
| --- | --- | --- | --- | --- |
| FT-01 | P0 | Edit a child, start a gated move, type again before disk completion. The later text vanished. | Preserve all input. Explorer suppressed capture while busy and reopened the old session; now captures during I/O and again before restoring the moved identity. | tree E2E: typing during move; native rename/move flow |
| FT-02 | P0 | Start reload, type while disk read waits. Returned disk text overwrote new input. | Refuse stale reload. Track draft revisions and check after the read. | model: pending reload; tree E2E: reload conflict |
| FT-03 | P0 | Edit during deletion preflight or while committed native deletion waits. File/session disappeared with new input. | Before deletion, abort on a new revision; after committed deletion, retain new edits as a missing draft and keep it active. | model: both deletion gates; tree E2E: delete/cancel/retained draft |
| FT-04 | P0 | Restore a checkpoint whose path was externally removed. Restore silently skipped that draft. | Confirmed recovery creates a missing model record without recreating a disk file; retains the available ID. TeX recovery is considered before rejecting an empty directory. | model: confirmed missing-path recovery |
| FT-05 | P0 | On Windows browser handles create `MAIN.tex` when `main.tex` exists. Case-sensitive preflight could open the existing file for writing. | Reject the case alias before `create:true`; preserve existing bytes. | model: case-alias create |
| FT-06 | P0 | Change a file after frontend preflight, then send native remove/move with old expected bytes. Rust ignored expected bytes and performed the mutation. | Validate the baseline and mutate the same native handle, denying concurrent writer/delete sharing. Bridge forwards expected bytes. | Rust: stale remove/move; bridge contract |
| FT-07 | P0 | Two native moves preflight the same absent target. A pathname rename could replace a newly created target. | Windows handle rename uses kernel no-replace semantics. Exactly one move succeeds; losing source remains intact. | Rust: competing moves |
| FT-08 | P0 | Externally modify the active clean file, refresh, then type while a later file read waits. The active baseline was already advanced; save could overwrite the external version without conflict. | Stage all reads, publish synchronously at the end, and compare original edit revisions. Concurrent typing retains the original baseline and conflicts on save. | model: staged refresh publication, failed before fix |
| FT-09 | P1 | Queue save and move concurrently. Disk awaits interleaved model/path updates. | A per-project operation queue serializes mutations while draft edits remain synchronous. A rejected operation does not poison the queue. | model: real-disk queued save/move |
| FT-10 | P1 | Rename a child `.tex` to `.bib`. Tree icon changed, but session kind and TeX dependencies stayed stale. | Update kind/scans with the path while retaining ID/draft. Reject main-to-non-TeX and editable-to-binary renames explicitly. | model: kind/metadata rename |
| FT-11 | P1 | Add/delete/rename files outside Lineae. The existing tree had no reconciliation operation. | Explicit Refresh tree reconciles paths, retains IDs/sessions at the same path, reports per-file errors and preserves missing open drafts. External renames are not guessed. | model refresh cases; tree E2E external rename/add/change |
| FT-12 | P1 | Save a missing clean file, or resolve a reference to a retained missing record. UI could report Saved; metadata said resolved. | Missing paths reject save and remain missing dependency targets. | model: missing clean file/dependency |
| FT-13 | P1 | Recovery storage throws after disk deletion. Active ID could refer to a removed record. | Finish model bookkeeping first; record checkpoint error and still attempt native persistence. | model: storage failure after delete |
| FT-14 | P1 | Open a native project through browser handles with `.lineae-*` recovery files present. Reserved path validation aborted enumeration. | Exclude reserved metadata case-insensitively while preserving it on disk. | model: browser enumeration |
| FT-15 | P1 | Use `.LINEAE-*` against native operations on Windows. Case-insensitive filesystem aliases bypassed case-sensitive protection. | Shared native component validation rejects the namespace regardless of case and invalid Windows filenames; listing excludes it. | Rust: namespace aliases and path components |
| FT-16 | P1 | Open/close a project from standalone Body/Raw/Split. Original mode, selection/undo or assets were lost; pending source projection could be stale on return. | Suspend and restore the original editor states and mode. When source is authoritative, rebuild the preview from its current text before restoring selection. | sessions E2E: Body, Raw/Split, pending projection |
| FT-17 | P1 | In Split type source then immediately Save. Preview stayed permanently stale. | Capturing a session must be read-only. It no longer cancels the pending preview update; actual restore/close still cancels obsolete work. | sessions E2E: immediate save before preview |
| FT-18 | P2 | Type or reopen the current file. Tree nodes were replaced, losing focused buttons and risking detached toggle events. | Update row status in place; no-op reopening the active file; preserve expansion/scroll and stable focus keys across topology changes. | tree E2E: DOM identity, focus, nesting; sessions E2E: stable CM view |
| FT-19 | P2 | Open a never-visited file after another file was Split. It inherited Split without its own preference. | New files start Raw; visited files restore their own Split state. | sessions E2E: repeated switching and rich undo isolation |

## Test matrix and actual execution

| Layer | Executed coverage | Result |
| --- | --- | --- |
| All discovered Node tests | Every `tests/**/*.test.mjs`, including real-disk model integration | 420/420, 100%, zero skipped |
| Project Node subset | Existing project tests plus 14 new tree-integrity tests | 29/29, 100% |
| Rust | Real Windows filesystem, paths, Unicode/binary moves, stale mutations, ACL/read-only/exclusive locks, save races, checkpoint processes, crash staging, destination race | 13/13 entries, 100%, zero ignored |
| Tree Playwright E2E | Full application, real Windows fixture disk behind an explicit adapter test boundary; 21 toggle clicks, hidden default, empty directory, stable nodes/focus, gated input/move/reload/delete, Chinese paths, external refresh, conflicts, long names, 200 added files, cancelled/empty project open | 11/11 scenarios |
| Session Playwright E2E | Full application with real Chromium OPFS; standalone restoration, pending preview, immediate save, per-file Raw/Split/undo/selection, 12 repeated switches, stable CodeMirror DOM | 5/5 scenarios |
| Existing project E2E | Real OPFS + Windows-backed bridge contract, create/delete/Bib source, draft recovery, conflicts, mixed EOL, reopen, 1440/900/600/390 widths | Passed |
| Full V2 browser suite | Existing editor/toolbar/completion/zoom/source/EOL checks | Passed; V2 70 and V2.1 61 assertions reported |
| Build | Web bundle; staged assets; locked Rust debug desktop build | Passed |
| Actual Tauri/WebView2 | Native folder selection, process-tree kill and confirmed recovery, external conflict, Chinese rename/move with dirty draft, save to new path | See native interaction result below |

The tree and session suites substitute the picker/adapter boundary where stated;
they are not claims of testing the OS picker or Rust. Rust tests and the actual
desktop run provide those separate layers. The generated `FileTree-Test 中文 …`
fixture includes `main.tex`, sections, nested chapters, images/PDF, Bib, empty
directory, `主文件.tex`, `第一章/研究方法.tex`, and `图片 资源/实验图片.png`.
Image/PDF bytes are resource-operation fixtures, not rendering acceptance.

Native interaction result: **partially verified, overall interactive run did not
pass**. Real Windows picker selection succeeded twice; all assertions through
recovery, external-conflict refusal, Chinese rename/move, new-path bytes and
absence of the old paths succeeded. The runner then printed
`NATIVE_PICKER_CANCEL_READY` and timed out at cancellation: the automation could
not reliably target the dialog while another window repeatedly covered it.
The log retains that failure. A fresh targeting retry was stopped after the
same interference rather than claiming success. Only the test-owned process
tree was stopped. The later refresh staging change passed its disk regression
and the final native build; a complete interactive rerun of that final build
is still pending. Native cancellation, real IME and physical power interruption
remain unverified in this audit. No simulated input is reported as IME or
native-window acceptance.

One intermediate browser rerun timed out because its missing-file check still
expected raw ENOENT after the product gained an explicit missing-file error.
The assertion was updated to require either explicit missing error; disk
nonexistence and draft preservation assertions remain. The failing log is kept.
An initial native cancel attempt timed out after window targeting interference;
its log is kept separately from the final result.

## Remaining limitations / unresolved audit items

- **Partial concurrency guarantee:** directory moves preflight descendants but
  do not atomically lock the entire subtree against unrelated external apps.
  File rename/delete baseline validation and destination no-replace are covered;
  arbitrary descendant mutations during directory moves are not fully solved.
- Browser File System Access lacks the native compare-and-mutate guarantee.
  Baseline checks reject observed conflicts, but arbitrary non-cooperating
  writers can still race the final browser commit. Native desktop is stronger.
- Refresh is explicit, not a background filesystem watcher. External rename
  becomes a new path plus retained missing session; it does not infer identity
  or rewrite LaTeX references. Missing drafts can be copied/exported/recovered;
  Save does not silently recreate the deleted path.
- Folder deletion, resource-file deletion UI, custom context menus, drag/drop,
  multi-select and arrow-key tree navigation were not implemented previously
  and are not introduced in this bug bash. Existing buttons and native
  `details` support Tab, Enter and Space. There is no per-file tab-close UI.
- Empty directories inside a TeX project work. A wholly empty/non-TeX project
  without confirmed recoverable TeX drafts remains rejected with a clear error;
  the previous project remains open.
- Case-only rename of an existing Windows path is rejected as a collision.
  Windows backslashes are rejected in project-relative UI paths; use `/`.
  Normalized `.`/`..` stay within the project; escaping paths are rejected.
- 200 added files were measured (about 0.8 seconds on this machine, including
  fixture I/O and UI wait). This is not a million-file/large-binary performance
  claim; project initialization still reads resource bytes and the tree is not
  virtualized. No exhaustive accessibility audit or physical touchpad test.
- Recovery journals still have Phase 1 retention/storage limits; no full
  version history, recovery-draft management UI or crash-proof last-keystroke
  guarantee is claimed.

## Evidence and changed files

Committed evidence is under `docs/file-tree-evidence/`. Screenshots support the
record; assertions and byte checks establish behavior. `move-before.png` shows
the missing late input, while `move-after.png` preserves it. The standalone
before/after captures illustrate FT-16. Full local logs remain under
`test-results/file-tree/` and `test-results/file-tree-*.log`.

![Move lost in-flight typing before repair](file-tree-evidence/move-before.png)
![Move preserves in-flight typing after repair](file-tree-evidence/move-after.png)

Compact committed logs: [browser failures](file-tree-evidence/browser-before.txt),
[native failures](file-tree-evidence/native-before.txt),
[refresh race failure](file-tree-evidence/refresh-before.txt),
[native cancellation blocker](file-tree-evidence/native-cancel-blocked.txt),
[final automated checks](file-tree-evidence/final-checks.txt).

Product files: `apps/web/src/project/{project.mjs,paths.mjs,dependencies.mjs,explorer.js}`;
`apps/web/src/main.js`; `apps/web/src/editor/source-workspace.js`;
`apps/desktop/src-tauri/src/{project.rs,bridge.js}`.
Tests: `tests/project-tree-integrity.test.mjs`, `tests/file-tree-browser.cjs`,
`tests/file-tree-sessions.cjs`, `tests/project-native-bridge.test.mjs`,
`tests/project-tauri.cjs`. CI: `.github/workflows/desktop.yml` now includes the
three project browser suites and native integrity tests. CI has not been run
against this follow-up branch (PR #16 is already merged). Documentation: this
report and `docs/V3_PROGRESS.md`.

Local commands: discover all Node tests with `rg --files tests -g '*.test.mjs'`
then pass the full list to `node --test`; run the three project/tree browser
scripts plus `tests/editor.cjs`; `npm run build`; run
`apps/desktop/scripts/check-native.ps1`; then `node tests/project-tauri.cjs`
with the operator completing the explicitly printed native-picker steps.
The actual desktop runner kills only the app process tree it started.
