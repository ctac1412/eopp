"""add commission_user_id and tax_user_id to invoices

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-05-18
"""

from alembic import op

revision = "b7c8d9e0f1a2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE invoices ADD COLUMN commission_user_id INTEGER REFERENCES users(id)")
    op.execute("ALTER TABLE invoices ADD COLUMN tax_user_id INTEGER REFERENCES users(id)")


def downgrade() -> None:
    op.execute("ALTER TABLE invoices DROP COLUMN tax_user_id")
    op.execute("ALTER TABLE invoices DROP COLUMN commission_user_id")
