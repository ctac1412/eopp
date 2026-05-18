"""add invoice_items table for custom line items on invoices

Revision ID: a1b2c3d4e5f6
Revises: 8814b9cb1e05
Create Date: 2026-05-18
"""

from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "8814b9cb1e05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id),
            description TEXT NOT NULL DEFAULT '',
            amount INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER DEFAULT 0
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS invoice_items")
