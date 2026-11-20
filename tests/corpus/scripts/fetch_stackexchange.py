#!/usr/bin/env python3
"""Extract complete MWEs from TeX Stack Exchange question bodies.

Uses the official Stack Exchange API only (no HTML scraping). Each kept case
is a single code block copied verbatim from the question, with attribution and
the per-post content license reported by the API.

Usage:
  python scripts/fetch_stackexchange.py --limit 20
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import corpus, texscan  # noqa: E402

API = "https://api.stackexchange.com/2.3/questions"
SITE = "tex"
DEFAULT_TAGS = [
    "tikz", "tables", "math-mode", "macros", "floats", "fonts", "spacing",
    "page-breaking", "cross-referencing", "lists", "pgfplots", "beamer",
    "bibliographies", "errors", "color", "boxes", "footnotes", "hyperref",
]

LICENSE_MAP = {
    "CC BY-SA 4.0": "SE-CC-BY-SA-4.0",
    "CC BY-SA 3.0": "SE-CC-BY-SA-3.0",
    "CC BY-SA 2.5": "SE-CC-BY-SA-2.5",
}


def query(tag: str, page: int, pagesize: int = 50) -> dict:
    url = (
        f"{API}?site={SITE}&order=desc&sort=votes&tagged={tag}"
        f"&page={page}&pagesize={pagesize}&filter=withbody"
    )
    return corpus.get_json(url, retries=4)


INVISIBLE = dict.fromkeys(
    [*range(0x200B, 0x2010), *range(0x202A, 0x202F), *range(0x2060, 0x2065), 0xFEFF],
    None,
)


def clean_code(code: str) -> str:
    """Strip direction marks and zero-width characters copied from web pages.

    They are invisible in the browser but break TeX control sequences.
    """
    code = code.translate(INVISIBLE).replace("\u00a0", " ")
    return code.replace("\r\n", "\n")


def complete_mwe(body_html: str) -> str | None:
    blocks = re.findall(r"<pre[^>]*>\s*<code[^>]*>(.*?)</code>\s*</pre>", body_html, re.S | re.I)
    best = None
    for block in blocks:
        code = clean_code(html.unescape(re.sub(r"<[^>]+>", "", block)))
        if "\\documentclass" not in code or "\\begin{document}" not in code:
            continue
        if "\\end{document}" not in code:
            continue
        if best is None or len(code) > len(best):
            best = code
    return best


def entry_for(item: dict, tag: str) -> dict | None:
    mwe = complete_mwe(item.get("body", ""))
    if not mwe:
        return None
    license_name = item.get("content_license", "")
    license_key = LICENSE_MAP.get(license_name)
    if not license_key:
        return None
    info = corpus.find_license(license_key)
    qid = item["question_id"]
    owner = item.get("owner") or {}
    created = datetime.fromtimestamp(item["creation_date"], tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    features = scan_features(mwe)
    engine = "pdflatex"
    if re.search(r"\\usepackage(?:\[[^\]]*\])?\{fontspec\}|\\setmainfont|\\usepackage(?:\[[^\]]*\])?\{unicode-math\}|\\usepackage(?:\[[^\]]*\])?\{ctex\}", mwe):
        engine = "xelatex"
    if "\\directlua" in mwe:
        engine = "lualatex"
    entry_id = f"texse-{qid}"
    return {
        "id": entry_id,
        "dataset": "paper",
        "source": "tex-stackexchange",
        "source_id": str(qid),
        "source_url": item.get("link", ""),
        "title": html.unescape(item.get("title", "")),
        "authors": [owner.get("display_name", "")] if owner.get("display_name") else [],
        "version": "",
        "downloaded_at": corpus.now_iso(),
        "posted_at": created,
        "license": license_key,
        "license_url": info["url"],
        "license_status": "redistributable",
        "redistributable": True,
        "attribution": f"{owner.get('display_name','unknown')} on TeX Stack Exchange, {item.get('link','')}",
        "tags": item.get("tags", []),
        "source_tag": tag,
        "score": item.get("score"),
        "answer_count": item.get("answer_count"),
        "features": features,
        "main_file": "question.tex",
        "engine": engine,
        "file_count": 1,
        "status": "downloaded",
        "build_status": "not_tested",
        "notes": "MWE extracted verbatim from the question body; answers are not included.",
        "_mwe": mwe,
    }


def scan_features(mwe: str) -> list[str]:
    """Feature tags for a single MWE without writing it to disk."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "mwe.tex"
        path.write_text(mwe, encoding="utf-8")
        return texscan.analyze_tree(Path(tmp))["features"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--per-tag", type=int, default=2)
    parser.add_argument("--tags", default=",".join(DEFAULT_TAGS))
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    seen: set[int] = {
        int(r["source_id"]) for r in corpus.load_manifest()
        if r.get("source") == "tex-stackexchange" and r.get("status") == "downloaded"
        and str(r.get("source_id", "")).isdigit()
    }
    accepted = 0
    for tag in tags:
        if accepted >= args.limit:
            break
        try:
            response = query(tag, 1)
        except Exception as exc:  # noqa: BLE001
            corpus.log("stackexchange", "query_failed", tag=tag, error=str(exc))
            print(f"  query failed for {tag}: {exc}")
            continue
        corpus.log("stackexchange", "query", tag=tag, quota=response.get("quota_remaining"),
                   items=len(response.get("items", [])))
        accepted_for_tag = 0
        for item in response.get("items", []):
            if accepted >= args.limit or accepted_for_tag >= args.per_tag:
                break
            if item["question_id"] in seen:
                continue
            seen.add(item["question_id"])
            record = entry_for(item, tag)
            if not record:
                continue
            if args.dry_run:
                print(f"would import {record['id']} [{tag}] {record['title'][:60]}")
                accepted += 1
                continue
            target = corpus.entry_dir("paper", "tex-stackexchange", record["id"])
            mwe = record.pop("_mwe")
            if args.metadata_only:
                record["status"] = "metadata_only"
                corpus.upsert(record)
                accepted += 1
                continue
            target.mkdir(parents=True, exist_ok=True)
            (target / "question.tex").write_text(mwe, encoding="utf-8")
            (target / "question.api.json").write_text(
                json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            (target / "question.html").write_text(item.get("body", ""), encoding="utf-8")
            record["sha256"] = corpus.sha256_tree(target)
            record["source_path"] = target.relative_to(corpus.ROOT).as_posix()
            corpus.upsert(record)
            corpus.log("stackexchange", "imported", id=record["id"], tag=tag,
                       license=record["license"])
            print(f"  {record['id']} [{tag}] {record['title'][:70]}")
            accepted += 1
    print(f"imported {accepted} TeX Stack Exchange MWEs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
