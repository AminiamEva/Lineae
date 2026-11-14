# V3 implementation contract and audit

Finalization adds persistent native-root identities/main selection and Rust-backed
.lineae-state.json snapshots. The real forced-Tauri-kill test demonstrated that
localStorage alone was insufficient. Native checkpoint writes are queued and use
the safe-save path; recovery promises only the last completed checkpoint. Corrupt
state is retained. A named Windows mutex serializes cooperative Lineae processes
for each canonical save path. See PHASE1_FINAL_ACCEPTANCE.md for tested boundaries,
shared-snapshot limitations and the current upstream integration conflict.

Resilience follow-up: native saves now stage and flush sibling bytes before
ReplaceFileW, verify expected source bytes in Rust, and serialize own writes.
This preserves the target in tested pre-replacement process exits; external
delete-sharing replacement races remain. Native project source drafts use a
localStorage RecoveryStore keyed by selected root, restored only on confirmation
with the original disk baseline retained. Recovery is text-only and best effort;
it does not persist CodeMirror history and does not replace filesystem saves.
Native error strings are normalized at the bridge for visible UI feedback.

Native follow-up: the adapter is now compiled and tested with a pinned Cargo.lock.
Production Rust disk tests exercise the same operation helper invoked by Tauri.
The actual desktop UI has selected a Windows folder and completed file rename,
move and save. Invalid write payloads are validated before opening a file.
check-native.ps1 provides a repeatable locked test/debug-build gate. Permission,
crash and concurrent-writer coverage remains limited; see acceptance report.

## Phase 1.5 additions

The Tauri bridge selects directories with the existing dialog plugin and returns
a project adapter. Rust retains authorized roots and validates every relative
operation against the canonical selected root; listing skips symbolic/junction
aliases. Browser File System Access remains a separate adapter. Native commands
preserve byte content and use OS rename for files and directories.

Project.move validates destination, affected saved bytes and directory membership,
then calls the adapter before updating existing records in place. File IDs,
drafts and CodeMirror states survive; pathChanges records old/new paths without
rewriting TeX source. UI operations serialize disk mutations.

Dependency metadata is bounded: literal input/include/graphics/Bib resource
commands, known missing resources and pending macro paths. Source scans are
cached per file ID and refreshed on changed content, not on file switches.
Main candidates come from documentclass declarations with a main.tex fallback;
the user can select another TeX file. This is not macro expansion or full Phase 2.
Native compilation and native dialog/manual permission acceptance are pending;
test results distinguish substituted IPC, OS disk, and browser native OPFS.

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

The explorer now consumes Project.tree directly, with native directory-handle
reads/writes, file/directory creation, confirmed deletion and explicit disk reload.
The bottom status bar's first child is the explorer toggle. Opening/reopening
always resets visibility to hidden. Directory expansion is UI state, file content
and dirty state are owned by Project.

The existing CodeMirror view is reused. Each file stores its EditorState (including
undo history, selection and EOL metadata), original source and scroll offsets.
Project switches restore that state; the existing rich-text projection is rebuilt.
Rich selection and Split preference are stored per file. Project files use Source
or Split; standalone Document mode remains available outside projects. Bib files
use source editing with preview disabled. Full bibliography-manager integration
is pending. Binary resources are identified but not opened in a text editor.

Fragment parsing is explicit and opt-in, used for project TeX files only. The
temporary document wrapper is removed from parser results; projection offsets
refer to child source bytes. Original mixed EOL bytes remain authoritative.

Saving checks disk bytes and retains dirty drafts on failure. Reload discards a
dirty draft only after confirmation. There remains a check/write race against an
external writer. Creation also has a check/create race. Main selection still
prefers main.tex, then the first TeX file. Semantic root detection, dependency
initialization, filesystem watching, rename/move transactions and full native
directory-picker acceptance are pending. See PHASE1_ACCEPTANCE_REPORT.md.
