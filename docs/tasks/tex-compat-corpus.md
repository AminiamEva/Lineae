# TeX compatibility corpus task record

## Scope / 范围

Original corpus scope: new tests/fixtures/tex-compat/**, tests/tex-compat-fixtures.test.mjs and this record. The follow-up server compilation was explicitly requested separately and is recorded below. No application source, package files, or workflows were changed.

## Execution / 执行

A: 15 text/headings/lists fixtures and initial manifest completed; parent notified.
B: 25 remaining fixtures and full manifest completed; parent notified.
C: source/expectation review and independent integrity checks completed.
Follow-up: user authorized installing XeLaTeX on `aliyun1` and compiling all 44 `.tex` samples; server outputs and limitations are recorded under Actual validation.

## Checklist / 清单

- [x] text-paragraphs
- [x] text-escaped
- [x] text-emphasis
- [x] text-comments
- [x] text-unicode
- [x] headings-levels
- [x] headings-starred
- [x] headings-short-title
- [x] headings-label-ref
- [x] headings-toc
- [x] lists-itemize
- [x] lists-enumerate
- [x] lists-nested
- [x] lists-description
- [x] lists-paragraphs
- [x] tables-basic
- [x] tables-alignment
- [x] tables-multicolumn
- [x] tables-booktabs
- [x] tables-paragraph-cell
- [x] math-inline-display
- [x] math-displaystyle
- [x] math-scripts
- [x] math-relations
- [x] math-operators
- [x] matrices-single
- [x] matrices-rectangular
- [x] matrices-empty-cells
- [x] matrices-delimiters
- [x] matrices-nested
- [x] environments-align
- [x] environments-align-star
- [x] environments-cases
- [x] environments-theorem
- [x] environments-proof
- [x] macros-newcommand
- [x] macros-optional
- [x] macros-renewcommand
- [x] macros-local-scope
- [x] macros-preservation

## Actual validation / 实际验证

`node --test tests/tex-compat-fixtures.test.mjs`: 3 tests passed, 0 failed. Initial validation caught missing second preservation fragment in the single-cell matrix; corrected and rerun successfully.
`git diff --check`: no tracked whitespace findings; these newly created files are untracked, so that command does not validate their whitespace. The empty-cell matrix deliberately contains spaces after its final ampersand; do not trim that preservation fixture silently.
On `aliyun1` (Ubuntu 24.04.2), installed XeLaTeX and Chinese/LaTeX support packages. Compiled all 44 project `.tex` samples in `~/aminiam/lineae/testcases`, preserving source subdirectories; verified 44 `.tex`, 44 same-name `.pdf`, no missing PDF, and zero other files in that destination. Temporary build output and the three temporary `.bib` support files were removed. XeLaTeX is retained on the server. The four bibliography-oriented samples were recompiled with two BibTeX and two Biber passes, each followed by two XeLaTeX passes. No visual PDF comparison was performed.

## Handoff and open issues / 交接与未解决事项

40 fixtures, 8 categories × 5 each, plus four bibliography compilation samples elsewhere under `tests/bib/`. Manifest is the normative manual expectation, independent of current editor behavior. Core owner must separately wire CI compilation and visual acceptance; no support claims should derive from these tests.
Chinese fixtures were compiled on `aliyun1` with XeLaTeX and Chinese language support. Bibliography resolution was completed for the four bibliography samples using temporary support databases. PDF visual rendering has not been reviewed.
Existing command-catalog untracked files belong to the previously accepted task and were not changed. No current application behavior was tested or modified.

References actually consulted:
- https://ctan.org/pkg/amsmath
- https://ctan.org/pkg/amsthm
- https://ctan.org/pkg/booktabs
- https://ctan.org/pkg/ctex
- https://ctan.org/pkg/amsfonts
- https://tug.ctan.org/fonts/amsfonts/doc/amssymb.pdf
