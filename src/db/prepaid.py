"""Prepaid packages and deductions."""

from datetime import UTC, datetime

from src.db.connection import get_connection


def _package_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "api_key_id": row["api_key_id"],
        "balance_amount": row["balance_amount"],
        "active": bool(row["active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_prepaid_packages() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM prepaid_packages ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_package_to_dict(row) for row in rows]


def create_prepaid_package(api_key_id: int, balance_amount: int, active: bool = True) -> dict:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    conn.execute(
        """INSERT INTO prepaid_packages (api_key_id, balance_amount, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (api_key_id, balance_amount, 1 if active else 0, now, now),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM prepaid_packages WHERE api_key_id = ? ORDER BY id DESC LIMIT 1",
        (api_key_id,),
    ).fetchone()
    conn.close()
    return _package_to_dict(row)


def update_prepaid_package(
    package_id: int,
    balance_amount: int | None = None,
    active: bool | None = None,
) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM prepaid_packages WHERE id = ?", (package_id,)).fetchone()
    if not row:
        conn.close()
        return None
    now = datetime.now(UTC).isoformat()
    next_balance = balance_amount if balance_amount is not None else row["balance_amount"]
    next_active = (1 if active else 0) if active is not None else row["active"]
    conn.execute(
        """UPDATE prepaid_packages
           SET balance_amount = ?, active = ?, updated_at = ?
           WHERE id = ?""",
        (next_balance, next_active, now, package_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM prepaid_packages WHERE id = ?", (package_id,)).fetchone()
    conn.close()
    return _package_to_dict(row)


def delete_prepaid_package(package_id: int) -> bool:
    conn = get_connection()
    cur = conn.execute("DELETE FROM prepaid_packages WHERE id = ?", (package_id,))
    conn.commit()
    deleted = cur.rowcount > 0
    conn.close()
    return deleted


def get_active_prepaid_package(api_key_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        """SELECT * FROM prepaid_packages
           WHERE api_key_id = ? AND active = 1
           ORDER BY id DESC LIMIT 1""",
        (api_key_id,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    return _package_to_dict(row)


def deduct_prepaid_for_usage_tx(conn, api_key_id: int, usage_log_id: int, amount: int) -> bool:
    if amount <= 0:
        return False
    package = conn.execute(
        """SELECT * FROM prepaid_packages
           WHERE api_key_id = ? AND active = 1
           ORDER BY id DESC LIMIT 1""",
        (api_key_id,),
    ).fetchone()
    if not package or package["balance_amount"] < amount:
        return False

    already = conn.execute(
        "SELECT id FROM prepaid_deductions WHERE usage_log_id = ?",
        (usage_log_id,),
    ).fetchone()
    if already:
        return True

    now = datetime.now(UTC).isoformat()
    next_balance = package["balance_amount"] - amount
    conn.execute(
        "UPDATE prepaid_packages SET balance_amount = ?, updated_at = ? WHERE id = ?",
        (next_balance, now, package["id"]),
    )
    conn.execute(
        """INSERT INTO prepaid_deductions (package_id, usage_log_id, amount, created_at)
           VALUES (?, ?, ?, ?)""",
        (package["id"], usage_log_id, amount, now),
    )
    conn.execute("UPDATE usage_log SET paid = 1 WHERE id = ?", (usage_log_id,))
    return True


def deduct_prepaid_for_usage(api_key_id: int, usage_log_id: int, amount: int) -> bool:
    conn = get_connection()
    try:
        deducted = deduct_prepaid_for_usage_tx(conn, api_key_id, usage_log_id, amount)
        conn.commit()
        return deducted
    finally:
        conn.close()
