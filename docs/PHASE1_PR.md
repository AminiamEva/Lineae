Opening a LaTeX project now loads a disk-backed file tree and independent editing
sessions. The tree starts hidden; its toggle is the first control in the existing
bottom status bar. Switching files preserves source drafts, selection, undo state
and Split preferences, while saves, renames and moves operate on real files.

This branch integrates main through `4bd1165`, retaining the V2.1 independent zoom,
safe save indentation and environment-completion changes. Project saves share
the explicit-save preparation path, including the indentation opt-out.

Implemented:

- Project model, normalized paths, persistent file IDs/main selection, literal
  dependency metadata and missing/pending resource reporting.
- Native Tauri folder selection and scoped binary-safe filesystem adapter;
  file/directory creation, confirmed deletion, rename/move and disk reload.
- One reused CodeMirror view with per-file states; opt-in document-fragment
  projection for child TeX files, retaining mixed line endings and source guards.
- Native expected-byte checks, staging/flush/replacement saves, cross-process
  save locks and explicit conflict/error feedback.
- Per-instance draft journals. Restoring a version requires confirmation; the
  selected draft is checkpointed before byte-guarded archival of its original.
  Other instances' versions are retained rather than overwritten or cleared.

Validation on the integrated tree:

- All **406** discovered Node test cases passed; zero skipped.
- **9** Rust test entries passed; zero ignored. Includes real Windows ACL,
  exclusive locks, competing processes and independent checkpoint journals.
- Complete browser editor regression passed, including 70 V2 and 61 V2.1
  assertions, source lifecycle, EOL, zoom, toolbar and completion coverage.
- Project browser E2E and ordinary OS-disk tests passed. Browser IPC substitution
  is explicitly distinguished from the actual desktop test.
- Actual compiled Tauri/WebView2 test passed with operator-assisted native folder
  selection, Chinese/space path, process-tree termination, two recovered drafts,
  persistent identities, conflict refusal and recovered-draft disk save.
- Web build and locked native debug build passed. No release installer built.

The real forced-termination test caught loss of unflushed localStorage; native
disk checkpoints were added and the test then passed. Tests and reports do not
claim protection against every possible storage or external-process failure.

Known limits: physical Chinese IME/accessibility remain manual checks; power
failure and every replacement syscall phase are unverified; unrelated editors
need not honor Lineae's mutex. Recovery covers completed checkpoints and source
text, not persistent undo history. Archives retain plaintext drafts and require
disk-space/privacy management. Browser-only rename/move is unavailable. Moves
report reference-path risk rather than rewriting arbitrary TeX. The dependency
scanner has bounded literal semantics; project compilation and Phase 2 remain
out of scope. No font embedding, release or collaboration work is included.

See [final acceptance report](https://github.com/AminiamEva/Lineae/blob/feat/project-multipage-bibliography/docs/PHASE1_FINAL_ACCEPTANCE.md),
[architecture](https://github.com/AminiamEva/Lineae/blob/feat/project-multipage-bibliography/docs/V3_ARCHITECTURE.md), and
[detailed test history](https://github.com/AminiamEva/Lineae/blob/feat/project-multipage-bibliography/docs/PHASE1_ACCEPTANCE_REPORT.md).

Actual desktop before forced termination:

![Native Split before termination](https://raw.githubusercontent.com/AminiamEva/Lineae/feat/project-multipage-bibliography/docs/phase1-evidence/before-termination.png)

Actual desktop after recovered-draft save:

![Native restored draft](https://raw.githubusercontent.com/AminiamEva/Lineae/feat/project-multipage-bibliography/docs/phase1-evidence/recovered-desktop.png)
