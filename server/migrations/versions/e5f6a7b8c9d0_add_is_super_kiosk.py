"""add is_super_kiosk to api_keys

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-19
"""

from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE api_keys ADD COLUMN is_super_kiosk INTEGER NOT NULL DEFAULT 0")
    op.execute("UPDATE api_keys SET is_super_kiosk = 1 WHERE is_admin = 1")


def downgrade() -> None:
    op.execute("ALTER TABLE api_keys DROP COLUMN is_super_kiosk")
