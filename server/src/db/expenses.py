"""
EOPP Captcha Solver - Expenses.

CRUD операции для расходов.
"""

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

    # Batch allocation status
    if result:
        conn2 = get_connection()
        ids = [e["id"] for e in result]
        placeholders = ",".join("?" * len(ids))
        alloc_rows = conn2.execute(
            f"SELECT expense_id, COALESCE(SUM(amount), 0) as allocated FROM payout_expenses WHERE expense_id IN ({placeholders}) GROUP BY expense_id",
            ids,
        ).fetchall()
        conn2.close()
        alloc_map = {r["expense_id"]: float(r["allocated"]) for r in alloc_rows}

        for exp in result:
            original = float(exp["amount"])
            allocated = alloc_map.get(exp["id"], 0.0)
            pct = (allocated / original * 100) if original > 0 else 0.0
            if allocated <= 0:
                status = "unallocated"
            elif allocated >= original - 0.01:
                status = "fully_allocated"
            else:
                status = "partially_allocated"
            exp["allocation"] = {
                "original_amount": original,
                "allocated_amount": allocated,
                "allocated_pct": round(pct, 1),
                "status": status,
            }

    return result


def get_total_expenses() -> int:
    conn = get_connection()
    row = conn.execute("SELECT COALESCE(SUM(amount), 0) as total FROM expenses").fetchone()
    conn.close()
    return row["total"] if row else 0
