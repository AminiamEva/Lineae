# Remote bibliography acceptance fixtures

These fixtures are independent of the original examples and are compiled in an
isolated output directory. The original `tests/bib/xelatex/` fixtures and any
reference PDFs are never overwritten.

| Fixture | Backend | Coverage | Expected result |
| --- | --- | --- | --- |
| `bibtex-crlf-中文` | BibTeX | Unicode, Chinese path, Windows CRLF copy | pass |
| `biblatex-中文` | Biber | Unicode, Chinese path, `\textcite`, `\printbibliography` | pass |
| `duplicate-key` | BibTeX | duplicate key diagnostic | fail with duplicate-key diagnostic |
| `missing-resource` | BibTeX | missing `.bib` resource | fail with missing-resource diagnostic |

Run the existing round-trip harness from an authorized TeX host:

```text
node tests/bib/verify-xelatex.mjs --out=/tmp/lineae-bib-acceptance
```

The acceptance report records the exact tool versions, commands, output
directory, and whether the browser/engine source view differs from the TeX
result. XeLaTeX is authoritative for PDF layout; the browser preview is only a
source/semantic preview and does not replace compilation.
