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
  opt-in, **read-only native page preview alongside the unchanged editable surface**.

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
Only trusted, standalone test documents are in scope.

Requirements, installed separately (not silently downloaded by the application):

- rtex **0.0.8**, including its adjacent `share/rtex/tex` directory.
- LuaLaTeX with the fixture's packages and Latin Modern Math.
- `LINEAE_RTEX_PATH` may select the rtex executable; otherwise `rtex` is resolved
  from the process PATH. `RTEX_TEXLIVE_BIN` may select the TeX Live binary directory.
  `RTEX_TEXDIR` is supported by rtex for a nonstandard support-file location.
- GUI-launched apps do not necessarily inherit a terminal's PATH. Launch the executable
  from the configured terminal for the first experiment; the app must report missing tools,
  not fall back to another implementation.

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
project assets and degraded-page PDF fallback are not yet supported.

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
| Native-canvas clicking, caret and selection | **Not implemented**; requires stable owner/slot mapping and native geometry, not an invisible MathLive overlay |
| Native page fidelity | Strict resource/exactness gate; no generic-font or unknown-operation fallback |
| Full feature parity | **Not achieved**; native direct editing cannot become default until these gates pass |

This checkpoint offers existing editing with an updating LuaLaTeX preview. It is not a
claim that the complete existing editing experience has been reimplemented on native
geometry, or that an unsupported document can already be edited in the native Canvas.

[Run 45384269123](https://github.com/AminiamEva/Lineae/actions/runs/45384269123)
verified the real Rust session, captured font loading, raw-source updates, revision-checked
clean PDF export and close cleanup on **both Windows x64 and macOS arm64**.
The frontend test also filled the sample denominator, undid and redid the edit while
retaining exactly the surrounding source spelling; the existing math-editing suite ran
with the preview active through a mock transport. These are distinct layers of evidence,
not a claim of automated physical-device IME or native-canvas direct-editing coverage.

## Next gates

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
