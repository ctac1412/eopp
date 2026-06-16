"""
EOPP Captcha Solver - Payouts.

CRUD для выплат с FIFO компенсацией расходов.
"""

from datetime import UTC, datetime
import re

from src.db.connection import get_connection
from src.db.connection import row_to_dict as _row_to_dict

# ─────────────────────────────────────────────────────────────────────────────
# Низкоуровневые CRUD для payout_invoices / payout_expenses
# ─────────────────────────────────────────────────────────────────────────────


def _link_invoice(payout_id: int, invoice_id: int, amount: float) -> int:
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO payout_invoices (payout_id, invoice_id, amount) VALUES (?, ?, ?)",
        (payout_id, invoice_id, amount),
    )
    conn.commit()
    conn_id = cur.lastrowid
    conn.close()
    return conn_id


def _link_expense(payout_id: int, expense_id: int, amount: float) -> int:
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO payout_expenses (payout_id, expense_id, amount) VALUES (?, ?, ?)",
        (payout_id, expense_id, amount),
    )
    conn.commit()
    conn_id = cur.lastrowid
    conn.close()
    return conn_id


def _lock_finance_entries_for_payout(payout_id: int, invoice_ids: list[int]) -> None:
    if not invoice_ids:
        return

    placeholders = ",".join("?" * len(invoice_ids))
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    try:
        row = conn.execute(
            f"""
            SELECT id, payout_id
            FROM finance_entries
            WHERE invoice_id IN ({placeholders})
              AND payout_id IS NOT NULL
              AND payout_id != ?
            LIMIT 1
            """,
            [*invoice_ids, payout_id],
        ).fetchone()
        if row:
            raise ValueError(
                f"finance entry {row['id']} is already linked to payout {row['payout_id']}"
            )

        conn.execute(
            f"""
            UPDATE finance_entries
            SET payout_id = ?,
                edit_state = 'locked',
                updated_at = ?
            WHERE invoice_id IN ({placeholders})
              AND payout_id IS NULL
            """,
            [payout_id, now, *invoice_ids],
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _create_director_profit_entries_for_payout(
    payout_id: int,
    invoice_ids: list[int],
    user_splits: list[dict],
) -> None:
    if not invoice_ids or not user_splits:
        return

    placeholders = ",".join("?" * len(invoice_ids))
    conn = get_connection()
    try:
        profit_splits = [
            {"user_id": int(us["user_id"]), "split_pct": float(us["split_pct"])}
            for us in user_splits
            if us.get("user_id") is not None
        ]
        total_split_pct = sum(us["split_pct"] for us in profit_splits)
        if total_split_pct <= 0:
            return

        lots = conn.execute(
            f"""
            SELECT
                pl.id,
                pl.company_id,
                pl.usage_log_id,
                pl.invoice_id,
                pl.gross_amount + COALESCE(SUM(fe.amount), 0) AS available
            FROM profit_lots pl
            LEFT JOIN finance_entries fe ON fe.profit_lot_id = pl.id
            WHERE pl.invoice_id IN ({placeholders})
            GROUP BY pl.id
            ORDER BY pl.created_at ASC, pl.id ASC
            """,
            invoice_ids,
        ).fetchall()
        now = datetime.now(UTC).isoformat()
        for lot in lots:
            available = round(float(lot["available"] or 0), 2)
            if available <= 0:
                continue
            allocated = 0.0
            for idx, split in enumerate(profit_splits):
                if idx == len(profit_splits) - 1:
                    share = round(available - allocated, 2)
                else:
                    share = round(available * split["split_pct"] / total_split_pct, 2)
                    allocated = round(allocated + share, 2)
                if share <= 0:
                    continue
                source_key = f"payout:{payout_id}:profit_lot:{lot['id']}:director:{split['user_id']}"
                conn.execute(
                    """
                    INSERT INTO finance_entries (
                        company_id, usage_log_id, invoice_id, payout_id, profit_lot_id,
                        user_id, kind, amount, edit_state, source, source_key, comment,
                        created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'director_profit', ?, 'locked', 'system', ?, '', ?, ?)
                    ON CONFLICT(source_key) DO UPDATE SET
                        amount = excluded.amount,
                        updated_at = excluded.updated_at
                    """,
                    (
                        lot["company_id"],
                        lot["usage_log_id"],
                        lot["invoice_id"],
                        payout_id,
                        lot["id"],
                        split["user_id"],
                        -share,
                        source_key,
                        now,
                        now,
                    ),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _attach_user_names(conn, shares: list[dict]) -> list[dict]:
    user_ids = sorted({int(share["user_id"]) for share in shares if share.get("user_id") is not None})
    if not user_ids:
        return shares
    placeholders = ",".join("?" * len(user_ids))
    rows = conn.execute(
        f"SELECT id, name FROM users WHERE id IN ({placeholders})",
        user_ids,
    ).fetchall()
    names = {int(row["id"]): row["name"] for row in rows}
    for share in shares:
        user_id = share.get("user_id")
        if user_id is not None:
            share["user_name"] = names.get(int(user_id))
    return shares


def _share_total(share: dict) -> float:
    return (
        float(share.get("profit_share") or 0)
        + float(share.get("commission_amount") or 0)
        + float(share.get("tax_amount") or 0)
        + float(share.get("expenses_compensation") or 0)
        + float(share.get("operator_amount") or 0)
        + float(share.get("executor_amount") or 0)
    )


def _ensure_profit_lots_for_invoices(invoice_ids: list[int]) -> None:
    if not invoice_ids:
        return
    from src.db.finance import rebuild_profit_lots, sync_invoice_item_finance_entries

    conn = get_connection()
    try:
        for invoice_id in invoice_ids:
            rows = conn.execute(
                """
                SELECT id, usage_log_id, source_key
                FROM finance_entries
                WHERE invoice_id = ?
                  AND kind = 'customer_income'
                """,
                (invoice_id,),
            ).fetchall()
            usage_log_ids: list[int] = []
            for row in rows:
                usage_log_id = row["usage_log_id"]
                if usage_log_id is None:
                    match = re.match(r"usage:(\d+):income$", row["source_key"] or "")
                    if match:
                        usage_log_id = int(match.group(1))
                        conn.execute(
                            "UPDATE finance_entries SET usage_log_id = ? WHERE id = ?",
                            (usage_log_id, row["id"]),
                        )
                if usage_log_id is not None:
                    usage_log_ids.append(int(usage_log_id))
            if usage_log_ids:
                rebuild_profit_lots(conn, invoice_id, usage_log_ids)
            sync_invoice_item_finance_entries(conn, invoice_id)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _expense_repayment_preview_allocations(expense_repayments: list[dict]) -> tuple[float, dict[int, float]]:
    repayment_total = 0.0
    repayment_by_user: dict[int, float] = {}
    if not expense_repayments:
        return repayment_total, repayment_by_user

    conn = get_connection()
    try:
        for item in expense_repayments:
            expense_id = item.get("expense_id")
            requested = float(item.get("amount") or 0)
            if expense_id is None or requested <= 0:
                continue
            row = conn.execute(
                """
                SELECT e.user_id,
                       MAX(
                           e.amount
                           - COALESCE(pe.allocated_amount, 0)
                           - COALESCE(fe.repaid_amount, 0),
                           0
                       ) AS remaining
                FROM expenses e
                LEFT JOIN (
                    SELECT expense_id, SUM(amount) AS allocated_amount
                    FROM payout_expenses
                    WHERE expense_id = ?
                    GROUP BY expense_id
                ) pe ON pe.expense_id = e.id
                LEFT JOIN (
                    SELECT expense_id, SUM(ABS(amount)) AS repaid_amount
                    FROM finance_entries
                    WHERE expense_id = ?
                      AND kind = 'expense_repayment'
                    GROUP BY expense_id
                ) fe ON fe.expense_id = e.id
                WHERE e.id = ?
                """,
                (expense_id, expense_id, expense_id),
            ).fetchone()
            if not row:
                continue
            amount = min(requested, float(row["remaining"] or 0))
            if amount <= 0:
                continue
            repayment_total += amount
            if row["user_id"]:
                user_id = int(row["user_id"])
                repayment_by_user[user_id] = repayment_by_user.get(user_id, 0.0) + amount
    finally:
        conn.close()
    return repayment_total, repayment_by_user


def validate_expense_repayments_available_profit(
    invoice_ids: list[int],
    expense_repayments: list[dict],
) -> tuple[bool, float, float]:
    """Return whether selected paid invoice lots can fund requested repayments."""

    if not expense_repayments:
        return True, 0.0, 0.0
    _ensure_profit_lots_for_invoices(invoice_ids)
    repayment_total, _ = _expense_repayment_preview_allocations(expense_repayments)
    from src.db.finance import available_profit_amount

    available = float(available_profit_amount(invoice_ids))
    return repayment_total <= available + 0.01, repayment_total, available


def _apply_expense_repayment_allocations(
    calc: dict,
    repayment_total: float,
    repayment_by_user: dict[int, float],
) -> tuple[float, list[dict]]:
    adjusted_net = calc["net"] - repayment_total
    shares = [dict(share) for share in calc["payout_shares"]]

    profit_shares = [share for share in shares if float(share.get("split_pct") or 0) > 0]
    total_split_pct = sum(float(share.get("split_pct") or 0) for share in profit_shares)
    remaining_profit = max(adjusted_net, 0.0)
    allocated_profit = 0.0
    for index, share in enumerate(profit_shares):
        if total_split_pct <= 0:
            profit = 0.0
        elif index == len(profit_shares) - 1:
            profit = round(remaining_profit - allocated_profit, 2)
        else:
            profit = round(remaining_profit * float(share.get("split_pct") or 0) / total_split_pct, 2)
            allocated_profit += profit
        share["profit_share"] = profit

    if repayment_by_user:
        shares_by_user = {int(share["user_id"]): share for share in shares if share.get("user_id") is not None}
        for user_id, amount in repayment_by_user.items():
            share = shares_by_user.get(user_id)
            if not share:
                share = {
                    "user_id": user_id,
                    "split_pct": 0.0,
                    "commission_amount": 0.0,
                    "tax_amount": 0.0,
                    "expenses_compensation": 0.0,
                    "operator_icons": 0,
                    "operator_amount": 0.0,
                    "executor_count": 0,
                    "executor_amount": 0.0,
                    "profit_share": 0.0,
                    "total": 0.0,
                }
                shares.append(share)
                shares_by_user[user_id] = share
            share["expenses_compensation"] = float(share.get("expenses_compensation") or 0) + amount

    for share in shares:
        share["total"] = _share_total(share)

    conn = get_connection()
    try:
        shares = _attach_user_names(conn, shares)
    finally:
        conn.close()
    return adjusted_net, shares


def _release_finance_entries_for_pending_payout(payout_id: int) -> None:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    try:
        conn.execute(
            "DELETE FROM finance_entries WHERE payout_id = ? AND kind IN ('director_profit', 'expense_repayment')",
            (payout_id,),
        )
        conn.execute(
            """
            UPDATE finance_entries
            SET payout_id = NULL,
                edit_state = 'open',
                updated_at = ?
            WHERE payout_id = ?
              AND edit_state = 'locked'
            """,
            (now, payout_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _unlink_invoices(payout_id: int) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM payout_invoices WHERE payout_id = ?", (payout_id,))
    conn.commit()
    conn.close()


def _unlink_expenses(payout_id: int) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM payout_expenses WHERE payout_id = ?", (payout_id,))
    conn.commit()
    conn.close()


def _get_linked_invoices(payout_id: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT pi.*, i.invoice_number, i.company, i.debt_amount, i.percent_amount, i.tax_amount,
                  i.total_amount, i.comment, i.paid, i.commission_user_id, i.tax_user_id,
                  i.created_at as invoice_created_at
           FROM payout_invoices pi
           LEFT JOIN invoices i ON pi.invoice_id = i.id
           WHERE pi.payout_id = ?""",
        (payout_id,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def _user_names(user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    conn = get_connection()
    placeholders = ",".join("?" * len(user_ids))
    rows = conn.execute(
        f"SELECT id, name FROM users WHERE id IN ({placeholders})",
        list(user_ids),
    ).fetchall()
    conn.close()
    return {int(row["id"]): row["name"] for row in rows}


def _calculate_payout_transfers(payout: dict) -> dict:
    received: dict[int, float] = {}
    owed: dict[int, float] = {}
    user_ids: set[int] = set()

    for invoice in payout["invoices"]:
        holder_id = invoice.get("commission_user_id") or invoice.get("tax_user_id")
        if holder_id is None:
            continue
        holder_id = int(holder_id)
        user_ids.add(holder_id)
        received[holder_id] = received.get(holder_id, 0.0) + float(invoice.get("total_amount") or invoice.get("amount") or 0)

    for share in payout["shares"]:
        user_id = share.get("user_id")
        if user_id is None:
            continue
        user_id = int(user_id)
        user_ids.add(user_id)
        owed[user_id] = owed.get(user_id, 0.0) + float(share.get("total") or 0)

    names = _user_names(user_ids)
    balances = []
    for user_id in sorted(user_ids):
        got = round(received.get(user_id, 0.0), 2)
        should_get = round(owed.get(user_id, 0.0), 2)
        balance = round(got - should_get, 2)
        balances.append(
            {
                "user_id": user_id,
                "user_name": names.get(user_id),
                "received_amount": got,
                "owed_amount": should_get,
                "balance": balance,
            }
        )

    debtors = [
        {"user_id": item["user_id"], "amount": item["balance"]}
        for item in balances
        if item["balance"] > 0.01
    ]
    creditors = [
        {"user_id": item["user_id"], "amount": -item["balance"]}
        for item in balances
        if item["balance"] < -0.01
    ]
    transfers = []
    debtor_index = 0
    creditor_index = 0
    while debtor_index < len(debtors) and creditor_index < len(creditors):
        debtor = debtors[debtor_index]
        creditor = creditors[creditor_index]
        amount = round(min(debtor["amount"], creditor["amount"]), 2)
        if amount > 0:
            transfers.append(
                {
                    "from_user_id": debtor["user_id"],
                    "from_user_name": names.get(debtor["user_id"]),
                    "to_user_id": creditor["user_id"],
                    "to_user_name": names.get(creditor["user_id"]),
                    "amount": amount,
                }
            )
        debtor["amount"] = round(debtor["amount"] - amount, 2)
        creditor["amount"] = round(creditor["amount"] - amount, 2)
        if debtor["amount"] <= 0.01:
            debtor_index += 1
        if creditor["amount"] <= 0.01:
            creditor_index += 1

    return {"balances": balances, "transfers": transfers}


def _get_linked_expenses(payout_id: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """
        WITH linked AS (
            SELECT
                pe.id AS id,
                pe.payout_id AS payout_id,
                pe.expense_id AS expense_id,
                pe.amount AS amount
            FROM payout_expenses pe
            WHERE pe.payout_id = ?
            UNION ALL
            SELECT
                MIN(fe.id) AS id,
                fe.payout_id AS payout_id,
                fe.expense_id AS expense_id,
                SUM(ABS(fe.amount)) AS amount
            FROM finance_entries fe
            WHERE fe.payout_id = ?
              AND fe.kind = 'expense_repayment'
              AND fe.expense_id IS NOT NULL
            GROUP BY fe.payout_id, fe.expense_id
        )
        SELECT
            MIN(linked.id) AS id,
            linked.payout_id,
            linked.expense_id,
            SUM(linked.amount) AS amount,
            e.amount AS expense_amount,
            e.reason,
            e.user_id,
            u.company_id
        FROM linked
        LEFT JOIN expenses e ON linked.expense_id = e.id
        LEFT JOIN users u ON e.user_id = u.id
        GROUP BY linked.payout_id, linked.expense_id
        ORDER BY MIN(linked.id)
        """,
        (payout_id, payout_id),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]

# ─────────────────────────────────────────────────────────────────────────────
# Расчёт выплаты (FIFO для расходов)
# ─────────────────────────────────────────────────────────────────────────────


def _operator_payouts_for_invoices(conn, invoice_ids: list[int]) -> dict[int, dict]:
    if not invoice_ids:
        return {}
    placeholders = ",".join("?" * len(invoice_ids))
    rows = conn.execute(
        f"""
        WITH log_executor AS (
            SELECT
                ul.id AS usage_log_id,
                MIN(uec.user_id) AS executor_user_id
            FROM usage_log ul
            LEFT JOIN user_executor_companies uec
              ON ul.company_id IS NOT NULL
             AND uec.active = 1
             AND (uec.company_id = ul.company_id OR uec.company_id IS NULL)
            WHERE ul.invoice_id IN ({placeholders})
            GROUP BY ul.id
        )
        SELECT
            op.user_id AS user_id,
            da.operator_id AS operator_id,
            COUNT(*) AS icons,
            CASE
                WHEN COALESCE(obo.billing_mode, o.billing_mode, 'company') = 'custom'
                    THEN COALESCE(obo.icon_rate, o.icon_rate, 0)
                ELSE COALESCE(ct.operator_amount, 0)
            END AS effective_icon_rate
        FROM distribution_answers da
        JOIN log_executor le ON le.usage_log_id = da.usage_log_id
        JOIN usage_log ul ON ul.id = le.usage_log_id
        JOIN operators o ON o.id = da.operator_id
        LEFT JOIN operator_company_billing_overrides obo
          ON obo.operator_id = o.id
         AND obo.company_id = ul.company_id
        LEFT JOIN company_tariffs ct ON ct.company_id = ul.company_id
        JOIN operator_profiles op ON op.operator_id = o.id AND op.active = 1
        WHERE ul.invoice_id IN ({placeholders})
          AND COALESCE(obo.billing_mode, o.billing_mode, 'company') != 'free'
          AND CASE
                WHEN COALESCE(obo.billing_mode, o.billing_mode, 'company') = 'custom'
                    THEN COALESCE(obo.icon_rate, o.icon_rate, 0)
                ELSE COALESCE(ct.operator_amount, 0)
              END > 0
          AND (le.executor_user_id IS NULL OR op.user_id != le.executor_user_id)
        GROUP BY op.user_id, da.operator_id, effective_icon_rate
        """,
        [*invoice_ids, *invoice_ids],
    ).fetchall()
    payouts: dict[int, dict] = {}
    for row in rows:
        user_id = int(row["user_id"])
        icons = int(row["icons"] or 0)
        amount = float(icons * int(row["effective_icon_rate"] or 0))
        item = payouts.setdefault(user_id, {"operator_icons": 0, "operator_amount": 0.0})
        item["operator_icons"] += icons
        item["operator_amount"] += amount
    return payouts


def _executor_payouts_for_invoices(conn, invoice_ids: list[int]) -> dict[int, dict]:
    if not invoice_ids:
        return {}
    placeholders = ",".join("?" * len(invoice_ids))
    rows = conn.execute(
        f"""
        WITH log_executor AS (
            SELECT
                ul.id AS usage_log_id,
                MIN(uec.user_id) AS user_id,
                COALESCE(ct.executor_amount, 0) AS executor_amount
            FROM usage_log ul
            JOIN company_tariffs ct ON ct.company_id = ul.company_id
            JOIN user_executor_companies uec
              ON uec.active = 1
             AND (uec.company_id = ul.company_id OR uec.company_id IS NULL)
            WHERE ul.invoice_id IN ({placeholders})
              AND ul.company_id IS NOT NULL
              AND COALESCE(ct.executor_amount, 0) > 0
            GROUP BY ul.id, ct.executor_amount
        )
        SELECT user_id, COUNT(*) AS log_count, SUM(executor_amount) AS amount
        FROM log_executor
        WHERE user_id IS NOT NULL
        GROUP BY user_id
        """,
        invoice_ids,
    ).fetchall()
    payouts: dict[int, dict] = {}
    for row in rows:
        user_id = int(row["user_id"])
        payouts[user_id] = {
            "executor_count": int(row["log_count"] or 0),
            "executor_amount": float(row["amount"] or 0),
        }
    return payouts


def _ledger_payout_for_invoices(
    conn,
    invoice_ids: list[int],
    user_splits: list[dict],
) -> dict | None:
    if not invoice_ids:
        return None
    placeholders = ",".join("?" * len(invoice_ids))
    entry_rows = conn.execute(
        f"""
        SELECT *
        FROM finance_entries
        WHERE invoice_id IN ({placeholders})
          AND kind IN (
              'customer_income',
              'executor_salary',
              'operator_salary',
              'invoice_commission',
              'invoice_tax',
              'expense_repayment',
              'director_profit'
          )
        ORDER BY id
        """,
        invoice_ids,
    ).fetchall()
    if not entry_rows:
        return None

    invoice_rows = conn.execute(
        f"SELECT id, COALESCE(debt_amount, 0) AS debt_amount FROM invoices WHERE id IN ({placeholders})",
        invoice_ids,
    ).fetchall()
    invoice_amounts = {int(row["id"]): float(row["debt_amount"] or 0) for row in invoice_rows}
    invoices_total = sum(invoice_amounts.values())

    user_commission: dict[int, float] = {}
    user_tax: dict[int, float] = {}
    operator_payouts: dict[int, dict] = {}
    executor_payouts: dict[int, dict] = {}
    user_expenses_comp: dict[int, float] = {}
    for row in entry_rows:
        uid = row["user_id"]
        if uid is None:
            continue
        uid = int(uid)
        amount = abs(float(row["amount"] or 0))
        if row["kind"] == "invoice_commission":
            user_commission[uid] = user_commission.get(uid, 0.0) + amount
        elif row["kind"] == "invoice_tax":
            user_tax[uid] = user_tax.get(uid, 0.0) + amount
        elif row["kind"] == "operator_salary":
            item = operator_payouts.setdefault(uid, {"operator_icons": 0, "operator_amount": 0.0})
            item["operator_icons"] += 1
            item["operator_amount"] += amount
        elif row["kind"] == "executor_salary":
            item = executor_payouts.setdefault(uid, {"executor_count": 0, "executor_amount": 0.0})
            item["executor_count"] += 1
            item["executor_amount"] += amount
        elif row["kind"] == "expense_repayment":
            user_expenses_comp[uid] = user_expenses_comp.get(uid, 0.0) + amount

    lot_rows = conn.execute(
        f"""
        SELECT
            pl.*,
            pl.gross_amount + COALESCE(SUM(fe.amount), 0) AS available
        FROM profit_lots pl
        LEFT JOIN finance_entries fe ON fe.profit_lot_id = pl.id
        WHERE pl.invoice_id IN ({placeholders})
        GROUP BY pl.id
        ORDER BY pl.created_at ASC, pl.id ASC
        """,
        invoice_ids,
    ).fetchall()
    total_operator_amount = sum(item["operator_amount"] for item in operator_payouts.values())
    total_executor_amount = sum(item["executor_amount"] for item in executor_payouts.values())
    lot_invoice_ids = {int(row["invoice_id"]) for row in lot_rows if row["invoice_id"] is not None}
    missing_lot_invoice_ids = set(invoice_ids) - lot_invoice_ids
    fallback_net = sum(invoice_amounts.get(invoice_id, 0.0) for invoice_id in missing_lot_invoice_ids)
    fallback_net -= sum(
        abs(float(row["amount"] or 0))
        for row in entry_rows
        if int(row["invoice_id"] or 0) in missing_lot_invoice_ids
        and row["kind"] in {"expense_repayment", "operator_salary", "executor_salary"}
    )
    net = sum(max(float(row["available"] or 0), 0.0) for row in lot_rows) + max(fallback_net, 0.0)
    total_compensated = sum(
        abs(float(row["amount"] or 0)) for row in entry_rows if row["kind"] == "expense_repayment"
    )
    already_allocated = sum(
        abs(float(row["amount"] or 0)) for row in entry_rows if row["kind"] == "director_profit"
    )
    if not lot_rows:
        net = invoices_total - total_compensated - total_operator_amount - total_executor_amount

    profit_splits = [us for us in user_splits if us.get("user_id") is not None]
    total_split_pct = sum(us["split_pct"] for us in profit_splits) or 0.0
    profit_shares: dict[int, float] = {}
    normalized_split_pct: dict[int, float] = {}
    for us in profit_splits:
        user_id = int(us["user_id"])
        pct = us["split_pct"]
        normalized_split_pct[user_id] = round(pct * 100 / total_split_pct, 2) if total_split_pct else 0.0
        profit_shares[user_id] = round(net * pct / total_split_pct, 2) if net > 0 and total_split_pct else 0.0

    payout_shares = []
    payout_user_ids = set()
    for us in user_splits:
        uid = int(us["user_id"])
        payout_user_ids.add(uid)
        operator_item = operator_payouts.get(uid, {})
        executor_item = executor_payouts.get(uid, {})
        total = (
            profit_shares.get(uid, 0.0)
            + user_commission.get(uid, 0.0)
            + user_tax.get(uid, 0.0)
            + user_expenses_comp.get(uid, 0.0)
            + operator_item.get("operator_amount", 0.0)
            + executor_item.get("executor_amount", 0.0)
        )
        payout_shares.append(
            {
                "user_id": uid,
                "split_pct": normalized_split_pct.get(uid, 0.0),
                "commission_amount": user_commission.get(uid, 0.0),
                "tax_amount": user_tax.get(uid, 0.0),
                "expenses_compensation": user_expenses_comp.get(uid, 0.0),
                "operator_icons": operator_item.get("operator_icons", 0),
                "operator_amount": operator_item.get("operator_amount", 0.0),
                "executor_count": executor_item.get("executor_count", 0),
                "executor_amount": executor_item.get("executor_amount", 0.0),
                "profit_share": profit_shares.get(uid, 0.0),
                "total": total,
            }
        )

    side_user_ids = set(user_commission) | set(user_tax) | set(user_expenses_comp) | set(operator_payouts) | set(executor_payouts)
    for uid in sorted(side_user_ids):
        if uid in payout_user_ids:
            continue
        operator_item = operator_payouts.get(uid, {})
        executor_item = executor_payouts.get(uid, {})
        total = (
            user_commission.get(uid, 0.0)
            + user_tax.get(uid, 0.0)
            + user_expenses_comp.get(uid, 0.0)
            + operator_item.get("operator_amount", 0.0)
            + executor_item.get("executor_amount", 0.0)
        )
        payout_shares.append(
            {
                "user_id": uid,
                "split_pct": 0.0,
                "commission_amount": user_commission.get(uid, 0.0),
                "tax_amount": user_tax.get(uid, 0.0),
                "expenses_compensation": user_expenses_comp.get(uid, 0.0),
                "operator_icons": operator_item.get("operator_icons", 0),
                "operator_amount": operator_item.get("operator_amount", 0.0),
                "executor_count": executor_item.get("executor_count", 0),
                "executor_amount": executor_item.get("executor_amount", 0.0),
                "profit_share": 0.0,
                "total": total,
            }
        )

    return {
        "invoices_total": invoices_total,
        "total_commission": sum(user_commission.values()),
        "total_tax": sum(user_tax.values()),
        "total_operator_amount": total_operator_amount,
        "total_executor_amount": total_executor_amount,
        "expenses_total": total_compensated,
        "compensated_total": total_compensated,
        "already_allocated": already_allocated,
        "net": net,
        "invoice_links": [{"invoice_id": iid} for iid in invoice_ids],
        "expense_links": [],
        "payout_shares": _attach_user_names(conn, payout_shares),
    }


def calculate_payout(
    invoice_ids: list[int],
    expense_ids: list[int],
    user_splits: list[dict],
    # user_splits: [{"user_id": int, "split_pct": float}, ...]
) -> dict:
    """
    Рассчитывает выплату с FIFO компенсацией расходов, комиссией и налогами.

    1. income = SUM(invoices.debt_amount)  — базовая прибыль до налогов/комиссий
    2. FIFO по expenses.created_at → компенсация из income
    3. net = income - total_compensated
    4. Если net > 0 → делить пропорционально split_pct → profit_share
    5. После: каждому участнику добавить commission_amount и tax_amount по связке из счетов
    6. total = profit_share + expenses_compensation + commission_amount + tax_amount
    """
    conn = get_connection()
    ledger_calc = _ledger_payout_for_invoices(conn, invoice_ids, user_splits)
    if ledger_calc is not None:
        conn.close()
        return ledger_calc

    # 1. Получаем суммы инвойсов (debt_amount = базовая прибыль)
    invoices_total = 0.0
    total_commission = 0.0
    total_tax = 0.0
    if invoice_ids:
        placeholders = ",".join("?" * len(invoice_ids))
        rows = conn.execute(
            f"SELECT COALESCE(SUM(debt_amount), 0) as income, COALESCE(SUM(percent_amount), 0) as commission, COALESCE(SUM(tax_amount), 0) as tax FROM invoices WHERE id IN ({placeholders})",
            invoice_ids,
        ).fetchone()
        invoices_total = float(rows["income"]) if rows else 0.0
        total_commission = float(rows["commission"]) if rows else 0.0
        total_tax = float(rows["tax"]) if rows else 0.0

    # 1.5. Собираем commission и tax по user_id из инвойсов
    user_commission: dict[int, float] = {}
    user_tax: dict[int, float] = {}
    if invoice_ids:
        placeholders = ",".join("?" * len(invoice_ids))
        comm_rows = conn.execute(
            f"SELECT commission_user_id, COALESCE(SUM(percent_amount), 0) as total FROM invoices WHERE id IN ({placeholders}) AND commission_user_id IS NOT NULL GROUP BY commission_user_id",
            invoice_ids,
        ).fetchall()
        for r in comm_rows:
            user_commission[r["commission_user_id"]] = float(r["total"])

        tax_rows = conn.execute(
            f"SELECT tax_user_id, COALESCE(SUM(tax_amount), 0) as total FROM invoices WHERE id IN ({placeholders}) AND tax_user_id IS NOT NULL GROUP BY tax_user_id",
            invoice_ids,
        ).fetchall()
        for r in tax_rows:
            user_tax[r["tax_user_id"]] = float(r["total"])

    # 2. Получаем расходы по FIFO (сортировка по created_at)
    expenses = []
    if expense_ids:
        placeholders = ",".join("?" * len(expense_ids))
        rows = conn.execute(
            f"SELECT e.*, u.name as user_name FROM expenses e LEFT JOIN users u ON e.user_id = u.id WHERE e.id IN ({placeholders}) ORDER BY e.created_at ASC",
            expense_ids,
        ).fetchall()
        expenses = [_row_to_dict(r) for r in rows]

    # 3. FIFO компенсация расходов
    remaining = invoices_total
    compensated: dict[int, float] = {}  # expense_id → compensated amount
    for exp in expenses:
        exp_id = exp["id"]
        exp_amount = float(exp["amount"])
        if remaining <= 0:
            compensated[exp_id] = 0.0
        elif remaining >= exp_amount:
            compensated[exp_id] = exp_amount
            remaining -= exp_amount
        else:
            compensated[exp_id] = remaining
            remaining = 0.0

    total_compensated = sum(compensated.values())
    operator_payouts = _operator_payouts_for_invoices(conn, invoice_ids)
    total_operator_amount = sum(item["operator_amount"] for item in operator_payouts.values())
    executor_payouts = _executor_payouts_for_invoices(conn, invoice_ids)
    total_executor_amount = sum(item["executor_amount"] for item in executor_payouts.values())
    net = invoices_total - total_compensated - total_operator_amount - total_executor_amount

    # 4. Делим net пропорционально split_pct из конфигурации долей.
    profit_splits = [us for us in user_splits if us.get("user_id") is not None]
    profit_shares: dict[int, float] = {}  # user_id → profit_share
    normalized_split_pct: dict[int, float] = {}
    total_split_pct = sum(us["split_pct"] for us in profit_splits) or 0.0

    for us in profit_splits:
        user_id = int(us["user_id"])
        pct = us["split_pct"]
        normalized_split_pct[user_id] = round(pct * 100 / total_split_pct, 2) if total_split_pct else 0.0
        profit_shares[user_id] = round(net * pct / total_split_pct, 2) if net > 0 and total_split_pct else 0.0

    # 5. Итоговые суммы для payout_shares
    # Собираем компенсации по user_id
    user_expenses_comp: dict[int, float] = {}
    for exp in expenses:
        uid = exp.get("user_id")
        if uid:
            user_expenses_comp[uid] = user_expenses_comp.get(uid, 0.0) + compensated.get(
                exp["id"], 0.0
            )

    payout_shares = []
    payout_user_ids = set()
    for us in user_splits:
        uid = int(us["user_id"])
        payout_user_ids.add(uid)
        comm = user_commission.get(uid, 0.0)
        tx = user_tax.get(uid, 0.0)
        exp_comp = user_expenses_comp.get(uid, 0.0)
        operator_item = operator_payouts.get(uid, {})
        operator_amount = operator_item.get("operator_amount", 0.0)
        executor_item = executor_payouts.get(uid, {})
        executor_amount = executor_item.get("executor_amount", 0.0)
        profit = profit_shares.get(uid, 0.0)
        total = profit + exp_comp + operator_amount + executor_amount
        payout_shares.append(
            {
                "user_id": uid,
                "split_pct": normalized_split_pct.get(uid, 0.0),
                "commission_amount": comm,
                "tax_amount": tx,
                "expenses_compensation": exp_comp,
                "operator_icons": operator_item.get("operator_icons", 0),
                "operator_amount": operator_amount,
                "executor_count": executor_item.get("executor_count", 0),
                "executor_amount": executor_amount,
                "profit_share": profit,
                "total": total,
            }
        )
    side_payment_user_ids = set(operator_payouts) | set(executor_payouts)
    for uid in side_payment_user_ids:
        if uid in payout_user_ids:
            continue
        operator_item = operator_payouts.get(uid, {})
        operator_amount = operator_item.get("operator_amount", 0.0)
        executor_item = executor_payouts.get(uid, {})
        executor_amount = executor_item.get("executor_amount", 0.0)
        exp_comp = user_expenses_comp.get(uid, 0.0)
        payout_shares.append(
            {
                "user_id": uid,
                "split_pct": 0.0,
                "commission_amount": user_commission.get(uid, 0.0),
                "tax_amount": user_tax.get(uid, 0.0),
                "expenses_compensation": exp_comp,
                "operator_icons": operator_item.get("operator_icons", 0),
                "operator_amount": operator_amount,
                "executor_count": executor_item.get("executor_count", 0),
                "executor_amount": executor_amount,
                "profit_share": 0.0,
                "total": operator_amount + executor_amount + exp_comp,
            }
        )

    conn.close()

    return {
        "invoices_total": invoices_total,
        "total_commission": total_commission,
        "total_tax": total_tax,
        "total_operator_amount": total_operator_amount,
        "total_executor_amount": total_executor_amount,
        "expenses_total": sum(float(e["amount"]) for e in expenses),
        "compensated_total": total_compensated,
        "already_allocated": 0.0,
        "net": net,
        "invoice_links": [{"invoice_id": iid} for iid in invoice_ids],
        "expense_links": [
            {"expense_id": e["id"], "amount": compensated.get(e["id"], 0.0)} for e in expenses
        ],
        "payout_shares": payout_shares,
    }


def preview_payout(
    invoice_ids: list[int],
    expense_ids: list[int],
    user_splits: list[dict],
    expense_repayments: list[dict] | None = None,
) -> dict:
    """Превью выплаты без сохранения в БД."""
    expense_repayments = expense_repayments or []
    if not invoice_ids and not expense_ids and not expense_repayments:
        conn = get_connection()
        try:
            shares = _attach_user_names(
                conn,
                [
                    {
                        **us,
                        "commission_amount": 0.0,
                        "tax_amount": 0.0,
                        "expenses_compensation": 0.0,
                        "operator_icons": 0,
                        "operator_amount": 0.0,
                        "executor_count": 0,
                        "executor_amount": 0.0,
                        "profit_share": 0.0,
                        "total": 0.0,
                    }
                    for us in user_splits
                ],
            )
        finally:
            conn.close()
        return {
            "invoice_count": 0,
            "expense_count": 0,
            "total_income": 0.0,
            "total_commission": 0.0,
            "total_tax": 0.0,
            "total_operator_amount": 0.0,
            "total_executor_amount": 0.0,
            "total_expenses": 0.0,
            "already_allocated": 0.0,
            "net_amount": 0.0,
            "shares": shares,
        }

    calc = calculate_payout(invoice_ids, expense_ids, user_splits)

    # Оригинальная сумма расходов
    original_expenses_total = 0.0
    if expense_ids:
        conn = get_connection()
        placeholders = ",".join("?" * len(expense_ids))
        row = conn.execute(
            f"SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE id IN ({placeholders})",
            expense_ids,
        ).fetchone()
        if row:
            original_expenses_total = float(row["total"])
        conn.close()

    repayment_total, repayment_by_user = _expense_repayment_preview_allocations(expense_repayments)
    net_amount, shares = _apply_expense_repayment_allocations(calc, repayment_total, repayment_by_user)

    return {
        "invoice_count": len(invoice_ids),
        "expense_count": len(expense_ids) + len(expense_repayments),
        "total_income": calc["invoices_total"],
        "total_commission": calc["total_commission"],
        "total_tax": calc["total_tax"],
        "total_operator_amount": calc["total_operator_amount"],
        "total_executor_amount": calc["total_executor_amount"],
        "total_expenses": original_expenses_total + repayment_total,
        "already_allocated": calc.get("already_allocated", 0.0),
        "net_amount": net_amount,
        "shares": shares,
    }


# ─────────────────────────────────────────────────────────────────────────────
# payout_shares CRUD
# ─────────────────────────────────────────────────────────────────────────────


def _create_share(
    payout_id: int,
    user_id: int,
    split_pct: float,
    commission_amount: float,
    tax_amount: float,
    expenses_compensation: float,
    operator_icons: int,
    operator_amount: float,
    executor_count: int,
    executor_amount: float,
    profit_share: float,
    total: float,
) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO payout_shares
           (payout_id, user_id, split_pct, commission_amount, tax_amount, expenses_compensation, operator_icons, operator_amount, executor_count, executor_amount, profit_share, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            payout_id,
            user_id,
            split_pct,
            commission_amount,
            tax_amount,
            expenses_compensation,
            operator_icons,
            operator_amount,
            executor_count,
            executor_amount,
            profit_share,
            total,
        ),
    )
    conn.commit()
    share_id = cur.lastrowid
    conn.close()
    return share_id


def _delete_shares(payout_id: int) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM payout_shares WHERE payout_id = ?", (payout_id,))
    conn.commit()
    conn.close()


def _get_shares(payout_id: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT ps.*, u.name as user_name
           FROM payout_shares ps
           LEFT JOIN users u ON ps.user_id = u.id
           WHERE ps.payout_id = ?""",
        (payout_id,),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = _row_to_dict(r)
        d["user_name"] = r["user_name"]
        result.append(d)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Основные CRUD
# ─────────────────────────────────────────────────────────────────────────────


def create_payout_with_calculation(
    name: str,
    invoice_ids: list[int],
    expense_ids: list[int],
    user_splits: list[dict],
    expense_repayments: list[dict] | None = None,
) -> dict:
    """
    Создаёт выплату с полным расчётом (FIFO).
    invoice_ids — список id инвойсов для этой выплаты
    expense_ids — список id расходов для этой выплаты
    user_splits — [{"user_id": int, "split_pct": float}, ...]
    """
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    cur = conn.execute(
        "INSERT INTO payouts (name, status, created_at) VALUES (?, 'pending', ?)",
        (name, now),
    )
    payout_id = cur.lastrowid
    conn.commit()
    conn.close()

    expense_repayments = expense_repayments or []
    _ensure_profit_lots_for_invoices(invoice_ids)
    calc = calculate_payout(invoice_ids, expense_ids, user_splits)
    repayment_total, repayment_by_user = _expense_repayment_preview_allocations(expense_repayments)
    if expense_repayments:
        calc["net"], calc["payout_shares"] = _apply_expense_repayment_allocations(
            calc,
            repayment_total,
            repayment_by_user,
        )

    # Записываем payout_shares
    for share in calc["payout_shares"]:
        _create_share(
            payout_id,
            share["user_id"],
            share["split_pct"],
            share["commission_amount"],
            share["tax_amount"],
            share["expenses_compensation"],
            share.get("operator_icons", 0),
            share.get("operator_amount", 0.0),
            share.get("executor_count", 0),
            share.get("executor_amount", 0.0),
            share["profit_share"],
            share["total"],
        )

    # Записываем payout_invoices (amount = debt_amount инвойса)
    conn2 = get_connection()
    for link in calc["invoice_links"]:
        invoice_id = link["invoice_id"]
        inv_row = conn2.execute(
            "SELECT debt_amount FROM invoices WHERE id = ?",
            (invoice_id,),
        ).fetchone()
        amount = float(inv_row["debt_amount"]) if inv_row else 0.0
        _link_invoice(payout_id, invoice_id, amount)
    conn2.close()

    # Записываем payout_expenses с суммами компенсации
    for link in calc["expense_links"]:
        _link_expense(payout_id, link["expense_id"], link["amount"])

    if expense_repayments:
        from src.db.finance import create_expense_repayments

        create_expense_repayments(payout_id, expense_repayments, invoice_ids)

    _create_director_profit_entries_for_payout(payout_id, invoice_ids, user_splits)
    _lock_finance_entries_for_payout(payout_id, invoice_ids)

    return get_payout_by_id(payout_id)


def _build_payout_response(payout: dict) -> dict:
    """Строит денормализованный ответ для фронтенда."""
    invoices_total = sum(i["amount"] for i in payout["invoices"])
    expenses_compensated = sum(e["amount"] for e in payout["expenses"])

    # Оригинальная сумма расходов (без FIFO-среза)
    original_expenses_total = 0.0
    if payout["expenses"]:
        ids = [e["expense_id"] for e in payout["expenses"]]
        placeholders = ",".join("?" * len(ids))
        conn = get_connection()
        row = conn.execute(
            f"SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE id IN ({placeholders})",
            ids,
        ).fetchone()
        if row:
            original_expenses_total = float(row["total"])
        conn.close()

    # Комиссия и налоги из shares
    total_commission = sum(s.get("commission_amount", 0) for s in payout["shares"])
    total_tax = sum(s.get("tax_amount", 0) for s in payout["shares"])
    total_operator_amount = sum(s.get("operator_amount", 0) for s in payout["shares"])
    total_executor_amount = sum(s.get("executor_amount", 0) for s in payout["shares"])

    net_amount = invoices_total - expenses_compensated - total_operator_amount - total_executor_amount

    # Копируем shares в удобном формате
    shares = payout["shares"]
    settlement = _calculate_payout_transfers(payout)

    return {
        **payout,
        "total_income": invoices_total,
        "total_commission": total_commission,
        "total_tax": total_tax,
        "total_operator_amount": total_operator_amount,
        "total_executor_amount": total_executor_amount,
        "total_expenses": original_expenses_total,
        "net_amount": net_amount,
        "shares": shares,
        "settlement": settlement,
    }


def _payout_matches_company(payout: dict, company_id: int | None, company: str | None) -> bool:
    if company_id is None and company is None:
        return True
    if company is not None and any(invoice.get("company") == company for invoice in payout["invoices"]):
        return True
    if company_id is not None and any(expense.get("company_id") == company_id for expense in payout["expenses"]):
        return True
    return False


def list_payouts(company_id: int | None = None) -> list[dict]:
    company = None
    if company_id is not None:
        conn_company = get_connection()
        row = conn_company.execute("SELECT name FROM companies WHERE id = ?", (company_id,)).fetchone()
        conn_company.close()
        company = row["name"] if row else None

    conn = get_connection()
    rows = conn.execute("SELECT * FROM payouts ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for row in rows:
        payout = _row_to_dict(row)
        payout["invoices"] = _get_linked_invoices(payout["id"])
        payout["expenses"] = _get_linked_expenses(payout["id"])
        payout["shares"] = _get_shares(payout["id"])
        if not _payout_matches_company(payout, company_id, company):
            continue
        result.append(_build_payout_response(payout))
    return result


def get_payout_by_id(payout_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM payouts WHERE id = ?", (payout_id,)).fetchone()
    conn.close()
    if not row:
        return None
    payout = _row_to_dict(row)
    payout["invoices"] = _get_linked_invoices(payout_id)
    payout["expenses"] = _get_linked_expenses(payout_id)
    payout["shares"] = _get_shares(payout_id)
    return _build_payout_response(payout)


def update_payout(payout_id: int, name: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM payouts WHERE id = ?", (payout_id,)).fetchone()
    if not row:
        conn.close()
        return None
    current = _row_to_dict(row)
    if current["status"] != "pending":
        conn.close()
        return None
    conn.execute("UPDATE payouts SET name = ? WHERE id = ?", (name, payout_id))
    conn.commit()
    conn.close()
    return get_payout_by_id(payout_id)


def set_payout_status(payout_id: int, status: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM payouts WHERE id = ?", (payout_id,)).fetchone()
    if not row:
        conn.close()
        return None
    current = _row_to_dict(row)
    if current["status"] != "pending":
        conn.close()
        return None
    now = datetime.now(UTC).isoformat()
    conn.execute(
        "UPDATE payouts SET status = ?, completed_at = ? WHERE id = ?",
        (status, now if status == "completed" else None, payout_id),
    )
    if status == "completed":
        conn.execute(
            """
            UPDATE finance_entries
            SET edit_state = 'paid',
                updated_at = ?
            WHERE payout_id = ?
            """,
            (now, payout_id),
        )
    conn.commit()
    conn.close()
    return get_payout_by_id(payout_id)


def delete_payout(payout_id: int) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT id, status FROM payouts WHERE id = ?", (payout_id,)).fetchone()
    if not row:
        conn.close()
        return False
    if row["status"] != "pending":
        conn.close()
        return False
    conn.close()
    _release_finance_entries_for_pending_payout(payout_id)
    conn = get_connection()
    _unlink_invoices(payout_id)
    _unlink_expenses(payout_id)
    _delete_shares(payout_id)
    conn.execute("DELETE FROM payouts WHERE id = ?", (payout_id,))
    conn.commit()
    conn.close()
    return True


def recalculate_payout(
    payout_id: int,
    invoice_ids: list[int],
    expense_ids: list[int],
    user_splits: list[dict],
    expense_repayments: list[dict] | None = None,
) -> dict | None:
    """Пересчитывает выплату (только pending)."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM payouts WHERE id = ?", (payout_id,)).fetchone()
    if not row:
        conn.close()
        return None
    current = _row_to_dict(row)
    if current["status"] != "pending":
        conn.close()
        return None

    _release_finance_entries_for_pending_payout(payout_id)
    _unlink_invoices(payout_id)
    _unlink_expenses(payout_id)
    _delete_shares(payout_id)

    expense_repayments = expense_repayments or []
    _ensure_profit_lots_for_invoices(invoice_ids)
    calc = calculate_payout(invoice_ids, expense_ids, user_splits)
    repayment_total, repayment_by_user = _expense_repayment_preview_allocations(expense_repayments)
    if expense_repayments:
        calc["net"], calc["payout_shares"] = _apply_expense_repayment_allocations(
            calc,
            repayment_total,
            repayment_by_user,
        )

    for share in calc["payout_shares"]:
        _create_share(
            payout_id,
            share["user_id"],
            share["split_pct"],
            share["commission_amount"],
            share["tax_amount"],
            share["expenses_compensation"],
            share.get("operator_icons", 0),
            share.get("operator_amount", 0.0),
            share.get("executor_count", 0),
            share.get("executor_amount", 0.0),
            share["profit_share"],
            share["total"],
        )

    conn2 = get_connection()
    for link in calc["invoice_links"]:
        invoice_id = link["invoice_id"]
        inv_row = conn2.execute(
            "SELECT debt_amount FROM invoices WHERE id = ?",
            (invoice_id,),
        ).fetchone()
        amount = float(inv_row["debt_amount"]) if inv_row else 0.0
        _link_invoice(payout_id, invoice_id, amount)
    conn2.close()

    for link in calc["expense_links"]:
        _link_expense(payout_id, link["expense_id"], link["amount"])

    if expense_repayments:
        from src.db.finance import create_expense_repayments

        create_expense_repayments(payout_id, expense_repayments, invoice_ids)

    _create_director_profit_entries_for_payout(payout_id, invoice_ids, user_splits)
    _lock_finance_entries_for_payout(payout_id, invoice_ids)

    conn.commit()
    conn.close()
    return get_payout_by_id(payout_id)
