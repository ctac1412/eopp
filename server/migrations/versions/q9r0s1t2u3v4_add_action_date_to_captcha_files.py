"""add action_date to captcha_files

Revision ID: q9r0s1t2u3v4
Revises: p8q9r0s1t2u3
Create Date: 2026-06-09
"""

from alembic import op


revision = "q9r0s1t2u3v4"
down_revision = "p8q9r0s1t2u3"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE captcha_files ADD COLUMN action_date TEXT")


def downgrade():
    pass
