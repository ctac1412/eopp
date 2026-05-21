"""add missing columns to captchas table

Revision ID: a8f1c2d3e4f5
Revises: f6a7b8c9d0e1
Create Date: 2026-05-21
"""

from alembic import op

revision = "a8f1c2d3e4f5"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def _existing_columns(table_name: str) -> set[str]:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def upgrade() -> None:
    cols = _existing_columns("captchas")

    if "tiles_hash" not in cols:
        op.execute("ALTER TABLE captchas ADD COLUMN tiles_hash TEXT")
    if "correct_answer" not in cols:
        op.execute("ALTER TABLE captchas ADD COLUMN correct_answer TEXT")
    if "fail_reason" not in cols:
        op.execute("ALTER TABLE captchas ADD COLUMN fail_reason TEXT")


def downgrade() -> None:
    # SQLite may not support DROP COLUMN in all environments; keep downgrade no-op.
    pass

