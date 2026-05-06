"""
EOPP Captcha Solver - Tariffs.

CRUD операции для тарифов.
"""

from datetime import UTC, datetime

from src.db.connection import get_connection


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
