"""allow manual invoice profit lots

Revision ID: z3a4b5c6d7e8
Revises: y2z3a4b5c6d7
Create Date: 2026-06-16
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "z3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "y2z3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    row = op.get_bind().exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _usage_log_id_is_nullable() -> bool:
    rows = op.get_bind().exec_driver_sql("PRAGMA table_info(profit_lots)").fetchall()
    for row in rows:
        if row[1] == "usage_log_id":
            return int(row[3] or 0) == 0
    return True


def upgrade() -> None:
    if not _table_exists("profit_lots") or _usage_log_id_is_nullable():
        return

    op.execute("DROP TABLE IF EXISTS profit_lots_new")
    op.execute(
        """
        CREATE TABLE profit_lots_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER REFERENCES companies(id),
            usage_log_id INTEGER REFERENCES usage_log(id),
            invoice_id INTEGER REFERENCES invoices(id),
            gross_amount INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(usage_log_id, invoice_id)
        )
        """
    )
    op.execute(
        """
        INSERT INTO profit_lots_new (
            id, company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at
        )
        SELECT id, company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at
        FROM profit_lots
        """
    )
    op.execute("DROP TABLE profit_lots")
    op.execute("ALTER TABLE profit_lots_new RENAME TO profit_lots")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profit_lots_usage_log_id ON profit_lots(usage_log_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profit_lots_invoice_id ON profit_lots(invoice_id)")


def downgrade() -> None:
    pass
