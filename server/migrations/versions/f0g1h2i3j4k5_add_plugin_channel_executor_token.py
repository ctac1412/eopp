"""add plugin channel executor token

Revision ID: f0g1h2i3j4k5
Revises: e9f0g1h2i3j4
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa


revision = "f0g1h2i3j4k5"
down_revision = "e9f0g1h2i3j4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plugin_channel_sessions", sa.Column("executor_token", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("plugin_channel_sessions", "executor_token")
