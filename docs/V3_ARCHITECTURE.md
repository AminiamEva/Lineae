# V3 implementation contract and audit

Baseline: origin/main 8b3db67aeb7203a75b1b42b151aeef89ecdc643e.
PR #14 was confirmed merged through GitHub API at 4531d2dc3c0ef67e322982f039a7ade890365d38.
Branch: feat/project-multipage-bibliography. Isolated managed worktree: lineae-v3-project/Lineae-source-editor-pr.
The existing Lineae-editor-v21 working files are not inputs to this work.

## Existing boundaries

The main application coordinates a single filename, file handle, saved source,
imported source and rich-text snapshot. `load` resets source history and clears
project assets when marking an import saved. It cannot safely serve as a
multi-file switch without a document-session adapter. `source-sync` and
`source-workspace` own the V2 bidirectional projection; preserve their contracts.
The project asset map and ZIP dependency scanner support export, not a persistent
filesystem-backed project. The existing bibliography engine must be reused.
Typeset pagination and reference indexing should be extended rather than replaced.

## Dependency order and acceptance gates

0. Baseline tests, build and browser regressions; record environment limitations.
1. Project records, filesystem adapter, document sessions, explorer. A directory
   picker loads disk-backed records; the panel starts hidden. The toggle is the
   first control in the bottom status bar. Verify real disk reads/writes, external
   changes, cancellation and unsaved state before declaring this phase complete.
2. Token-aware dependency scanner and root-relative TeX resolution, cycle and
   missing-file diagnostics; main-document selection, search and confirmed batch
   replacement. Preserve source offsets and line endings. Preview composition
   must not replace editable child-file source with expanded text.
3. Bounded macro expansion, math environment adapters, typography settings and
   bibliography presentation. Keep BibTeX and biblatex configurations distinct.
4. Recursive layout fragments, shared page/anchor registry, TOC, references and
   print consumption. TeX page numbers and browser page indices are separate data.
5. Combined fixtures, existing V2 E2E and XeLaTeX comparisons. A browser-only
   result is not evidence of TeX equivalence.

## Data ownership

- Project: stable id, root adapter, file map, directory set, main file id, config.
- ProjectFile: stable id, normalized root-relative path, kind, disk version,
  original source, draft source, dirty state, editor session. Binary resources
  retain byte content, not decoded text.
- DirectoryNode: derived tree including empty directories, not authoritative state.
- MainDocument: selected file id and resolved compilation dependency order.
- Dependency: owner file id, command, source span, literal path, resolved file id
  or diagnostic. Multiple occurrences remain distinct; cycles use an active stack.
- DocumentReference: label/citation identity, owner and source span, semantic target.
- ProjectState: active file id, sessions, diagnostics, tree visibility (initially
  false), expanded directories and filesystem operation state.

Filesystem writes require an adapter with read, list, write, mkdir, rename and
delete capabilities. Reject paths escaping the selected root. Detect external
modification before writing. Rename and reference updates require a reviewable
transaction; on partial failure retain recovery information. Browser capability
limitations must be surfaced, never silently replaced with a virtual disk.

The parser produces source locations; the macro engine produces a separate
expansion with origin mappings; math and typography consume semantic settings.
Bibliography consumes project Bib records and citation occurrences. Pagination
produces page fragments and anchors. References and TOC consume the same immutable
layout revision so page labels and jump targets cannot drift between revisions.

## Scope and fidelity

Font embedding, release engineering and collaboration are deferred. Full TeX
catcodes, package execution, arbitrary macros and exact TeX page breaking are
not promised. Unsupported syntax must remain source-preserved and diagnosed.

Current implementation is foundation-only: path normalization, derived trees,
project draft records and a browser directory-handle read/write adapter. Saving
checks current disk bytes and retains dirty drafts when writing fails. This is
not atomic protection against an external write between the check and write.
Main selection currently prefers main.tex, then the first TeX file; semantic
main-document detection is pending. The adapter has not had real-browser disk
acceptance. Explorer UI, editor session integration and new TeX semantics are
not complete. Do not describe the planned architecture as shipped behavior.
