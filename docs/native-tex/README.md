# Native TeX migration: first checkpoint

## Scope and non-negotiables

- Keep the current XeLaTeX-aligned JS rendering path and the separate, unmerged Lua JS engine.
  The latter's branch/commit is not yet supplied; do not modify, merge or substitute it.
- Build, test and package on remote CI. Windows x64 and macOS Apple Silicon only;
  Intel Mac is out of scope. Users run the downloaded applications on their own two devices.
- “Remote build” refers to building the application and running acceptance tests.
  Uploading user documents for remote compilation is **not** enabled or implied.
- Experimental native editing will be off by default until its own acceptance gates pass.
  The initial baseline release did not include rtex integration; subsequent work adds an
  opt-in native page/PDF preview alongside the unchanged editable surface.

`baseline.json` records observed JS entry points, fixed candidate dependency commits and
explicitly missing evidence. The rtex and extension tag commits were verified through
GitHub's Git refs API. No candidate source or font has been vendored.

## Download a matching two-device preview

Run **Desktop release** (`macos-release.yml`) on the intended branch, explicitly checking
`publish_preview`. CLI equivalent:

```sh
gh workflow run macos-release.yml --ref main -f publish_preview=true
```

Web checks, Windows checks/build and macOS arm64 packaging run remotely. Linux is skipped
only for this manual preview request. Publication waits for all three required jobs;
macOS retains its packaged WKWebView smoke test and signature checks. Stable `v*` releases
keep their existing platform gates and signing policy.

If GitHub rejects an automated release request after verification, the run keeps
the assembled, checksummed `lineae-verified-preview-<sha>` artifact. A maintainer
can publish those same bytes against a tag verified to point to that commit,
without weakening CI permissions or rebuilding either platform on a local device.

On success, a separate `desktop-preview-<run ID>` GitHub **prerelease** contains:

- Windows x64 offline installer and portable ZIP (unsigned).
- macOS arm64 DMG and app ZIP (ad-hoc signed, not notarized).
- SHA-256 checksums, exact tracked source archive, input/expected-output `.tex` samples,
  engine baseline and `BUILD.txt` linking the exact commit to its CI run.

The application manifest version is unchanged; identify preview builds by commit and
run ID, not that version alone. These baseline packages still share the stable app's
identifier/preferences. Back up documents and export preferences before testing;
do not treat the portable ZIP as an isolated profile. Do not install both copies over
the same stable installation. Native migration is not claimed by publishing a baseline.

## Two-device review

1. Download both platforms from the **same prerelease**; check `BUILD.txt` and hashes.
2. On each physical device, launch the real app and open a **copy** of
   `empty-denominator.tex`.
3. Check existing formula editing, zoom, font loading, copy/paste and Chinese IME.
   Keep any rendering discrepancy as baseline evidence, not an assumed native-engine bug.
4. Try filling the denominator with `b`, undoing, redoing and Save As. Compare the saved
   bytes with `filled-denominator.tex`; record a failure if the change is not exactly one
   letter. The fixture test validates the expected source patch, **not** this interactive path.
5. Record native shortcut delivery separately: Command combinations on the Mac,
   Ctrl combinations on Windows. Browser/CDP simulation does not certify system interception.
6. Record platform/OS, commit, run URL, screenshot or screen recording, source diff and
   pass/fail. A CI launch does not certify a downloaded app's first-run security prompts.

No additional TeX toolchain is required to review this baseline. Later native-engine
checkpoints will specify the exact LuaLaTeX/font requirements; missing requirements must
not silently select a different engine.

## Live feedback versus release validation

At this checkpoint, seeing a new desktop result requires downloading a new CI build.
Browser development previews can speed up UI iteration but cannot validate WKWebView,
WebView2 or IPC. A dedicated hot-reload development shell is a later checkpoint, not a
feature of these packages. It must use a separate development identity and controlled
connection; production must continue loading its packaged resources with its existing CSP.

## Experimental desktop preview integration

The status-bar **LuaLaTeX preview (experimental)** control starts a local rtex session
only after a separate native trust dialog. LuaLaTeX can execute Lua with the user's
file privileges; a temporary directory and disabled shell escape are not a sandbox.
Only trusted documents and projects are in scope. The native trust warning applies to
the entire project, including local packages, Lua modules and image/PDF assets.

Requirements, installed separately (not silently downloaded by the application):

- rtex **0.0.8**, including its adjacent `share/rtex/tex` directory.
- LuaLaTeX with the fixture's packages and Latin Modern Math.
- `LINEAE_RTEX_PATH` may select the rtex executable; otherwise `rtex` is resolved
  from the process PATH. `RTEX_TEXLIVE_BIN` may select the TeX Live binary directory.
  `RTEX_TEXDIR` is supported by rtex for a nonstandard support-file location.
- GUI-launched apps do not necessarily inherit a terminal's PATH. Launch the executable
  from the configured terminal if you use nonstandard paths. For an ordinary GUI launch,
  extract the verified rtex release directory unchanged under `%LOCALAPPDATA%\Lineae`
  (Windows) or `~/Library/Application Support/Lineae` (macOS). Lineae checks
  `/Library/TeX/texbin` on macOS or the latest numeric TeX Live installation on the
  Windows system drive. Explicit environment overrides take precedence. Missing tools
  are reported; another engine is never silently substituted.

For example, Windows PowerShell (substitute installed locations):

```powershell
$env:LINEAE_RTEX_PATH = 'C:\tools\rtex-0.0.8-x86_64-pc-windows-msvc\bin\rtex.exe'
$env:RTEX_TEXLIVE_BIN = 'C:\texlive\2025\bin\windows'
.\Lineae-portable.exe
```

On the Mac, from a terminal:

```sh
export LINEAE_RTEX_PATH="$HOME/tools/rtex-0.0.8-aarch64-apple-darwin/bin/rtex"
export RTEX_TEXLIVE_BIN="/Library/TeX/texbin"
app="/Applications/Lineae.app"
executable=$(plutil -extract CFBundleExecutable raw "$app/Contents/Info.plist")
"$app/Contents/MacOS/$executable"
```

Open the supplied `empty-denominator.tex`, enable preview and approve trust. Continue
typing in the existing rich/formula/source editors: source updates are coalesced after
composition, sent as raw buffers, and acknowledged using actual engine revisions.
The native panel is read-only and visibly marks stale/error frames. Supported exact
OTF/TTF resources are read only through captured font tokens. Type 1, TTC/OTC, images,
TikZ and other material the glyph painter cannot draw use a clean revision-frozen
PDF and the bundled PDF.js renderer. PDF pages are visual output, not semantic
formula hit-testing metadata. No PDF scripting or external PDF viewer is enabled.

For projects, open the existing project explorer and select the actual main `.tex`.
Native snapshots retain relative paths and unsaved text drafts, local `.sty`/`.cls`/
Lua resources and binary graphics. No flattening or writeback to the original project
is performed. Snapshot limits are 512 files, 2 MiB per editable text, 16 MiB per asset
and 64 MiB total.
Hidden metadata is excluded. Explicit generated inputs such as `build/diagram.pdf`
or an external reference `.aux` remain available. Live typing reuses the model's asset
bytes; use the project's explicit Refresh action to load external asset changes.
Dependency changes must invalidate the native engine/cache, not just repaint stale output.

The macOS project bridge uses held directory capabilities and no-follow traversal;
it is not the Windows backend with its platform checks disabled. Conflicted writes
retain displaced bytes for review. Archival remove/recovery data is not automatically
purged; a cleanup policy remains separate from compilation.

The desktop package stages an integrity-verified PDF.js 4.10.38 module/worker and its
licensed standard-font/CMap resources for offline rendering. See `resources.json` and
the corresponding license files in `vendor/pdfjs/`; no user font cache is redistributed.

**Export clean PDF** is available only for a confirmed current frame. It names a source
revision, uses the native Save dialog and exports the uninstrumented session buffer.
Editing can continue while export holds the engine snapshot; subsequent source updates
are queued. Compilation must converge before replacing an existing destination PDF.
Closing/replacing a session or destroying the window stops its process tree and removes
its disposable project; it never saves over the original `.tex`.

### Editing parity gates

| Area | Current approach / evidence required |
| --- | --- |
| Existing math navigation/deletion/structures | Keep the original MathLive and Lineae commands; rerun the existing math suite with preview active |
| History and source changes | One PM/MathLive history, no second native editor history; preview must not write document state |
| IME and clipboard | Existing input surface remains visible/authoritative; physical WKWebView/WebView2 checks still required |
| LuaLaTeX session, fonts and PDF | Real ignored Rust integration test explicitly selected in remote native CI; mock UI tests do not replace it |
| Native Canvas clicking, caret and selection | Interactive slice: verified clicks, caret, keyboard, drag selection and IME-capable input route into ProseMirror for supported formulas |
| Native page fidelity | Exact glyph/resource gate, otherwise revision-frozen whole-page PDF; no generic-font or unknown-operation substitution |
| Full feature parity | **Not achieved**; native direct editing cannot become default until these gates pass |

This checkpoint offers existing editing with an updating LuaLaTeX preview. It is not a
claim that the complete existing editing experience has been reimplemented on native
geometry, or that an unsupported document can already be edited in the native Canvas.

Release acceptance must still cover all of the following before the new surface
can become the default:

- The caret and selection remain synchronized with keyboard navigation and typing,
  including across reflow, zoom, edits, and history changes.
- Existing structured deletion, multiline editing, matrix operations, clipboard,
  toolbar commands, and platform shortcuts behave the same on the new surface.
- Inline and display formulas in composed projects choose their original file and
  offset, not an offset in composed source.
- Physical Windows and Apple Silicon tests cover IME candidate positioning,
  composition commit/cancel, shortcut delivery, and selection at multiple zooms.
- Unsupported or degraded geometry never writes a guessed source range.

[Run 45384269123](https://github.com/AminiamEva/Lineae/actions/runs/45384269123)
verified the real Rust session, captured font loading, raw-source updates, revision-checked
clean PDF export and close cleanup on **both Windows x64 and macOS arm64**.
The frontend test also filled the sample denominator, undid and redid the edit while
retaining exactly the surrounding source spelling; the existing math-editing suite ran
with the preview active through a mock transport. These are distinct layers of evidence,
not a claim of automated physical-device IME or native-canvas direct-editing coverage.

## Next gates

Architecture and current slice limits are documented in
[native-editing-surface.md](native-editing-surface.md). The migration phase
targets a native input surface; the preview remains the fallback until the
gaps listed there are closed.

The first gate now has a dedicated remote workflow:

```sh
gh workflow run native-tex.yml --ref main
```

It runs on macOS arm64 and Windows x64, verifies the rtex 0.0.8 archive against a
checked-in SHA-256, and installs the frozen TeX Live 2025 `tlnet-final` toolchain
into the CI workspace. This toolchain is **not** added to desktop packages.
The authored fixture explicitly selects `unicode-math`/Latin Modern Math.
The probe is not a production preamble rewrite or a general TeX parser.
Fonts remain on the runner; the artifact records their identity and hash.

Each platform uploads `native-tex-geometry-<target>-<commit>` with actual JSONL
commands/events, initial and incremental geometry, the original/projection text,
environment/package revisions, and an independently compiled uninstrumented PDF.
Missing tools, background-only routing, absent owners or mismatched revisions fail
the job; they are not treated as skipped or successful native support. Tests of
the probe's matching logic are separate from engine-generated evidence.
One warm edit's engine timing is recorded, not advertised as end-to-end latency.
An optional `warm_repetitions` dispatch input runs up to 1,000 edits on the
authored LF fixture and archives routing counts plus P50/P95/P99 from JSONL
dispatch to the matching response. It excludes paint, IME, and display latency;
this small-fixture measurement does not replace large-document acceptance.
For explicit larger probes, dispatch `native-tex.yml` with `large_documents=true`
and the desired `warm_repetitions`. It checks the generated 10, 100 and 300 page
counts before timing; the documents are synthetic and not part of a user corpus.

[Run 45438435841](https://github.com/AminiamEva/Lineae/actions/runs/45438435841)
recorded 1,000/1,000 fast edits on each runner. Dispatch-to-result P50/P95/P99
were 2.19/4.90/15.82 ms on macOS arm64 and 2.85/4.09/4.48 ms on Windows x64.
These are CI protocol timings for one short authored document, not a claim of
end-to-end typing latency.

[Run 45443842694](https://github.com/AminiamEva/Lineae/actions/runs/45443842694)
also recorded 1,000/1,000 fast edits per platform and document size:

| Pages | macOS arm64 P50/P95/P99 (ms) | Windows x64 P50/P95/P99 (ms) |
| --- | --- | --- |
| 10 | 2.17/4.77/5.88 | 1.84/2.75/2.98 |
| 100 | 2.96/6.01/11.15 | 1.71/2.62/4.32 |
| 300 | 2.16/5.24/6.29 | 1.61/2.54/3.08 |

These figures apply to a fixed formula edit in synthetic documents, not to
initial pagination, arbitrary projects, or end-to-end input latency.
Source-level newline/Unicode offset coverage does not certify glyph rendering,
interactive history, export identity or input-method behavior.

### Verified geometry checkpoint

[Run 45377663490](https://github.com/AminiamEva/Lineae/actions/runs/45377663490),
commit `8080d0f0e93c21f2d55bd0679077335f8ed7255c`, passed on both target platforms:
actual empty `owner=10, role=den` point, a warm insertion routed `fast`,
matching edit/source revisions, LF and Unicode-comment/CRLF cases, and a separate
uninstrumented reference compile. LuaHBTeX 1.22.0 / TeX Live 2025 and the exact
Latin Modern Math font hash are recorded in each artifact's environment manifest.
This does not yet certify native pointer editing, complete history or export identity.

1. **Environment/geometry:** remote CI verifies pinned rtex + LuaLaTeX, font identity,
   an actual `LayoutUpdate`, an empty `den` owner and a revision-matched incremental
   `ParagraphUpdate`. Archive the actual protocol trace; never fabricate it from fixtures.
2. **Read-only native view:** process/session ownership, fonts, Painter and one display
   formula, while keeping the existing editor as default.
3. **Editable denominator:** one authoritative source transaction, stable slot identity,
   undo/redo, stale-result rejection and clean uninstrumented export.
4. Expand only after source fidelity, geometry and history pass. Native engine speed
   and sub-30ms interaction are unmeasured targets, not promises.

The interaction prototype has two independent modules under
`apps/web/src/editor/native-math/`: `source.mjs` maps supported syntax to slots and
minimal source patches; `hit.mjs` maps page-space geometry to a single owner/role
at a matching session, source and layout revision. The geometry probe connects
an actual empty-denominator box to a one-letter slot patch at 100%, 150% and 200%.
That probe still uses a controlled fixture owner ID. It does **not** certify
production pointer input, a visible caret, a native selection, or undo/redo on Canvas.

The separate **Target formula caret (experimental)** action checks an isolated,
instrumented copy of a supported standalone document or of the selected project
with its TeX inputs. Each recognized top-level
inline or display formula has distinct owner IDs; unsupported formulas do not
receive hit targets.
New atoms receive new IDs without renumbering unchanged owners in later formulas
or included files. Hits still require the current session and source/layout
revisions; stable IDs do not make a stale frame editable.
It enables a click only when
exact page drawing records agree with the raw preview and the session, source and
layout still match. Clicking an empty numerator, denominator, radicand or supported glyph edge transfers focus to the
original MathLive field, or selects the original source offset in Source/Split.
For projects, composed rich pages filter targets by original file. Source/Split
navigates to a clicked target's source file before placing the caret. The observer only
instruments copies of existing TeX files in the trusted project snapshot.
The existing editor history handles subsequent input and undo. A click shows a
native position marker that follows the supported MathLive caret positions when the
layout remains current; dragging between two supported
targets transfers a selection to the editor. Dragging between glyphs in the same
supported formula also highlights those glyphs on the Canvas before drop.
Keyboard extension of a selection between known glyph boundaries uses the same
highlight layer; when either endpoint cannot be mapped, the original editor
selection remains authoritative and no guessed rectangle appears.
Both hit targeting and PDF export are disabled during an IME preedit. Canceled
preedit does not produce a new native revision. This does not move the operating
system's candidate window from the real editing surface to the preview.
Semantic editing on PDF fallback is not implemented.
The independently compiled projection never replaces the source or export buffer.
After targeting is armed, small standalone documents refresh owner geometry after
the new raw layout settles. Large documents and projects still require an explicit
observation request; no stale geometry remains editable during the refresh.
The observation process is kept warm for repeat requests; changes to its
dependency snapshot replace it. Closing the preview also closes the observer
and removes both temporary projects.

When rtex supplies an exact, non-stale warm update whose rows map unambiguously
to the current layout, the page can repaint those rows while waiting for the
complete result. This provisional frame does not authorize hit-testing or PDF
export. A background result remains necessary for placement changes, ambiguous
rows, or drawing operations the warm renderer cannot safely compose.

On remote CI, the browser acceptance pass also replays the raw and instrumented
pages captured by the real Rust/LuaLaTeX session. It loads the recorded font files
on the runner, clicks the actual observed denominator geometry, and verifies the
one-letter edit through the production browser bundle. Test transport is not the
same as physical desktop input; OS-level IME checks remain separate.

The verified release checkpoints are [the two-device preview with Canvas drag targeting](
https://github.com/AminiamEva/Lineae/releases/tag/desktop-preview-45415437738) and the
[preview including multiple formulas, inline targeting, scripts, and PDF reuse](
https://github.com/AminiamEva/Lineae/releases/tag/desktop-preview-45418212782).
The [matrix-slot run](https://github.com/AminiamEva/Lineae/actions/runs/45420285782)
separately verifies real per-cell LuaLaTeX ownership and mock-transport UI targeting.
With the pinned rtex version, `aligned` can report ordinary in-group assignments
under a shared container owner. In the isolated observation copy, the empty-cell
assignment therefore runs after amsmath's internal cell group closes; it adds
no math nodes. The renderer still requires distinct owners and matching drawing
records, rather than guessing a cell from box order.
