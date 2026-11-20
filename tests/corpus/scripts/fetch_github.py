#!/usr/bin/env python3
"""Fetch GitHub-hosted LaTeX projects without relying on the git protocol.

Uses codeload tarballs and records the exact commit SHA. License status is
never inferred from repository metadata alone: it must be supplied from a
reviewed source record (--license).

Usage:
  python scripts/fetch_github.py --mode repo --repo OpenLogicProject/OpenLogic \
      --id openlogic --dataset books --license CC-BY-4.0 --license-status redistributable
  python scripts/fetch_github.py --mode examples --repo MartinThoma/LaTeX-examples \
      --limit 20
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import corpus, texscan  # noqa: E402

GITHUB = "https://api.github.com"


def api(repo: str, path: str = "") -> dict:
    return corpus.get_json(f"{GITHUB}/repos/{repo}{path}", retries=4)


def repo_meta(repo: str) -> dict:
    meta = api(repo)
    branch = meta["default_branch"]
    ref = api(repo, f"/git/ref/heads/{branch}")
    return {
        "default_branch": branch,
        "revision": ref["object"]["sha"],
        "size_kb": meta["size"],
        "archived": meta["archived"],
        "pushed_at": meta["pushed_at"],
        "license_spdx": (meta.get("license") or {}).get("spdx_id"),
        "description": meta.get("description") or "",
    }


def download_tarball(repo: str, revision: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = corpus.request(
        f"https://codeload.github.com/{repo}/tar.gz/{revision}", timeout=600
    )
    dest.write_bytes(payload)
    return dest


def extract_tarball(archive: Path, dest: Path) -> Path:
    with tarfile.open(archive) as tf:
        members = tf.getmembers()
        for member in members:
            target = (dest / member.name).resolve()
            if not str(target).startswith(str(dest.resolve())):
                raise ValueError(f"path traversal: {member.name}")
            if member.issym() or member.islnk():
                continue
        tf.extractall(dest, members=[m for m in members if m.isfile() or m.isdir()])
    roots = [p for p in dest.iterdir() if p.is_dir()]
    if len(roots) != 1:
        raise ValueError(f"unexpected archive layout in {archive}")
    return roots[0]


def common_record(record: dict, root: Path, meta: dict) -> dict:
    info = texscan.analyze_tree(root)
    main = texscan.detect_main(root)
    record.update({
        "upstream_revision": meta["revision"],
        "file_count": info["file_count"],
        "features": info["features"],
        "dependencies": info["packages"],
        "tex_file_count": len(info["tex_files"]),
        "bib_file_count": len(info["bib_files"]),
        "main_file": main.get("main_file"),
        "engine": main.get("engine") or "pdflatex",
        "detection_evidence": main.get("evidence", []),
        "sha256": corpus.sha256_tree(root),
        "build_status": "not_tested",
    })
    return record


def fetch_repo(args) -> dict:
    meta = repo_meta(args.repo)
    target = corpus.entry_dir(args.dataset, args.source, args.id)
    record = {
        "id": args.id,
        "dataset": args.dataset,
        "source": args.source,
        "source_url": f"https://github.com/{args.repo}",
        "source_id": args.repo,
        "title": args.title or args.id,
        "version": args.version or "",
        "downloaded_at": corpus.now_iso(),
        "license": args.license,
        "license_url": args.license_url or corpus.find_license(args.license)["url"],
        "license_status": args.license_status,
        "redistributable": args.license_status == "redistributable",
        "upstream_revision": meta["revision"],
        "third_party": args.third_party,
        "attribution": f"{args.repo}, https://github.com/{args.repo}",
        "notes": args.notes,
        "status": "discovered",
    }
    if meta["archived"]:
        record["notes"] = (record["notes"] + " upstream repository is archived").strip()

    if args.metadata_only:
        record["status"] = "metadata_only"
        corpus.upsert(record)
        return record
    if args.dry_run:
        print(json.dumps(record, indent=2))
        return record

    staging = corpus.ROOT / ".cache" / f"{args.id}-{meta['revision'][:12]}"
    staging.mkdir(parents=True, exist_ok=True)
    archive = staging / "repo.tar.gz"
    if not archive.exists():
        download_tarball(args.repo, meta["revision"], archive)
    extracted = staging / "tree"
    if not extracted.exists():
        extracted.mkdir()
        extract_tarball(archive, extracted)
    tree = next(p for p in extracted.iterdir() if p.is_dir())

    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(tree, target)
    record["source_path"] = target.relative_to(corpus.ROOT).as_posix()
    common_record(record, target, meta)
    if args.main_file:
        if args.main_file == "none":
            record["main_file"] = None
            record["detection_evidence"] = record.get("detection_evidence", []) + [
                "manual review: no single existing entry file; see build_command"
            ]
        else:
            record["main_file"] = args.main_file
            record["detection_evidence"] = [f"manual review override: {args.main_file}"]
    if args.build_command:
        record["build_command"] = args.build_command
    record["status"] = "downloaded"
    corpus.upsert(record)
    corpus.log("github", "repo_downloaded", id=args.id, repo=args.repo,
               revision=meta["revision"], files=record["file_count"])
    print(f"downloaded {args.id}: {record['file_count']} files at {meta['revision'][:12]}")
    return record


def discover_examples(root: Path) -> list[dict]:
    """A LaTeX example is a directory that directly contains at least one .tex."""
    examples = []
    for path in sorted(root.rglob("*.tex")):
        directory = path.parent
        rel = directory.relative_to(root).as_posix()
        if rel.startswith(".") or not directory.is_dir():
            continue
        if any(p.name == ".git" for p in directory.parents):
            continue
        info = texscan.analyze_tree(directory)
        if not info["tex_files"]:
            continue
        main = texscan.detect_main(directory)
        license_files = [
            p.name for p in directory.iterdir()
            if p.is_file() and p.name.lower().startswith(("license", "copying"))
        ]
        examples.append({
            "path": directory,
            "rel": rel,
            "info": info,
            "main": main,
            "license_files": license_files,
        })
    return examples


def select_examples(examples: list[dict], limit: int, quotas: dict[str, int]) -> list[dict]:
    """Stratify by top-level category and prefer real project directories.

    A directory with a Makefile is an example root; directories inside such a
    root are not separate examples. Nested duplicates (backup/, graphs/) are
    therefore skipped, matching the repository's own "one folder per example"
    contract.
    """
    makefile_dirs = {
        item["path"] for item in examples if (item["path"] / "Makefile").is_file()
    }

    def project_root(item: dict) -> bool:
        path = item["path"]
        if path in makefile_dirs:
            return True
        return not any(parent in makefile_dirs for parent in path.parents)

    candidates = []
    seen: set[str] = set()
    for item in examples:
        rel = item["rel"]
        if rel in seen or "/backup" in rel or rel.startswith("documents/GeoTopo"):
            continue
        seen.add(rel)
        if not project_root(item):
            continue
        score = len(item["info"]["features"]) * 2
        score += min(len(item["info"]["tex_files"]), 10)
        score += 8 if (item["path"] / "Makefile").is_file() else 0
        score += 4 if item["main"].get("main_file") else 0
        item["score"] = score
        item["category"] = rel.split("/", 1)[0]
        candidates.append(item)

    candidates.sort(key=lambda item: (-item["score"], item["rel"]))
    chosen: list[dict] = []

    def add(item: dict) -> None:
        if any(
            item["path"] == other["path"]
            or item["path"] in other["path"].parents
            or other["path"] in item["path"].parents
            for other in chosen
        ):
            return
        chosen.append(item)

    for category, quota in quotas.items():
        for item in candidates:
            if sum(1 for c in chosen if c["category"] == category) >= quota:
                break
            if item["category"] == category:
                add(item)
    for item in candidates:
        if len(chosen) >= limit:
            break
        add(item)
    return chosen[:limit]


def fetch_examples(args) -> int:
    meta = repo_meta(args.repo)
    tree_root = corpus.ROOT / ".cache" / args.id / f"tree-{meta['revision'][:12]}"
    if not tree_root.exists():
        tree_root.mkdir(parents=True)
        fd, name = tempfile.mkstemp(suffix=".tar.gz", dir=tree_root.parent)
        os.close(fd)
        archive = Path(name)
        download_tarball(args.repo, meta["revision"], archive)
        extract_tarball(archive, tree_root)
        try:
            archive.unlink()
        except OSError:
            pass
    root = next(p for p in tree_root.iterdir() if p.is_dir())

    examples = discover_examples(root)
    quotas = {}
    for part in args.categories.split(","):
        if ":" in part:
            name, count = part.split(":", 1)
            quotas[name.strip()] = int(count)
    default_quotas = {
        "math": 4, "tikz": 4, "pstricks": 2, "circuits": 2,
        "publications": 3, "documents": 3, "presentations": 2, "asymptote": 1,
    }
    quotas = quotas or default_quotas
    selected = select_examples(examples, args.limit, quotas)
    print(f"{len(examples)} example directories found, importing {len(selected)}")
    for index, item in enumerate(selected, 1):
        rel_slug = item["rel"].replace("/", "--")
        entry_id = f"latex-examples-{corpus.slug(rel_slug)}"
        target = corpus.entry_dir("paper", "latex-examples", entry_id)
        license_files = item["license_files"]
        # Conservative default: the repository root MIT license is not treated
        # as covering arbitrary subdirectories without a local notice.
        license_status = args.license_status
        record = {
            "id": entry_id,
            "dataset": "paper",
            "source": "latex-examples",
            "source_url": f"https://github.com/{args.repo}/tree/{meta['revision']}/{item['rel']}",
            "source_id": f"{args.repo}/{item['rel']}",
            "source_path_rel": item["rel"],
            "title": item["rel"],
            "downloaded_at": corpus.now_iso(),
            "upstream_revision": meta["revision"],
            "license": args.license,
            "license_url": args.license_url or corpus.find_license(args.license)["url"],
            "license_status": license_status,
            "redistributable": license_status == "redistributable",
            "license_scope": "repository root only" if not license_files else "directory notice present",
            "license_files": license_files,
            "attribution": f"Martin Thoma, LaTeX-examples: {item['rel']}",
            "features": item["info"]["features"],
            "dependencies": item["info"]["packages"],
            "file_count": item["info"]["file_count"],
            "tex_file_count": len(item["info"]["tex_files"]),
            "main_file": item["main"].get("main_file"),
            "engine": item["main"].get("engine") or "pdflatex",
            "detection_evidence": item["main"].get("evidence", []),
            "build_status": "not_tested",
            "status": "downloaded",
            "notes": args.notes,
        }
        if not args.metadata_only:
            if target.exists():
                shutil.rmtree(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(item["path"], target)
            record["sha256"] = corpus.sha256_tree(target)
            record["source_path"] = target.relative_to(corpus.ROOT).as_posix()
        else:
            record["status"] = "metadata_only"
        corpus.upsert(record)
        print(f"  [{index}/{len(selected)}] {item['rel']} ({item['score']})")
    corpus.log("latex-examples", "imported", count=len(selected),
               revision=meta["revision"], mode="metadata" if args.metadata_only else "full")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["repo", "examples"], default="repo")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--id", default="")
    parser.add_argument("--dataset", default="books")
    parser.add_argument("--source", default="github")
    parser.add_argument("--title", default="")
    parser.add_argument("--version", default="")
    parser.add_argument("--license", required=True)
    parser.add_argument("--license-url", default="")
    parser.add_argument("--license-status", default="local_only_review",
                        choices=["redistributable", "local_only_review", "metadata_only", "excluded"])
    parser.add_argument("--third-party", default="")
    parser.add_argument("--notes", default="")
    parser.add_argument("--main-file", default="", help="reviewed entry file, or 'none'")
    parser.add_argument("--build-command", default="")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--categories", default="", help="e.g. math:4,tikz:4,documents:3")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.mode == "repo":
        if not args.id:
            parser.error("--id is required in repo mode")
        fetch_repo(args)
        return 0
    args.id = args.id or "latex-examples"
    return fetch_examples(args)


if __name__ == "__main__":
    raise SystemExit(main())
