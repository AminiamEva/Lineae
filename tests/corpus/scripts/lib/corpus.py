"""Shared helpers for the Lineae test corpus acquisition pipeline.

Standard library only: the pipeline must run on a clean machine with no
third-party Python packages.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("LINEAE_CORPUS_DATA", ROOT / "data"))
MANIFEST = ROOT / "manifest" / "manifest.jsonl"
LICENSES = ROOT / "manifest" / "licenses.json"
SOURCES = ROOT / "manifest" / "sources.json"
LOG_DIR = ROOT / "reports" / "acquisition" / "logs"

USER_AGENT = os.environ.get(
    "LINEAE_CORPUS_UA",
    "LineaeCorpus/0.1 (LaTeX WYSIWYG test corpus; contact: lineae maintainers)",
)
MIN_INTERVAL = float(os.environ.get("LINEAE_CORPUS_INTERVAL", "1.0"))
_last_request = 0.0


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(source: str, event: str, **fields) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    record = {"ts": now_iso(), "source": source, "event": event, **fields}
    with (LOG_DIR / f"{source}.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def _throttle() -> None:
    global _last_request
    delta = time.monotonic() - _last_request
    if delta < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - delta)
    _last_request = time.monotonic()


def request(url: str, *, retries: int = 3, timeout: int = 60, data: bytes | None = None,
            headers: dict | None = None, max_bytes: int | None = None) -> bytes:
    """Fetch a URL with retries. Honours Retry-After and never bypasses limits."""
    if not url.startswith(("http://", "https://")):
        raise ValueError(f"refusing non-http URL: {url}")
    last: Exception | None = None
    for attempt in range(retries):
        _throttle()
        req = urllib.request.Request(url, data=data, headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            **(headers or {}),
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read() if max_bytes is None else resp.read(max_bytes)
                return body
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code in (400, 401, 403, 404, 410):
                raise
            retry_after = exc.headers.get("Retry-After")
            if exc.code == 429:
                # arXiv and Stack Exchange both throttle: back off well past the
                # advertised limit instead of hammering the endpoint.
                wait = max(20.0 * (attempt + 1),
                           float(retry_after) if retry_after and retry_after.isdigit() else 0.0)
            else:
                wait = float(retry_after) if retry_after and retry_after.isdigit() else 5 * (attempt + 1)
            log("http", "retry", url=url, status=exc.code, wait=wait)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"fetch failed after {retries} attempts: {url}: {last}")


def get_json(url: str, **kwargs):
    return json.loads(request(url, **kwargs).decode("utf-8"))


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_tree(root: Path) -> str:
    """Deterministic digest over relative paths and file bytes."""
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(sha256_file(path)))
    return digest.hexdigest()


def safe_extract(archive: Path, dest: Path) -> list[str]:
    """Extract zip/tar without absolute paths, traversal, or symlinks."""
    dest = dest.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zf:
            for member in zf.infolist():
                target = (dest / member.filename).resolve()
                if not str(target).startswith(str(dest)):
                    raise ValueError(f"path traversal in {archive}: {member.filename}")
                if member.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member) as src, target.open("wb") as out:
                    out.write(src.read())
                written.append(member.filename)
        return written
    if tarfile.is_tarfile(archive):
        with tarfile.open(archive) as tf:
            for member in tf.getmembers():
                target = (dest / member.name).resolve()
                if not str(target).startswith(str(dest)):
                    raise ValueError(f"path traversal in {archive}: {member.name}")
                if member.issym() or member.islnk():
                    # Links are not extracted: they can escape the staging tree.
                    log("corpus", "skipped_link", archive=str(archive), member=member.name)
                    continue
                if not member.isfile():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                src = tf.extractfile(member)
                if src is None:
                    continue
                with src, target.open("wb") as out:
                    out.write(src.read())
                written.append(member.name)
        return written
    raise ValueError(f"unsupported archive: {archive}")


def load_manifest() -> list[dict]:
    if not MANIFEST.exists():
        return []
    records = []
    with MANIFEST.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def upsert(record: dict) -> None:
    """Insert or replace one manifest record by id, keeping the file sorted."""
    records = {r["id"]: r for r in load_manifest()}
    records[record["id"]] = record
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = MANIFEST.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8", newline="\n") as fh:
        for key in sorted(records):
            fh.write(json.dumps(records[key], ensure_ascii=False, sort_keys=True) + "\n")
    tmp.replace(MANIFEST)


def load_registry(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def find_license(license_id: str) -> dict:
    registry = load_registry(LICENSES)
    entry = registry.get(license_id)
    if entry is None:
        raise KeyError(f"license not registered: {license_id}")
    return entry


def slug(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9._-]+", "-", value)
    return value.strip("-")


def entry_dir(dataset: str, source: str, entry_id: str) -> Path:
    return DATA / dataset / source / entry_id
