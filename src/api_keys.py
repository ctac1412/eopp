"""
EOPP Captcha Solver - API Keys Database.

SQLite база данных для управления API ключами и логирования использования.
Таблицы:
- api_keys: ключи с лимитами использования (max_uses)
- usage_log: история использования ключей

Функции:
- create_key, list_keys, update_key, delete_key - CRUD для ключей
- validate_key - проверка валидности и лимитов
- log_usage, confirm_usage, fail_usage - управление логами использования

Используется routes.py для авторизации и трекинга использования.
База: data/api_keys.db
"""

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
            active INTEGER NOT NULL DEFAULT 1,
            comment TEXT
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
            price INTEGER,
            paid INTEGER
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tariffs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id INTEGER UNIQUE NOT NULL,
            price_create INTEGER NOT NULL,
            price_reschedule INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            percent INTEGER NOT NULL,
            requisites TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
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
    try:
        conn.execute("ALTER TABLE usage_log ADD COLUMN price INTEGER")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE usage_log ADD COLUMN paid INTEGER")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE api_keys ADD COLUMN comment TEXT")
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
    try:
        conn.execute("ALTER TABLE usage_log ADD COLUMN price INTEGER")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE usage_log ADD COLUMN paid INTEGER")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE api_keys ADD COLUMN comment TEXT")
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
        "price": row["price"],
        "paid": bool(row["paid"]) if row["paid"] is not None else None,
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
        "comment": row["comment"],
    }


def _row_to_dict_with_optional(row: sqlite3.Row, include_optional: bool = False) -> dict:
    result = {
        "id": row["id"],
        "key": row["key"],
        "label": row["label"],
        "created_at": row["created_at"],
        "usage_count": row["usage_count"],
        "max_uses": row["max_uses"],
        "active": bool(row["active"]),
        "comment": row["comment"],
    }
    if include_optional:
        if "price" in row.keys():
            result["price"] = row["price"]
        if "paid" in row.keys():
            result["paid"] = row["paid"]
    return result


def _row_to_dict_with_optional(row: sqlite3.Row, include_optional: bool = False) -> dict:
    result = {
        "id": row["id"],
        "key": row["key"],
        "label": row["label"],
        "created_at": row["created_at"],
        "usage_count": row["usage_count"],
        "max_uses": row["max_uses"],
        "active": bool(row["active"]),
        "comment": row["comment"],
    }
    if include_optional:
        if "price" in row.keys():
            result["price"] = row["price"]
        if "paid" in row.keys():
            result["paid"] = row["paid"]
    return result


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
    config_json = json.loads(row["config_json"]) if row["config_json"] else None
    mode = config_json.get("mode", "create") if config_json else "create"
    tariff = get_tariff(row["api_key_id"])
    price = 0
    if tariff:
        if mode == "reschedule":
            price = tariff["price_reschedule"]
        else:
            price = tariff["price_create"]
    conn.execute(
        "UPDATE usage_log SET price = ? WHERE id = ?",
        (price, usage_log_id),
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
                "price": r["price"],
                "paid": bool(r["paid"]) if r["paid"] is not None else None,
            }
        )
    return result


def get_tariff(api_key_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM tariffs WHERE api_key_id = ?", (api_key_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "api_key_id": row["api_key_id"],
        "price_create": row["price_create"],
        "price_reschedule": row["price_reschedule"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_tariff(api_key_id: int, price_create: int, price_reschedule: int) -> dict:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    cursor = conn.execute(
        "INSERT INTO tariffs (api_key_id, price_create, price_reschedule, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (api_key_id, price_create, price_reschedule, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM tariffs WHERE api_key_id = ?", (api_key_id,)).fetchone()
    conn.close()
    return {
        "id": row["id"],
        "api_key_id": row["api_key_id"],
        "price_create": row["price_create"],
        "price_reschedule": row["price_reschedule"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def update_tariff(api_key_id: int, price_create: int | None = None, price_reschedule: int | None = None) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM tariffs WHERE api_key_id = ?", (api_key_id,)).fetchone()
    if not row:
        conn.close()
        return None
    now = datetime.now(UTC).isoformat()
    price_create = price_create if price_create is not None else row["price_create"]
    price_reschedule = price_reschedule if price_reschedule is not None else row["price_reschedule"]
    conn.execute(
        "UPDATE tariffs SET price_create = ?, price_reschedule = ?, updated_at = ? WHERE api_key_id = ?",
        (price_create, price_reschedule, now, api_key_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM tariffs WHERE api_key_id = ?", (api_key_id,)).fetchone()
    conn.close()
    return {
        "id": row["id"],
        "api_key_id": row["api_key_id"],
        "price_create": row["price_create"],
        "price_reschedule": row["price_reschedule"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def delete_tariff(api_key_id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM tariffs WHERE api_key_id = ?", (api_key_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def list_withdrawals() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM withdrawals ORDER BY created_at DESC").fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "percent": row["percent"],
            "requisites": row["requisites"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def get_withdrawal(withdrawal_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM withdrawals WHERE id = ?", (withdrawal_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "percent": row["percent"],
        "requisites": row["requisites"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_withdrawal(name: str, percent: int, requisites: str) -> dict:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    cursor = conn.execute(
        "INSERT INTO withdrawals (name, percent, requisites, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (name, percent, requisites, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM withdrawals WHERE id = ?", (cursor.lastrowid,)).fetchone()
    conn.close()
    return {
        "id": row["id"],
        "name": row["name"],
        "percent": row["percent"],
        "requisites": row["requisites"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def update_withdrawal(
    withdrawal_id: int, name: str | None = None, percent: int | None = None, requisites: str | None = None
) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM withdrawals WHERE id = ?", (withdrawal_id,)).fetchone()
    if not row:
        conn.close()
        return None
    now = datetime.now(UTC).isoformat()
    name = name if name is not None else row["name"]
    percent = percent if percent is not None else row["percent"]
    requisites = requisites if requisites is not None else row["requisites"]
    conn.execute(
        "UPDATE withdrawals SET name = ?, percent = ?, requisites = ?, updated_at = ? WHERE id = ?",
        (name, percent, requisites, now, withdrawal_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM withdrawals WHERE id = ?", (withdrawal_id,)).fetchone()
    conn.close()
    return {
        "id": row["id"],
        "name": row["name"],
        "percent": row["percent"],
        "requisites": row["requisites"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def delete_withdrawal(withdrawal_id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM withdrawals WHERE id = ?", (withdrawal_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def update_usage_log(usage_log_id: int, price: int | None = None, paid: bool | None = None) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    if not row:
        conn.close()
        return None
    price = price if price is not None else row["price"]
    paid = paid if paid is not None else row["paid"]
    conn.execute(
        "UPDATE usage_log SET price = ?, paid = ? WHERE id = ?",
        (price, 1 if paid else 0 if paid is False else None, usage_log_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    conn.close()
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
        "price": row["price"],
        "paid": bool(row["paid"]) if row["paid"] is not None else None,
    }


init_db()
