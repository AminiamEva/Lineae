# macOS desktop distribution

Lineae uses the existing Tauri 2 shell, Node.js 22 with npm, Cargo, and the system WKWebView. The macOS package targets Apple Silicon (`aarch64-apple-darwin`) and declares macOS 13.0 as its minimum system version. Keep macOS and its WebKit updates current.

The shell loads `index.html` and the bundled editor, MathLive, fonts, and symbol assets from Tauri's local app protocol. Native dialogs and scoped IPC open/save UTF-8 files and projects. The experimental LuaLaTeX path discovers separately installed rtex 0.0.8 and TeX Live; it does not bundle a TeX distribution. Native output uses glyph Canvas with offline PDF.js fallback. See [native TeX setup and acceptance status](native-tex/README.md); native-Canvas direct editing is not yet complete.

## Remote build on Apple Silicon

Build and test using the GitHub Actions `macos-15` Apple Silicon runner, not on the user's device.
The runner supplies the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/),
Xcode tools, Node.js and Rust. Python 3 runs the bounded packaged WKWebView/PDF smoke test.
The following commands document the remote runner recipe, not a request for local builds.

From the repository root on the remote Mac runner:

```bash
xcode-select -p
rustup target add aarch64-apple-darwin
npm ci
npm ci --prefix apps/desktop
npm run build
archive_dir=$(mktemp -d)
archive=$(npm pack mathlive@0.108.0 --pack-destination "$archive_dir" --silent)
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive_dir/$archive" -C apps/web/vendor/mathlive --strip-components=1 \
  package/mathlive.min.js package/fonts
rm "$archive_dir/$archive"
rmdir "$archive_dir"
npm --prefix apps/desktop run tauri -- build --target aarch64-apple-darwin --bundles app,dmg -- --locked
version=$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version")
bash apps/desktop/scripts/package-macos.sh "$version"
```

Tauri reads `tauri.macos.conf.json` alongside the shared config. It keeps `app.lineae.desktop` as the bundle identifier, converts the existing Lineae Logo into the app icon, and signs the app using the ad-hoc identity `-`. No Apple Developer membership, certificate, or notarization credentials are used.

- Raw app and DMG: `apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/{macos,dmg}/`.
- Normalized output in `artifacts/macos/`: `Lineae-<version>-aarch64.dmg`, `Lineae-<version>-aarch64.app.zip`, and `SHA256SUMS`.
- The ZIP is created with macOS `ditto` so the unpacked bundle retains its structure, executable permissions, and code signature.

## GitHub Actions and releasing

- For a build without publication, open [macOS Apple Silicon](https://github.com/AminiamEva/Lineae/actions/workflows/macos-release.yml), choose **Run workflow**, and download the `lineae-macos-aarch64` artifact from the run. Equivalently, use `gh workflow run macos-release.yml --ref main`.
- For a release, update the matching version in `apps/desktop/package.json`, `apps/desktop/package-lock.json`, `tauri.conf.json`, `Cargo.toml`, and `Cargo.lock`. Commit the version changes before pushing one matching `v<version>` tag. A pre-release suffix such as `-preview.1` must also agree across manifests.
- For example, for a committed application version `X.Y.Z`, run `git tag -a vX.Y.Z -m "Lineae vX.Y.Z"` and `git push origin vX.Y.Z`. The workflow validates the tag before building and publishes only after the Web regressions and macOS artifact checks succeed.
- macOS and Windows share the version's GitHub Release. The macOS workflow waits for any running Windows tag workflow, then appends its separately named assets if the release is public or creates a release for the verified tag. A pre-existing draft is left for its owner to finish. If a publication step fails, the verified package files are still available from Actions.

The build verifies the arm64 executable and ad-hoc signature in the original, mounted DMG, and extracted ZIP bundles. It checks the Applications link and SHA-256 file, then starts the extracted app with outbound networking denied to the app's test process. The WKWebView smoke test checks the editor, MathLive, bundled fonts and symbol library, and the native bridge's refusal to write to an unselected file. The staging list contains frontend runtime files, and collection checks it for common development and credential files. The workflow does not use a signing secret.

## Install and verify on a Mac

1. Download the DMG or app ZIP and the matching `SHA256SUMS` from the same [GitHub Release](https://github.com/AminiamEva/Lineae/releases). To check just the DMG, compare the output of `shasum -a 256 Lineae-X.Y.Z-aarch64.dmg` with its line in `SHA256SUMS`. If both packages are present in the same directory, use `shasum -a 256 -c SHA256SUMS`.
2. Open the DMG and drag Lineae to Applications, or extract the ZIP and move `Lineae.app` there. If the system Applications folder requires privileges, create `~/Applications` and copy it there instead.
3. Launch the copied app in Finder. If macOS blocks it, and you trust the source and have verified the package, check **System Settings → Privacy & Security → Open Anyway**. This exception applies to the app you tried to open and is available only when macOS and the Mac's policy offer it. [Apple's instructions for opening an unnotarized app](https://support.apple.com/en-us/102445)
4. To verify the installed bundle, run `codesign --verify --deep --strict --verbose=2 "$HOME/Applications/Lineae.app"`, substituting the actual path if needed. To smoke-test offline use, turn off networking, launch Lineae, open a local `.tex` file, edit a formula, and Save As to a writable directory.

An ad-hoc signature provides an integrity check and does not identify the developer to Gatekeeper. The CI launch uses an extracted build on a runner. A freshly downloaded, quarantined copy must be checked separately on a physical Mac for the first-run behavior.

## Troubleshooting and future signing

- An architecture mismatch means the installer is for a different CPU. Run `uname -m` and use an Apple Silicon Mac.
- If Gatekeeper offers no override, check the download hash and your device's security policy. On managed devices, the policy may prevent installation of unnotarized apps.
- A tag mismatch means the version manifests or the tag need correction before release. Manual dispatch is available to retest packaging without a version tag.
- For future Developer ID distribution, replace the ad-hoc identity with a **Developer ID Application** identity from a dedicated signing keychain, configure the notarization credentials in GitHub Actions, and switch the release checks to validate the Developer ID signature and stapled ticket. Keep credentials out of the repository. [Tauri signing and notarization guide](https://v2.tauri.app/distribute/sign/macos/)
