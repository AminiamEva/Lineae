#!/usr/bin/env bash
set -euo pipefail

[[ "$GITHUB_EVENT_NAME" == push && "$GITHUB_REF" == "refs/tags/$TAG" && "$TAG" == "v$VERSION" ]]
refs=$(git ls-remote --exit-code origin "refs/tags/$TAG" "refs/tags/$TAG^{}")
target=$(awk '/\^\{\}$/ { peeled=$1 } NR==1 { direct=$1 } END {print peeled ? peeled : direct}' <<<"$refs")
if [[ "$target" != "$GITHUB_SHA" ]]; then
  echo "Release tag $TAG no longer points to the verified commit" >&2
  exit 1
fi

notes="docs/releases/$TAG.md"
stem="Lineae-$VERSION-aarch64"
cd artifacts/macos
files=("$stem.dmg" "$stem.app.zip" SHA256SUMS)
sha256sum -c SHA256SUMS

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
if existing=$(gh release view "$TAG" --json isDraft,assets 2>"$scratch/lookup"); then
  if jq -e '.isDraft' >/dev/null <<<"$existing"; then
    echo "Release $TAG is still a draft. The verified macOS assets remain available in Actions." >&2
    exit 1
  fi
  missing=()
  for file in "${files[@]}"; do
    if jq -e --arg name "$file" '.assets | any(.name == $name)' >/dev/null <<<"$existing"; then
      gh release download "$TAG" --pattern "$file" --dir "$scratch"
      cmp "$file" "$scratch/$file" || {
        echo "Release $TAG already contains a different $file" >&2
        exit 1
      }
    else
      missing+=("$file")
    fi
  done
  if (( ${#missing[@]} )); then
    gh release upload "$TAG" "${missing[@]}"
  fi
else
  if ! grep -Eqi 'release not found|HTTP 404' "$scratch/lookup"; then
    cat "$scratch/lookup" >&2
    exit 1
  fi
  if [[ -f "../../$notes" ]]; then
    cat "../../$notes" > "$scratch/notes"
  fi
  cat >> "$scratch/notes" <<'NOTES'

### macOS (Apple Silicon)

Download the arm64 DMG or app ZIP and verify it against SHA256SUMS. The app
uses ad-hoc signing and is not notarized. See the
[installation guide](https://github.com/AminiamEva/Lineae/blob/main/docs/macos-distribution.md#install-and-verify-on-a-mac).
NOTES
  flags=()
  if [[ "$PRERELEASE" == true ]]; then
    flags+=(--prerelease --latest=false)
  fi
  gh release create "$TAG" "${files[@]}" --verify-tag --title "Lineae $TAG" \
    --notes-file "$scratch/notes" "${flags[@]}"
fi
