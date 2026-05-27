"""Filesystem service for captcha JSON files and their DB index."""

from __future__ import annotations

import hashlib
import json
import os
from contextlib import redirect_stdout
from dataclasses import dataclass
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path

import src.constants as constants
from src.captcha_assembly import get_valid_variant_index
from src.entities.utils import entities_to_list
from src.repositories import captcha_file_repo
from captcha_solver import solve_captcha


@dataclass(frozen=True)
class SaveCaptchaPayloadResult:
    path: str
    data: dict
    reused_existing: bool
    analysis_changed: bool


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


def calculate_solver_results(data: dict) -> list[dict]:
    try:
        with redirect_stdout(StringIO()):
            _, _, results = solve_captcha(data)
    except Exception:
        return []
    return [
        {
            "variant": int(result["variant"]),
            "rank": rank,
            "score": round(float(result["score"]), 2),
            "discontinuity": round(float(result["discontinuity"]), 2),
            "coherence": round(float(result["coherence"]), 3),
            "ssim": round(float(result["ssim"]), 3),
            "sobel": round(float(result["sobel"]), 2),
        }
        for rank, result in enumerate(results, 1)
    ]


def ensure_solver_metadata(data: dict) -> bool:
    top3 = data.get("solver_top3")
    results = data.get("solver_results")
    has_top3 = isinstance(top3, list) and all(isinstance(item, int) for item in top3)
    has_results = isinstance(results, list) and all(isinstance(item, dict) for item in results)
    if has_top3 and has_results:
        return False

    calculated = calculate_solver_results(data)
    if not calculated:
        return False

    data["solver_top3"] = [item["variant"] for item in calculated[:3]]
    data["solver_results"] = calculated
    return True


def solver_valid_rank(data: dict, valid_index: int | None) -> int | None:
    results = data.get("solver_results")
    if valid_index is None:
        return None
    if isinstance(results, list):
        for result in results:
            if not isinstance(result, dict):
                continue
            if result.get("variant") == valid_index and isinstance(result.get("rank"), int):
                return result["rank"] - 1
    top3 = data.get("solver_top3")
    if isinstance(top3, list):
        try:
            return top3.index(valid_index)
        except ValueError:
            return None
    return None


def ensure_label_metadata(data: dict) -> bool:
    changed = False
    if "manual_labeled" not in data:
        data["manual_labeled"] = False
        changed = True
    if "label_source" not in data:
        data["label_source"] = None
        changed = True

    valid_index = get_valid_variant_index(data)
    rank = solver_valid_rank(data, valid_index)
    if data.get("solver_valid_rank") != rank:
        data["solver_valid_rank"] = rank
        changed = True
    return changed


def ensure_analysis_metadata(data: dict) -> bool:
    solver_changed = ensure_solver_metadata(data)
    label_changed = ensure_label_metadata(data)
    return solver_changed or label_changed


def metadata_for_data(path: str, data: dict, captcha_id: str | None = None) -> dict:
    puzzle = data.get("puzzle", data)
    variants = puzzle.get("variantsCapture", [])
    valid_index = get_valid_variant_index(data)
    no_valid = data.get("no_valid_index")
    manual_labeled = data.get("manual_labeled") is True
    label_source = data.get("label_source")
    captcha_type = data.get("type") or puzzle.get("type") or "unknown"
    stat = os.stat(path)
    now = datetime.now(UTC).isoformat()
    return {
        "captcha_id": captcha_id or Path(path).stem,
        "file_path": path,
        "file_status": "labeled" if valid_index is not None else "unlabeled",
        "captcha_type": str(captcha_type),
        "tiles_hash": tiles_hash(puzzle.get("tiles", [])),
        "valid_index": valid_index,
        "no_valid_index": no_valid if isinstance(no_valid, int) else None,
        "manual_labeled": manual_labeled,
        "label_source": str(label_source) if isinstance(label_source, str) else None,
        "solver_valid_rank": solver_valid_rank(data, valid_index),
        "variants_count": len(variants) if isinstance(variants, list) else 0,
        "file_size": stat.st_size,
        "file_mtime": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
        "created_at": now,
        "last_seen_at": now,
    }


def metadata_for_path(path: str) -> dict | None:
    data = read_json(path)
    if data is None:
        return None
    return metadata_for_data(path, data)


def upsert_captcha_file_data(path: str, data: dict, captcha_id: str | None = None) -> int | None:
    try:
        return captcha_file_repo.upsert_file(metadata_for_data(path, data, captcha_id))
    except Exception:
        return None


def upsert_captcha_file(path: str) -> int | None:
    meta = metadata_for_path(path)
    if meta is None:
        return None
    return captcha_file_repo.upsert_file(meta)


def write_captcha_json(path: str, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def copy_existing_metadata(existing: dict, data: dict, include_labels: bool = False) -> None:
    keys = ["solver_top3", "solver_results", "solver_valid_rank"]
    if include_labels:
        keys.extend(["manual_labeled", "label_source", "valid_index", "no_valid_index"])
    for key in keys:
        if key in existing:
            data[key] = existing[key]


def save_captcha_payload_detailed(captcha_id: str, data: dict) -> SaveCaptchaPayloadResult:
    os.makedirs(all_dir(), exist_ok=True)
    path = captcha_file_path(captcha_id)
    if os.path.exists(path):
        existing = read_json(path) or {}
        existing_valid = get_valid_variant_index(existing)
        incoming_valid = get_valid_variant_index(data)
        if incoming_valid is None:
            analysis_changed = ensure_analysis_metadata(existing)
            if analysis_changed:
                write_captcha_json(path, existing)
            copy_existing_metadata(existing, data, include_labels=existing_valid is not None)
            if existing.get("solver_results"):
                return SaveCaptchaPayloadResult(path, data, True, analysis_changed)
    analysis_changed = ensure_analysis_metadata(data)
    write_captcha_json(path, data)
    return SaveCaptchaPayloadResult(path, data, False, analysis_changed)


def save_captcha_payload(captcha_id: str, data: dict) -> str:
    return save_captcha_payload_detailed(captcha_id, data).path


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


def backfill_analysis_metadata() -> dict:
    os.makedirs(all_dir(), exist_ok=True)
    total = 0
    json_updated = 0
    indexed = 0
    skipped = 0
    solver_ready = 0
    rank_known = 0
    rank_zero = 0

    for name in sorted(os.listdir(all_dir())):
        if not name.endswith(".json"):
            continue
        total += 1
        path = os.path.join(all_dir(), name)
        data = read_json(path)
        if data is None:
            skipped += 1
            continue

        changed = ensure_analysis_metadata(data)
        solver_top3 = data.get("solver_top3")
        if isinstance(solver_top3, list) and solver_top3:
            solver_ready += 1

        rank = data.get("solver_valid_rank")
        if isinstance(rank, int):
            rank_known += 1
            if rank == 0:
                rank_zero += 1

        if changed:
            try:
                write_captcha_json(path, data)
                json_updated += 1
            except Exception:
                skipped += 1
                continue

        row_id = upsert_captcha_file_data(path, data)
        if row_id is None:
            skipped += 1
        else:
            indexed += 1

    return {
        "total": total,
        "json_updated": json_updated,
        "indexed": indexed,
        "skipped": skipped,
        "solver_ready": solver_ready,
        "rank_known": rank_known,
        "rank_zero": rank_zero,
    }


def list_captcha_files() -> list[dict]:
    return entities_to_list(captcha_file_repo.list_files())


def _write_valid_index(path: str, source_data: dict, idx: int) -> bool:
    try:
        source_data["valid_index"] = idx
        write_captcha_json(path, source_data)
        upsert_captcha_file_data(path, source_data)
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
