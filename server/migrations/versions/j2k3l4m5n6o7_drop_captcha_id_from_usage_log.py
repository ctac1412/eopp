"""drop captcha_id from usage_log

Revision ID: j2k3l4m5n6o7
Revises: h1i2j3k4l5m6
Create Date: 2026-05-26
"""

from alembic import op

revision = "j2k3l4m5n6o7"
down_revision = "h1i2j3k4l5m6"
branch_labels = None
depends_on = None


def _existing_columns(table_name: str) -> set[str]:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def upgrade() -> None:
    cols = _existing_columns("usage_log")
    if "captcha_id" in cols:
        op.execute("ALTER TABLE usage_log DROP COLUMN captcha_id")


def downgrade() -> None:
    cols = _existing_columns("usage_log")
    if "captcha_id" not in cols:
        op.execute("ALTER TABLE usage_log ADD COLUMN captcha_id TEXT")
