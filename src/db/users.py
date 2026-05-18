"""
EOPP Captcha Solver - Users.

CRUD для пользователей (участники выплат).
"""

from datetime import UTC, datetime

from src.db.connection import get_connection


def _row_to_dict(row):
    return dict(zip(row.keys(), row))


def create_user(name: str) -> dict:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    cursor = conn.execute(
        "INSERT INTO users (name, created_at) VALUES (?, ?)",
        (name, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    conn.close()
    return _row_to_dict(row)


def list_users() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM users ORDER BY name").fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_user_by_id(user_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def update_user(user_id: int, name: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        return None
    conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return _row_to_dict(row)


def delete_user(user_id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted