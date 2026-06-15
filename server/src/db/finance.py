"""Finance ledger helpers for usage income, payouts, and profit lots."""

from __future__ import annotations

from datetime import UTC, datetime

from src.db.connection import get_connection
from src.db.connection import row_to_dict as _row_to_dict

INVOICE_USAGE_KINDS = ("customer_income", "executor_salary", "operator_salary")


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _placeholders(values: list[int]) -> str:
    return ",".join("?" * len(values))


def upsert_finance_entry(
    conn,
    *,
    kind: str,
    amount: int,
    source_key: str,
    company_id: int | None = None,
    usage_log_id: int | None = None,
    invoice_id: int | None = None,
    payout_id: int | None = None,
    expense_id: int | None = None,
    profit_lot_id: int | None = None,
    distribution_answer_id: int | None = None,
    user_id: int | None = None,
    source: str = "system",
    comment: str = "",
) -> int:
    """Insert or update an open system finance entry by source_key."""

    now = _now()
    existing = conn.execute(
        "SELECT id, edit_state, payout_id FROM finance_entries WHERE source_key = ?",
        (source_key,),
    ).fetchone()
    if existing:
        if existing["edit_state"] != "open" or existing["payout_id"] is not None:
            return int(existing["id"])
        conn.execute(
            """
            UPDATE finance_entries
               SET company_id = ?, usage_log_id = ?, invoice_id = ?, payout_id = ?,
                   expense_id = ?, profit_lot_id = ?, distribution_answer_id = ?,
                   user_id = ?, kind = ?, amount = ?, source = ?, comment = ?,
                   updated_at = ?
             WHERE id = ?
            """,
            (
                company_id,
                usage_log_id,
                invoice_id,
                payout_id,
                expense_id,
                profit_lot_id,
                distribution_answer_id,
                user_id,
                kind,
                int(amount),
                source,
                comment,
                now,
                existing["id"],
            ),
        )
        return int(existing["id"])

    cur = conn.execute(
        """
        INSERT INTO finance_entries (
            company_id, usage_log_id, invoice_id, payout_id, expense_id,
            profit_lot_id, distribution_answer_id, user_id, kind, amount,
            edit_state, source, source_key, comment, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
        """,
        (
            company_id,
            usage_log_id,
            invoice_id,
            payout_id,
            expense_id,
            profit_lot_id,
            distribution_answer_id,
            user_id,
            kind,
            int(amount),
            source,
            source_key,
            comment,
            now,
            now,
        ),
    )
    return int(cur.lastrowid)


def usage_income_amount(conn, usage_log_id: int) -> int | None:
    row = conn.execute(
        """
        SELECT amount
        FROM finance_entries
        WHERE usage_log_id = ? AND kind = 'customer_income'
        ORDER BY id DESC
        LIMIT 1
        """,
        (usage_log_id,),
    ).fetchone()
    return int(row["amount"]) if row else None


def create_usage_finance_entries(conn, usage_log_id: int, price: int) -> None:
    """Create all usage-scoped finance entries that are known at billing time."""

    usage = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    if usage is None:
        raise ValueError(f"usage_log {usage_log_id} not found")
    company_id = usage["company_id"]
    upsert_finance_entry(
        conn,
        kind="customer_income",
        amount=int(price),
        company_id=company_id,
        usage_log_id=usage_log_id,
        invoice_id=usage["invoice_id"],
        source_key=f"usage:{usage_log_id}:income",
        comment="Usage customer income",
    )
    executor = _executor_entry(conn, usage_log_id, company_id)
    if executor:
        upsert_finance_entry(
            conn,
            kind="executor_salary",
            amount=-int(executor["amount"]),
            company_id=company_id,
            usage_log_id=usage_log_id,
            invoice_id=usage["invoice_id"],
            user_id=executor["user_id"],
            source_key=f"usage:{usage_log_id}:executor",
            comment="Usage executor salary",
        )
    for operator in _operator_entries(conn, usage_log_id):
        upsert_finance_entry(
            conn,
            kind="operator_salary",
            amount=-int(operator["amount"]),
            company_id=company_id,
            usage_log_id=usage_log_id,
            invoice_id=usage["invoice_id"],
            user_id=operator["user_id"],
            distribution_answer_id=operator["distribution_answer_id"],
            source_key=f"operator-answer:{operator['distribution_answer_id']}",
            comment="Operator icon salary",
        )


def recalculate_usage_finance_entries(usage_log_id: int) -> list[dict]:
    """Rebuild open automatic finance entries from the current usage log price."""

    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        usage = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
        if usage is None:
            conn.execute("ROLLBACK")
            raise ValueError(f"usage_log {usage_log_id} not found")
        if usage["price"] is None:
            conn.execute("ROLLBACK")
            raise ValueError(f"usage_log {usage_log_id} has no price")
        conn.execute(
            """
            DELETE FROM finance_entries
            WHERE usage_log_id = ?
              AND kind IN ('customer_income', 'executor_salary', 'operator_salary')
              AND source = 'system'
              AND edit_state = 'open'
              AND payout_id IS NULL
            """,
            (usage_log_id,),
        )
        create_usage_finance_entries(conn, usage_log_id, int(usage["price"]))
        if usage["invoice_id"] is not None:
            rebuild_profit_lots(conn, int(usage["invoice_id"]), [usage_log_id])
        conn.commit()
        rows = conn.execute(
            """
            SELECT fe.*, u.name AS user_name, u.login AS user_login
            FROM finance_entries fe
            LEFT JOIN users u ON u.id = fe.user_id
            WHERE fe.usage_log_id = ?
            ORDER BY fe.created_at DESC, fe.id DESC
            """,
            (usage_log_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise
    finally:
        conn.close()


def _executor_entry(conn, usage_log_id: int, company_id: int | None) -> dict | None:
    if company_id is None:
        return None
    row = conn.execute(
        """
        SELECT ak.user_id AS user_id, COALESCE(ct.executor_amount, 0) AS amount
        FROM usage_log ul
        JOIN api_keys ak ON ak.id = ul.api_key_id
        JOIN company_tariffs ct ON ct.company_id = ul.company_id
        WHERE ul.id = ?
          AND ul.company_id IS NOT NULL
          AND ak.user_id IS NOT NULL
          AND COALESCE(ct.executor_amount, 0) > 0
        """,
        (usage_log_id,),
    ).fetchone()
    if not row or row["user_id"] is None:
        return None
    return {"user_id": int(row["user_id"]), "amount": int(row["amount"] or 0)}


def _operator_entries(conn, usage_log_id: int) -> list[dict]:
    rows = conn.execute(
        """
        WITH usage_executor AS (
            SELECT ak.user_id AS user_id
            FROM usage_log ul
            JOIN api_keys ak ON ak.id = ul.api_key_id
            WHERE ul.id = ? AND ul.company_id IS NOT NULL
        ),
        successful_captchas AS (
            SELECT DISTINCT captcha_id
            FROM captchas
            WHERE usage_log_id = ?
              AND status IN ('passed', 'confirmed')
        )
        SELECT
            da.id AS distribution_answer_id,
            op.user_id,
            CASE
                WHEN COALESCE(o.billing_mode, 'company') = 'custom' THEN COALESCE(o.icon_rate, 0)
                ELSE COALESCE(ct.operator_amount, 0)
            END AS amount
        FROM distribution_answers da
        JOIN usage_log ul ON ul.id = da.usage_log_id
        JOIN successful_captchas sc ON sc.captcha_id = da.captcha_id
        JOIN operators o ON o.id = da.operator_id
        LEFT JOIN company_tariffs ct ON ct.company_id = ul.company_id
        JOIN operator_profiles op ON op.operator_id = o.id AND op.active = 1
        LEFT JOIN usage_executor ue ON 1 = 1
        WHERE da.usage_log_id = ?
          AND COALESCE(o.billing_mode, 'company') != 'free'
          AND CASE
                WHEN COALESCE(o.billing_mode, 'company') = 'custom' THEN COALESCE(o.icon_rate, 0)
                ELSE COALESCE(ct.operator_amount, 0)
              END > 0
          AND (ue.user_id IS NULL OR op.user_id != ue.user_id)
        ORDER BY da.id
        """,
        (usage_log_id, usage_log_id, usage_log_id),
    ).fetchall()
    return [
        {
            "distribution_answer_id": int(row["distribution_answer_id"]),
            "user_id": int(row["user_id"]),
            "amount": int(row["amount"] or 0),
        }
        for row in rows
    ]


def link_usage_entries_to_invoice(
    conn,
    invoice_id: int,
    usage_log_ids: list[int],
    *,
    percent_amount: int = 0,
    tax_amount: int = 0,
    tax_commission_mode: str = "added",
    commission_user_id: int | None = None,
    tax_user_id: int | None = None,
) -> None:
    if not usage_log_ids:
        return
    placeholders = _placeholders(usage_log_ids)
    conflicts = conn.execute(
        f"""
        SELECT usage_log_id, COUNT(DISTINCT invoice_id) AS invoice_count
        FROM finance_entries
        WHERE usage_log_id IN ({placeholders})
          AND invoice_id IS NOT NULL
          AND invoice_id != ?
        GROUP BY usage_log_id
        """,
        [*usage_log_ids, invoice_id],
    ).fetchall()
    if conflicts:
        raise ValueError("usage log finance entries already belong to another invoice")

    conn.execute(
        f"""
        UPDATE finance_entries
           SET invoice_id = ?, updated_at = ?
         WHERE usage_log_id IN ({placeholders})
           AND kind IN ({",".join("?" * len(INVOICE_USAGE_KINDS))})
           AND payout_id IS NULL
        """,
        [invoice_id, _now(), *usage_log_ids, *INVOICE_USAGE_KINDS],
    )

    charge_sign = -1 if tax_commission_mode == "included" else 1
    _create_invoice_charge_entries(
        conn,
        invoice_id,
        usage_log_ids,
        "invoice_commission",
        charge_sign * int(percent_amount or 0),
        "commission",
        commission_user_id,
    )
    _create_invoice_charge_entries(
        conn,
        invoice_id,
        usage_log_ids,
        "invoice_tax",
        charge_sign * int(tax_amount or 0),
        "tax",
        tax_user_id,
    )
    rebuild_profit_lots(conn, invoice_id, usage_log_ids)


def _create_invoice_charge_entries(
    conn,
    invoice_id: int,
    usage_log_ids: list[int],
    kind: str,
    total_amount: int,
    key_suffix: str,
    user_id: int | None = None,
) -> None:
    if not usage_log_ids:
        return
    per_usage = _split_amount(total_amount, len(usage_log_ids))
    for usage_log_id, amount in zip(usage_log_ids, per_usage, strict=True):
        usage = conn.execute(
            "SELECT company_id FROM usage_log WHERE id = ?",
            (usage_log_id,),
        ).fetchone()
        upsert_finance_entry(
            conn,
            kind=kind,
            amount=amount,
            company_id=usage["company_id"] if usage else None,
            usage_log_id=usage_log_id,
            invoice_id=invoice_id,
            user_id=user_id,
            source_key=f"invoice:{invoice_id}:{key_suffix}:usage:{usage_log_id}",
            comment=f"Invoice {key_suffix}",
        )


def _split_amount(total: int, count: int) -> list[int]:
    if count <= 0:
        return []
    sign = -1 if total < 0 else 1
    absolute = abs(int(total))
    base = absolute // count
    remainder = absolute % count
    return [sign * (base + (1 if idx < remainder else 0)) for idx in range(count)]


def rebuild_profit_lots(conn, invoice_id: int, usage_log_ids: list[int] | None = None) -> None:
    if usage_log_ids is None:
        rows = conn.execute(
            "SELECT DISTINCT usage_log_id FROM finance_entries WHERE invoice_id = ? AND usage_log_id IS NOT NULL",
            (invoice_id,),
        ).fetchall()
        usage_log_ids = [int(row["usage_log_id"]) for row in rows]
    for usage_log_id in usage_log_ids:
        payout = conn.execute(
            "SELECT 1 FROM finance_entries WHERE usage_log_id = ? AND payout_id IS NOT NULL LIMIT 1",
            (usage_log_id,),
        ).fetchone()
        if payout:
            continue
        invoice = conn.execute(
            "SELECT tax_commission_mode FROM invoices WHERE id = ?",
            (invoice_id,),
        ).fetchone()
        tax_commission_mode = invoice["tax_commission_mode"] if invoice else "added"
        charge_profit_sql = (
            "amount"
            if tax_commission_mode == "included"
            else "0"
        )
        row = conn.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN kind = 'customer_income' THEN amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN kind IN ('executor_salary', 'operator_salary') THEN amount ELSE 0 END), 0) AS salaries,
                COALESCE(SUM(CASE WHEN kind IN ('invoice_commission', 'invoice_tax') THEN {charge_profit_sql} ELSE 0 END), 0) AS invoice_charges
            FROM finance_entries
            WHERE usage_log_id = ? AND invoice_id = ?
            """.format(charge_profit_sql=charge_profit_sql),
            (usage_log_id, invoice_id),
        ).fetchone()
        usage = conn.execute(
            "SELECT company_id FROM usage_log WHERE id = ?",
            (usage_log_id,),
        ).fetchone()
        gross_amount = int(
            (row["income"] or 0)
            + (row["salaries"] or 0)
            + (row["invoice_charges"] or 0)
        )
        now = _now()
        conn.execute(
            """
            INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(usage_log_id, invoice_id)
            DO UPDATE SET gross_amount = excluded.gross_amount, updated_at = excluded.updated_at
            """,
            (
                usage["company_id"] if usage else None,
                usage_log_id,
                invoice_id,
                gross_amount,
                now,
                now,
            ),
        )


def create_expense_repayments(payout_id: int, expense_repayments: list[dict]) -> list[dict]:
    conn = get_connection()
    created: list[dict] = []
    try:
        conn.execute("BEGIN IMMEDIATE")
        for item in expense_repayments:
            expense_id = int(item["expense_id"])
            requested = int(item["amount"])
            if requested <= 0:
                continue
            remaining_expense = _expense_unpaid_amount(conn, expense_id)
            to_allocate = min(requested, remaining_expense)
            if to_allocate <= 0:
                continue
            for lot in _available_profit_lots(conn):
                if to_allocate <= 0:
                    break
                available = int(lot["available"] or 0)
                amount = min(to_allocate, available)
                if amount <= 0:
                    continue
                source_key = f"profit-lot:{lot['id']}:expense:{expense_id}:payout:{payout_id}"
                entry_id = upsert_finance_entry(
                    conn,
                    kind="expense_repayment",
                    amount=-amount,
                    company_id=lot["company_id"],
                    usage_log_id=lot["usage_log_id"],
                    invoice_id=lot["invoice_id"],
                    payout_id=payout_id,
                    expense_id=expense_id,
                    profit_lot_id=lot["id"],
                    source_key=source_key,
                    comment="Expense repayment",
                )
                conn.execute(
                    "UPDATE finance_entries SET edit_state = 'locked' WHERE id = ?",
                    (entry_id,),
                )
                row = conn.execute("SELECT * FROM finance_entries WHERE id = ?", (entry_id,)).fetchone()
                created.append(_row_to_dict(row))
                to_allocate -= amount
            if to_allocate > 0:
                raise ValueError("expense repayment exceeds available profit")
        conn.commit()
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()
    return created


def _expense_unpaid_amount(conn, expense_id: int) -> int:
    row = conn.execute(
        """
        SELECT e.amount + COALESCE(SUM(fe.amount), 0) AS remaining
        FROM expenses e
        LEFT JOIN finance_entries fe
          ON fe.expense_id = e.id AND fe.kind = 'expense_repayment'
        WHERE e.id = ?
        GROUP BY e.id
        """,
        (expense_id,),
    ).fetchone()
    if not row:
        raise ValueError(f"expense {expense_id} not found")
    return int(row["remaining"] or 0)


def _available_profit_lots(conn) -> list[dict]:
    return [
        _row_to_dict(row)
        for row in conn.execute(
            """
            SELECT
                pl.*,
                pl.gross_amount + COALESCE(SUM(fe.amount), 0) AS available
            FROM profit_lots pl
            JOIN invoices i ON i.id = pl.invoice_id
            LEFT JOIN finance_entries fe ON fe.profit_lot_id = pl.id
            WHERE COALESCE(i.paid, 0) = 1
              AND NOT EXISTS (
                  SELECT 1 FROM finance_entries locked
                  WHERE locked.profit_lot_id = pl.id
                    AND locked.kind = 'director_profit'
              )
            GROUP BY pl.id
            HAVING available > 0
            ORDER BY pl.created_at ASC, pl.id ASC
            """
        ).fetchall()
    ]


def list_finance_entries(filters: dict | None = None) -> list[dict]:
    filters = filters or {}
    conditions = []
    params = []
    for key in ("company_id", "usage_log_id", "invoice_id", "payout_id", "kind", "edit_state"):
        value = filters.get(key)
        if value is not None:
            conditions.append(f"fe.{key} = ?")
            params.append(value)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    conn = get_connection()
    try:
        rows = conn.execute(
            f"""
            SELECT fe.*, u.name AS user_name, u.login AS user_login
            FROM finance_entries fe
            LEFT JOIN users u ON u.id = fe.user_id
            {where}
            ORDER BY fe.created_at DESC, fe.id DESC
            """,
            params,
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def list_profit_lots(filters: dict | None = None) -> list[dict]:
    filters = filters or {}
    conditions = []
    params = []
    for key in ("company_id", "usage_log_id", "invoice_id"):
        value = filters.get(key)
        if value is not None:
            conditions.append(f"pl.{key} = ?")
            params.append(value)
    allocated_expr = "COALESCE(linked.allocated_amount, 0)"
    remaining_expr = f"pl.gross_amount - {allocated_expr}"
    status = filters.get("status")
    if status == "open":
        conditions.append(f"{remaining_expr} > 0")
    elif status == "allocated":
        conditions.append(f"{remaining_expr} <= 0")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    conn = get_connection()
    try:
        rows = conn.execute(
            f"""
            SELECT
                pl.id,
                pl.company_id,
                pl.usage_log_id,
                pl.invoice_id,
                pl.gross_amount,
                pl.created_at,
                pl.updated_at,
                {allocated_expr} AS allocated_amount,
                {remaining_expr} AS remaining_amount,
                COALESCE(linked.linked_entries_count, 0) AS linked_entries_count,
                i.invoice_number,
                COALESCE(c.name, i.company) AS company_name
            FROM profit_lots pl
            LEFT JOIN invoices i ON i.id = pl.invoice_id
            LEFT JOIN companies c ON c.id = pl.company_id
            LEFT JOIN (
                SELECT
                    profit_lot_id,
                    SUM(ABS(amount)) AS allocated_amount,
                    COUNT(*) AS linked_entries_count
                FROM finance_entries
                WHERE profit_lot_id IS NOT NULL
                GROUP BY profit_lot_id
            ) linked ON linked.profit_lot_id = pl.id
            {where}
            ORDER BY pl.created_at DESC, pl.id DESC
            """,
            params,
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def create_manual_entry(payload: dict) -> dict:
    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        entry_id = upsert_finance_entry(
            conn,
            kind=payload.get("kind") or "manual_adjustment",
            amount=int(payload.get("amount") or 0),
            company_id=payload.get("company_id"),
            usage_log_id=payload.get("usage_log_id"),
            invoice_id=payload.get("invoice_id"),
            payout_id=payload.get("payout_id"),
            expense_id=payload.get("expense_id"),
            profit_lot_id=payload.get("profit_lot_id"),
            distribution_answer_id=payload.get("distribution_answer_id"),
            user_id=payload.get("user_id"),
            source="manual",
            source_key=payload.get("source_key") or f"manual:{_now()}",
            comment=payload.get("comment") or "",
        )
        conn.commit()
        row = conn.execute("SELECT * FROM finance_entries WHERE id = ?", (entry_id,)).fetchone()
        return _row_to_dict(row)
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def update_finance_entry(entry_id: int, payload: dict) -> dict | None:
    allowed = {
        "company_id",
        "usage_log_id",
        "invoice_id",
        "expense_id",
        "profit_lot_id",
        "distribution_answer_id",
        "user_id",
        "kind",
        "amount",
        "comment",
    }
    fields = {key: payload[key] for key in allowed if key in payload}
    if not fields:
        return get_finance_entry(entry_id)
    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        current = conn.execute(
            "SELECT * FROM finance_entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
        if not current or current["edit_state"] != "open" or current["payout_id"] is not None:
            conn.execute("ROLLBACK")
            return None
        assignments = [f"{key} = ?" for key in fields]
        values = [int(value) if key == "amount" else value for key, value in fields.items()]
        assignments.append("updated_at = ?")
        values.append(_now())
        values.append(entry_id)
        conn.execute(
            f"UPDATE finance_entries SET {', '.join(assignments)} WHERE id = ?",
            values,
        )
        conn.commit()
        row = conn.execute("SELECT * FROM finance_entries WHERE id = ?", (entry_id,)).fetchone()
        return _row_to_dict(row)
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def get_finance_entry(entry_id: int) -> dict | None:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM finance_entries WHERE id = ?", (entry_id,)).fetchone()
        return _row_to_dict(row) if row else None
    finally:
        conn.close()


def delete_finance_entry(entry_id: int) -> bool:
    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        current = conn.execute(
            "SELECT edit_state, payout_id FROM finance_entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
        if not current or current["edit_state"] != "open" or current["payout_id"] is not None:
            conn.execute("ROLLBACK")
            return False
        cur = conn.execute("DELETE FROM finance_entries WHERE id = ?", (entry_id,))
        conn.commit()
        return cur.rowcount > 0
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()
