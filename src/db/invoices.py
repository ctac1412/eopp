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

from src.db.connection import get_connection


def _row_to_dict(r):
    """Convert sqlite3.Row to dict."""
    return dict(zip(r.keys(), r))


def init_invoices_table(conn=None):
    """Create invoices table if it doesn't exist."""
    c = conn or get_connection()
    c.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT UNIQUE NOT NULL,
            comment TEXT DEFAULT '',
            percent_rate REAL DEFAULT 0,
            tax_rate REAL DEFAULT 0,
            debt_amount INTEGER DEFAULT 0,
            percent_amount INTEGER DEFAULT 0,
            tax_amount INTEGER DEFAULT 0,
            total_amount INTEGER DEFAULT 0,
            pdf_path TEXT,
            paid INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    if not conn:
        conn.commit()
        conn.close()


def insert_invoice(
    invoice_number: str,
    pdf_path: str = "",
    comment: str = "",
    percent_rate: float = 0,
    tax_rate: float = 0,
    debt_amount: int = 0,
    percent_amount: int = 0,
    tax_amount: int = 0,
    total_amount: int = 0,
    paid: bool = False,
) -> int:
    """Insert a new invoice record and return its id."""
    conn = get_connection()
    cur = conn.execute(
        """
        INSERT INTO invoices (
            invoice_number, comment, percent_rate, tax_rate,
            debt_amount, percent_amount, tax_amount, total_amount, pdf_path, paid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            invoice_number,
            comment,
            percent_rate,
            tax_rate,
            debt_amount,
            percent_amount,
            tax_amount,
            total_amount,
            pdf_path,
            1 if paid else 0,
        ),
    )
    invoice_id = cur.lastrowid
    conn.commit()
    conn.close()
    return invoice_id


def get_invoice(invoice_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    conn.close()
    if not row:
        return None
    result = _row_to_dict(row)
    result["paid"] = bool(result["paid"]) if result["paid"] is not None else False
    return result


def get_invoice_by_number(invoice_number: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE invoice_number = ?", (invoice_number,)).fetchone()
    conn.close()
    if not row:
        return None
    result = _row_to_dict(row)
    result["paid"] = bool(result["paid"]) if result["paid"] is not None else False
    return result


def list_invoices(limit: int = 100) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = _row_to_dict(row)
        d["paid"] = bool(d["paid"]) if d["paid"] is not None else False
        result.append(d)
    return result


def set_invoice_paid(invoice_id: int, paid: bool) -> dict | None:
    """Toggle paid status on an invoice and cascade to associated usage logs."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not row:
        conn.close()
        return None

    conn.execute("UPDATE invoices SET paid = ? WHERE id = ?", (1 if paid else 0, invoice_id))

    # Cascade to usage logs via FK
    conn.execute(
        "UPDATE usage_log SET paid = 0, invoice_id = NULL WHERE invoice_id = ?",
        (invoice_id,)
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
    conn.execute("UPDATE usage_log SET paid = 0, invoice_id = NULL WHERE invoice_id = ?", (invoice_id,))

    conn.execute("DELETE FROM invoices WHERE id = ?", (invoice_id,))
    conn.commit()
    conn.close()
    return True


def get_usage_log_count(invoice_id: int) -> int:
    """Get count of usage logs linked to this invoice."""
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM usage_log WHERE invoice_id = ?",
        (invoice_id,),
    ).fetchone()
    conn.close()
    return row["cnt"] if row else 0
