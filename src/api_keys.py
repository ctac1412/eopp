import json
import os
import secrets
import sqlite3
from datetime import UTC, datetime

from src.constants import ADMIN_TOKEN, PROJECT_DIR

DB_DIR = os.path.join(PROJECT_DIR, "data")
DB_PATH = os.path.join(DB_DIR, "api_keys.db")


def get_connection():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            usage_count INTEGER NOT NULL DEFAULT 0,
            max_uses INTEGER,
            active INTEGER NOT NULL DEFAULT 1
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id INTEGER NOT NULL,
            reservation_id TEXT NOT NULL,
            captcha_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            error_stage TEXT,
            slot_date TEXT,
            created_at TEXT NOT NULL,
            confirmed_at TEXT,
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
        )
    """)
    try:
        conn.execute("ALTER TABLE usage_log ADD COLUMN slot_date TEXT")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE usage_log ADD COLUMN logs TEXT")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE usage_log ADD COLUMN config_json TEXT")
        conn.commit()
    except Exception:
        pass

    # Инициализация админского токена, если его нет
    now = datetime.now(UTC).isoformat()
    conn.execute(
        "INSERT OR IGNORE INTO api_keys (key, label, created_at, max_uses, active) VALUES (?, ?, ?, NULL, 1)",
        (ADMIN_TOKEN, "admin", now),
    )
    conn.commit()

    conn.close()


def create_key(label: str, max_uses: int | None = None) -> dict:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    key = secrets.token_hex(16)
    cursor = conn.execute(
        "INSERT INTO api_keys (key, label, created_at, max_uses, active) VALUES (?, ?, ?, ?, 1)",
        (key, label, now, max_uses),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM api_keys WHERE id = ?", (cursor.lastrowid,)).fetchone()
    conn.close()
    return _row_to_dict(row)


def list_keys() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM api_keys ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_key_by_id(key_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def update_key(
    key_id: int,
    label: str = None,
    max_uses: int | None = None,
    active: bool | None = None,
) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()
    if not row:
        conn.close()
        return None

    current = _row_to_dict(row)
    label = label if label is not None else current["label"]
    max_uses = max_uses if max_uses is not None else current["max_uses"]
    active = active if active is not None else current["active"]

    conn.execute(
        "UPDATE api_keys SET label = ?, max_uses = ?, active = ? WHERE id = ?",
        (label, max_uses, 1 if active else 0, key_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()
    conn.close()
    return _row_to_dict(row)


def delete_key(key_id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def reset_usage(key_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()
    if not row:
        conn.close()
        return None
    conn.execute("UPDATE api_keys SET usage_count = 0 WHERE id = ?", (key_id,))
    conn.commit()
    row = conn.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()
    conn.close()
    return _row_to_dict(row)


def validate_key(key: str) -> dict:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE key = ?", (key,)).fetchone()
    conn.close()

    if not row:
        return {"valid": False, "reason": "Key not found"}

    record = _row_to_dict(row)

    if not record["active"]:
        return {"valid": False, "reason": "Key is disabled"}

    if record["max_uses"] is not None and record["usage_count"] >= record["max_uses"]:
        return {"valid": False, "reason": "Maximum uses exceeded"}

    remaining = None
    if record["max_uses"] is not None:
        remaining = record["max_uses"] - record["usage_count"]

    return {
        "valid": True,
        "label": record["label"],
        "remaining": remaining,
    }


def increment_usage(key: str) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE key = ?", (key,)).fetchone()
    if not row:
        conn.close()
        return False
    conn.execute("UPDATE api_keys SET usage_count = usage_count + 1 WHERE key = ?", (key,))
    conn.commit()
    conn.close()
    return True


def get_key_record(key: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE key = ?", (key,)).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def get_key_by_label(label: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE label = ?", (label,)).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def get_usage_log_entry(usage_log_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "api_key_id": row["api_key_id"],
        "reservation_id": row["reservation_id"],
        "captcha_id": row["captcha_id"],
        "status": row["status"],
        "error_message": row["error_message"],
        "error_stage": row["error_stage"],
        "slot_date": row["slot_date"],
        "logs": json.loads(row["logs"]) if row["logs"] else None,
        "config_json": json.loads(row["config_json"]) if row["config_json"] else None,
        "created_at": row["created_at"],
        "confirmed_at": row["confirmed_at"],
    }


def delete_usage_log(usage_log_id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM usage_log WHERE id = ?", (usage_log_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "key": row["key"],
        "label": row["label"],
        "created_at": row["created_at"],
        "usage_count": row["usage_count"],
        "max_uses": row["max_uses"],
        "active": bool(row["active"]),
    }


def log_usage(
    api_key: str, reservation_id: str, captcha_id: str, config_json: dict | None = None
) -> int:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE key = ?", (api_key,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"API key not found: {api_key[:8]}...")
    now = datetime.now(UTC).isoformat()
    config_str = json.dumps(config_json) if config_json else None
    cursor = conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, captcha_id, status, created_at, config_json) VALUES (?, ?, ?, 'pending', ?, ?)",
        (row["id"], reservation_id, captcha_id, now, config_str),
    )
    conn.commit()
    usage_log_id = cursor.lastrowid
    conn.close()
    return usage_log_id


def confirm_usage(
    usage_log_id: int,
    slot_date: str | None = None,
    logs: list[str] | None = None,
    captcha_id: str | None = None,
) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    if not row:
        conn.close()
        return False
    now = datetime.now(UTC).isoformat()
    logs_json = json.dumps(logs) if logs else None
    if captcha_id and captcha_id != "unknown":
        conn.execute(
            "UPDATE usage_log SET status = 'confirmed', confirmed_at = ?, slot_date = ?, logs = ?, captcha_id = ? WHERE id = ?",
            (now, slot_date, logs_json, captcha_id, usage_log_id),
        )
    else:
        conn.execute(
            "UPDATE usage_log SET status = 'confirmed', confirmed_at = ?, slot_date = ?, logs = ? WHERE id = ?",
            (now, slot_date, logs_json, usage_log_id),
        )
    conn.execute(
        "UPDATE api_keys SET usage_count = usage_count + 1 WHERE id = ?",
        (row["api_key_id"],),
    )
    conn.commit()
    conn.close()
    return True


def fail_usage(
    usage_log_id: int,
    error_message: str,
    error_stage: str,
    slot_date: str | None = None,
    logs: list[str] | None = None,
    captcha_id: str | None = None,
) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    if not row:
        conn.close()
        return False
    logs_json = json.dumps(logs) if logs else None
    if captcha_id and captcha_id != "unknown":
        conn.execute(
            "UPDATE usage_log SET status = 'failed', error_message = ?, error_stage = ?, slot_date = ?, logs = ?, captcha_id = ? WHERE id = ?",
            (
                error_message,
                error_stage,
                slot_date,
                logs_json,
                captcha_id,
                usage_log_id,
            ),
        )
    else:
        conn.execute(
            "UPDATE usage_log SET status = 'failed', error_message = ?, error_stage = ?, slot_date = ?, logs = ? WHERE id = ?",
            (error_message, error_stage, slot_date, logs_json, usage_log_id),
        )
    conn.commit()
    conn.close()
    return True


def list_usages(api_key_id: int | None = None) -> list[dict]:
    conn = get_connection()
    if api_key_id is not None:
        rows = conn.execute(
            "SELECT u.*, k.label FROM usage_log u LEFT JOIN api_keys k ON u.api_key_id = k.id WHERE u.api_key_id = ? ORDER BY u.created_at DESC",
            (api_key_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT u.*, k.label FROM usage_log u LEFT JOIN api_keys k ON u.api_key_id = k.id ORDER BY u.created_at DESC"
        ).fetchall()
    conn.close()
    result = []
    for r in rows:
        captcha_id = r["captcha_id"] or ""
        logs_raw = r["logs"]
        logs = json.loads(logs_raw) if logs_raw else None
        result.append(
            {
                "id": r["id"],
                "api_key_id": r["api_key_id"],
                "reservation_id": r["reservation_id"],
                "captcha_id": captcha_id,
                "captcha_id_short": captcha_id[:16] if len(captcha_id) > 16 else captcha_id,
                "status": r["status"],
                "error_message": r["error_message"],
                "error_stage": r["error_stage"],
                "slot_date": r["slot_date"],
                "logs": logs,
                "config_json": json.loads(r["config_json"]) if r["config_json"] else None,
                "created_at": r["created_at"],
                "confirmed_at": r["confirmed_at"],
                "label": r["label"],
            }
        )
    return result


init_db()
