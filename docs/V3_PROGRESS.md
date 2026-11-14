# V3 checkpoint — 2026-11-14

## Review-ready integration

User-approved merge 6ba780c integrates origin/main 4bd1165 and retains V2.1 zoom,
save indentation and environment completion alongside project sessions. Recovery
uses per-instance journals and guarded archival, preserving alternate drafts.
406 Node tests and 9 Rust entries passed; combined browser and native builds
passed. See PHASE1_FINAL_ACCEPTANCE.md for current results and manual limitations.
Earlier blocked/single-snapshot notes below are superseded.

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
