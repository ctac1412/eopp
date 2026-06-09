"""add solver valid rank after top1 marker

Revision ID: n6o7p8q9r0s1
Revises: m5n6o7p8q9r0
Create Date: 2026-05-27
"""

from alembic import op


revision = "n6o7p8q9r0s1"
down_revision = "m5n6o7p8q9r0"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE captcha_files ADD COLUMN solver_valid_rank INTEGER DEFAULT NULL")


def downgrade():
    op.execute("ALTER TABLE captcha_files DROP COLUMN solver_valid_rank")
