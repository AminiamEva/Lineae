#!/usr/bin/env bash
set -euo pipefail

[[ "$GITHUB_EVENT_NAME" == push && "$GITHUB_REF" == "refs/tags/$TAG" && "$TAG" == "v$VERSION" ]]
refs=$(git ls-remote --exit-code origin "refs/tags/$TAG" "refs/tags/$TAG^{}")
target=$(awk '/\^\{\}$/ { peeled=$1 } NR==1 { direct=$1 } END {print peeled ? peeled : direct}' <<<"$refs")
test "$target" = "$GITHUB_SHA"

windows=(artifacts/windows/*-setup.exe)
test "${#windows[@]}" = 1 && test -s "${windows[0]}"
assets=(
  "${windows[0]}"
  artifacts/windows/Lineae-portable.zip
  artifacts/windows/SHA256SUMS.txt
  "artifacts/macos/Lineae-$VERSION-aarch64.dmg"
  "artifacts/macos/Lineae-$VERSION-aarch64.app.zip"
  artifacts/macos/SHA256SUMS
  "artifacts/linux/Lineae-$VERSION-linux-amd64.deb"
  "artifacts/linux/Lineae-$VERSION-linux-x86_64.AppImage"
  artifacts/linux/SHA256SUMS-linux
)
for asset in "${assets[@]}"; do test -s "$asset"; done
(cd artifacts/windows && sha256sum -c SHA256SUMS.txt)
(cd artifacts/macos && sha256sum -c SHA256SUMS)
(cd artifacts/linux && sha256sum -c SHA256SUMS-linux)

flags=()
if [[ "$PRERELEASE" == true ]]; then flags+=(--prerelease --latest=false); fi
gh release create "$TAG" "${assets[@]}" --draft --verify-tag --title "Lineae $TAG" \
  --notes-file "docs/releases/$TAG.md" "${flags[@]}"
gh release edit "$TAG" --draft=false
