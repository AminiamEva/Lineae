# Reproducing the independent TeX references

Use a new output directory and record the exact Git SHA. Install Node dependencies, Playwright Chromium, matching MathLive/TikZ assets, latexmk, XeLaTeX, LuaLaTeX, BibTeX, Biber, Poppler, PyMuPDF and fontTools. Source fonts and packages for a passing reference must be identifiable from the TeX log and recorder output. On Windows, check that latexmk has a working Perl interpreter and that Fontconfig can resolve the actual Latin Modern and Fandol files.

```sh
npm run build
python -B tests/tex-reference/generate.py /absolute/new-reference --jobs 2
node tests/lua-pdf-browser.cjs lualatex /absolute/new-reference/lualatex-reference.json /absolute/lua-en.json
node tests/lua-pdf-browser.cjs lualatex /absolute/new-reference/luatexja-reference.json /absolute/lua-zh.json
node tests/lua-pdf-browser.cjs xelatex /absolute/new-reference/current-xelatex.json /absolute/xe.json
node tests/bib/verify-xelatex.mjs
node tests/bib/verify-xelatex.mjs --engine=lualatex
```

The generator stores main.tex, PDF, command logs, node probes and coordinates by case and engine. Leave the generated directory tree together when running Chromium. The historical TeX Live 2023 Xe evidence and the independent Phase C Debian references are separate datasets. Generate new outputs elsewhere. On provisioned Linux, tests/tex-reference/verify.sh also checks old hashes, smoke tests and frozen comparisons.

The page origin for Poppler boxes is top left. Multiply PDF bp by 96/72 for CSS px, or TeX pt by 96/72.27. Compare the span between corresponding text boundaries. For vertical position, compare PDF text origins against browser baselines relative to each paragraph's first line. An absolute page origin, a glyph ink edge, a rule edge and a baseline require separate measurements. See [acceptance matrix](ACCURACY_MATRIX.md).
