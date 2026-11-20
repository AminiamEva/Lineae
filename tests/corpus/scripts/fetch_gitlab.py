#!/usr/bin/env python3
"""Fetch GitLab-hosted LaTeX projects (used for Hefferon's textbooks).

Pins the commit SHA, keeps the complete tree, and requires a reviewed license
decision rather than inferring one from the repository.

Usage:
  python scripts/fetch_gitlab.py --project jim.hefferon/linear-algebra \
      --id hefferon-linear-algebra --license CC-BY-SA-3.0 \
      --license-status redistributable
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import corpus, texscan  # noqa: E402

API = "https://gitlab.com/api/v4/projects"


def project_meta(project: str) -> dict:
    encoded = project.replace("/", "%2F")
    meta = corpus.get_json(f"{API}/{encoded}", retries=4)
    branch = meta["default_branch"]
    commit = corpus.get_json(
        f"{API}/{encoded}/repository/commits/{branch}", retries=4
    )
    return {
        "default_branch": branch,
        "revision": commit["id"],
        "last_activity_at": meta.get("last_activity_at"),
        "description": meta.get("description") or "",
    }


def fetch(args) -> dict:
    meta = project_meta(args.project)
    entry_id = args.id
    target = corpus.entry_dir(args.dataset, "gitlab", entry_id)
    record = {
        "id": entry_id,
        "dataset": args.dataset,
        "source": "gitlab",
        "source_id": args.project,
        "source_url": f"https://gitlab.com/{args.project}",
        "title": args.title or entry_id,
        "downloaded_at": corpus.now_iso(),
        "upstream_revision": meta["revision"],
        "license": args.license,
        "license_url": corpus.find_license(args.license)["url"],
        "license_status": args.license_status,
        "redistributable": args.license_status == "redistributable",
        "third_party": args.third_party,
        "attribution": f"{args.project}, https://gitlab.com/{args.project}",
        "notes": args.notes,
        "status": "discovered",
    }
    if args.metadata_only:
        record["status"] = "metadata_only"
        corpus.upsert(record)
        return record

    archive = corpus.ROOT / ".cache" / f"{entry_id}-{meta['revision'][:12]}.tar.gz"
    if not archive.exists():
        archive.parent.mkdir(parents=True, exist_ok=True)
        payload = corpus.request(
            f"https://gitlab.com/api/v4/projects/{args.project.replace('/', '%2F')}"
            f"/repository/archive.tar.gz?sha={meta['revision']}",
            timeout=600,
            headers={"User-Agent": "Mozilla/5.0 (compatible; LineaeCorpus/0.1)"},
        )
        archive.write_bytes(payload)
    staging = corpus.ROOT / ".cache" / f"{entry_id}-{meta['revision'][:12]}-tree"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    corpus.safe_extract(archive, staging)
    tree = next(p for p in staging.iterdir() if p.is_dir())

    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(tree, target)

    info = texscan.analyze_tree(target)
    main = texscan.detect_main(target)
    record.update({
        "source_path": target.relative_to(corpus.ROOT).as_posix(),
        "file_count": info["file_count"],
        "tex_file_count": len(info["tex_files"]),
        "features": info["features"],
        "dependencies": info["packages"],
        "main_file": args.main_file or main.get("main_file"),
        "engine": main.get("engine") or "pdflatex",
        "detection_evidence": main.get("evidence", []),
        "sha256": corpus.sha256_tree(target),
        "build_status": "not_tested",
        "status": "downloaded",
    })
    if args.main_file:
        record["detection_evidence"] = [f"manual review override: {args.main_file}"]
    corpus.upsert(record)
    corpus.log("gitlab", "downloaded", id=entry_id, revision=meta["revision"],
               files=record["file_count"])
    print(f"downloaded {entry_id}: {record['file_count']} files at {meta['revision'][:12]}")
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--dataset", default="books")
    parser.add_argument("--title", default="")
    parser.add_argument("--license", required=True)
    parser.add_argument("--license-status", default="local_only_review",
                        choices=["redistributable", "local_only_review", "metadata_only", "excluded"])
    parser.add_argument("--main-file", default="")
    parser.add_argument("--third-party", default="")
    parser.add_argument("--notes", default="")
    parser.add_argument("--metadata-only", action="store_true")
    args = parser.parse_args()
    fetch(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
