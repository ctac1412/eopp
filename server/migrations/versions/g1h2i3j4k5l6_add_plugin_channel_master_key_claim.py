"""add plugin channel master key claim

Revision ID: g1h2i3j4k5l6
Revises: f0g1h2i3j4k5
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa


revision = "g1h2i3j4k5l6"
down_revision = "f0g1h2i3j4k5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plugin_channel_sessions", sa.Column("claimed_master_key_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("plugin_channel_sessions", "claimed_master_key_id")
