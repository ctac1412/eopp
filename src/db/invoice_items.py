"""Invoice items database layer.

Table: invoice_items
  id INTEGER PRIMARY KEY
  invoice_id INTEGER NOT NULL REFERENCES invoices(id)
  description TEXT
  amount INTEGER
  sort_order INTEGER
"""

from src.db.connection import get_connection


def _row_to_dict(r):
    return dict(zip(r.keys(), r))


def init_invoice_items_table(conn=None):
    """Create invoice_items table if it doesn't exist."""
    c = conn or get_connection()
    c.execute("""
        CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id),
            description TEXT NOT NULL DEFAULT '',
            amount INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER DEFAULT 0
        )
    """)
    if not conn:
        conn.commit()
        conn.close()


def add_item(invoice_id: int, description: str, amount: int, sort_order: int = 0) -> int:
    """Add a line item to an invoice. Returns item id."""
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO invoice_items (invoice_id, description, amount, sort_order) VALUES (?, ?, ?, ?)",
        (invoice_id, description, amount, sort_order),
    )
    item_id = cur.lastrowid
    conn.commit()
    conn.close()
    return item_id


def get_items_for_invoice(invoice_id: int) -> list[dict]:
    """Get all line items for an invoice, ordered by sort_order."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id",
        (invoice_id,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def update_item(item_id: int, description: str | None = None, amount: int | None = None, sort_order: int | None = None) -> dict | None:
    """Update a line item."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM invoice_items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        conn.close()
        return None

    current = _row_to_dict(row)
    description = description if description is not None else current["description"]
    amount = amount if amount is not None else current["amount"]
    sort_order = sort_order if sort_order is not None else current["sort_order"]

    conn.execute(
        "UPDATE invoice_items SET description = ?, amount = ?, sort_order = ? WHERE id = ?",
        (description, amount, sort_order, item_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM invoice_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def delete_item(item_id: int) -> bool:
    """Delete a line item."""
    conn = get_connection()
    cursor = conn.execute("DELETE FROM invoice_items WHERE id = ?", (item_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def delete_items_for_invoice(invoice_id: int) -> None:
    """Delete all line items for an invoice."""
    conn = get_connection()
    conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?", (invoice_id,))
    conn.commit()
    conn.close()


def get_items_total(invoice_id: int) -> int:
    """Get sum of all line item amounts for an invoice."""
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM invoice_items WHERE invoice_id = ?",
        (invoice_id,),
    ).fetchone()
    conn.close()
    return row["total"] if row else 0
