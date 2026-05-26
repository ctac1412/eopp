"""add no_valid_index column to captcha_files

Revision ID: h1i2j3k4l5m6
Revises: g3h4i5j6k7l8
Create Date: 2026-05-26
"""

from alembic import op

revision = "h1i2j3k4l5m6"
down_revision = "g3h4i5j6k7l8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE captcha_files ADD COLUMN no_valid_index INTEGER DEFAULT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE captcha_files DROP COLUMN no_valid_index")
