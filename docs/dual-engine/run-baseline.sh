#!/usr/bin/env bash
# Run from any directory. Build the editor and provision Chromium/MathLive before browser runs.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
group=${1:?Usage: run-baseline.sh GROUP ABSOLUTE_OUTPUT_DIRECTORY}
out=${2:?Specify an output directory}
mkdir -p "$out"
out=$(realpath "$out")
mkdir -p "$out/$group"
index="$out/$group/results.tsv"
printf 'id\tstatus\texit\tlog\tcommand\n' > "$index"
git rev-parse HEAD > "$out/$group/commit.txt"

run() {
  local id=$1 executable=$2 rc=0 result=PASS
  shift 2
  local log="$out/$group/$id.log" command
  printf -v command '%q ' "$executable" "$@"
  {
    printf 'cwd=%s\ncommit=%s\ncommand=%s\n' "$PWD" "$(git rev-parse HEAD)" "$command"
    if command -v "$executable" >/dev/null; then
      "$executable" "$@" || rc=$?
    else
      printf 'Missing command: %s\n' "$executable"
      rc=127
    fi
    printf '\nexit=%s\n' "$rc"
  } > "$log" 2>&1
  if (( rc != 0 )); then result=FAIL; fi
  if (( rc == 127 || rc == 126 )) ||
     { [[ "$id" == tikz-studio-browser ]] && grep -q '^SKIP ' "$log"; } ||
     { [[ "$id" == book-fixtures-browser ]] && grep -q "ENOENT.*bookreporttest/" "$log"; } ||
     { [[ "$id" == native-pkg-config ]] && (( rc != 0 )); } ||
     { [[ "$id" == bib-compile ]] && (( rc == 2 )); }; then
    result=BLOCKED
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$result" "$rc" "$group/$id.log" "$command" | tee -a "$index"
}

case "$group" in
  node)
    for test in optimum-paragraph typeset-layout paragraph-parameters config; do
      run "$test" node --test "tests/$test.test.mjs"
    done
    run all-node node --test 'tests/**/*.test.mjs'
    ;;
  layout)
    for test in paragraph-layout-browser xecjk-layout-browser appendix-browser book-fixtures-browser book-styles-browser wrapfigure-layout-browser table-scroll-browser table-reflow-browser pagination-idempotency-browser maketitle-date-browser; do
      run "$test" node "tests/$test.cjs"
    done
    ;;
  project)
    for test in project-browser project-separator-browser project-boundary-browser project-reopen-browser project-usability-browser project-render-parity-browser project-editing-browser project-composition-browser workspace-navigation-browser file-tree-browser file-tree-sessions; do
      run "$test" node "tests/$test.cjs"
    done
    ;;
  source)
    for test in source-v2 source-v21 source-workspace source-workspace-lifecycle source-workspace-mixed-eol source-workspace-eol-state source-raw source-separator-fidelity source-standalone-paragraph source-split-reuse source-marker-batching source-display-math source-figures source-headings source-references source-table-floats source-tabularx source-tblr source-text-environments; do
      LINEAE_EOL_ARTIFACTS="$out/$group/$test" run "$test" node tests/run-source-browser.cjs "$test"
    done
    ;;
  editor)
    LINEAE_EOL_ARTIFACTS="$out/$group/editor" run editor node tests/editor.cjs
    run source-eol-browser node tests/source-eol-browser.cjs
    run shortcuts-browser node tests/shortcuts-browser.cjs
    ;;
  tikz)
    run tikz-editor-browser node tests/tikz-editor-browser.cjs
    run tikz-studio-browser node tests/tikz-studio-browser.cjs
    ;;
  native)
    run native-stage node apps/desktop/scripts/stage.mjs
    run native-pkg-config pkg-config --modversion webkit2gtk-4.1 gtk+-3.0 javascriptcoregtk-4.1
    run native-rust cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
    run native-build cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
    ;;
  bib)
    run biber-version biber --version
    run bib-compile node tests/bib/compile/run-editor-compile.mjs --json "--out=$out/$group/bib-report.json"
    ;;
  *) printf 'Unknown group: %s\n' "$group" >&2; exit 2 ;;
esac
if grep -q $'\tFAIL\t' "$index"; then exit 1; fi
if grep -q $'\tBLOCKED\t' "$index"; then exit 2; fi
