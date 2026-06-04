"""add duration_ms to captchas

Revision ID: o7p8q9r0s1t2
Revises: n6o7p8q9r0s1
Create Date: 2026-06-04
"""

from alembic import op


revision = "o7p8q9r0s1t2"
down_revision = "n6o7p8q9r0s1"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE captchas ADD COLUMN duration_ms INTEGER DEFAULT NULL")


def downgrade():
    op.execute("ALTER TABLE captchas DROP COLUMN duration_ms")
