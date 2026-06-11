"""payout_expenses UNIQUE(payout_id, expense_id) + dedup

Revision ID: v3w4x5y6z7a8
Revises: u2v3w4x5y6z7
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'v3w4x5y6z7a8'
down_revision: Union[str, Sequence[str], None] = 'u2v3w4x5y6z7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    row = conn.exec_driver_sql(
        f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    ).fetchone()
    return row is not None


def _index_exists(index_name: str) -> bool:
    conn = op.get_bind()
    row = conn.exec_driver_sql(
        f"SELECT 1 FROM sqlite_master WHERE type='index' AND name='{index_name}'"
    ).fetchone()
    return row is not None


def upgrade() -> None:
    if not _table_exists("payout_expenses"):
        return

    conn = op.get_bind()
    # Deduplicate: keep the row with the highest ID for each (payout_id, expense_id)
    conn.exec_driver_sql("""
        DELETE FROM payout_expenses
        WHERE id NOT IN (
            SELECT MAX(id) FROM payout_expenses
            GROUP BY payout_id, expense_id
        )
    """)

    # Recreate table with UNIQUE constraint (SQLite doesn't support ALTER ADD CONSTRAINT)
    conn.exec_driver_sql("""
        CREATE TABLE payout_expenses_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payout_id INTEGER NOT NULL,
            expense_id INTEGER REFERENCES expenses(id),
            amount REAL DEFAULT 0,
            FOREIGN KEY (payout_id) REFERENCES payouts(id),
            UNIQUE(payout_id, expense_id)
        )
    """)
    conn.exec_driver_sql("""
        INSERT INTO payout_expenses_new (id, payout_id, expense_id, amount)
        SELECT id, payout_id, expense_id, amount FROM payout_expenses
    """)
    conn.exec_driver_sql("DROP TABLE payout_expenses")
    conn.exec_driver_sql("ALTER TABLE payout_expenses_new RENAME TO payout_expenses")


def downgrade() -> None:
    if not _table_exists("payout_expenses"):
        return

    conn = op.get_bind()
    # Remove UNIQUE constraint by recreating table
    conn.exec_driver_sql("""
        CREATE TABLE payout_expenses_old (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payout_id INTEGER NOT NULL,
            expense_id INTEGER REFERENCES expenses(id),
            amount REAL DEFAULT 0,
            FOREIGN KEY (payout_id) REFERENCES payouts(id)
        )
    """)
    conn.exec_driver_sql("""
        INSERT INTO payout_expenses_old (id, payout_id, expense_id, amount)
        SELECT id, payout_id, expense_id, amount FROM payout_expenses
    """)
    conn.exec_driver_sql("DROP TABLE payout_expenses")
    conn.exec_driver_sql("ALTER TABLE payout_expenses_old RENAME TO payout_expenses")
