# Native editing surface (migration phase)

The native TeX preview is no longer the end goal. This page describes the
architecture now being migrated toward: a directly interactive surface whose
layout geometry comes only from rtex/LuaLaTeX.

Status: the migration is in progress. Native input is opt-in, the old editor
remains the default fallback, and the final acceptance gate (normal editing
with the old JS typesetting engine disabled) is not met yet.

## Rules

- ProseMirror remains the single document model and history.
- A native page receives pointer, caret, selection, keyboard and IME input for
  supported content. The old JS-formatted page is not the input surface.
- MathLive may supply math semantics (commands, structure rules), but not the
  page geometry.
- The old JS typesetting engine stays only as a fallback while parity is built.
  Final acceptance is editing with it disabled.
- Unsupported or stale geometry never writes a guessed source range.

## Implemented editing paths

Standalone and composed project pages can combine prose, inline math and
display math. Native text and math adapters share the same document session
and selection. Each editable stop maps to its source file, and a registered
PDF can serve as the painted page when its geometry matches the observed
layout. `parity.json` records the verified scope and links to each test run.

| Layer | Implementation |
| --- | --- |
| Geometry source | rtex layout, staged raster images and font faces including collections; registered PDF for other resources |
| Source mapping | `editor/native-math/source.mjs`, `document.mjs`, `resolve.mjs`; `editor/native-text/projection.mjs` |
| Caret/selection | `editor/native-surface/document-session.mjs` and its text and math adapters over observed owner boxes |
| Input | textarea overlay for keys and IME composition; keys map to exact source patches |
| Transactions | `commitMath` and `commitText` apply verified patches through ProseMirror |
| History | ProseMirror undo/redo, with verified tests for edits that affect two project files |
| IPC | Rust reader thread emits `lineae-native-tex` events; no polling loop |

Covered interactions include printable insertion, deletion within a slot or
paragraph, horizontal and vertical movement, PageUp/PageDown, range selection,
undo/redo, and Tab between empty math fields.

For plain prose, each non-space grapheme is preceded by an
`\attribute65000` assignment inside a local group. The instrumented compile is
accepted only when its drawing equals the displayed raw page, so attributes
that change spacing or line breaking cannot authorize a caret. Source edits
remain UTF-16 patches into the original paragraph bytes; TeX syntax in a
paragraph refuses native targeting rather than guessing a range.

Drag selections and keyboard-extension selections are drawn from observed glyph
boxes. A click paints a positioned caret marker. Both disappear when the frame
is no longer current.

Composed documents draw file dividers between verified visual lines. The dividers
leave page geometry unchanged, including when an input begins on a line shared
with its parent. Independent project documents switch the compilation entry
within the same trusted project. A detached source fragment inherits the project
preamble in the temporary snapshot and keeps its own source offsets for edits.
Folding at verified visual boundaries masks the included content on the edge
pages and hides intervening pages while keeping their original numbering.
Edits to existing UTF-8 TeX buffers reuse the live and observation sessions.
Changes to the compilation entry or to binary assets rebuild the snapshot.
Unchanged glyphs keep their owner IDs across edits to limit the changes sent to
the observation engine.

## Event-driven protocol

`native_tex_open` installs an emitter on the session. Every protocol event that
the Rust reader decodes is emitted as:

```json
{"sessionId":"tex-…","event":{"event":"LayoutUpdate","versions":{…}}}
```

The frontend subscribes with the Tauri event API and processes layout,
paragraph, diagnostic and engine-state events immediately. `native_tex_poll`
exists only for hosts without an event bridge. The previous 250 ms source
debounce and 100 ms polling timer are gone: refreshes coalesce through an
in-flight update loop instead.

Demonstrated in the browser regression by asserting that typing produces a
source update without any additional `native_tex_poll` call.

Real-engine evidence on both target platforms now covers prose as well:
rtex reports attribute-tagged text glyphs outside math, and the browser
regression clicks a recorded LuaLaTeX text box, places the native caret and
writes the exact source byte.

## Latency

`#native-tex-preview` records `data-latency-samples`, `data-latency-p50`,
`data-latency-p95` and `data-latency-p99` from keydown through the next browser
frame after the matching caret geometry. `data-latency-segments` reports separate percentiles for
input-to-transaction, transaction-to-geometry, geometry-to-repaint and the
total, using up to the most recent 1,024 samples. Superseded revisions and
edits whose caret could not be restored do not enter the sample set.
`data-latency-routes` records the corresponding counts by engine route, project
file update, or session restart. The browser regression uses
mocked geometry. OS input, real device composition and display scan-out still
need separate measurements on Windows and macOS.

Engine-only protocol timings are in `parity.json` and the
[two-platform Actions artifacts](https://github.com/AminiamEva/Lineae/actions/runs/45651241855).
The run recorded 1,000 warm edits each at 10, 100, and 300 pages.

GitHub-hosted WebView2 and WKWebView checks start the engine-off workspace and
verify the embedded fonts, PDF worker and native session bridge. The workflow
also runs on Ubuntu x64 with pinned rtex and a WebKitGTK smoke check under Xvfb.
Browser regressions and real LuaLaTeX host tests run separately from these
WebView checks. Linux exercises the directory-handle tests shared with macOS.
The actual folder picker and physical Linux IME still need device checks.

For physical input review, the workflow's optional `desktop_input_probe`
retains the unbundled debug executables from the same commit. The three-platform
[full software run](https://github.com/AminiamEva/Lineae/actions/runs/45678406254)
includes these executables and the recorded LuaLaTeX geometry. Launch an
executable with `--lineae-native-workspace` on the device under test. This
opens the engine-off workspace with the normal TeX trust dialog. The
`--lineae-native-workspace-smoke` argument is for the automated check that
opens and exits on its own.

The device record needs the commit, operating system, WebView version, IME
name, and a recording of the candidate box after the first and second Pinyin
keys next to an inline formula. Check candidate selection, cancellation,
duplicate input and shortcut delivery with the physical keyboard. Measure
keydown to pixels separately from engine protocol and browser frame timing.

## Known gaps before switching the default

1. Broader commands, TeX structures, complex table cells and project changes
   still need equivalent editing and history coverage.
2. Cross-file replacement can include complete inline and display formulas
   between prose endpoints. It verifies the rebuilt document against the source
   drafts and records both drafts in the same undo step. Selection endpoints
   inside complex containers still need coverage.
3. Automated composition proves commit-once and cancellation. Candidate
   placement, shortcut delivery and latency still need physical-device tests.
4. The browser can open standalone and floating TikZ directly from a registered
   LuaLaTeX PDF and edit an ordinary formula on that page. The two-subfigure
   example opens the specific drawing clicked on both platforms, as verified by
   [45656057369](https://github.com/AminiamEva/Lineae/actions/runs/45656057369).
   Other nested float content still needs geometry and editing coverage.
5. The engine-off desktop workspace has passed the covered cases. Its default
   switch still depends on complete coverage and the device checks.

## Acceptance for the first full slice

- With the old JS page hidden and MathLive not focused, a user can click a
  supported formula on the native page, type, move the caret, select, delete,
  undo/redo, and save the same source bytes as the old editor would produce.
- Typing produces no periodic polling and no fixed debounce delay.
- Every accepted hit matches session, source and layout revisions; a stale frame
  cannot edit.
- IME composition commits once and cancels without an edit on physical Win/macOS.
- The old editor remains reachable while the migration is incomplete, but is not
  required for the supported slice.
