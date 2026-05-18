"""
EOPP Captcha Solver - Expenses.

CRUD операции для расходов.
"""

from datetime import UTC, datetime

from src.db.connection import get_connection


def _row_to_dict(row):
    return {
        "id": row["id"],
        "amount": row["amount"],
        "reason": row["reason"],
        "comment": row["comment"],
        "user_id": row["user_id"],
        "created_at": row["created_at"],
    }


def create_expense(amount: int, reason: str, user_id: int | None, comment: str = "") -> dict:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    cursor = conn.execute(
        "INSERT INTO expenses (amount, reason, comment, user_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (amount, reason, comment, user_id, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM expenses WHERE id = ?", (cursor.lastrowid,)).fetchone()
    conn.close()
    return _row_to_dict(row)


def list_expenses() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT e.*, u.name as user_name
        FROM expenses e
        LEFT JOIN users u ON e.user_id = u.id
        ORDER BY e.created_at DESC
        """
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = _row_to_dict(row)
        d["user_name"] = row["user_name"] if row["user_name"] else None
        result.append(d)
    return result


def get_expense_by_id(expense_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def update_expense(expense_id: int, amount: int | None = None, reason: str | None = None, comment: str | None = None, user_id: int | None = None) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if not row:
        conn.close()
        return None

    current = _row_to_dict(row)
    amount = amount if amount is not None else current["amount"]
    reason = reason if reason is not None else current["reason"]
    comment = comment if comment is not None else current["comment"]
    user_id = user_id if user_id is not None else current["user_id"]

    conn.execute(
        "UPDATE expenses SET amount = ?, reason = ?, comment = ?, user_id = ? WHERE id = ?",
        (amount, reason, comment, user_id, expense_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    conn.close()
    return _row_to_dict(row)


def delete_expense(expense_id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def get_total_expenses() -> int:
    conn = get_connection()
    row = conn.execute("SELECT COALESCE(SUM(amount), 0) as total FROM expenses").fetchone()
    conn.close()
    return row["total"] if row else 0


def get_total_expenses_by_user(user_id: int) -> int:
    conn = get_connection()
    row = conn.execute("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    return row["total"] if row else 0