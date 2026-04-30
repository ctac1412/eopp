import sqlite3
import os
import secrets
from datetime import datetime, timezone

from src.utils import PROJECT_DIR

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
    conn.commit()
    conn.close()


def create_key(label: str, max_uses: int | None = None) -> dict:
    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    key = secrets.token_hex(16)
    cursor = conn.execute(
        "INSERT INTO api_keys (key, label, created_at, max_uses, active) VALUES (?, ?, ?, ?, 1)",
        (key, label, now, max_uses),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM api_keys WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
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
    conn.execute(
        "UPDATE api_keys SET usage_count = usage_count + 1 WHERE key = ?", (key,)
    )
    conn.commit()
    conn.close()
    return True


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


init_db()
