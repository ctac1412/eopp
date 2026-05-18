"""
EOPP Captcha Solver - Payouts.

CRUD для выплат с FIFO компенсацией расходов.
"""

from datetime import UTC, datetime

from src.db.connection import get_connection


def _row_to_dict(row):
    return dict(zip(row.keys(), row))


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
        "SELECT * FROM payout_invoices WHERE payout_id = ?",
        (payout_id,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def _get_linked_expenses(payout_id: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM payout_expenses WHERE payout_id = ?",
        (payout_id,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Расчёт выплаты (FIFO для расходов)
# ─────────────────────────────────────────────────────────────────────────────

def calculate_payout(
    invoice_ids: list[int],
    expense_ids: list[int],
    user_splits: list[dict],
    # user_splits: [{"user_id": int, "split_pct": float}, ...]
) -> dict:
    """
    Рассчитывает выплату с FIFO компенсацией расходов.

    1. income = SUM(invoices.total_amount)
    2. FIFO по expenses.created_at → компенсация из income
    3. net = income - total_compensated
    4. Если net > 0 → делить пропорционально split_pct
    5. total = expenses_compensation + profit_share
    """
    conn = get_connection()

    # 1. Получаем суммы инвойсов
    invoices_total = 0.0
    if invoice_ids:
        placeholders = ",".join("?" * len(invoice_ids))
        rows = conn.execute(
            f"SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE id IN ({placeholders})",
            invoice_ids,
        ).fetchone()
        invoices_total = float(rows["total"]) if rows else 0.0

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
    net = invoices_total - total_compensated

    # 4. Делим net пропорционально split_pct
    profit_shares: dict[int, float] = {}  # user_id → profit_share
    total_split_pct = sum(us["split_pct"] for us in user_splits) or 100.0

    for us in user_splits:
        user_id = us["user_id"]
        pct = us["split_pct"]
        profit_shares[user_id] = round(net * pct / total_split_pct, 2) if net > 0 else 0.0

    # 5. Итоговые суммы для payout_shares
    # Собираем компенсации по user_id
    user_expenses_comp: dict[int, float] = {}
    for exp in expenses:
        uid = exp.get("user_id")
        if uid:
            user_expenses_comp[uid] = user_expenses_comp.get(uid, 0.0) + compensated.get(exp["id"], 0.0)

    payout_shares = []
    for us in user_splits:
        uid = us["user_id"]
        exp_comp = user_expenses_comp.get(uid, 0.0)
        profit = profit_shares.get(uid, 0.0)
        payout_shares.append({
            "user_id": uid,
            "split_pct": us["split_pct"],
            "expenses_compensation": exp_comp,
            "profit_share": profit,
            "total": exp_comp + profit,
        })

    conn.close()

    return {
        "invoices_total": invoices_total,
        "expenses_total": sum(float(e["amount"]) for e in expenses),
        "compensated_total": total_compensated,
        "net": net,
        "invoice_links": [{"invoice_id": iid} for iid in invoice_ids],
        "expense_links": [
            {"expense_id": e["id"], "amount": compensated.get(e["id"], 0.0)}
            for e in expenses
        ],
        "payout_shares": payout_shares,
    }


# ─────────────────────────────────────────────────────────────────────────────
# payout_shares CRUD
# ─────────────────────────────────────────────────────────────────────────────

def _create_share(
    payout_id: int,
    user_id: int,
    split_pct: float,
    expenses_compensation: float,
    profit_share: float,
    total: float,
) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO payout_shares
           (payout_id, user_id, split_pct, expenses_compensation, profit_share, total)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (payout_id, user_id, split_pct, expenses_compensation, profit_share, total),
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

def create_payout(name: str) -> int:
    """Создаёт пустую выплату (без расчёта)."""
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    cur = conn.execute(
        "INSERT INTO payouts (name, status, created_at) VALUES (?, 'pending', ?)",
        (name, now),
    )
    conn.commit()
    payout_id = cur.lastrowid
    conn.close()
    return payout_id


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
            share["expenses_compensation"],
            share["profit_share"],
            share["total"],
        )

    # Записываем payout_invoices (amount = полная сумма инвойса)
    conn2 = get_connection()
    for link in calc["invoice_links"]:
        invoice_id = link["invoice_id"]
        inv_row = conn2.execute(
            "SELECT total_amount FROM invoices WHERE id = ?",
            (invoice_id,),
        ).fetchone()
        amount = float(inv_row["total_amount"]) if inv_row else 0.0
        _link_invoice(payout_id, invoice_id, amount)
    conn2.close()

    # Записываем payout_expenses с суммами компенсации
    for link in calc["expense_links"]:
        _link_expense(payout_id, link["expense_id"], link["amount"])

    return get_payout_by_id(payout_id)


def list_payouts() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM payouts ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for row in rows:
        payout = _row_to_dict(row)
        payout["invoices"] = _get_linked_invoices(payout["id"])
        payout["expenses"] = _get_linked_expenses(payout["id"])
        payout["shares"] = _get_shares(payout["id"])
        # Денормализованные totals
        payout["invoices_total"] = sum(i["amount"] for i in payout["invoices"])
        payout["expenses_compensated"] = sum(e["amount"] for e in payout["expenses"])
        result.append(payout)
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
    payout["invoices_total"] = sum(i["amount"] for i in payout["invoices"])
    payout["expenses_compensated"] = sum(e["amount"] for e in payout["expenses"])
    return payout


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

    _unlink_invoices(payout_id)
    _unlink_expenses(payout_id)
    _delete_shares(payout_id)

    calc = calculate_payout(invoice_ids, expense_ids, user_splits)

    for share in calc["payout_shares"]:
        _create_share(
            payout_id,
            share["user_id"],
            share["split_pct"],
            share["expenses_compensation"],
            share["profit_share"],
            share["total"],
        )

    conn2 = get_connection()
    for link in calc["invoice_links"]:
        invoice_id = link["invoice_id"]
        inv_row = conn2.execute(
            "SELECT total_amount FROM invoices WHERE id = ?",
            (invoice_id,),
        ).fetchone()
        amount = float(inv_row["total_amount"]) if inv_row else 0.0
        _link_invoice(payout_id, invoice_id, amount)
    conn2.close()

    for link in calc["expense_links"]:
        _link_expense(payout_id, link["expense_id"], link["amount"])

    conn.commit()
    conn.close()
    return get_payout_by_id(payout_id)