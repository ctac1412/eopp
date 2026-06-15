"""
EOPP Captcha Solver - Payouts.

CRUD для выплат с FIFO компенсацией расходов.
"""

from datetime import UTC, datetime

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
        split_user_ids = [int(us["user_id"]) for us in user_splits if us.get("user_id") is not None]
        director_ids = _director_user_ids(conn, split_user_ids)
        director_splits = [
            {"user_id": int(us["user_id"]), "split_pct": float(us["split_pct"])}
            for us in user_splits
            if us.get("user_id") is not None and int(us["user_id"]) in director_ids
        ]
        total_split_pct = sum(us["split_pct"] for us in director_splits)
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
            for idx, split in enumerate(director_splits):
                if idx == len(director_splits) - 1:
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


def _release_finance_entries_for_pending_payout(payout_id: int) -> None:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    try:
        conn.execute(
            "DELETE FROM finance_entries WHERE payout_id = ? AND kind = 'director_profit'",
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
        """SELECT pi.*, i.invoice_number, i.company, i.debt_amount, i.percent_amount, i.tax_amount, i.total_amount, i.comment, i.paid, i.created_at as invoice_created_at
           FROM payout_invoices pi
           LEFT JOIN invoices i ON pi.invoice_id = i.id
           WHERE pi.payout_id = ?""",
        (payout_id,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def _get_linked_expenses(payout_id: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT pe.*, e.user_id, u.company_id
           FROM payout_expenses pe
           LEFT JOIN expenses e ON pe.expense_id = e.id
           LEFT JOIN users u ON e.user_id = u.id
           WHERE pe.payout_id = ?""",
        (payout_id,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Расчёт выплаты (FIFO для расходов)
# ─────────────────────────────────────────────────────────────────────────────


def _director_user_ids(conn, user_ids: list[int]) -> set[int]:
    if not user_ids:
        return set()
    placeholders = ",".join("?" * len(user_ids))
    rows = conn.execute(
        f"SELECT id FROM users WHERE id IN ({placeholders}) AND COALESCE(is_director, 0) = 1",
        user_ids,
    ).fetchall()
    return {int(row["id"]) for row in rows}


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
            COALESCE(NULLIF(o.icon_rate, 0), ct.operator_amount, 0) AS icon_rate
        FROM distribution_answers da
        JOIN log_executor le ON le.usage_log_id = da.usage_log_id
        JOIN usage_log ul ON ul.id = le.usage_log_id
        JOIN operators o ON o.id = da.operator_id
        LEFT JOIN company_tariffs ct ON ct.company_id = ul.company_id
        JOIN operator_profiles op ON op.operator_id = o.id AND op.active = 1
        WHERE ul.invoice_id IN ({placeholders})
          AND COALESCE(NULLIF(o.icon_rate, 0), ct.operator_amount, 0) > 0
          AND (le.executor_user_id IS NULL OR op.user_id != le.executor_user_id)
        GROUP BY op.user_id, da.operator_id, COALESCE(NULLIF(o.icon_rate, 0), ct.operator_amount, 0)
        """,
        [*invoice_ids, *invoice_ids],
    ).fetchall()
    payouts: dict[int, dict] = {}
    for row in rows:
        user_id = int(row["user_id"])
        icons = int(row["icons"] or 0)
        amount = float(icons * int(row["icon_rate"] or 0))
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
    net = sum(max(float(row["available"] or 0), 0.0) for row in lot_rows)
    total_compensated = sum(
        abs(float(row["amount"] or 0)) for row in entry_rows if row["kind"] == "expense_repayment"
    )

    split_user_ids = [int(us["user_id"]) for us in user_splits if us.get("user_id") is not None]
    director_ids = _director_user_ids(conn, split_user_ids)
    director_splits = [us for us in user_splits if int(us["user_id"]) in director_ids]
    total_split_pct = sum(us["split_pct"] for us in director_splits) or 0.0
    profit_shares: dict[int, float] = {}
    normalized_split_pct: dict[int, float] = {}
    for us in director_splits:
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

    total_operator_amount = sum(item["operator_amount"] for item in operator_payouts.values())
    total_executor_amount = sum(item["executor_amount"] for item in executor_payouts.values())
    return {
        "invoices_total": invoices_total,
        "total_commission": sum(user_commission.values()),
        "total_tax": sum(user_tax.values()),
        "total_operator_amount": total_operator_amount,
        "total_executor_amount": total_executor_amount,
        "expenses_total": total_compensated,
        "compensated_total": total_compensated,
        "net": net,
        "invoice_links": [{"invoice_id": iid} for iid in invoice_ids],
        "expense_links": [],
        "payout_shares": payout_shares,
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

    # 4. Делим net пропорционально split_pct только между директорами.
    split_user_ids = [int(us["user_id"]) for us in user_splits if us.get("user_id") is not None]
    director_ids = _director_user_ids(conn, split_user_ids)
    director_splits = [us for us in user_splits if int(us["user_id"]) in director_ids]
    profit_shares: dict[int, float] = {}  # user_id → profit_share
    normalized_split_pct: dict[int, float] = {}
    total_split_pct = sum(us["split_pct"] for us in director_splits) or 0.0

    for us in director_splits:
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
) -> dict:
    """Превью выплаты без сохранения в БД."""
    if not invoice_ids and not expense_ids:
        return {
            "invoice_count": 0,
            "expense_count": 0,
            "total_income": 0.0,
            "total_commission": 0.0,
            "total_tax": 0.0,
            "total_operator_amount": 0.0,
            "total_executor_amount": 0.0,
            "total_expenses": 0.0,
            "net_amount": 0.0,
            "shares": [
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

    net_amount = calc["net"]

    return {
        "invoice_count": len(invoice_ids),
        "expense_count": len(expense_ids),
        "total_income": calc["invoices_total"],
        "total_commission": calc["total_commission"],
        "total_tax": calc["total_tax"],
        "total_operator_amount": calc["total_operator_amount"],
        "total_executor_amount": calc["total_executor_amount"],
        "total_expenses": original_expenses_total,
        "net_amount": net_amount,
        "shares": calc["payout_shares"],
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

    calc = calculate_payout(invoice_ids, expense_ids, user_splits)

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
    row = conn.execute("SELECT id FROM payouts WHERE id = ?", (payout_id,)).fetchone()
    if not row:
        conn.close()
        return False
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

    calc = calculate_payout(invoice_ids, expense_ids, user_splits)

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

    _create_director_profit_entries_for_payout(payout_id, invoice_ids, user_splits)
    _lock_finance_entries_for_payout(payout_id, invoice_ids)

    conn.commit()
    conn.close()
    return get_payout_by_id(payout_id)
