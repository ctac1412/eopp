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


def delete_items_for_invoice(invoice_id: int) -> None:
    """Delete all line items for an invoice."""
    conn = get_connection()
    conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?", (invoice_id,))
    conn.commit()
    conn.close()
