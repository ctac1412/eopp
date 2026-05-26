"""drop correct_answer from captchas

Revision ID: k3l4m5n6o7p8
Revises: j2k3l4m5n6o7
Create Date: 2026-05-26
"""

from alembic import op

revision = "k3l4m5n6o7p8"
down_revision = "j2k3l4m5n6o7"
branch_labels = None
depends_on = None


def _existing_columns(table_name: str) -> set[str]:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def upgrade() -> None:
    cols = _existing_columns("captchas")
    if "correct_answer" in cols:
        op.execute("ALTER TABLE captchas DROP COLUMN correct_answer")


def downgrade() -> None:
    cols = _existing_columns("captchas")
    if "correct_answer" not in cols:
        op.execute("ALTER TABLE captchas ADD COLUMN correct_answer TEXT")
