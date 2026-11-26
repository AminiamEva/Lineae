#!/usr/bin/env bash
# Run in the provisioned Linux environment. Refuse to reuse an old result directory.
set -eu
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
out=$(realpath -m "${1:?provide a new output directory}")
mkdir "$out"
git rev-parse HEAD > "$out/commit.txt"
git status --short --branch > "$out/git-status.txt"
ref=tests/fixtures/paragraph-layout/texlive-2025-debian
run() {
  local id=$1 status=0
  shift
  "$@" > "$out/$id.log" 2>&1 || status=$?
  { printf '%s\t%s\t%s.log\t' "$id" "$status" "$id"; printf '%q ' "$@"; printf '\n'; } >> "$out/commands.tsv"
  printf '%s exit=%s\n' "$id" "$status"
  return "$status"
}
run fixtures sha256sum -c docs/dual-engine/fixtures.sha256
run runner node --test tests/tex-reference/runner.test.mjs
run smoke python3 -B tests/tex-reference/smoke.py "$out/smoke"
run generate python3 -B tests/tex-reference/generate.py "$out/reference" --jobs "${JOBS:-2}"
for file in lualatex-reference.json luatexja-reference.json; do
  run "cmp-$file" cmp "$ref/$file" "$out/reference/$file"
done
run legacy-xe node tests/bib/verify-xelatex.mjs "--out=$out/bib-xe"
run bib-lua node tests/bib/verify-xelatex.mjs --engine=lualatex "--out=$out/bib-lua"
