"""Invoices database layer.

Table: invoices
  id INTEGER PRIMARY KEY
  invoice_number TEXT UNIQUE
  comment TEXT
  percent_rate REAL
  tax_rate REAL
  debt_amount INTEGER
  percent_amount INTEGER
  tax_amount INTEGER
  total_amount INTEGER
  pdf_path TEXT
  paid INTEGER
  created_at TEXT (ISO)
"""

from datetime import UTC, datetime

from src.db.connection import get_connection
from src.db.connection import row_to_dict as _row_to_dict


def insert_invoice(
    invoice_number: str,
    company: str | None = None,
    is_open: bool = False,
    pdf_path: str = "",
    comment: str = "",
    percent_rate: float = 0,
    tax_rate: float = 0,
    debt_amount: int = 0,
    percent_amount: int = 0,
    tax_amount: int = 0,
    total_amount: int = 0,
    paid: bool = False,
    commission_user_id: int | None = None,
    tax_user_id: int | None = None,
) -> int:
    """Insert a new invoice record and return its id."""
    conn = get_connection()
    cur = conn.execute(
        """
        INSERT INTO invoices (
            invoice_number, company, is_open, comment, percent_rate, tax_rate,
            debt_amount, percent_amount, tax_amount, total_amount, pdf_path, paid,
            commission_user_id, tax_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            invoice_number,
            company,
            1 if is_open else 0,
            comment,
            percent_rate,
            tax_rate,
            debt_amount,
            percent_amount,
            tax_amount,
            total_amount,
            pdf_path,
            1 if paid else 0,
            commission_user_id,
            tax_user_id,
        ),
    )
    invoice_id = cur.lastrowid
    conn.commit()
    conn.close()
    return invoice_id


def insert_invoice_with_items(
    invoice_number: str,
    company: str | None = None,
    is_open: bool = False,
    comment: str = "",
    percent_rate: float = 0,
    tax_rate: float = 0,
    debt_amount: int = 0,
    percent_amount: int = 0,
    tax_amount: int = 0,
    total_amount: int = 0,
    paid: bool = False,
    items: list[dict] | None = None,
    commission_user_id: int | None = None,
    tax_user_id: int | None = None,
) -> dict:
    """Insert a new invoice with optional line items. Returns the invoice dict with items."""
    from src.db.invoice_items import add_item

    conn = get_connection()
    cur = conn.execute(
        """
        INSERT INTO invoices (
            invoice_number, company, is_open, comment, percent_rate, tax_rate,
            debt_amount, percent_amount, tax_amount, total_amount, pdf_path, paid,
            commission_user_id, tax_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            invoice_number,
            company,
            1 if is_open else 0,
            comment,
            percent_rate,
            tax_rate,
            debt_amount,
            percent_amount,
            tax_amount,
            total_amount,
            "",
            1 if paid else 0,
            commission_user_id,
            tax_user_id,
        ),
    )
    invoice_id = cur.lastrowid
    conn.commit()

    # Add items
    if items:
        for i, item in enumerate(items):
            add_item(
                invoice_id,
                description=item.get("description", ""),
                amount=item.get("amount", 0),
                sort_order=item.get("sort_order", i),
            )
    conn.close()

    result = get_invoice(invoice_id)
    result["items"] = items or []
    return result


def get_invoice(invoice_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    conn.close()
    if not row:
        return None
    result = _row_to_dict(row)
    result["paid"] = bool(result["paid"]) if result["paid"] is not None else False
    result["is_open"] = bool(result["is_open"]) if result.get("is_open") is not None else False
    return result


def _open_invoice_number(company: str) -> str:
    now = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"OPEN-{company}-{now}"


def _issued_invoice_number(company: str) -> str:
    now = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"INV-{company}-{now}"


def get_open_invoice(company: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM invoices WHERE company = ? AND is_open = 1 ORDER BY id DESC LIMIT 1",
        (company,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    result = _row_to_dict(row)
    result["paid"] = bool(result["paid"]) if result["paid"] is not None else False
    result["is_open"] = bool(result["is_open"]) if result.get("is_open") is not None else False
    return result


def ensure_open_invoice(company: str) -> dict:
    existing = get_open_invoice(company)
    if existing:
        return existing
    invoice_id = insert_invoice(
        invoice_number=_open_invoice_number(company),
        company=company,
        is_open=True,
        comment=f"Open invoice for {company}",
        paid=False,
    )
    return get_invoice(invoice_id)


def recalculate_invoice_totals(invoice_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not row:
        conn.close()
        return None
    sum_row = conn.execute(
        """SELECT COALESCE(SUM(price), 0) as debt
           FROM usage_log
           WHERE invoice_id = ? AND status = 'confirmed' AND is_test = 0""",
        (invoice_id,),
    ).fetchone()
    debt = int(sum_row["debt"]) if sum_row else 0
    conn.execute(
        "UPDATE invoices SET debt_amount = ?, total_amount = ?, percent_amount = 0, tax_amount = 0 WHERE id = ?",
        (debt, debt, invoice_id),
    )
    conn.commit()
    conn.close()
    return get_invoice(invoice_id)


def link_usage_to_open_invoice(usage_log_id: int, company: str) -> dict | None:
    open_invoice = get_open_invoice(company)
    if not open_invoice:
        return None
    conn = get_connection()
    conn.execute(
        "UPDATE usage_log SET invoice_id = ?, paid = 0 WHERE id = ?",
        (open_invoice["id"], usage_log_id),
    )
    conn.commit()
    conn.close()
    return recalculate_invoice_totals(open_invoice["id"])


def issue_open_invoice(company: str, comment: str = "", reopen: bool = False) -> dict | None:
    open_invoice = get_open_invoice(company)
    if not open_invoice:
        return None
    updated = recalculate_invoice_totals(open_invoice["id"])
    if not updated:
        return None
    conn = get_connection()
    conn.execute(
        "UPDATE invoices SET is_open = 0, invoice_number = ?, comment = ? WHERE id = ?",
        (
            _issued_invoice_number(company),
            comment or updated.get("comment") or "",
            updated["id"],
        ),
    )
    conn.commit()
    conn.close()
    closed_invoice = get_invoice(updated["id"])
    new_open = ensure_open_invoice(company) if reopen else None
    return {"closed_invoice": closed_invoice, "new_open_invoice": new_open}


def list_invoices(limit: int = 100, company: str | None = None) -> list[dict]:
    conn = get_connection()
    if company is None:
        rows = conn.execute(
            "SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM invoices WHERE company = ? ORDER BY created_at DESC LIMIT ?",
            (company, limit),
        ).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = _row_to_dict(row)
        d["paid"] = bool(d["paid"]) if d["paid"] is not None else False
        d["is_open"] = bool(d["is_open"]) if d.get("is_open") is not None else False
        result.append(d)

    # Batch allocation status
    if result:
        conn2 = get_connection()
        ids = [inv["id"] for inv in result]
        placeholders = ",".join("?" * len(ids))
        alloc_rows = conn2.execute(
            f"SELECT invoice_id, COALESCE(SUM(amount), 0) as allocated FROM payout_invoices WHERE invoice_id IN ({placeholders}) GROUP BY invoice_id",
            ids,
        ).fetchall()
        conn2.close()
        alloc_map = {r["invoice_id"]: float(r["allocated"]) for r in alloc_rows}

        for inv in result:
            original = float(inv["debt_amount"])
            allocated = alloc_map.get(inv["id"], 0.0)
            pct = (allocated / original * 100) if original > 0 else 0.0
            if allocated <= 0:
                status = "unallocated"
            elif allocated >= original - 0.01:
                status = "fully_allocated"
            else:
                status = "partially_allocated"
            inv["allocation"] = {
                "original_amount": original,
                "allocated_amount": allocated,
                "allocated_pct": round(pct, 1),
                "status": status,
            }

    return result


def list_invoices_with_items(limit: int = 100, company: str | None = None) -> list[dict]:
    """List invoices with their line items and allocation status."""
    result = list_invoices(limit, company=company)

    from src.db.invoice_items import get_items_for_invoice

    for inv in result:
        inv["items"] = get_items_for_invoice(inv["id"])

    return result


def update_invoice(
    invoice_id: int,
    comment: str | None = None,
    percent_rate: float | None = None,
    tax_rate: float | None = None,
    debt_amount: int | None = None,
    percent_amount: int | None = None,
    tax_amount: int | None = None,
    total_amount: int | None = None,
    commission_user_id: int | None = None,
    tax_user_id: int | None = None,
    company: str | None = None,
    is_open: bool | None = None,
) -> dict | None:
    """Update invoice fields. Returns updated invoice or None."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not row:
        conn.close()
        return None

    current = _row_to_dict(row)
    comment = comment if comment is not None else current["comment"]
    percent_rate = percent_rate if percent_rate is not None else current["percent_rate"]
    tax_rate = tax_rate if tax_rate is not None else current["tax_rate"]
    debt_amount = debt_amount if debt_amount is not None else current["debt_amount"]
    percent_amount = percent_amount if percent_amount is not None else current["percent_amount"]
    tax_amount = tax_amount if tax_amount is not None else current["tax_amount"]
    total_amount = total_amount if total_amount is not None else current["total_amount"]
    commission_user_id = (
        commission_user_id if commission_user_id is not None else current.get("commission_user_id")
    )
    tax_user_id = tax_user_id if tax_user_id is not None else current.get("tax_user_id")
    company = company if company is not None else current.get("company")
    is_open = is_open if is_open is not None else current.get("is_open")

    conn.execute(
        """UPDATE invoices SET company = ?, is_open = ?, comment = ?, percent_rate = ?, tax_rate = ?,
           debt_amount = ?, percent_amount = ?, tax_amount = ?, total_amount = ?,
           commission_user_id = ?, tax_user_id = ?
           WHERE id = ?""",
        (
            company,
            1 if is_open else 0,
            comment,
            percent_rate,
            tax_rate,
            debt_amount,
            percent_amount,
            tax_amount,
            total_amount,
            commission_user_id,
            tax_user_id,
            invoice_id,
        ),
    )
    conn.commit()
    conn.close()
    return get_invoice(invoice_id)


def set_invoice_paid(invoice_id: int, paid: bool) -> dict | None:
    """Toggle paid status on an invoice and cascade to associated usage logs."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not row:
        conn.close()
        return None

    conn.execute("UPDATE invoices SET paid = ? WHERE id = ?", (1 if paid else 0, invoice_id))

    # Cascade paid status to linked usage logs
    conn.execute(
        "UPDATE usage_log SET paid = ? WHERE invoice_id = ?", (1 if paid else 0, invoice_id)
    )

    conn.commit()
    conn.close()
    return get_invoice(invoice_id)


def delete_invoice(invoice_id: int) -> bool:
    """Delete an invoice and unlink associated usage logs."""
    conn = get_connection()
    row = conn.execute("SELECT id FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not row:
        conn.close()
        return False

    # Unlink usage logs
    conn.execute(
        "UPDATE usage_log SET paid = 0, invoice_id = NULL WHERE invoice_id = ?", (invoice_id,)
    )

    conn.execute("DELETE FROM invoices WHERE id = ?", (invoice_id,))
    conn.commit()
    conn.close()
    return True
