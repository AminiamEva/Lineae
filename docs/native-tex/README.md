# Native TeX migration: first checkpoint

## Scope and non-negotiables

- Keep the current XeLaTeX-aligned JS rendering path and the separate, unmerged Lua JS engine.
  The latter's branch/commit is not yet supplied; do not modify, merge or substitute it.
- Build, test and package on remote CI. Windows x64 and macOS Apple Silicon only;
  Intel Mac is out of scope. Users run the downloaded applications on their own two devices.
- “Remote build” refers to building the application and running acceptance tests.
  Uploading user documents for remote compilation is **not** enabled or implied.
- Experimental native editing will be off by default until its own acceptance gates pass.
  This first checkpoint does not yet include rtex, LuaLaTeX, a new renderer or PDF export.

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

## Next gates

The first gate now has a dedicated remote workflow:

```sh
gh workflow run native-tex.yml --ref main
```

It runs on macOS arm64 and Windows x64, verifies the rtex 0.0.8 archive against a
checked-in SHA-256, and installs the frozen TeX Live 2025 `tlnet-final` toolchain
into the CI workspace. This toolchain is **not** added to desktop packages.
The probe adds a controlled `unicode-math`/Latin Modern Math preamble only to its
test input; it is not a production preamble rewrite or a general TeX parser.
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

1. **Environment/geometry:** remote CI verifies pinned rtex + LuaLaTeX, font identity,
   an actual `LayoutUpdate`, an empty `den` owner and a revision-matched incremental
   `ParagraphUpdate`. Archive the actual protocol trace; never fabricate it from fixtures.
2. **Read-only native view:** process/session ownership, fonts, Painter and one display
   formula, while keeping the existing editor as default.
3. **Editable denominator:** one authoritative source transaction, stable slot identity,
   undo/redo, stale-result rejection and clean uninstrumented export.
4. Expand only after source fidelity, geometry and history pass. Native engine speed
   and sub-30ms interaction are unmeasured targets, not promises.
