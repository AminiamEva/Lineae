# Corpus fetchers

Acquisition scripts for the external LaTeX benchmark corpus used to test Lineae against real-world documents. They are a synchronized copy of `scripts/` from the corpus repository (`lineae-test-corpus`), where the manifest of record, license review and compile reports live.

Third-party payload is never committed here. Everything these scripts download goes to `tests/corpus/data/`, which is gitignored.

## What is here

```
scripts/fetch_arxiv.py         arXiv metadata, source packages, reference PDFs
scripts/fetch_ctan.py          CTAN package archives and documentation classification
scripts/fetch_github.py        GitHub tarballs, commit pinning, LaTeX-examples import
scripts/fetch_gitlab.py        GitLab tarballs (Hefferon's textbooks)
scripts/fetch_stackexchange.py complete MWEs from TeX Stack Exchange question bodies
scripts/discover.py            candidate volume, metadata only
scripts/lib/corpus.py          HTTP throttling/retries, hashing, safe extraction, manifest IO
scripts/lib/texscan.py         feature scanning, main-file and engine detection
manifest/licenses.json         license registry required by the fetchers
```

## Usage

Requires Python 3.11+ and nothing else.

```bash
cd tests/corpus
python scripts/discover.py
python scripts/fetch_stackexchange.py --limit 20 --per-tag 2 --dry-run
python scripts/fetch_ctan.py --packages amsmath,pgfplots
```

`data/` is created next to `manifest/`. Point it elsewhere with `LINEAE_CORPUS_DATA`; the request throttle is `LINEAE_CORPUS_INTERVAL` (seconds).

The scripts are sequential and rate-limited by design. Do not lower the throttle to finish faster; arXiv and Stack Exchange both return 429 and the clients back off by at least 20 s.

## Licensing

Availability is not permission. The registry marks each license `redistributable` or not, and the fetchers record provenance. Nothing here may be published or committed: arXiv's default license, TUGboat articles, NonCommercial CC variants and repository-scope-only licenses all prohibit or restrict redistribution.

Before adding a source, verify the license from the file that carries the grant, add it to `manifest/licenses.json`, and record the review in the corpus repository.

## Relationship to the corpus repository

These scripts are copies, not the source of truth. Changes should be made in the corpus repository first and synchronized back, so the manifest and reports stay consistent with the tooling that produced them.
