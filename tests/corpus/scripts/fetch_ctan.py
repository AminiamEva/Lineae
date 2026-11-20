#!/usr/bin/env python3
"""Fetch CTAN packages, metadata and documentation examples.

CTAN packages carry their own licenses. This script records the license
reported by the CTAN JSON API, keeps the package tree, and never treats a
package download as a redistribution grant beyond that declared license.

Usage:
  python scripts/fetch_ctan.py --packages booktabs,siunitx,pgfplots,algorithm2e,amsmath
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import corpus, texscan  # noqa: E402

CTAN_API = "https://ctan.org/json/2.0/pkg"
MIRROR = "https://mirrors.ctan.org"

LICENSE_ALIASES = {
    "lppl1.3c": "LPPL-1.3c",
    "lppl1.3": "LPPL-1.3c",
    "lppl": "LPPL-1.3c",
    "gpl3+": "GPL-3.0",
    "gpl3": "GPL-3.0",
    "gpl2+": "GPL-2.0",
    "gpl2": "GPL-2.0",
}


def map_license(value: str) -> tuple[str, bool]:
    """Return (registry id, all_terms_known) for a CTAN license string."""
    terms = [t.strip().lower() for t in re.split(r"[,;]", value) if t.strip()]
    ids = []
    unknown = False
    for term in terms:
        term = term.rstrip(".")
        if term in LICENSE_ALIASES:
            ids.append(LICENSE_ALIASES[term])
        elif term in {"other-free", "other", "unknown"}:
            unknown = True
        else:
            unknown = True
    unique = sorted(set(ids))
    if unknown or not unique:
        return "NOASSERTION", False
    preferred = "LPPL-1.3c" if "LPPL-1.3c" in unique else unique[0]
    return preferred, True


def package_metadata(pkg: str) -> dict:
    meta = corpus.get_json(f"{CTAN_API}/{pkg}", retries=4)
    version = (meta.get("version") or {}).get("number", "")
    path = (meta.get("ctan") or {}).get("path", "")
    return {
        "name": meta.get("name", pkg),
        "version": version,
        "license": meta.get("license", ""),
        "ctan_path": path,
        "documentation": meta.get("documentation") or {},
        "install": meta.get("install") or "",
    }


def doc_candidates(root: Path) -> list[Path]:
    """Prefer documentation .tex over .dtx/.ins implementation sources."""
    tex_files = [p for p in root.rglob("*.tex") if p.is_file()]
    return sorted(
        tex_files,
        key=lambda p: (
            "/doc/" not in p.as_posix().lower(),
            p.name.lower() not in {"example.tex", "sample.tex"},
            len(p.parts),
        ),
    )


def fetch(args, pkg: str) -> dict:
    meta = package_metadata(pkg)
    entry_id = f"ctan-{pkg}"
    target = corpus.entry_dir("paper", "ctan", entry_id)
    license_key, known = map_license(meta["license"])
    info = corpus.find_license(license_key)
    status = "redistributable" if known and info["redistributable"] else "local_only_review"
    record = {
        "id": entry_id,
        "dataset": "paper",
        "source": "ctan",
        "source_id": pkg,
        "source_url": f"https://ctan.org/pkg/{pkg}",
        "title": meta["name"],
        "version": meta["version"],
        "downloaded_at": corpus.now_iso(),
        "license": license_key,
        "license_url": info["url"],
        "license_status": status,
        "redistributable": status == "redistributable",
        "ctan_license": meta["license"],
        "ctan_path": meta["ctan_path"],
        "attribution": f"{meta['name']} CTAN package, https://ctan.org/pkg/{pkg}",
        "status": "discovered",
        "notes": "",
    }
    if args.metadata_only or args.dry_run:
        record["status"] = "metadata_only" if args.metadata_only else "discovered"
        corpus.upsert(record)
        return record

    archive_url = f"{MIRROR}{meta['ctan_path']}.zip"
    payload = corpus.request(archive_url, timeout=300)
    archive = target / "package.zip"
    target.mkdir(parents=True, exist_ok=True)
    archive.write_bytes(payload)
    record["archive_sha256"] = corpus.sha256_bytes(payload)
    record["archive_url"] = archive_url

    extracted = target / "package"
    if extracted.exists():
        shutil.rmtree(extracted)
    corpus.safe_extract(archive, extracted)
    info_tree = texscan.analyze_tree(extracted)
    docs = doc_candidates(extracted)
    main = texscan.detect_main(extracted)

    dtx = [p for p in extracted.rglob("*.dtx")]
    ins = [p for p in extracted.rglob("*.ins")]
    record.update({
        "file_count": info_tree["file_count"],
        "tex_file_count": len(info_tree["tex_files"]),
        "doc_tex_files": [p.relative_to(extracted).as_posix() for p in docs],
        "implementation_files": {
            "dtx": len(dtx),
            "ins": len(ins),
        },
        "dependencies": info_tree["packages"],
        "features": info_tree["features"],
        "main_file": main.get("main_file"),
        "engine": main.get("engine") or "pdflatex",
        "detection_evidence": main.get("evidence", []),
        "build_status": "not_tested",
        "status": "downloaded",
    })
    if not main.get("main_file"):
        record["notes"] = "package ships documentation without a standalone .tex example"
    record["sha256"] = corpus.sha256_tree(extracted)
    record["source_path"] = extracted.relative_to(corpus.ROOT).as_posix()
    corpus.upsert(record)
    corpus.log("ctan", "downloaded", id=entry_id, version=meta["version"],
               license=meta["license"], docs=len(docs))
    print(f"downloaded {entry_id} {meta['version']} ({len(docs)} doc .tex files)")
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--packages", required=True,
                        help="comma-separated CTAN package names")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    for pkg in [p.strip() for p in args.packages.split(",") if p.strip()]:
        try:
            fetch(args, pkg)
        except Exception as exc:  # noqa: BLE001
            corpus.log("ctan", "failed", package=pkg, error=str(exc))
            print(f"FAILED {pkg}: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
