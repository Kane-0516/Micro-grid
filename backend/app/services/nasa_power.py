"""On-disk cache for NASA POWER JSON responses.

NASA POWER answers in 4-13 s per request and the twenty-year analysis needs
20 of them, so every fresh process (and every fresh E2B sandbox) paid ~140 s
before the first simulation. Every request this backend makes covers a
fixed, fully-past window (2001-2020 hourly, 2020 daily, 2001-2020
climatology), so responses are treated as immutable: they are persisted
under ``backend/data/nasa_power`` and replayed on later calls. The directory
is git-ignored; warm it for a site and ``git add -f`` the files to ship that
site's weather with the code, so a cold clone starts with zero NASA
requests. Bump ``_CACHE_VERSION`` to invalidate everything after a NASA
data-version change.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import threading
from pathlib import Path

import httpx

CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "nasa_power"
_CACHE_VERSION = 1


def _new_client(timeout: float) -> httpx.Client:
    return httpx.Client(timeout=timeout)


def _cache_path(url: str, params: dict) -> Path:
    key = json.dumps(
        {"v": _CACHE_VERSION, "url": url, "params": params},
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
    endpoint = url.rstrip("/").rsplit("/", 2)[-2]
    readable = []
    for name in ("latitude", "longitude"):
        if name in params:
            readable.append(str(float(params[name])))
    if "start" in params:
        readable.append(str(params["start"]))
    return CACHE_DIR / f"{'_'.join([endpoint, *readable, digest])}.json.gz"


def _read_cached(path: Path) -> dict | None:
    try:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, EOFError, ValueError):
        path.unlink(missing_ok=True)  # poisoned entry: refetch and rewrite
        return None


def _write_cached(path: Path, payload: dict) -> None:
    partial = path.with_name(
        f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp"
    )
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(partial, "wt", encoding="utf-8") as handle:
            json.dump(payload, handle)
        partial.replace(path)
    except OSError:
        partial.unlink(missing_ok=True)  # read-only tree: cache is optional


def fetch_json(url: str, params: dict, *, timeout: float) -> dict:
    """GET ``url`` with ``params`` as JSON, replaying from disk when cached."""
    path = _cache_path(url, params)
    if path.is_file():
        cached = _read_cached(path)
        if cached is not None:
            return cached

    with _new_client(timeout) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()

    _write_cached(path, payload)
    return payload
