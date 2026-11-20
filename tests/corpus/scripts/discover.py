#!/usr/bin/env python3
"""Discover candidate volume before downloading anything.

Writes reports/acquisition/discovery.json with per-source counts. No source
files are downloaded; only metadata endpoints are queried sequentially.

Usage: python scripts/discover.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import corpus  # noqa: E402

ARXIV_CATEGORIES = ["math.AG", "math.NT", "math.CO", "math.OC", "math.PR",
                    "stat.ML", "cs.LO", "cs.DS", "cs.LG", "cs.CV",
                    "quant-ph", "hep-th"]
SE_TAGS = ["tikz", "tables", "math-mode", "macros", "floats", "fonts", "spacing",
           "page-breaking", "cross-referencing", "lists", "pgfplots", "beamer",
           "bibliographies", "errors", "color", "boxes", "footnotes", "hyperref"]
CTAN_PACKAGES = ["amsmath", "pgf", "pgfplots", "longtable", "tabularx", "booktabs",
                 "biblatex", "hyperref", "cleveref", "geometry", "fontspec",
                 "siunitx", "glossaries", "beamer", "algorithm2e", "listings"]


def arxiv_counts() -> dict:
    counts = {}
    for category in ARXIV_CATEGORIES:
        url = ("https://export.arxiv.org/api/query?search_query="
               f"cat:{category}&max_results=1")
        xml = corpus.request(url, timeout=60).decode("utf-8", "replace")
        match = re.search(r"<opensearch:totalResults[^>]*>(\d+)<", xml)
        counts[category] = int(match.group(1)) if match else None
    return counts


def se_counts() -> dict:
    counts = {}
    for tag in SE_TAGS:
        url = (f"https://api.stackexchange.com/2.3/tags/{tag}/info?site=tex")
        payload = corpus.get_json(url, retries=3)
        item = (payload.get("items") or [{}])[0]
        counts[tag] = item.get("count")
    return counts


def ctan_records() -> dict:
    records = {}
    for pkg in CTAN_PACKAGES:
        meta = corpus.get_json(f"https://ctan.org/json/2.0/pkg/{pkg}", retries=3)
        path = (meta.get("ctan") or {}).get("path", "")
        records[pkg] = {
            "version": (meta.get("version") or {}).get("number", ""),
            "license": meta.get("license", ""),
            "path": path,
        }
    return records


def main() -> int:
    corpus.MIN_INTERVAL = 3.5
    results = {}
    for name, func in (("arxiv", arxiv_counts), ("stackexchange", se_counts),
                       ("ctan", ctan_records)):
        try:
            results[name] = func()
        except Exception as exc:  # noqa: BLE001
            results[name] = {"error": str(exc)}
            print(f"{name} discovery failed: {exc}")
    out = {
        "generated_at": corpus.now_iso(),
        **results,
        "notes": [
            "Counts are candidate volume, not vetted samples.",
            "arXiv totals include papers without TeX sources.",
            "Stack Exchange counts include questions without complete MWEs.",
        ],
    }
    path = corpus.ROOT / "reports" / "acquisition" / "discovery.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"arxiv_categories": len(out["arxiv"]),
                      "se_tags": len(out["stackexchange"]),
                      "ctan_packages": len(out["ctan"])}, indent=2))
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
