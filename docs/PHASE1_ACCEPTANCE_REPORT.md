# Phase 1 implementation and acceptance — 2026-11-14

Latest finalization evidence and readiness status are in
[PHASE1_FINAL_ACCEPTANCE.md](PHASE1_FINAL_ACCEPTANCE.md). It supersedes historical
missing-persistence/Tauri-kill notes below: actual process-tree recovery now passed
after adding Rust-backed disk checkpoints. The main.js conflict that blocked
latest-main integration in the prior checkpoint has now been resolved
with user-approved merge 6ba780c. Combined tests and independent-session recovery
verification passed. Historical sections below describe earlier checkpoints.

## Resilience follow-up (latest)

Implemented fixes:

- Native save now writes a unique sibling staging file, flushes it with sync_all,
  then calls Windows ReplaceFileW. It no longer truncates the original before
  writing. Failed saves remove only their own staging file. A killed process can
  leave a staging file; reserved .lineae-save-* files are excluded from project
  enumeration and retained rather than deleting potentially useful evidence.
- The native adapter sends expected original bytes. Rust compares those bytes
  with the opened target immediately before staging. Writes from this process
  are serialized. Its open original denies concurrent write handles; delete
  sharing is necessary for replacement. Windows ACL and lock errors propagate.
- Native string rejections are normalized to Error objects so explorer error
  feedback includes the actual reason.
- Native-root project drafts receive synchronous localStorage checkpoints on
  content changes and state transitions. Reopening the same selected root asks
  before restoring text drafts. Recovery retains original baseline bytes, so an
  externally changed file still conflicts on save. Successful saves clear clean
  drafts; explicit project close discards recovery after the existing confirmation.
  Storage quota errors are shown rather than silently treated as protection.

Automated evidence:

- 7 Rust test entries passed, zero ignored. One entry is the child-process crash
  helper; the parent spawns that helper and checks its deliberate exit code 92.
  A child exits after staging is synced but before replacement: original bytes
  remain intact and a subsequent save succeeds.
- Actual Windows ACL deny-write/delete on a newly created test file rejected a
  save and preserved original bytes. The temporary deny ACE was removed afterward.
  Separate read-only attribute and exclusive share_mode(0) tests rejected save,
  read and move attempts as applicable, preserving the original.
- Two competing threads supplied the same baseline; exactly one write succeeded.
  A subsequent stale-baseline write was rejected. This verifies intra-process
  serialization and expected-content checks, not arbitrary external cooperation.
- 238 JS tests passed, zero skipped. Project browser E2E additionally verified
  a checkpoint surviving a fresh page instance, confirmation-based restoration,
  and rejection of save after external disk modification. It still uses the
  documented native IPC contract substitute for this browser-only recovery test.
- Web build, final native debug build and V2 regression passed. An initial native
  rebuild failed because the previous acceptance executable was still running.
  It was normally closed (no forced termination), then the locked native test/build
  gate passed. See resilience-build-final.log and resilience-v2.log.

Local evidence: test-results/phase1/resilience-native.log, resilience-js.log,
resilience-browser.log, resilience-build.log, resilience-build-final.log,
resilience-v2.log. Tests create
dedicated fixtures; no user files or original font/zoom workspace were changed.

Remaining limits (not claimed as passed):

- Physical Chinese IME, human permission/error-dialog presentation and broader
  accessibility remain manual checks. ACL enforcement itself was automated.
- Atomic replacement protects old/new content against the tested process exit;
  power failure, filesystem failure and termination during every OS phase were
  not tested. This is not a guarantee against all storage failures.
- An external process with delete sharing can replace a path between native
  validation and replacement. Cross-process compare-and-swap and races during
  rename/delete are not fully solved. Other applications need not respect our
  process mutex.
- Recovery is best effort: it depends on available localStorage and the same
  native root identity. Browser-handle projects do not have this recovery key.
  Editor history/selection are not persisted through a crash. A crash between a
  filesystem rename and checkpoint update can leave a draft at an old path;
  unmatched entries remain in recovery storage. Missing files are not recreated
  automatically. No end-to-end forced Tauri process kill with draft recovery was
  performed; the tested page restart and native writer exit are separate checks.

Phase 1's tested safety coverage has expanded; exhaustive crash/concurrency and
manual IME acceptance is still not declared. No later feature phase was started.

## Native build and actual desktop validation (latest)

The earlier missing-toolchain/native-picker gaps below are superseded by this
section. Rust 1.100.0 MSVC was installed locally in test-results/toolchain using
the official rustup distribution, without modifying system PATH. Existing Visual
Studio 2017 C++ tools and Windows SDK were used. Cargo.lock now pins the actual
resolved desktop dependencies. No release installer or signing was performed.

Actual results:

- Web build and staging: passed.
- `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`:
  2 passed, 0 failed/ignored. These call production Rust operation logic on real
  Windows disk: Chinese/space paths, BOM/mixed EOL and binary content, file and
  directory moves, write/read/delete, scope denial, destination collision,
  missing files, self-descendant moves and invalid payload preservation.
- `cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`:
  passed; debug executable at apps/desktop/src-tauri/target/debug/lineae.exe.
- 235 JavaScript tests passed with zero skips; project browser E2E and existing
  V2 browser regressions passed again.
- The freshly compiled Tauri app was actually launched. Windows UI automation
  clicked Open Project, observed the real Windows folder dialog, selected
  test-results/phase1/原生 工程, and observed main.tex load with the tree hidden.
- Using that application's actual UI and Rust backend (no substituted IPC),
  sections/method.tex was renamed to sections/renamed.tex, then moved to moved.tex.
  The active editor path followed both changes. Text was added and saved.
  Independent filesystem reads verified the new content, unchanged main.tex,
  and absence of both old paths.
- Reopening the native picker and cancelling with Escape closed the dialog
  and preserved the active moved.tex content and project.

Evidence: tool-observed native window/accessibility states in this chat;
test-results/phase1/native-build.log, native-check.log, unit-regression.log,
project-browser.log, v2-regression.log and the retained 原生 工程 fixture.
Native UI actions were automated and observed, not a user-performed manual audit.
Some UI captures initially lacked coordinate geometry; refreshing/activating
the returned native window resolved this without modifying application code.

Fix found during native testing work: a write/create request without bytes is
now rejected before opening/truncating the destination. A Rust regression test
proves an existing file remains intact. No compilation source errors remained.

Still not claimed as verified: actual Windows access-denied and locked-file
dialogs, physical Chinese IME, multi-process race/crash recovery, release build
and installer. Browser-only directory rename/move and automatic TeX reference
rewriting remain unsupported as previously documented. Core native happy-path
acceptance is now verified; exhaustive Phase 1 acceptance is not declared.

Reproduce: build Web assets first, then run
`apps/desktop/scripts/check-native.ps1`; it uses system cargo or the local
test toolchain and fails immediately on staging/test/build errors.

Status: substantial integration implemented; full Phase 1 acceptance is pending.
Latest Phase 1.5 checkpoint supersedes the remaining-feature list below:

- Implemented: Tauri `pick_folder` selection, session-authorized native project
  roots, scoped list/read/write/create/mkdir/remove/move IPC, binary byte transport.
  Desktop staging now includes both V2 and project CSS.
- Implemented: literal-command dependency metadata initialized on open and updated
  on edits/create/delete/reload/move. Comments/verbatim are ignored, macro paths
  remain pending. Missing known resources are counted in the explorer. This is
  not a full TeX dependency resolver. Paths use the compilation project root.
- Implemented: documentclass-based main candidates, main.tex fallback and user
  main-file selection. Multiple candidate persistence across reopen is not yet provided.
- Implemented: native file/directory rename and move. Stable IDs, sessions and
  drafts survive. Conflicts, invalid Windows names, self-descendant moves and
  changed disk bytes/directory membership are rejected before mutation. Model
  remapping happens after disk success, with path-change records for future
  reference rewriting. TeX reference text is deliberately not rewritten.
- Browser-only File System Access mode has no directory rename/move API exposed
  here; those buttons are available on the desktop native adapter only.
- Automated: 235/235 selected tests passed, zero skipped; Web build passed;
  existing V2 browser regression passed. New E2E also passed real Windows disk
  rename/move through a substituted native IPC contract, including a dirty active
  file and a project without main.tex. OS-disk tests include directory movement
  into a Chinese/space path and saving after that movement.
- Native bridge tests cover cancellation, dialog failure, Chinese/space root and
  binary byte transport. They do not exercise the actual native dialog or Rust.
- NOT VERIFIED: Rust compilation/Tauri runtime. Neither cargo on PATH nor the
  normal user cargo installation was present. No desktop build was claimed.
- NOT MANUALLY VERIFIED: Windows directory picker, permissions, locked files,
  physical IME. No new screen/OCR automation was attempted this round.
- Known risks: external races between checks and writes/moves; partial writes on
  I/O failure; no filesystem watcher. Native roots remain authorized for the
  running application session. Project mutations are serialized by the UI.
- Full Phase 1 remains pending native build/runtime and manual acceptance. No
  subsequent math/Bib/font/pagination development was started.

Additional files in Phase 1.5: `apps/desktop/src-tauri/src/project.rs` (native
operations), `lib.rs` (registration), `bridge.js` (adapter),
`apps/desktop/scripts/stage.mjs` (CSS staging),
`apps/web/src/project/dependencies.mjs` (bounded metadata),
`tests/project-dependencies.test.mjs`, `tests/project-native-bridge.test.mjs`;
existing project model, explorer, disk/browser tests were extended.

The detailed sections below retain the preceding Phase 1 checkpoint for context.
Branch: feat/project-multipage-bibliography. Original font/zoom worktree untouched.
No push, PR, merge or release performed.

## Implemented

- Open a disk-backed directory through File System Access, initialize Project,
  select main.tex (otherwise first TeX file), load source, derive a real tree.
- Explorer initially hidden, including after reopening. Toggle is first child
  of the existing bottom status bar, with aria-expanded/controls and tooltip.
- Expand/collapse directories, active/dirty indicators, TeX/Bib/image/PDF/resource
  kinds, TeX and Bib source editing. Binary resources display their path.
- Independent source drafts, CodeMirror state/history/selection/scroll, rich
  selection and Split preference. Reuse one CodeMirror view; do not remount app.
- Source and Split editing of full documents and child fragments, including
  rich-to-source updates without adding a document wrapper to disk.
- Save current file, check external disk bytes, retain drafts on failure,
  confirmed explicit reload. Dirty-project close and beforeunload protection.
- Actual file/directory creation; confirmed non-main-file deletion. Model changes
  follow successful disk operations. Rename/move have no misleading UI entry.

## Data flow

DirectoryHandleAdapter -> Project records -> derived tree -> explorer.
Before switching, source and CodeMirror state are captured in the current file.
The next file's state is installed into the existing view and its preview rebuilt.
Save captures current source -> checks disk -> writes -> updates saved baseline.
Errors reach both explorer status and application status; conflict does not
fall back to overwriting or downloading a misleading successful save.

## Verification actually run

- Original selected baseline: 229/229 passed before edits.
- Extended selected regression: 232/232 passed, zero skips (LaTeX, config,
  typography/layout, Bib and project suites). Three additional tests cover
  real disk operations and fragment byte/offset semantics.
- Build passed after integration.
- Existing browser regression passed on Edge, including 66 V2 assertions,
  source lifecycle, mixed-EOL exact export, source state/history and other editor
  regressions. Final rerun status must be checked in the local evidence log.
- New browser integration passed: hidden-on-open/reopen, leftmost toggle,
  drafts, native filesystem save/conflict, Source/Split, rich child edits,
  Bib saves, new file, deletion cancel/confirm, 1440/900/600/390px layouts.
- New real OS filesystem test passed: production adapter through OS-backed
  handle contract, BOM/Chinese/mixed EOL, create directory/file, conflict,
  external deletion, deletion, and reopen.

Browser disk tests use Chromium's native origin-private filesystem (real native
handles and persistent writes), with only showDirectoryPicker substituted.
The OS-disk test uses Node-backed handle contracts. Neither proves the complete
system picker/permission interaction with a user-selected Windows directory.
No XeLaTeX comparison was run in this phase; no TeX-equivalence claim is made.

Local reproducible evidence: test-results/phase1/split-desktop.png,
split-900.png, split-600.png, split-390.png, v2-regression.log and disk-* fixtures.
Screenshots were inspected; a narrow-screen status-bar wrap was corrected.
Test evidence and downloaded MathLive build assets are ignored, not source files.

## Files

- apps/web/src/project/explorer.js: UI/controller and project lifecycle.
- apps/web/src/project/project.mjs: filesystem create/delete/reload operations.
- apps/web/src/project/paths.mjs: distinguish PDF resources.
- apps/web/src/editor/source-workspace.js: capture/restore CodeMirror sessions.
- apps/web/src/editor/source-sync.js, apps/web/latex/document.mjs: opt-in fragments.
- apps/web/src/main.js: thin editor bridge and project save/open integration.
- apps/web/project.css, apps/web/index.html: explorer layout and stylesheet.
- tests/project-browser.cjs: real-browser native-filesystem integration scenarios.
- tests/project-disk.test.mjs: ordinary OS-directory adapter integration.
- tests/project-fragments.test.mjs: byte/offset regression for child sources.
- tests/project-paths.test.mjs: PDF classification adjustment.
- .gitignore: local evidence/build downloads.
- docs/V3_ARCHITECTURE.md, docs/V3_PROGRESS.md, this report: implementation status.

## Remaining acceptance gaps and next tasks

1. Native Windows directory picker and permission-denial UI acceptance; physical
   Chinese IME and concurrent writer stress. Current checks are not substitutes.
2. Token-aware dependency initialization and semantic main-document selection.
3. External filesystem refresh/watch and recovery after partial create failures.
4. Rename/move with verified path-reference updates; currently withheld.
5. Bib field-manager integration; currently source editing only.
6. Resource preview and project-wide export/compile resource wiring.
7. Additional per-file undo/selection/scroll stress assertions. Browser tests
   exercise state switching but do not exhaust every plugin/lifecycle combination.

Do not mark Phase 1 fully accepted or advance math/font/pagination development
until required Phase 1 gaps are resolved. Those later phases remain unchanged.
