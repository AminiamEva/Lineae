# Lineae desktop preview

The desktop preview wraps the existing `apps/web` editor in a Tauri 2 shell. It is
built and packaged only on GitHub Actions Windows runners; local development is
limited to editing source and installing CI artifacts.

## Scope

Included:

- Offline Windows x64 NSIS installer.
- Portable ZIP containing the standalone executable.
- Native open, save, and save-as dialogs for UTF-8 `.tex` files.
- Native ZIP/YAML export using the existing project export code.
- Bundled MathLive script, fonts, brand assets, and editor bundle.

Deferred:

- XeLaTeX compilation and PDF preview.
- File watching and automatic reload.
- Auto-update.

## Architecture

`apps/desktop/src-tauri` contains the Rust shell. It creates the `main` window and
injects `src/bridge.js` before the web app loads. `scripts/stage.mjs` copies only
the runtime files from `apps/web` into `apps/desktop/dist`, so editor sources and
test fixtures are not embedded in the installer. The bridge maps the File System
Access API calls already used by `apps/web/src/main.js` onto four Tauri commands:

- `open_tex` opens a native picker and reads the selected UTF-8 file.
- `pick_save_tex` opens a native save picker and records the destination.
- `write_tex` writes only to paths selected through a native dialog.
- `save_bytes` writes ZIP/YAML exports produced by detached download anchors.

The Rust side keeps an allowlist of dialog-selected paths. IPC cannot write to an
arbitrary path, and the webview never receives broad filesystem scope.

## Build

The `Desktop Preview` workflow (`.github/workflows/desktop.yml`) runs on every pull
request and on `v*` tags. It performs the web build, vendors MathLive, runs the
data, UI, bibliography, and Playwright suites, then builds the Tauri bundle.

Builds upload an artifact named `lineae-desktop-<sha>` containing:

- `Lineae_0.1.0_x64-setup.exe` (offline NSIS installer)
- `Lineae-portable.zip` (portable executable and notes)

Tag builds attach the artifacts to a GitHub release. Tags containing `preview` are published as prereleases; other tags publish a normal release.

## Acceptance checklist

Use the CI-built artifacts, not a local build.

1. Disconnect networking, run the installer, and start Lineae.
2. Open a `.tex` file from a directory whose full path contains Chinese characters.
3. Edit, save, close, reopen, and confirm the file content and path are unchanged.
4. Use Save as to write a copy into another Chinese-named directory.
5. Export the project ZIP and confirm it contains the edited `.tex` and required assets.
6. Place the caret after an inline formula, switch to a Windows Chinese IME, type
   pinyin, and confirm the first letter's caret position and candidate commit are
   correct.
7. Start the portable executable on a machine with WebView2 available and repeat
   steps 2–6.

Record the workflow run URL, artifact names, and the result of each step in the pull
request.

## Known limits

- Preview version `0.1.0`; no signing, update channel, or release stability promise.
- The portable executable assumes WebView2 is installed. The offline installer
  installs it when missing.
- Only UTF-8 `.tex` files are accepted; malformed input is reported in the status bar.
- The web version remains the primary target and continues to deploy through
  `pages.yml`.
