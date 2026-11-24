#!/usr/bin/env bash
set -euo pipefail

# CI-only toolchain, not a desktop runtime dependency or distribution bundle.
# Frozen 2025 tlnet-final, rather than today's changing CTAN repository.
[[ "${GITHUB_ACTIONS:-}" == true ]]
repo=${TL_REPO:?TL_REPO must name the frozen TeX Live repository}
root="$PWD/.native-tex"
texdir="$root/texlive"
arch=universal-darwin
windows=false
case "$(uname -s)" in
  Darwin) ;;
  MINGW*|MSYS*|CYGWIN*) windows=true; arch=windows ;;
  *) echo 'This checkpoint targets macOS arm64 and Windows x64 only' >&2; exit 1 ;;
esac
if $windows; then texdir=$(cygpath -m "$texdir"); fi
bin="$texdir/bin/$arch"
tlmgr="$bin/tlmgr"
if $windows; then tlmgr="$bin/tlmgr.bat"; fi
mkdir -p "$root/installer"
if [[ ! -f "$tlmgr" ]]; then
  cat > "$root/installer/profile" <<EOF
selected_scheme scheme-infraonly
instopt_adjustpath 0
instopt_adjustrepo 0
instopt_portable 1
tlpdbopt_autobackup 0
tlpdbopt_install_docfiles 0
tlpdbopt_install_srcfiles 0
tlpdbopt_create_formats 1
TEXDIR $texdir
TEXMFLOCAL $texdir/texmf-local
TEXMFSYSVAR $texdir/texmf-var
TEXMFSYSCONFIG $texdir/texmf-config
TEXMFVAR $texdir/texmf-var
TEXMFCONFIG $texdir/texmf-config
TEXMFHOME $texdir/texmf-home
EOF
  if $windows; then
    curl -fsSL --retry 3 "$repo/install-tl.zip" -o "$root/installer/install.zip"
    unzip -q "$root/installer/install.zip" -d "$root/installer"
    installers=("$root"/installer/install-tl-*/install-tl-windows.bat)
    test "${#installers[@]}" = 1
    cmd //c "$(cygpath -w "${installers[0]}")" -no-gui -repository "$repo" \
      -profile "$(cygpath -w "$root/installer/profile")"
  else
    curl -fsSL --retry 3 "$repo/install-tl-unx.tar.gz" -o "$root/installer/install.tar.gz"
    tar -xzf "$root/installer/install.tar.gz" -C "$root/installer"
    installers=("$root"/installer/install-tl-*/install-tl)
    test "${#installers[@]}" = 1
    perl "${installers[0]}" -no-gui -repository "$repo" -profile "$root/installer/profile"
  fi
fi
if $windows; then export PATH="$(cygpath -u "$bin"):$PATH"; else export PATH="$bin:$PATH"; fi
export TEXMFVAR="$texdir/texmf-var"
export TEXMFCONFIG="$texdir/texmf-config"
export TEXMFHOME="$texdir/texmf-home"
"$tlmgr" option repository "$repo"
"$tlmgr" install collection-latex collection-latexrecommended collection-luatex amsmath amsfonts \
  fontspec unicode-math lm lm-math pgf ctex fandol biblatex biber latexmk luacode
mkdir -p artifacts/native-tex
"$tlmgr" info --only-installed --data name,localrev > artifacts/native-tex/packages.txt
fmtutil-sys --byfmt lualatex
luaotfload-tool --update
lualatex --version
