"""add operator fields and is_external

Revision ID: t1u2v3w4x5y6
Revises: s1t2u3v4w5x6
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 't1u2v3w4x5y6'
down_revision: Union[str, Sequence[str], None] = 's1t2u3v4w5x6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("operators", "icon_display_mode"):
        op.execute(
            "ALTER TABLE operators ADD COLUMN icon_display_mode TEXT "
            "NOT NULL DEFAULT 'own_then_foreign'"
        )
    if not _column_exists("operators", "allowed_master_keys"):
        op.execute("ALTER TABLE operators ADD COLUMN allowed_master_keys TEXT")
    if not _column_exists("operators", "online"):
        op.execute(
            "ALTER TABLE operators ADD COLUMN online INTEGER NOT NULL DEFAULT 0"
        )
    if not _column_exists("api_keys", "is_external"):
        op.execute(
            "ALTER TABLE api_keys ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0"
        )


def downgrade() -> None:
    # SQLite does not support DROP COLUMN easily; skip for safety.
    pass
