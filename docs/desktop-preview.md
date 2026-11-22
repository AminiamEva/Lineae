# Lineae desktop

The desktop app wraps the existing `apps/web` editor in a Tauri 2 shell. Windows
and macOS packages are built on their matching GitHub Actions runners; local
development is limited to editing source and installing CI artifacts.

## Scope

Included:

- Offline Windows x64 NSIS installer.
- Portable ZIP containing the standalone executable.
- macOS Apple Silicon DMG and app ZIP, ad-hoc signed.
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

- `Lineae_0.2.2_x64-setup.exe` (offline NSIS installer)
- `Lineae-portable.zip` (portable executable and notes)
- `SHA256SUMS.txt` (SHA-256 checksums)

Tag builds attach the artifacts to a GitHub release. A manual run may also set `release_tag` to publish a matching version after all checks and packaging. Publication stays draft until the installer, portable ZIP and checksums are uploaded and verified. Preview tags publish prereleases; stable tags publish normal releases.

## Code signing

Tag builds sign the app, NSIS uninstaller, and final installer with Authenticode
when the repository provides these secrets:

- `WINDOWS_CERTIFICATE`: base64-encoded PKCS#12 (`.pfx`) code-signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: password for that `.pfx` file.
- `WINDOWS_TIMESTAMP_URL`: optional RFC 3161 timestamp server; defaults to
  `http://timestamp.digicert.com`.

Tauri invokes `sign-windows.ps1` before embedding the app in NSIS and again for
the uninstaller and installer. The script signs with SHA-256 and an RFC 3161
timestamp, and verifies every invocation with `signtool verify /pa`. The workflow
also verifies the final standalone executable and installer before packaging.
When `WINDOWS_CERTIFICATE` is absent, a `preview` tag builds unsigned artifacts.
A formal release requires a certificate by default; a manual release may explicitly
set `allow_unsigned: true` after the publisher has chosen unsigned distribution.
The workflow verifies that these binaries are unsigned and the release notes must
disclose that status. v0.2.2, v0.2.0 and v0.1.0 use this explicit unsigned path.
Pull-request and branch builds never require a certificate.

A publicly trusted signing certificate must be obtained separately; GitHub
Actions cannot create a trusted publisher identity. Cloud HSM services such as
Azure Trusted Signing require an alternative `signCommand`. Once the three PFX
secrets exist, any `v*` tag publishes signed artifacts without further changes.

Configure the secrets locally without pasting the certificate or password into
an issue or chat:

```powershell
pwsh apps/desktop/scripts/configure-signing.ps1 -Certificate C:\secure\lineae.pfx
```

The script prompts for the password, verifies that the PFX contains a private
key and permits code signing, then sends all three values to GitHub through
`gh secret set`. It does not print the certificate or password.

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

- Current release: [v0.2.2](releases/v0.2.2.md); macOS Apple Silicon is published alongside Windows; no automatic update channel.
- v0.2.0 is explicitly unsigned. Other stable releases still require a certificate
  or a deliberate unsigned release request.
- The portable executable assumes WebView2 is installed. The offline installer
  installs it when missing.
- Text editing expects UTF-8 `.tex` / `.bib`; binary assets are preserved, not opened as text.
- The web version remains the primary target and continues to deploy through
  `pages.yml`.
