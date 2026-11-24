#!/usr/bin/env bash
set -euo pipefail

# Only explicit manual requests can publish; never replace a stable release.
[[ "$GITHUB_EVENT_NAME" == workflow_dispatch && "$PUBLISH_PREVIEW" == true ]]
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ ]]
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
tag="desktop-preview-$GITHUB_RUN_ID"
short=${GITHUB_SHA:0:8}
out=artifacts/preview

(cd artifacts/windows && sha256sum -c SHA256SUMS.txt)
(cd artifacts/macos && sha256sum -c SHA256SUMS)
installers=(artifacts/windows/*-setup.exe)
test "${#installers[@]}" = 1 && test -s "${installers[0]}"
mkdir -p "$out"
cp "${installers[0]}" "$out/Lineae-preview-$short-windows-x64-setup.exe"
cp artifacts/windows/Lineae-portable.zip "$out/Lineae-preview-$short-windows-x64-portable.zip"
cp "artifacts/macos/Lineae-$VERSION-aarch64.dmg" "$out/Lineae-preview-$short-macos-arm64.dmg"
cp "artifacts/macos/Lineae-$VERSION-aarch64.app.zip" "$out/Lineae-preview-$short-macos-arm64.app.zip"
git archive --format=tar.gz --prefix="Lineae-$short/" --output="$out/Lineae-$short-source.tar.gz" HEAD
cp tests/native-math/fixtures/empty-denominator.tex "$out/empty-denominator.tex"
cp tests/native-math/fixtures/filled-denominator.tex "$out/filled-denominator.tex"
cp docs/native-tex/baseline.json "$out/engine-baseline.json"
cp docs/native-tex/resources.json "$out/native-resource-notices.json"
git archive --format=zip --output="$out/Lineae-native-project-fixture.zip" HEAD:tests/native-math/fixtures/lua-project
cat > "$out/BUILD.txt" <<EOF
Channel: desktop preview (not a stable release)
Application manifest version: $VERSION
Commit: $GITHUB_SHA
Workflow: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID
Windows: x64, unsigned
macOS: Apple Silicon only, ad-hoc signed, not notarized
Native LuaLaTeX page preview: opt-in; existing editor remains authoritative
Native Canvas: supported formula clicks, caret and selections use the existing editor
Full replacement of the existing editing surface: not yet complete
XeLaTeX-aligned JS renderer: retained
Lua JS engine: retained separately; unmerged reference not yet supplied
No TeX engine, TeX distribution or user font cache is bundled by this preview.
PDF.js includes its licensed unmodified standard-font and Adobe CMap resources.
The application identifier and preference storage are shared with stable Lineae.
Back up documents and exported preferences before testing.
EOF
cat > "$out/RELEASE-NOTES.md" <<EOF
## Two-device desktop preview

Commit: \`$GITHUB_SHA\`; application manifest version: \`$VERSION\`.
This is a separate **prerelease**, not an update to the stable release.

- **Windows x64:** offline installer or portable ZIP. Unsigned; no trusted publisher identity.
- **macOS Apple Silicon:** DMG or app ZIP. Ad-hoc signed, not notarized; macOS may block first launch.
- Both packages, checksums, exact tracked source, denominator samples and an authored LuaLaTeX project fixture are included.
- No Intel Mac or Linux package is part of this preview.
- Packages retain the stable application's identifier and preference storage; back up documents and exported preferences.
- Optional local LuaLaTeX page preview and clean PDF export require separately installed rtex 0.0.8 and LuaLaTeX, plus explicit document trust.
- For supported formulas, select **Target formula caret (experimental)** to use the native page's clicks and drags. The existing editor still handles input, commands and history.
- Semantic editing of PDF fallback, full native parity, automatic updates and frontend hot reload are not claimed.
- Existing JS typesetting and MathLive remain the active editing implementation. The unmerged Lua JS engine is not modified or substituted.

Check \`BUILD.txt\` and \`SHA256SUMS\`, then follow
[the two-device checklist]($GITHUB_SERVER_URL/$GITHUB_REPOSITORY/blob/$GITHUB_SHA/docs/native-tex/README.md).
Record outcomes against this commit, not just the manifest version.

[Remote build and test results]($GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID).
EOF
(
  cd "$out"
  sha256sum ./* > SHA256SUMS
  sha256sum -c SHA256SUMS
)
assets=("$out"/*)
# Draft until every asset has uploaded. Refuse to overwrite an existing preview.
gh release create "$tag" "${assets[@]}" --target "$GITHUB_SHA" --draft \
  --prerelease --latest=false --title "Lineae desktop preview $short" \
  --notes-file "$out/RELEASE-NOTES.md"
gh release edit "$tag" --draft=false
