"""
EOPP Captcha Solver - API Keys.

CRUD операции для API ключей.
"""

import secrets
from datetime import UTC, datetime

from src.db.connection import get_connection
from src.db.tariffs import get_tariff
from src.db.usage_log import calc_debt


def _row_to_dict(row):
    return {
        "id": row["id"],
        "key": row["key"],
        "label": row["label"],
        "created_at": row["created_at"],
        "usage_count": row["usage_count"],
        "max_uses": row["max_uses"],
        "active": bool(row["active"]),
        "comment": row["comment"],
    }


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
    keys = [_row_to_dict(r) for r in rows]

    if keys:
        key_ids = [k["id"] for k in keys]
        placeholders = ",".join("?" * len(key_ids))
        tariff_rows = conn.execute(
            f"SELECT * FROM tariffs WHERE api_key_id IN ({placeholders})",
            key_ids
        ).fetchall()
        tariff_map = {r["api_key_id"]: {
            "price_create": r["price_create"],
            "price_reschedule": r["price_reschedule"],
        } for r in tariff_rows}
        for k in keys:
            k["tariff"] = tariff_map.get(k["id"])
            k["debt"] = calc_debt(k["id"])

    conn.close()
    return keys


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
    comment: str = None,
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
    comment = comment if comment is not None else current["comment"]

    conn.execute(
        "UPDATE api_keys SET label = ?, max_uses = ?, active = ?, comment = ? WHERE id = ?",
        (label, max_uses, 1 if active else 0, comment, key_id),
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
        "max_uses": record["max_uses"],
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
