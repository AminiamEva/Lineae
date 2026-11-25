# Native editing surface (migration phase)

The native TeX preview is no longer the end goal. This page describes the
architecture now being migrated toward: a directly interactive surface whose
layout geometry comes only from rtex/LuaLaTeX.

## Rules

- ProseMirror remains the single document model and history.
- A native page receives pointer, caret, selection, keyboard and IME input for
  supported content. The old JS-formatted page is not the input surface.
- MathLive may supply math semantics (commands, structure rules), but not the
  page geometry.
- The old JS typesetting engine stays only as a fallback while parity is built.
  Final acceptance is editing with it disabled.
- Unsupported or stale geometry never writes a guessed source range.

## Vertical slice implemented

Scope: one standalone or project document, one display formula with
editor-owned math slots, and plain documents whose body has no supported
formula. A document that mixes prose and formulas still targets the formulas
only.

| Layer | Implementation |
| --- | --- |
| Geometry source | rtex full layout; exact OTF/TTF pages; PDF fallback for other resources |
| Source mapping | `editor/native-math/source.mjs`, `document.mjs`, `resolve.mjs`; `editor/native-text/projection.mjs` |
| Caret/selection | `editor/native-surface/math-surface.mjs` and `text-surface.mjs` over observed owner boxes |
| Input | textarea overlay for keys and IME composition; keys map to exact source patches |
| Transactions | `commitMath` updates the math node attribute in one ProseMirror transaction |
| History | ProseMirror undo/redo; formula selections restored by structural atom paths |
| IPC | Rust reader thread emits `lineae-native-tex` events; no polling loop |

Keys currently covered: printable insertion, Backspace/Delete within a slot or
paragraph, Left/Right/Home/End between observed stops, Shift selection, drag
selection across glyphs, Cmd/Ctrl+Z / Shift+Z / Y.

For plain prose, each non-space grapheme is preceded by an
`\attribute65000` assignment inside a local group. The instrumented compile is
accepted only when its drawing equals the displayed raw page, so attributes
that change spacing or line breaking cannot authorize a caret. Source edits
remain UTF-16 patches into the original paragraph bytes; TeX syntax in a
paragraph refuses native targeting rather than guessing a range.

Drag selections and keyboard-extension selections are drawn from observed glyph
boxes. A click paints a positioned caret marker. Both disappear when the frame
is no longer current.

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

## Latency

`#native-tex-preview` records `data-latency-samples`, `data-latency-p50` and
`data-latency-p95` for keydown → new geometry observed and repainted on the
native page. This excludes OS input latency and display scan-out, and currently
runs against mocked geometry in the browser regression; it must be repeated on
physical Windows/macOS devices with a real engine before publication claims.

Engine-only protocol timings remain in `native-tex.yml` artifacts.

## Known gaps before switching the default

1. **Mixed prose and project pages.** Plain prose paragraphs now use the same
   pipeline, but a document with any supported display formula still targets
   formulas only. Composed project pages have no prose projection yet; body
   text in a project remains on the existing editor surface.
2. **IME commit coverage.** The native input is an IME-capable textarea and
   composition disables targeting/export, but automated composition commit and
   candidate-window placement need real-device tests.
3. **Project composed pages.** Formula targets resolve to the original file and
   source offsets, and Source mode navigates to that file. Composed paragraph
   editing on the native page is not enabled yet.
4. **Structure commands.** Fraction/root/matrix insertion commands and
   multiline editing still run through the existing editor, not native keys.
5. **PDF fallback.** Pages drawn from PDF are read-only and carry no semantic
   caret.
6. **Engine-off acceptance.** Node scripts and UI still instantiate the old
   typesetting path for fallback; it has not yet been removed from the normal
   editing flow.

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
