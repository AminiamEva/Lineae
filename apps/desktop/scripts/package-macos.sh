#!/usr/bin/env bash
set -euo pipefail

# From the repository root, after `tauri build --target aarch64-apple-darwin`.
version=${1:?Usage: package-macos.sh VERSION [OUTPUT_DIRECTORY]}
out=${2:-artifacts/macos}
bundle=apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle
app="$bundle/macos/Lineae.app"
stem="Lineae-$version-aarch64"

scratch=$(mktemp -d)
mount="$scratch/dmg"
cleanup() {
  if [[ -e "$mount/Lineae.app" ]]; then
    hdiutil detach "$mount" >/dev/null || return
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT

verify_app() {
  local path=$1 plist executable icon signature
  plist="$path/Contents/Info.plist"
  plutil -lint "$plist"
  [[ "$(plutil -extract CFBundleIdentifier raw "$plist")" == app.lineae.desktop ]]
  [[ "$(plutil -extract CFBundleShortVersionString raw "$plist")" == "$version" ]]
  executable="$path/Contents/MacOS/$(plutil -extract CFBundleExecutable raw "$plist")"
  icon=$(plutil -extract CFBundleIconFile raw "$plist")
  [[ -s "$path/Contents/Resources/$icon" && -x "$executable" ]]
  [[ "$(lipo -archs "$executable")" == arm64 ]]
  codesign --verify --deep --strict --verbose=2 "$path"
  signature=$(codesign --display --verbose=4 "$path" 2>&1)
  grep -Fxq 'Signature=adhoc' <<<"$signature"
}

if [[ -n "$(find apps/desktop/dist \( -name '.git' -o -name '.env*' -o -name '*.p12' -o -name '*.pfx' -o -name '*.pem' -o -name '*.key' \) -print -quit)" ]]; then
  echo 'Unexpected development or credential file in frontend staging' >&2
  exit 1
fi

verify_app "$app"
mkdir -p "$out" "$mount" "$scratch/unpacked"
cp "$bundle/dmg/Lineae_${version}_aarch64.dmg" "$out/$stem.dmg"
ditto -c -k --sequesterRsrc --keepParent "$app" "$out/$stem.app.zip"

hdiutil verify "$out/$stem.dmg"
hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$out/$stem.dmg"
[[ -L "$mount/Applications" && "$(readlink "$mount/Applications")" == /Applications ]]
verify_app "$mount/Lineae.app"
hdiutil detach "$mount"

ditto -x -k "$out/$stem.app.zip" "$scratch/unpacked"
unpacked="$scratch/unpacked/Lineae.app"
verify_app "$unpacked"

executable=$(plutil -extract CFBundleExecutable raw "$unpacked/Contents/Info.plist")
python3 - "$unpacked/Contents/MacOS/$executable" <<'PY'
import subprocess
import sys

result = subprocess.run(
    ["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)(deny network-outbound)",
     sys.argv[1], "--lineae-smoke-test"],
    capture_output=True, text=True, timeout=60,
)
print(result.stdout, end="")
print(result.stderr, file=sys.stderr, end="")
if result.returncode or "Lineae smoke: ok" not in result.stderr.splitlines():
    raise SystemExit("Packaged editor smoke test failed")
PY

(
  cd "$out"
  shasum -a 256 "$stem.dmg" "$stem.app.zip" > SHA256SUMS
  shasum -a 256 -c SHA256SUMS
)
