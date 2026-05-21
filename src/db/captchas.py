"""
EOPP Captcha Solver - Captchas DB.

Таблица для хранения истории отдельных капч.
Парсер логов: только v2 формат.
"""

import hashlib
import json
import os
import re
from datetime import UTC, datetime

from src.constants import NO_VALID_DIR, VALID_DIR
from src.db.connection import get_connection


_V2_VALIDATED_RE = re.compile(r"Капча валидирована\s+\[([a-f0-9]+)\]\s+ответ:\s*(\[.*?\])")
_V2_NOT_VALIDATED_RE = re.compile(r"Капча не валидирована\s+\[([a-f0-9]+)\]\s+причина:\s*(.+)")
_V2_VERSION_RE = re.compile(r"<log-version>v2</log-version>")


def _is_v2(logs: list[str] | None) -> bool:
    if not logs:
        return False
    return bool(_V2_VERSION_RE.search(logs[0]))


def _tiles_hash(tiles: list[dict]) -> str:
    """Хеш только набора тайлов (без variantsCapture)."""
    tile_ids = sorted(t["tileId"] for t in tiles)
    hash_input = json.dumps(tile_ids, sort_keys=True)
    return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


def _extract_v2(logs: list[str]) -> list[tuple[str, str, str | None, str | None]]:
    """Парсит v2 логи и возвращает список (captcha_id, status, correct_answer, fail_reason)."""
    if not logs:
        return []

    results = []
    for line in logs:
        m = _V2_VALIDATED_RE.search(line)
        if m:
            captcha_id = m.group(1)
            answer = m.group(2)
            try:
                parsed = json.loads(answer)
                if isinstance(parsed, list):
                    results.append((captcha_id, "passed", json.dumps(parsed), None))
                else:
                    results.append((captcha_id, "passed", None, None))
            except (json.JSONDecodeError, ValueError):
                results.append((captcha_id, "passed", None, None))
            continue

        m = _V2_NOT_VALIDATED_RE.search(line)
        if m:
            captcha_id = m.group(1)
            reason = m.group(2).strip()
            results.append((captcha_id, "failed", None, reason))
            continue

    return results


def _resolve_tiles_hash(captcha_id: str) -> str | None:
    """Best-effort tiles hash lookup from stored captcha payload files."""
    for base_dir in (VALID_DIR, NO_VALID_DIR):
        payload_path = os.path.join(base_dir, f"{captcha_id}.json")
        if not os.path.exists(payload_path):
            continue
        try:
            with open(payload_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            puzzle = data.get("puzzle", data)
            tiles = puzzle.get("tiles", [])
            if tiles:
                return _tiles_hash(tiles)
        except Exception:
            continue
    return None


def create_captcha_records(
    usage_log_id: int,
    captcha_id: str,
    logs: list[str] | None,
    overall_status: str,
) -> list[int]:
    """Создаёт записи в таблице captchas на основе v2 логов.

    Если логи не v2 (нет <log-version>v2</log-version>), записи НЕ создаются.
    """
    if not _is_v2(logs):
        return []

    parsed = _extract_v2(logs)
    if not parsed:
        return []

    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    created_ids = []

    for cid, status, correct_answer, fail_reason in parsed:
        tiles_hash = _resolve_tiles_hash(cid)
        cursor = conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, correct_answer, fail_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cid, status, usage_log_id, tiles_hash, correct_answer, fail_reason, now),
        )
        created_ids.append(cursor.lastrowid)

    conn.commit()
    conn.close()
    return created_ids


def list_captchas(usage_log_id: int | None = None) -> list[dict]:
    """Возвращает список записей из таблицы captchas."""
    conn = get_connection()
    if usage_log_id is not None:
        rows = conn.execute(
            "SELECT * FROM captchas WHERE usage_log_id = ? ORDER BY created_at ASC",
            (usage_log_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM captchas ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "captcha_id": r["captcha_id"],
            "status": r["status"],
            "usage_log_id": r["usage_log_id"],
            "tiles_hash": r["tiles_hash"],
            "correct_answer": r["correct_answer"],
            "fail_reason": r["fail_reason"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def get_captcha_by_id(captcha_record_id: int) -> dict | None:
    """Возвращает запись капчи по ID."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM captchas WHERE id = ?", (captcha_record_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "captcha_id": row["captcha_id"],
        "status": row["status"],
        "usage_log_id": row["usage_log_id"],
        "tiles_hash": row["tiles_hash"],
        "correct_answer": row["correct_answer"],
        "fail_reason": row["fail_reason"],
        "created_at": row["created_at"],
    }


def delete_captcha(captcha_record_id: int) -> bool:
    """Удаляет запись капчи по ID."""
    conn = get_connection()
    cursor = conn.execute(
        "DELETE FROM captchas WHERE id = ?", (captcha_record_id,)
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted
