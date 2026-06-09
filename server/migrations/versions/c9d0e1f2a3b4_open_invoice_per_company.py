"""add open invoice fields for company workflow

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-05-23
"""

from alembic import op

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def _existing_columns(table_name: str) -> set[str]:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def _existing_indexes(table_name: str) -> set[str]:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA index_list({table_name})").fetchall()
    return {row[1] for row in rows}


def upgrade() -> None:
    columns = _existing_columns("invoices")
    if "company" not in columns:
        op.execute("ALTER TABLE invoices ADD COLUMN company TEXT")
    if "is_open" not in columns:
        op.execute("ALTER TABLE invoices ADD COLUMN is_open INTEGER DEFAULT 0")

    indexes = _existing_indexes("invoices")
    if "idx_open_invoice_company" not in indexes:
        op.execute(
            """CREATE UNIQUE INDEX idx_open_invoice_company
               ON invoices(company)
               WHERE is_open = 1 AND company IS NOT NULL"""
        )


def downgrade() -> None:
    # SQLite downgrade kept as no-op for compatibility.
    pass
