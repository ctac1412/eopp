"""add finance entries and profit lots

Revision ID: m6n7o8p9q0r1
Revises: l5m6n7o8p9q0
Create Date: 2026-06-14
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "m6n7o8p9q0r1"
down_revision: str | Sequence[str] | None = "l5m6n7o8p9q0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    row = op.get_bind().exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def upgrade() -> None:
    if not _table_exists("profit_lots"):
        op.execute(
            """
            CREATE TABLE profit_lots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER REFERENCES companies(id),
                usage_log_id INTEGER NOT NULL REFERENCES usage_log(id),
                invoice_id INTEGER REFERENCES invoices(id),
                gross_amount INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(usage_log_id, invoice_id)
            )
            """
        )
        op.execute("CREATE INDEX ix_profit_lots_usage_log_id ON profit_lots(usage_log_id)")
        op.execute("CREATE INDEX ix_profit_lots_invoice_id ON profit_lots(invoice_id)")

    if not _table_exists("finance_entries"):
        op.execute(
            """
            CREATE TABLE finance_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER REFERENCES companies(id),
                usage_log_id INTEGER REFERENCES usage_log(id),
                invoice_id INTEGER REFERENCES invoices(id),
                payout_id INTEGER REFERENCES payouts(id),
                expense_id INTEGER REFERENCES expenses(id),
                profit_lot_id INTEGER REFERENCES profit_lots(id),
                distribution_answer_id INTEGER REFERENCES distribution_answers(id),
                user_id INTEGER REFERENCES users(id),
                kind TEXT NOT NULL,
                amount INTEGER NOT NULL,
                edit_state TEXT NOT NULL DEFAULT 'open',
                source TEXT NOT NULL DEFAULT 'system',
                source_key TEXT UNIQUE,
                comment TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        op.execute("CREATE INDEX ix_finance_entries_usage_log_id ON finance_entries(usage_log_id)")
        op.execute("CREATE INDEX ix_finance_entries_invoice_id ON finance_entries(invoice_id)")
        op.execute("CREATE INDEX ix_finance_entries_payout_id ON finance_entries(payout_id)")
        op.execute("CREATE INDEX ix_finance_entries_profit_lot_id ON finance_entries(profit_lot_id)")
        op.execute("CREATE INDEX ix_finance_entries_kind ON finance_entries(kind)")

    if _table_exists("usage_log"):
        op.get_bind().exec_driver_sql(
            """
            INSERT OR IGNORE INTO finance_entries (
                company_id, usage_log_id, invoice_id, user_id, kind, amount,
                edit_state, source, source_key, comment, created_at, updated_at
            )
            SELECT
                company_id, id, invoice_id, NULL, 'customer_income', price,
                CASE WHEN invoice_id IS NULL THEN 'open' ELSE 'open' END,
                'migration',
                'usage:' || id || ':income',
                'Migrated from usage_log.price',
                COALESCE(confirmed_at, created_at),
                COALESCE(confirmed_at, created_at)
            FROM usage_log
            WHERE COALESCE(price, 0) > 0
            """
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS finance_entries")
    op.execute("DROP TABLE IF EXISTS profit_lots")
