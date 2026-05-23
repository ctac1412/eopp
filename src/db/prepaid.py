"""Prepaid packages and deductions."""

from datetime import UTC, datetime

from sqlalchemy import delete, select, update

from src.db.connection import get_connection
from src.db.core import get_engine, prepaid_packages_table
from src.dto.billing import PrepaidPackageDTO


def _package_to_dict(row) -> dict:
    return PrepaidPackageDTO(
        id=row["id"],
        api_key_id=row["api_key_id"],
        balance_amount=row["balance_amount"],
        active=bool(row["active"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    ).to_dict()


def list_prepaid_packages() -> list[dict]:
    with get_engine().connect() as conn:
        rows = conn.execute(
            select(prepaid_packages_table).order_by(prepaid_packages_table.c.created_at.desc())
        ).mappings().all()
    return [_package_to_dict(row) for row in rows]


def create_prepaid_package(api_key_id: int, balance_amount: int, active: bool = True) -> dict:
    now = datetime.now(UTC).isoformat()
    with get_engine().begin() as conn:
        conn.execute(
            prepaid_packages_table.insert().values(
                api_key_id=api_key_id,
                balance_amount=balance_amount,
                active=bool(active),
                created_at=now,
                updated_at=now,
            )
        )
    with get_engine().connect() as conn:
        row = conn.execute(
            select(prepaid_packages_table)
            .where(prepaid_packages_table.c.api_key_id == api_key_id)
            .order_by(prepaid_packages_table.c.id.desc())
            .limit(1)
        ).mappings().first()
    return _package_to_dict(row)


def update_prepaid_package(
    package_id: int,
    balance_amount: int | None = None,
    active: bool | None = None,
) -> dict | None:
    with get_engine().connect() as conn:
        row = conn.execute(
            select(prepaid_packages_table).where(prepaid_packages_table.c.id == package_id)
        ).mappings().first()
    if not row:
        return None
    now = datetime.now(UTC).isoformat()
    next_balance = balance_amount if balance_amount is not None else row["balance_amount"]
    next_active = (1 if active else 0) if active is not None else row["active"]
    with get_engine().begin() as conn:
        conn.execute(
            update(prepaid_packages_table)
            .where(prepaid_packages_table.c.id == package_id)
            .values(
                balance_amount=next_balance,
                active=next_active,
                updated_at=now,
            )
        )
    with get_engine().connect() as conn:
        row = conn.execute(
            select(prepaid_packages_table).where(prepaid_packages_table.c.id == package_id)
        ).mappings().first()
    return _package_to_dict(row)


def delete_prepaid_package(package_id: int) -> bool:
    with get_engine().begin() as conn:
        cur = conn.execute(delete(prepaid_packages_table).where(prepaid_packages_table.c.id == package_id))
    deleted = cur.rowcount > 0
    return deleted


def get_active_prepaid_package(api_key_id: int) -> dict | None:
    with get_engine().connect() as conn:
        row = conn.execute(
            select(prepaid_packages_table)
            .where(
                prepaid_packages_table.c.api_key_id == api_key_id,
                prepaid_packages_table.c.active == 1,
            )
            .order_by(prepaid_packages_table.c.id.desc())
            .limit(1)
        ).mappings().first()
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
