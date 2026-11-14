# V3 checkpoint — 2026-11-14

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
