"""
EOPP Captcha Solver - Withdrawals.

CRUD операции для способов вывода.
"""

from datetime import UTC, datetime

from src.db.connection import get_connection


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
