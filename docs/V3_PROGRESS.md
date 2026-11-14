# V3 checkpoint — 2026-11-14

## PR #17 Windows CI — 2026-11-15

[Remote run 43614263127](https://github.com/AminiamEva/Lineae/actions/runs/43614263127)
passed completely for repair head `fc45db3`: data/UI/Bib tests, V2/project/tree/
session browser suites, 21 Rust entries, Windows packaging and artifact upload.
The initial failure was a browser-test OPFS snapshot race during indentation
save; the test now waits for the existing save-completion signal before exact
disk comparison. Local CI-version Chromium regressions also passed, including
428 Node tests, 12 tree and 5 session scenarios. See FILE_TREE_BUG_AUDIT.md for
failure evidence and run links. PR remains open; no merge or release.

## File Tree concurrency and native cancellation follow-up — 2026-11-15

Directory moves now carry original subtree membership and saved bytes into the
native layer, use a project-wide lock across cooperating Lineae processes, and
verify/pin move endpoints. After a committed move, membership is reconciled while
existing editor baselines, drafts and stable IDs are retained. Late external
changes are visible and stale saves are refused; failed reconciliation does not
pretend the disk move was rolled back. This does not claim atomic locking of all
unrelated external programs or large-binary performance acceptance.

428/428 Node tests, 21/21 Windows Rust entries, 12/12 tree E2E and 5/5 session
E2E passed. Existing project and V2/V2.1 browser regressions, web build and locked
Tauri desktop debug build also passed. The actual latest-build Windows picker
passed standalone cancellation, Chinese/space directory selection, and dirty
project cancellation with both drafts, selection, undo, Split and editor identity
preserved. This was operator-assisted real native UI acceptance, not mocked or
unattended CI. Physical Chinese IME, touchpad and power-loss testing remain open.
See [FILE_TREE_BUG_AUDIT.md](FILE_TREE_BUG_AUDIT.md) for evidence and limitations.

Delivery: [Ready for Review fix PR #17](https://github.com/AminiamEva/Lineae/pull/17)
is open from the existing feature branch. Implementation commit: `246237f`.
No merge or release; local automated results are distinct from remote CI status.

The following sections retain historical results. The native cancellation blocker
there is superseded by the successful follow-up; earlier full native recovery and
rename/move UI coverage is not represented as a new final-build UI rerun. No
Phase 2 work or changes to the original font/zoom workspace were made.

## File Tree bug bash

19 reproduced issues repaired across model, native operations, tree DOM and
editor sessions; details, failed-before evidence and boundaries are recorded in
[FILE_TREE_BUG_AUDIT.md](FILE_TREE_BUG_AUDIT.md). In-flight move/reload/delete
edits survive; refresh publishes baselines only after all reads; missing drafts
remain recoverable; native file mutations validate and operate on the same
handle without replacing a conflicting destination. Tree edits retain DOM and
focus; standalone sessions and pending Split preview updates are preserved.

Final automated checks: 420/420 Node tests, 13/13 Rust entries, 11/11 tree E2E
and 5/5 session E2E scenarios; existing project/V2 browser regressions and locked
desktop debug build passed. CI definitions include the new suites, but no
follow-up remote CI result is claimed. Real native selection, recovery and
Chinese rename/move/save reached their assertions; cancellation then timed out
due to window targeting interference. Full interactive final-build rerun,
native cancellation and physical IME remain pending, not passed.

PR #16 was found already merged at audit start. Repairs remain on the existing
feature branch; no duplicate PR, PR merge, release or protected-workspace change.
Earlier Phase 1 reports below describe their own runs, not this audit's native
cancellation result. No Phase 2 work was started.

## Review-ready integration

User-approved merge 6ba780c integrates origin/main 4bd1165 and retains V2.1 zoom,
save indentation and environment completion alongside project sessions. Recovery
uses per-instance journals and guarded archival, preserving alternate drafts.
406 Node tests and 9 Rust entries passed; combined browser and native builds
passed. See PHASE1_FINAL_ACCEPTANCE.md for current results and manual limitations.
Earlier blocked/single-snapshot notes below are superseded.
Delivery: branch pushed, [Ready for Review PR #16](https://github.com/AminiamEva/Lineae/pull/16)
created. No merge/release. Implementation commit 63194d6.

## Finalization checkpoint

240 JS tests and 8 Rust test entries passed; browser/project tests and native
debug build passed. Actual Tauri process-tree termination/recovery passed after
fixing lost localStorage with Rust-backed disk checkpoints. Main selection and
IDs persist. Final report/screenshots are in PHASE1_FINAL_ACCEPTANCE.md.
Ready for Review is blocked by current origin/main integration conflict in
apps/web/src/main.js. No push/PR; no Phase 2 development.

## Resilience follow-up

Added native staging/replacement saves, Rust expected-byte checks, own-writer
serialization, visible native errors and confirmed local draft recovery for native
roots. 7 Rust test entries and 238 JS tests passed. Real ACL/read-only/exclusive
lock, competing thread writes and a writer subprocess exit were exercised.
Browser recovery E2E passed. Full manual IME, all cross-process races and full
Tauri-kill draft recovery are not claimed; see latest acceptance report.
Final locked native debug build and V2 browser regression also passed. The
previous acceptance app was closed normally to release its executable lock.

## Native acceptance follow-up

Rust/MSVC toolchain installed within ignored test-results; Cargo.lock added.
Desktop debug build passed, 2 production-Rust disk tests passed, 235 JS tests
and project/V2 browser regressions passed. Actual Tauri UI selected a Chinese
space-path folder, preserved hidden-tree default, renamed/moved a child file,
saved to the new disk path, and preserved the project on picker cancellation.
Missing-byte write requests now reject before truncation. No user manual audit,
Windows permission/locked-file interaction, release build or installer claim.
See the latest native section of PHASE1_ACCEPTANCE_REPORT.md; older checkpoints
below describe earlier states and their missing-toolchain note is superseded.

## Latest Phase 1.5

Native Tauri project picker/adapter, bounded dependency initialization, semantic
main candidates/user selection, file/directory rename and move are implemented.
235 selected tests, Web build, new browser integration and V2 regression passed.
Real Windows disk rename/move and unsaved-draft save-to-new-path were automated
through the native IPC contract. Rust compiler/runtime and native dialog/manual
permissions remain unverified; Phase 1 is not declared fully accepted. See the
latest section in PHASE1_ACCEPTANCE_REPORT.md. No Phase 2 work, push or release.

This is an incomplete development checkpoint, not V3 acceptance. The latest
Phase 1 implementation and evidence are in PHASE1_ACCEPTANCE_REPORT.md. The
foundation-only status below describes the previous checkpoint.

## Changes

- `apps/web/src/project/paths.mjs`: project-relative paths, resource kinds and
  derived directory tree, including empty directories and dirty indicators.
- `apps/web/src/project/project.mjs`: project records, independent drafts,
  main/active selection, conflict checks and browser directory-handle adapter.
- `tests/project-paths.test.mjs`, `tests/project-model.test.mjs`: path boundaries,
  tree identities, mixed EOL retention, unsaved switches, external modifications
  and write failure behavior using an in-memory disk fixture.
- `docs/V3_ARCHITECTURE.md`: audited integration constraints and staged design.

## Verification

Installed locked dependencies with npm ci. Initial configuration test failed
because yaml was not installed; after installation the selected regression run
passed 229/229 tests (LaTeX, config, layout, Bib and four new project tests).
The application build passed. No skipped tests in that run.

Browser E2E, actual filesystem UI integration, Chinese IME, new combined project
fixtures and XeLaTeX comparisons have not run. Existing TinyTeX xelatex and
Poppler tools were located under the shared .lineae-build/toolchains directory;
their discovery is not a TeX comparison result.

## Pending

Phase 0 browser regression remains pending. Phase 1 is partial: model and adapter
exist but are not yet wired to the application. Hidden explorer and bottom-left
toggle, directory CRUD, safe file switching and actual disk acceptance come next.
Phase 2 dependency parsing/search, Phase 3 math/font/Bib enhancements, Phase 4
pagination/TOC/references and Phase 5 combined acceptance remain unimplemented.
No font assets, desktop release changes or collaboration features were added.

The original font/zoom worktree was not edited. No push, PR or release was made.
