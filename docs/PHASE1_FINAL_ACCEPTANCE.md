# Phase 1 final acceptance — 2026-11-14

Status: local core verification passed; **Ready for Review is blocked** by
integration with the newly advanced upstream main. No branch push or PR was made.

## Baseline and integration gate

Worktree: lineae-v3-project/Lineae-source-editor-pr.
Branch: feat/project-multipage-bibliography. Starting commit: ad04942.
Implementation base: 8b3db67, including V2 PR #14.
Latest origin/main: 4bd1165950c2cf9799215cf877d13e778e0dba00, now including PR #15
and environment-completion fixes. `git merge-tree --write-tree HEAD origin/main`
reported a conflict in apps/web/src/main.js. This was an object-only preview:
no upstream merge, branch switch or worktree overwrite was performed.
Latest-main combined behavior has not been tested. Integration requires direction
under the user's prohibition on merging others' changes. Do not equate branch
tests with successful latest-main integration or create a falsely ready PR.

The old font/zoom directory was inspected read-only; no task writes targeted it.
Its branch has independently advanced to fix/latex-environment-completion-pairing,
so this report does not claim that unrelated concurrent work stayed unchanged.

## Actual changes this round

- Persistent file identities and selected main-document path for native projects.
  Main selection uses declared document candidates, main.tex fallback and a user
  selector. Identities survive reopen and project moves.
- A Windows named mutex coordinates cooperative Lineae processes saving the same
  canonical path. Rust rechecks the expected bytes while holding that mutex.
- The real Tauri kill test exposed loss of unflushed WebView2 localStorage.
  Native projects now also write .lineae-state.json through the Rust staging and
  replacement path. It contains identities, selected main and text draft snapshots.
  This reserved internal file is excluded from project enumeration. It is plaintext
  and should be excluded from source-control/share workflows.
- Checkpoint writes are queued; crashes can lose changes newer than the last
  completed checkpoint. Corrupt checkpoint data is retained and reported, with
  disk checkpoint overwrite disabled for that session. Source files still open.
- Restore confirmation lists file paths, draft lengths and disk-change state.
  Restored drafts retain their original baseline, preventing stale disk overwrites.
- A complete acceptance project and actual Tauri/WebView2 test driver were added.

## Feature status

| Capability | Implementation | Verification |
|---|---|---|
| Native folder dialog, Chinese/space path, cancel | Implemented | Actual Windows UI automation observed; prior cancellation evidence retained |
| File tree and resource classification | Implemented | Browser and native desktop checks |
| Default-hidden explorer, bottom-left toggle | Implemented | Browser assertions and actual Tauri assertions |
| Main detection/user selection/persistence | Implemented | Unit and reopen persistence tests; native identity checks |
| Stable IDs, native file/directory rename/move | Implemented | OS-disk, Rust and previous actual desktop rename/move evidence |
| Multi-file drafts, Source/Split sessions | Implemented | V2 and project E2E; actual Tauri multi-draft/Split checks |
| Literal dependency initialization | Partial semantic scope | Comments/verbatim ignored; macros pending; no complete TeX resolver claim |
| Safe native replacement, expected-byte check | Implemented | Real disk, ACL, locks, thread/process competition |
| Recovery after Tauri process-tree kill | Implemented to last completed checkpoint | Actual compiled Tauri + native IPC, no backend substitute |
| Physical Windows Chinese IME | Not manually verified | Human acceptance required; ordinary injected text is not IME evidence |
| All external races/power failure | Not fully covered | Explicit limitations below |

## Tests actually run

- 240 selected JavaScript tests: passed, zero skipped (238 baseline plus persisted
  identity/main-choice and unreadable checkpoint tests).
- 8 Rust test entries: passed, zero ignored. Includes real ACL denial, exclusive
  locks, two threads and two independent native test processes using one baseline.
  One entry is a child-process helper; parent tests check its exit codes/results.
- Project browser E2E: passed, including real OS-disk rename/move through a
  substituted native IPC contract. This category is not native-shell evidence.
- Actual Tauri test: passed. Native picker operated twice by Windows UI automation;
  all subsequent assertions used Playwright connected to that application's
  WebView2. The backend and IPC were real. The test killed the owned Tauri process
  tree, reopened the same Chinese/space-path project, confirmed recovery of two
  drafts, verified identities, rejected an externally changed file and saved the
  unchanged-file recovered draft. Checkpoints were verified on disk before kill.
- Web build and locked native debug build: passed. No installer/release build.
- V2 browser regression: final rerun passed, recorded in final-v2.log.

Local logs: test-results/phase1/final-js.log, final-native.log, final-browser.log,
final-v2.log, final-tauri.log. Machine-readable desktop result:
test-results/phase1/desktop-final/result.json. Native UI picker interaction is
operator-assisted automation, not a fully unattended test or human manual audit.
The test driver cleans up only the test-owned process tree; fixtures remain.

## Acceptance project and screenshots

Source fixtures: tests/fixtures/project-acceptance. The driver creates a runtime
copy with a PNG resource and a CRLF method file alongside LF files, Chinese and
English text, math, Bib and nested directories. These exercise management only;
no TeX rendering equivalence or compilation support is claimed.

![Actual desktop before forced termination](phase1-evidence/before-termination.png)
![Actual desktop after recovered draft save](phase1-evidence/recovered-desktop.png)

## Remaining limitations and classification

Blocking review readiness: upstream-main conflict and untested combined behavior.
No push/Ready PR until that gate is resolved.

Known safety/coverage limits, not represented as passed:

- An unrelated application using delete sharing can replace a path between
  validation and replacement. The named mutex coordinates Lineae, not all editors.
- Checkpoint storage is currently one latest snapshot per project root; independent
  simultaneous instances do not have separate draft histories. Source-file saves
  are protected, but multi-instance recovery snapshots can supersede one another.
- Rename/delete races, crash between a move and metadata checkpoint, disk-full
  behavior, all OS replacement phases and sudden power failure are not exhaustively
  verified. Interrupted staging files are retained, hidden from the tree.
- Pending asynchronous checkpoint writes can be lost on immediate termination;
  persistent undo/selection history and browser-handle durable recovery are absent.
- Reference paths are not rewritten on moves. The UI reports risk and missing
  known resources. Browser-only directory rename/move remain unavailable.
- Native root selections grant file access for the running process session.
  Physical IME and broader manual accessibility testing remain non-blocking
  manual items; no fabricated pass is recorded.

Next work is to reconcile the editor integration with current main, repeat all
checks on the combined tree, and assess the multi-instance draft snapshot limit
before declaring final readiness. Phase 2 should then add a structured dependency
resolver and project compilation entry; no Phase 2 implementation was started.
