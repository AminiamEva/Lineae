#!/usr/bin/env python3
"""Fetch arXiv papers and their TeX sources.

Usage:
  python scripts/fetch_arxiv.py --category math.AG --per-category 2 --limit 10
  python scripts/fetch_arxiv.py --ids 2501.00001,2501.00002 --dry-run
  python scripts/fetch_arxiv.py --category cs.LG --per-category 2 --metadata-only
"""

from __future__ import annotations

import argparse
import gzip
import html
import io
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import corpus, texscan  # noqa: E402

ARXIV = "https://arxiv.org"
MIN_INTERVAL = 3.0  # arXiv API guidance: one request every few seconds.

LICENSE_MAP = {
    "nonexclusive-distrib/1.0": ("ARXIV-NONEXCLUSIVE-1.0", "local_only_review"),
    "nonexclusive-distrib/1.0/": ("ARXIV-NONEXCLUSIVE-1.0", "local_only_review"),
    "by/4.0": ("ARXIV-CC-BY-4.0", "redistributable"),
    "by/4.0/": ("ARXIV-CC-BY-4.0", "redistributable"),
    "by-sa/4.0": ("ARXIV-CC-BY-SA-4.0", "redistributable"),
    "by-sa/4.0/": ("ARXIV-CC-BY-SA-4.0", "redistributable"),
    "publicdomain/zero/1.0": ("ARXIV-CC0-1.0", "redistributable"),
    "publicdomain/zero/1.0/": ("ARXIV-CC0-1.0", "redistributable"),
}

FEATURE_WEIGHT = {
    "amsmath": 2, "theorem": 2, "algorithm": 2, "tikz": 2, "pgfplots": 2,
    "longtable": 2, "tabularx": 1, "booktabs": 1, "subfigure": 1,
    "bibliography": 2, "biblatex": 2, "multicol": 1, "twocolumn": 2,
    "custom-macro": 2, "matrix": 1, "cases": 1, "beamer": 2,
}


def api_query(category: str, count: int, start: int = 0) -> list[dict]:
    url = (
        "https://export.arxiv.org/api/query?search_query="
        f"cat:{category}&start={start}&max_results={count}"
        "&sortBy=submittedDate&sortOrder=descending"
    )
    xml = corpus.request(url, timeout=90).decode("utf-8", "replace")
    entries = []
    for block in re.findall(r"<entry>(.*?)</entry>", xml, re.S):
        arxiv_id = re.search(r"<id>https?://arxiv.org/abs/([^<]+)</id>", block)
        if not arxiv_id:
            continue
        entries.append({
            "id": arxiv_id.group(1).strip(),
            "title": html.unescape(re.sub(r"\s+", " ", re.search(r"<title>(.*?)</title>", block, re.S).group(1)).strip()),
            "authors": [html.unescape(a.strip()) for a in re.findall(r"<name>(.*?)</name>", block, re.S)],
            "published": re.search(r"<published>(.*?)</published>", block).group(1),
            "categories": re.findall(r'<category term="([^"]+)"', block),
            "comment": html.unescape((re.search(r"<arxiv:comment>(.*?)</arxiv:comment>", block, re.S) or [None, ""])[1]),
        })
    return entries


def abs_metadata(arxiv_id: str) -> dict:
    page = corpus.request(f"{ARXIV}/abs/{arxiv_id}", timeout=60).decode("utf-8", "replace")
    license_match = re.search(r'class="abs-license"[^>]*>\s*<a href="([^"]+)"', page)
    license_url = license_match.group(1) if license_match else ""
    version_match = re.search(r'<meta name="citation_version" content="([^"]+)"', page)
    if not version_match:
        version_match = re.search(r"\[v(\d+)\]", page)
    submission = re.search(r'<meta name="citation_date" content="([^"]+)"', page)
    title = re.search(r'<meta name="citation_title" content="([^"]+)"', page)
    authors = re.findall(r'<meta name="citation_author" content="([^"]+)"', page)
    return {
        "license_url": license_url,
        "version": version_match.group(1) if version_match else "",
        "submitted": submission.group(1) if submission else "",
        "title": html.unescape(title.group(1)) if title else "",
        "authors": [html.unescape(a) for a in authors],
    }


def classify_license(url: str) -> tuple[str, str]:
    tail = url.rstrip("/").rsplit("/", 2)
    key = "/".join(tail[-2:])
    entry = LICENSE_MAP.get(key) or LICENSE_MAP.get(key + "/")
    if entry:
        return entry
    return "NOASSERTION", "local_only_review"


def download_source(arxiv_id: str, dest: Path) -> tuple[Path, str]:
    archive = dest / "source.download"
    dest.mkdir(parents=True, exist_ok=True)
    payload = corpus.request(f"{ARXIV}/e-print/{arxiv_id}", timeout=180)
    archive.write_bytes(payload)
    digest = corpus.sha256_bytes(payload)
    return archive, digest


def extract_source(archive: Path, dest: Path) -> tuple[Path, str]:
    """Normalise gzipped single-file, tar.gz, and plain .tex payloads."""
    dest.mkdir(parents=True, exist_ok=True)
    head = archive.read_bytes()[:4]
    if head[:2] == b"\x1f\x8b":
        raw = gzip.decompress(archive.read_bytes())
        if raw[:3] == b"ustar" or b"ustar" in raw[:300]:
            tmp = dest / "_source.tar"
            tmp.write_bytes(raw)
            corpus.safe_extract(tmp, dest)
            tmp.unlink()
        else:
            (dest / "main.tex").write_bytes(raw)
            return dest / "main.tex", "gzip-tex"
    elif tarfile.is_tarfile(archive):
        corpus.safe_extract(archive, dest)
        return dest, "tar"
    else:
        text = archive.read_bytes()
        if text.lstrip().startswith(b"%") or b"\\documentclass" in text or b"\\begin{document}" in text:
            (dest / "main.tex").write_bytes(text)
            return dest / "main.tex", "tex"
        raise ValueError("unrecognised arXiv source payload")
    # Some tarballs wrap everything in one directory; flatten if unambiguous.
    children = [p for p in dest.iterdir() if p.name != "source.download"]
    if len(children) == 1 and children[0].is_dir():
        inner = children[0]
        for item in inner.iterdir():
            shutil.move(str(item), dest / item.name)
        inner.rmdir()
    return dest, "tar"


def page_count(pdf: Path) -> int | None:
    try:
        out = subprocess.run(
            ["pdfinfo", str(pdf)], capture_output=True, text=True, timeout=30, check=False
        ).stdout
        match = re.search(r"^Pages:\s+(\d+)", out, re.M)
        if match:
            return int(match.group(1))
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        payload = pdf.read_bytes()
    except OSError:
        return None
    matches = re.findall(rb"/Type\s*/Page[^s]", payload)
    return len(matches) if matches else None


def process(arxiv_id: str, category: str, args) -> dict | None:
    base_id = re.sub(r"v\d+$", "", arxiv_id)
    meta = abs_metadata(arxiv_id)
    license_key, license_status = classify_license(meta["license_url"])
    license_info = corpus.find_license(license_key)
    entry_id = f"arxiv-{base_id}"
    target = corpus.entry_dir("paper", "arxiv", entry_id)

    record = {
        "id": entry_id,
        "dataset": "paper",
        "source": "arxiv",
        "source_category": category,
        "source_id": base_id,
        "source_url": f"{ARXIV}/abs/{base_id}",
        "version": meta["version"],
        "submitted": meta.get("submitted", ""),
        "downloaded_at": corpus.now_iso(),
        "license": license_key,
        "license_url": license_info["url"],
        "license_status": license_status,
        "redistributable": bool(license_info["redistributable"] and license_status == "redistributable"),
        "authors": [],
        "title": "",
        "status": "discovered",
        "notes": "",
    }

    if args.metadata_only:
        record["status"] = "metadata_only"
        corpus.upsert(record)
        corpus.log("arxiv", "metadata", id=entry_id, license=license_key)
        return record

    archive, archive_hash = download_source(arxiv_id, target)
    record["archive_sha256"] = archive_hash
    source_dir = target / "source"
    try:
        extract_source(archive, source_dir)
    except Exception as exc:  # noqa: BLE001
        record.update(status="download_failed", notes=f"source extraction: {exc}")
        corpus.upsert(record)
        corpus.log("arxiv", "extract_failed", id=entry_id, error=str(exc))
        return record

    info = texscan.analyze_tree(source_dir)
    if not info["tex_files"]:
        record.update(status="rejected", notes="source package has no .tex files")
        corpus.upsert(record)
        corpus.log("arxiv", "rejected", id=entry_id, reason="no tex")
        if not args.keep_rejected:
            shutil.rmtree(target, ignore_errors=True)
        return record

    complexity = sum(FEATURE_WEIGHT.get(f, 0) for f in info["features"]) + min(info["file_count"], 30) // 5
    record["complexity_score"] = complexity
    if complexity < args.min_complexity and not args.keep:
        record.update(status="rejected", notes=f"complexity {complexity} below threshold {args.min_complexity}")
        corpus.upsert(record)
        corpus.log("arxiv", "rejected", id=entry_id, complexity=complexity)
        if not args.keep_rejected:
            shutil.rmtree(target, ignore_errors=True)
        return record

    main = texscan.detect_main(source_dir)
    authors = meta.get("authors") or []
    record.update({
        "title": meta.get("title") or "",
        "authors": authors,
        "attribution": ("; ".join(authors) + f". arXiv:{base_id}") if authors else f"arXiv:{base_id}",
        "main_file": main.get("main_file"),
        "engine": main.get("engine") or "pdflatex",
        "features": info["features"],
        "dependencies": info["packages"],
        "file_count": info["file_count"],
        "tex_file_count": len(info["tex_files"]),
        "detection_evidence": main.get("evidence", []),
        "status": "downloaded",
    })

    if args.reference_pdf and main.get("main_file"):
        pdf = target / "reference.pdf"
        try:
            pdf.write_bytes(corpus.request(f"{ARXIV}/pdf/{base_id}", timeout=180))
            record["page_count"] = page_count(pdf)
            record["pdf_sha256"] = corpus.sha256_file(pdf)
        except Exception as exc:  # noqa: BLE001
            record["notes"] = f"reference PDF unavailable: {exc}"

    record["sha256"] = corpus.sha256_tree(source_dir)
    record["source_path"] = source_dir.relative_to(corpus.ROOT).as_posix()
    record["build_status"] = "not_tested"
    corpus.upsert(record)
    corpus.log("arxiv", "downloaded", id=entry_id, complexity=complexity,
               files=info["file_count"], license=license_key)
    print(f"  downloaded {entry_id}: {info['file_count']} files, complexity {complexity}")
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", action="append", default=[])
    parser.add_argument("--per-category", type=int, default=3)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--ids", default="")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--keep-rejected", action="store_true")
    parser.add_argument("--keep", action="store_true", help="keep sources below the complexity threshold")
    parser.add_argument("--min-complexity", type=int, default=4)
    parser.add_argument("--reference-pdf", action="store_true", default=True)
    parser.add_argument("--no-reference-pdf", dest="reference_pdf", action="store_false")
    args = parser.parse_args()

    corpus.MIN_INTERVAL = MIN_INTERVAL
    accepted = 0
    seen: set[str] = set()
    targets: list[tuple[str, str]] = []
    if args.ids:
        targets = [(item.strip(), "manual") for item in args.ids.split(",") if item.strip()]
    else:
        categories = args.category or ["math.AG", "math.NT", "math.CO", "math.PR", "cs.LG", "quant-ph"]
        for category in categories:
            for entry in api_query(category, args.per_category * 3):
                targets.append((entry["id"], category))
    for arxiv_id, category in targets:
        if accepted >= args.limit:
            break
        base_id = re.sub(r"v\d+$", "", arxiv_id)
        if base_id in seen:
            continue
        seen.add(base_id)
        if args.dry_run:
            print(f"would fetch {base_id} ({category})")
            accepted += 1
            continue
        record = process(arxiv_id, category, args)
        if record and record.get("status") in {"downloaded", "metadata_only"}:
            accepted += 1
    print(f"accepted {accepted} arXiv records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
