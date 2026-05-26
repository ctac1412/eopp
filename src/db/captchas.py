"""
EOPP Captcha Solver - Captchas DB.

Stores per-captcha history records parsed from v2 logs.
"""

import hashlib
import json
import os
import re
from datetime import UTC, datetime

from src.constants import CAPTCHA_ALL_DIR
from src.db.connection import get_connection

_V2_VERSION_RE = re.compile(r"<log-version>v2</log-version>")
_V2_VALIDATE_EVENT_RE = re.compile(
    r'"event"\s*:\s*"stage_end".*?"stage"\s*:\s*"validating".*?"status"\s*:\s*"success".*?"endpoint"\s*:\s*"validateCaptcha".*?"captcha_id"\s*:\s*"([a-f0-9]+)".*?"variant_index"\s*:\s*(\d+)'
)
_V2_VALIDATE_ERROR_EVENT_RE = re.compile(
    r'"event"\s*:\s*"stage_end".*?"stage"\s*:\s*"validating".*?"status"\s*:\s*"error".*?"error"\s*:\s*"([^"]+)".*?"endpoint"\s*:\s*"validateCaptcha".*?"captcha_id"\s*:\s*"([a-f0-9]+)".*?"variant_index"\s*:\s*(\d+)'
)
_V2_SOLVING_ERROR_EVENT_RE = re.compile(
    r'"event"\s*:\s*"stage_end".*?"stage"\s*:\s*"solving".*?"status"\s*:\s*"error".*?"error"\s*:\s*"([^"]+)".*?"endpoint"\s*:\s*"solve-captcha".*?"captcha_id"\s*:\s*"([a-f0-9]+)"'
)


def _is_v2(logs: list[str] | None) -> bool:
    if not logs:
        return False
    return any(_V2_VERSION_RE.search(line) for line in logs[:5])


def _tiles_hash(tiles: list[dict]) -> str:
    tile_ids = sorted(t["tileId"] for t in tiles)
    hash_input = json.dumps(tile_ids, sort_keys=True)
    return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


def extract_passed_captchas_from_logs(logs: list[str] | None) -> list[tuple[str, int]]:
    if not logs:
        return []
    passed: list[tuple[str, int]] = []
    for line in logs:
        m = _V2_VALIDATE_EVENT_RE.search(line)
        if m:
            passed.append((m.group(1), int(m.group(2))))
    return passed


def extract_invalid_captchas_from_logs(logs: list[str] | None) -> list[tuple[str, int | None, str]]:
    if not logs:
        return []
    invalid: list[tuple[str, int | None, str]] = []
    for line in logs:
        m = _V2_VALIDATE_ERROR_EVENT_RE.search(line)
        if m:
            invalid.append((m.group(2), int(m.group(3)), f"validation_error: {m.group(1).strip()}"))
    return invalid


def extract_unsolved_captchas_from_logs(logs: list[str] | None) -> list[tuple[str, str]]:
    if not logs:
        return []
    unsolved: list[tuple[str, str]] = []
    for line in logs:
        m = _V2_SOLVING_ERROR_EVENT_RE.search(line)
        if m:
            unsolved.append((m.group(2), f"solve_error: {m.group(1).strip()}"))
    return unsolved


def _resolve_tiles_hash(captcha_id: str) -> str | None:
    payload_path = os.path.join(CAPTCHA_ALL_DIR, f"{captcha_id}.json")
    if not os.path.exists(payload_path):
        return None
    try:
        with open(payload_path, encoding="utf-8") as f:
            data = json.load(f)
        puzzle = data.get("puzzle", data)
        tiles = puzzle.get("tiles", [])
        if tiles:
            return _tiles_hash(tiles)
    except Exception:
        return None
    return None


def _set_valid_index_in_payload(captcha_id: str, valid_index: int) -> bool:
    payload_path = os.path.join(CAPTCHA_ALL_DIR, f"{captcha_id}.json")
    if not os.path.exists(payload_path):
        return False
    try:
        with open(payload_path, encoding="utf-8") as f:
            data = json.load(f)
        data["valid_index"] = valid_index
        with open(payload_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def _set_no_valid_index_in_payload(captcha_id: str, no_valid_index: int) -> bool:
    payload_path = os.path.join(CAPTCHA_ALL_DIR, f"{captcha_id}.json")
    if not os.path.exists(payload_path):
        return False
    try:
        with open(payload_path, encoding="utf-8") as f:
            data = json.load(f)
        data["no_valid_index"] = no_valid_index
        with open(payload_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def _sync_captcha_files_label(conn, captcha_id: str, valid_index: int, timestamp_iso: str) -> None:
    try:
        payload_path = os.path.join(CAPTCHA_ALL_DIR, f"{captcha_id}.json")
        file_mtime = None
        if os.path.exists(payload_path):
            file_mtime = datetime.fromtimestamp(os.path.getmtime(payload_path), UTC).isoformat()
        conn.execute(
            """
            UPDATE captcha_files
            SET valid_index = ?,
                no_valid_index = NULL,
                file_status = 'labeled',
                file_mtime = COALESCE(?, file_mtime),
                last_seen_at = ?
            WHERE captcha_id = ?
            """,
            (valid_index, file_mtime, timestamp_iso, captcha_id),
        )
    except Exception:
        pass


def _sync_captcha_files_no_valid(conn, captcha_id: str, no_valid_index: int, timestamp_iso: str) -> None:
    try:
        payload_path = os.path.join(CAPTCHA_ALL_DIR, f"{captcha_id}.json")
        file_mtime = None
        if os.path.exists(payload_path):
            file_mtime = datetime.fromtimestamp(os.path.getmtime(payload_path), UTC).isoformat()
        conn.execute(
            """
            UPDATE captcha_files
            SET valid_index = NULL,
                no_valid_index = ?,
                file_status = 'labeled',
                file_mtime = COALESCE(?, file_mtime),
                last_seen_at = ?
            WHERE captcha_id = ?
            """,
            (no_valid_index, file_mtime, timestamp_iso, captcha_id),
        )
    except Exception:
        pass


def _sync_captcha_files_unsolved(conn, captcha_id: str, timestamp_iso: str) -> None:
    try:
        payload_path = os.path.join(CAPTCHA_ALL_DIR, f"{captcha_id}.json")
        file_mtime = None
        if os.path.exists(payload_path):
            file_mtime = datetime.fromtimestamp(os.path.getmtime(payload_path), UTC).isoformat()
        conn.execute(
            """
            UPDATE captcha_files
            SET valid_index = NULL,
                no_valid_index = NULL,
                file_status = 'no_answer',
                file_mtime = COALESCE(?, file_mtime),
                last_seen_at = ?
            WHERE captcha_id = ?
            """,
            (file_mtime, timestamp_iso, captcha_id),
        )
    except Exception:
        pass


def extract_variant_from_logs(logs: list[str] | None, captcha_id: str) -> int | None:
    variants = extract_variants_from_logs(logs)
    if not captcha_id:
        return None
    return variants.get(captcha_id)


def extract_variants_from_logs(logs: list[str] | None) -> dict[str, int]:
    if not logs or not _is_v2(logs):
        return {}
    variants: dict[str, int] = {}
    for line in logs:
        m = _V2_VALIDATE_EVENT_RE.search(line)
        if m:
            variants[m.group(1)] = int(m.group(2))
    return variants


def create_captcha_records(
    usage_log_id: int,
    captcha_id: str,
    logs: list[str] | None,
    overall_status: str,
) -> list[int]:
    if not _is_v2(logs):
        return []

    passed = extract_passed_captchas_from_logs(logs)
    invalid = extract_invalid_captchas_from_logs(logs)
    unsolved = extract_unsolved_captchas_from_logs(logs)
    if not passed and not invalid and not unsolved:
        return []

    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    created_ids = []

    # 1) solved correctly
    for cid, valid_index in passed:
        tiles_hash = _resolve_tiles_hash(cid)
        cursor = conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, fail_reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (cid, "passed", usage_log_id, tiles_hash, None, now),
        )
        created_ids.append(cursor.lastrowid)
        if _set_valid_index_in_payload(cid, valid_index):
            _sync_captcha_files_label(conn, cid, valid_index, now)

    # 2) solved but invalid: do not store answer
    for cid, no_valid_index, reason in invalid:
        tiles_hash = _resolve_tiles_hash(cid)
        cursor = conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, fail_reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (cid, "failed", usage_log_id, tiles_hash, reason, now),
        )
        created_ids.append(cursor.lastrowid)
        if no_valid_index is not None and _set_no_valid_index_in_payload(cid, no_valid_index):
            _sync_captcha_files_no_valid(conn, cid, no_valid_index, now)

    # 3) unsolved: answer does not exist
    for cid, reason in unsolved:
        tiles_hash = _resolve_tiles_hash(cid)
        cursor = conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, fail_reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (cid, "failed", usage_log_id, tiles_hash, reason, now),
        )
        created_ids.append(cursor.lastrowid)
        _sync_captcha_files_unsolved(conn, cid, now)

    conn.commit()
    conn.close()
    return created_ids


def list_captchas(usage_log_id: int | None = None) -> list[dict]:
    conn = get_connection()
    if usage_log_id is not None:
        rows = conn.execute(
            "SELECT * FROM captchas WHERE usage_log_id = ? ORDER BY created_at ASC",
            (usage_log_id,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM captchas ORDER BY created_at DESC").fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "captcha_id": r["captcha_id"],
            "status": r["status"],
            "usage_log_id": r["usage_log_id"],
            "tiles_hash": r["tiles_hash"],
            "fail_reason": r["fail_reason"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def list_public_captchas() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT captcha_id, status FROM captchas ORDER BY created_at DESC, id DESC"
    ).fetchall()
    conn.close()
    return [
        {
            "id": r["captcha_id"],
            "captcha_id": r["captcha_id"],
            "status": r["status"],
        }
        for r in rows
    ]
