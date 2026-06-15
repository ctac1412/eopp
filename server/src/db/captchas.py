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
    r'"event"\s*:\s*"stage_end".*?"stage"\s*:\s*"validating".*?"status"\s*:\s*"success".*?"endpoint"\s*:\s*"validateCaptcha".*?"captcha_id"\s*:\s*"([a-f0-9]+)".*?"variant_index"\s*:\s*(\d+)',
    re.DOTALL,
)
_V2_VALIDATE_ERROR_EVENT_RE = re.compile(
    r'"event"\s*:\s*"stage_end".*?"stage"\s*:\s*"validating".*?"status"\s*:\s*"error".*?"error"\s*:\s*"([^"]+)".*?"endpoint"\s*:\s*"validateCaptcha".*?"captcha_id"\s*:\s*"([a-f0-9]+)".*?"variant_index"\s*:\s*(\d+)',
    re.DOTALL,
)
_V2_SOLVING_ERROR_EVENT_RE = re.compile(
    r'"event"\s*:\s*"stage_end".*?"stage"\s*:\s*"solving".*?"status"\s*:\s*"error".*?"error"\s*:\s*"([^"]+)".*?"endpoint"\s*:\s*"solve-captcha".*?"captcha_id"\s*:\s*"([a-f0-9]+)"',
    re.DOTALL,
)
_V2_UNSOLVED_EVENT_RE = re.compile(
    r'"event"\s*:\s*"stage_end".*?"stage"\s*:\s*"captcha".*?"status"\s*:\s*"timeout".*?"reason"\s*:\s*"([^"]+)".*?"captcha_id"\s*:\s*"([a-f0-9]+)"',
    re.DOTALL,
)


def _is_v2(logs: list[str] | None) -> bool:
    if not logs:
        return False
    return any(_V2_VERSION_RE.search(line) for line in logs[:5])


def _tiles_hash(tiles: list[dict]) -> str:
    tile_ids = sorted(t["tileId"] for t in tiles)
    hash_input = json.dumps(tile_ids, sort_keys=True)
    return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


def _payload_path(captcha_id: str) -> str:
    return os.path.join(CAPTCHA_ALL_DIR, f"{captcha_id}.json")


def _load_payload(captcha_id: str) -> dict | None:
    payload_path = _payload_path(captcha_id)
    if not os.path.exists(payload_path):
        return None
    try:
        with open(payload_path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _write_payload(captcha_id: str, data: dict) -> bool:
    try:
        with open(_payload_path(captcha_id), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def _payload_tiles_hash(data: dict | None) -> str | None:
    if not data:
        return None
    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    if not tiles:
        return None
    try:
        return _tiles_hash(tiles)
    except Exception:
        return None


def _parse_v2_event(line: str) -> dict | None:
    marker_pos = line.find("event")
    if marker_pos < 0:
        return None
    json_pos = line.find("{", marker_pos)
    if json_pos < 0:
        return None
    try:
        event = json.loads(line[json_pos:])
    except json.JSONDecodeError:
        return None
    return event if isinstance(event, dict) else None


def _event_matches(event: dict, stage: str, status: str, endpoint: str) -> bool:
    return (
        event.get("event") == "stage_end"
        and event.get("stage") == stage
        and event.get("status") == status
        and event.get("endpoint") == endpoint
    )


def _event_int(event: dict, key: str) -> int | None:
    value = event.get(key)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def extract_passed_captchas_from_logs(logs: list[str] | None) -> list[tuple[str, int]]:
    if not logs:
        return []
    passed: list[tuple[str, int]] = []
    for line in logs:
        if not isinstance(line, str):
            continue
        event = _parse_v2_event(line)
        if event:
            if not _event_matches(event, "validating", "success", "validateCaptcha"):
                continue
            captcha_id = event.get("captcha_id")
            variant_index = _event_int(event, "variant_index")
            if isinstance(captcha_id, str) and variant_index is not None:
                passed.append((captcha_id, variant_index))
            continue
        m = _V2_VALIDATE_EVENT_RE.search(line)
        if m:
            passed.append((m.group(1), int(m.group(2))))
    return passed


def extract_invalid_captchas_from_logs(logs: list[str] | None) -> list[tuple[str, int | None, str]]:
    if not logs:
        return []
    invalid: list[tuple[str, int | None, str]] = []
    for line in logs:
        if not isinstance(line, str):
            continue
        event = _parse_v2_event(line)
        if event:
            if not _event_matches(event, "validating", "error", "validateCaptcha"):
                continue
            captcha_id = event.get("captcha_id")
            if not isinstance(captcha_id, str):
                continue
            error = str(event.get("error") or "").strip()
            invalid.append(
                (captcha_id, _event_int(event, "variant_index"), f"validation_error: {error}")
            )
            continue
        m = _V2_VALIDATE_ERROR_EVENT_RE.search(line)
        if m:
            invalid.append((m.group(2), int(m.group(3)), f"validation_error: {m.group(1).strip()}"))
    return invalid


def extract_unsolved_captchas_from_logs(logs: list[str] | None) -> list[tuple[str, str]]:
    if not logs:
        return []
    unsolved: list[tuple[str, str]] = []
    for line in logs:
        if not isinstance(line, str):
            continue
        event = _parse_v2_event(line)
        if event:
            if not _event_matches(event, "captcha", "error", "generateCaptcha"):
                continue
            captcha_id = event.get("captcha_id")
            if isinstance(captcha_id, str):
                reason = str(event.get("error") or "").strip()
                unsolved.append((captcha_id, f"captcha_generation_failed: {reason}" if reason else "captcha_generation_failed"))
            continue
        m = _V2_UNSOLVED_EVENT_RE.search(line)
        if m:
            unsolved.append((m.group(2), m.group(1).strip()))
    return unsolved


def extract_solving_errors_from_logs(logs: list[str] | None) -> list[tuple[str, str]]:
    if not logs:
        return []
    errors: list[tuple[str, str]] = []
    for line in logs:
        if not isinstance(line, str):
            continue
        event = _parse_v2_event(line)
        if event:
            if not _event_matches(event, "solving", "error", "solve-captcha"):
                continue
            captcha_id = event.get("captcha_id")
            if isinstance(captcha_id, str):
                reason = str(event.get("error") or "").strip()
                errors.append((captcha_id, f"solve_error: {reason}" if reason else "solve_error"))
            continue
        m = _V2_SOLVING_ERROR_EVENT_RE.search(line)
        if m:
            errors.append((m.group(2), f"solve_error: {m.group(1).strip()}"))
    return errors


_SERVER_ANSWER_RE = re.compile(
    r"Server answer:\s.*?\bcaptcha=([a-f0-9]+)\b.*?\btiles=\[([^\]]*)\]"
)


def extract_icon_coordinates_from_logs(logs: list[str] | None) -> dict[str, list[dict[str, int]]]:
    """Extract icon-click coordinates from 'Server answer' log lines.

    Returns {captcha_id: [{x, y}, ...]}.
    Only includes entries where coords look like icon-click (semicolons between pairs).
    Puzzle tile-id answers (commas, no coordinates) are skipped.
    """
    if not logs:
        return {}
    result: dict[str, list[dict[str, int]]] = {}
    for line in logs:
        if not isinstance(line, str):
            continue
        m = _SERVER_ANSWER_RE.search(line)
        if not m:
            continue
        captcha_id = m.group(1)
        tiles_str = m.group(2).strip()
        # Icon-click: "x1,y1; x2,y2; x3,y3; ..."
        if ";" not in tiles_str:
            continue  # puzzle answer, skip
        coords = []
        for pair in tiles_str.split(";"):
            pair = pair.strip()
            if not pair:
                continue
            parts = pair.split(",")
            if len(parts) == 2:
                try:
                    coords.append({"x": int(parts[0].strip()), "y": int(parts[1].strip())})
                except ValueError:
                    pass
        if coords:
            result[captcha_id] = coords
    return result


def extract_captcha_durations_from_logs(logs: list[str] | None) -> dict[str, int]:
    """Extract per-captcha solving durations from stage_end events.
    
    Prefers 'success' status over 'error' when both exist for the same captcha_id.
    """
    if not logs:
        return {}
    durations: dict[str, int] = {}
    for line in logs:
        if not isinstance(line, str):
            continue
        event = _parse_v2_event(line)
        if not event:
            continue
        if event.get("event") != "stage_end":
            continue
        if event.get("stage") != "solving":
            continue
        if event.get("endpoint") != "solve-captcha":
            continue
        cid = event.get("captcha_id")
        dur = _event_int(event, "duration_ms")
        if not isinstance(cid, str) or dur is None:
            continue
        if cid not in durations or event.get("status") == "success":
            durations[cid] = dur
    return durations


def _sync_captcha_files_label(
    conn,
    captcha_id: str,
    valid_index: int,
    timestamp_iso: str,
    payload_data: dict | None = None,
) -> None:
    try:
        _ensure_captcha_file_row(captcha_id, payload_data)
        payload_path = _payload_path(captcha_id)
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


def _sync_captcha_files_no_valid(
    conn,
    captcha_id: str,
    no_valid_index: int,
    timestamp_iso: str,
    payload_data: dict | None = None,
) -> None:
    try:
        _ensure_captcha_file_row(captcha_id, payload_data)
        payload_path = _payload_path(captcha_id)
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


def _sync_captcha_files_unsolved(
    conn,
    captcha_id: str,
    timestamp_iso: str,
    payload_data: dict | None = None,
) -> None:
    try:
        _ensure_captcha_file_row(captcha_id, payload_data)
        payload_path = _payload_path(captcha_id)
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


def _ensure_captcha_file_row(captcha_id: str, payload_data: dict | None = None) -> None:
    """Ensure captcha_files has a row for captcha_id before status/index updates."""
    try:
        from src.services import captcha_file_service

        path = captcha_file_service.captcha_file_path(captcha_id)
        if os.path.exists(path):
            if payload_data is not None:
                captcha_file_service.upsert_captcha_file_data(path, payload_data, captcha_id)
            else:
                captcha_file_service.upsert_captcha_file(path)
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
        if not isinstance(line, str):
            continue
        event = _parse_v2_event(line)
        if event:
            if not _event_matches(event, "validating", "success", "validateCaptcha"):
                continue
            captcha_id = event.get("captcha_id")
            variant_index = _event_int(event, "variant_index")
            if isinstance(captcha_id, str) and variant_index is not None:
                variants[captcha_id] = variant_index
            continue
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
    solve_errors = extract_solving_errors_from_logs(logs)
    cap_durations = extract_captcha_durations_from_logs(logs)
    icon_coords = extract_icon_coordinates_from_logs(logs)
    if not passed and not invalid and not unsolved and not solve_errors:
        return []

    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    created_ids = []

    usage_created_at = _get_usage_created_at(conn, usage_log_id)
    duration_ms = None
    if usage_created_at:
        try:
            start = _parse_naive_dt(usage_created_at)
            end = _parse_naive_dt(now)
            duration_ms = int((end - start).total_seconds() * 1000)
        except Exception:
            pass

    # 1) solved correctly
    for cid, valid_index in passed:
        payload_data = _load_payload(cid)
        tiles_hash = _payload_tiles_hash(payload_data)
        dur = cap_durations.get(cid, duration_ms)
        cursor = conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, fail_reason, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cid, "passed", usage_log_id, tiles_hash, None, dur, now),
        )
        created_ids.append(cursor.lastrowid)
        if payload_data is not None:
            payload_data["valid_index"] = valid_index
            if _write_payload(cid, payload_data):
                _sync_captcha_files_label(conn, cid, valid_index, now, payload_data)

    # 2) solved but invalid: do not store answer
    for cid, no_valid_index, reason in invalid:
        payload_data = _load_payload(cid)
        tiles_hash = _payload_tiles_hash(payload_data)
        dur = cap_durations.get(cid, duration_ms)
        cursor = conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, fail_reason, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cid, "failed", usage_log_id, tiles_hash, reason, dur, now),
        )
        created_ids.append(cursor.lastrowid)
        if payload_data is not None and no_valid_index is not None:
            payload_data["no_valid_index"] = no_valid_index
            if _write_payload(cid, payload_data):
                _sync_captcha_files_no_valid(conn, cid, no_valid_index, now, payload_data)

    # 3) unsolved: answer does not exist
    for cid, reason in unsolved:
        payload_data = _load_payload(cid)
        tiles_hash = _payload_tiles_hash(payload_data)
        dur = cap_durations.get(cid, duration_ms)
        cursor = conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, fail_reason, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cid, "failed", usage_log_id, tiles_hash, reason, dur, now),
        )
        created_ids.append(cursor.lastrowid)
        _sync_captcha_files_unsolved(conn, cid, now, payload_data)

    # 4) solving errors
    for cid, reason in solve_errors:
        payload_data = _load_payload(cid)
        tiles_hash = _payload_tiles_hash(payload_data)
        dur = cap_durations.get(cid, duration_ms)
        cursor = conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, tiles_hash, fail_reason, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cid, "failed", usage_log_id, tiles_hash, reason, dur, now),
        )
        created_ids.append(cursor.lastrowid)
        _sync_captcha_files_unsolved(conn, cid, now, payload_data)

    # 5) save icon-click coordinates to JSON files
    for cid, coords in icon_coords.items():
        payload_data = _load_payload(cid) or {}
        payload_data["coordinates"] = coords
        _write_payload(cid, payload_data)

    conn.commit()
    conn.close()
    return created_ids


def _get_usage_created_at(conn, usage_log_id: int) -> str | None:
    row = conn.execute(
        "SELECT created_at FROM usage_log WHERE id = ?", (usage_log_id,)
    ).fetchone()
    return row["created_at"] if row else None


def _parse_naive_dt(iso: str):
    dt = datetime.fromisoformat(iso)
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


def backfill_duration_ms() -> int:
    """Backfill duration_ms from logs stored in usage_log."""
    conn = get_connection()

    rows = conn.execute(
        "SELECT c.id, c.captcha_id, c.created_at, c.usage_log_id, u.logs, u.created_at AS usage_created_at "
        "FROM captchas c JOIN usage_log u ON c.usage_log_id = u.id "
        "WHERE c.duration_ms IS NULL"
    ).fetchall()

    updated = 0
    for r in rows:
        dur = None
        logs = None
        try:
            import json as _json
            raw = r["logs"]
            logs = _json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            pass

        if isinstance(logs, list):
            from_logs = extract_captcha_durations_from_logs(logs)
            dur = from_logs.get(r["captcha_id"])

        if dur is None:
            try:
                captcha_time = _parse_naive_dt(r["created_at"])
                usage_time = _parse_naive_dt(r["usage_created_at"])
                dur = int((captcha_time - usage_time).total_seconds() * 1000)
            except Exception:
                continue

        conn.execute("UPDATE captchas SET duration_ms = ? WHERE id = ?", (dur, r["id"]))
        updated += 1

    conn.commit()
    conn.close()
    return updated


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
            "duration_ms": r["duration_ms"] if "duration_ms" in r.keys() else None,
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
