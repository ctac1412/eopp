"""add commission_amount and tax_amount to payout_shares

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-05-18
"""

from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE payout_shares ADD COLUMN commission_amount REAL DEFAULT 0")
    op.execute("ALTER TABLE payout_shares ADD COLUMN tax_amount REAL DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE payout_shares DROP COLUMN tax_amount")
    op.execute("ALTER TABLE payout_shares DROP COLUMN commission_amount")
