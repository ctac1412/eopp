"""add is_admin boolean to api_keys

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-19
"""

from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE api_keys ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    # Помечаем существующий admin-ключ как админский (label = 'admin')
    op.execute("UPDATE api_keys SET is_admin = 1 WHERE label = 'admin'")


def downgrade() -> None:
    op.execute("ALTER TABLE api_keys DROP COLUMN is_admin")
