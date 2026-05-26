"""Filesystem service for captcha JSON files and their DB index."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import src.constants as constants
from src.captcha_assembly import get_valid_variant_index
from src.entities.utils import entities_to_list
from src.repositories import captcha_file_repo


def all_dir() -> str:
    return constants.CAPTCHA_ALL_DIR


def captcha_file_path(captcha_id: str) -> str:
    return os.path.join(all_dir(), f"{captcha_id}.json")


def read_json(path: str) -> dict | None:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def load_captcha_payload(captcha_id: str) -> dict | None:
    return read_json(captcha_file_path(captcha_id))


def tiles_hash(tiles: list[dict]) -> str | None:
    if not tiles:
        return None
    tile_ids = sorted(t["tileId"] for t in tiles if "tileId" in t)
    if not tile_ids:
        return None
    return hashlib.sha256(json.dumps(tile_ids, sort_keys=True).encode()).hexdigest()[:16]


def metadata_for_path(path: str) -> dict | None:
    data = read_json(path)
    if data is None:
        return None
    puzzle = data.get("puzzle", data)
    variants = puzzle.get("variantsCapture", [])
    valid_index = get_valid_variant_index(data)
    no_valid = data.get("no_valid_index")
    captcha_type = data.get("type") or puzzle.get("type") or "unknown"
    stat = os.stat(path)
    now = datetime.now(UTC).isoformat()
    return {
        "captcha_id": Path(path).stem,
        "file_path": path,
        "file_status": "labeled" if valid_index is not None else "unlabeled",
        "captcha_type": str(captcha_type),
        "tiles_hash": tiles_hash(puzzle.get("tiles", [])),
        "valid_index": valid_index,
        "no_valid_index": no_valid if isinstance(no_valid, int) else None,
        "variants_count": len(variants) if isinstance(variants, list) else 0,
        "file_size": stat.st_size,
        "file_mtime": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
        "created_at": now,
        "last_seen_at": now,
    }


def upsert_captcha_file(path: str) -> int | None:
    meta = metadata_for_path(path)
    if meta is None:
        return None
    existing = captcha_file_repo.get_by_captcha_id(meta["captcha_id"])
    if existing:
        meta["created_at"] = existing.created_at
    return captcha_file_repo.upsert_file(meta)


def save_captcha_payload(captcha_id: str, data: dict) -> str:
    os.makedirs(all_dir(), exist_ok=True)
    path = captcha_file_path(captcha_id)
    if os.path.exists(path):
        existing = read_json(path) or {}
        existing_valid = get_valid_variant_index(existing)
        incoming_valid = get_valid_variant_index(data)
        if existing_valid is not None and incoming_valid is None:
            return path
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def sync_captcha_files() -> dict:
    os.makedirs(all_dir(), exist_ok=True)
    indexed = 0
    skipped = 0
    for name in sorted(os.listdir(all_dir())):
        if not name.endswith(".json"):
            continue
        row_id = upsert_captcha_file(os.path.join(all_dir(), name))
        if row_id is None:
            skipped += 1
        else:
            indexed += 1
    return {"indexed": indexed, "skipped": skipped}


def list_captcha_files() -> list[dict]:
    return entities_to_list(captcha_file_repo.list_files())


def _write_valid_index(path: str, source_data: dict, idx: int) -> bool:
    try:
        source_data["valid_index"] = idx
        with open(path, "w", encoding="utf-8") as f:
            json.dump(source_data, f, ensure_ascii=False, indent=2)
        upsert_captcha_file(path)
        return True
    except Exception:
        return False


def backfill_captcha_dates() -> dict:
    """Проставляет file_mtime в captcha_files и файловой системе согласно usage_log.created_at.

    Для капч без привязки к usage_log ставится минимальная дата (2000-01-01)."""
    EPOCH_TS = 946684800.0  # 2000-01-01 UTC
    EPOCH_ISO = "2000-01-01T00:00:00+00:00"

    links = captcha_file_repo.list_usage_log_links()
    all_ids = captcha_file_repo.list_all_captcha_ids()
    linked_ids = {l["captcha_id"] for l in links}
    log_dates = {l["captcha_id"]: l["usage_log_created_at"] for l in links}

    updated = 0

    for captcha_id in all_ids:
        path = captcha_file_path(captcha_id)
        if not os.path.exists(path):
            continue

        if captcha_id in log_dates:
            date_str = log_dates[captcha_id]
        else:
            date_str = EPOCH_ISO

        try:
            from datetime import datetime
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            ts = dt.timestamp()
            os.utime(path, (ts, ts))
            upsert_captcha_file(path)
            updated += 1
        except Exception:
            pass

    return {
        "updated": updated,
        "total_files": len(all_ids),
        "linked": len(linked_ids),
        "unlinked": len(all_ids) - len(linked_ids),
    }
