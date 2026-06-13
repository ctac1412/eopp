"""add director flag to users

Revision ID: i2j3k4l5m6n7
Revises: h2i3j4k5l6m7
Create Date: 2026-06-13
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op


revision: str = "i2j3k4l5m6n7"
down_revision: str | Sequence[str] | None = "h2i3j4k5l6m7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("users", "is_director"):
        op.execute("ALTER TABLE users ADD COLUMN is_director INTEGER NOT NULL DEFAULT 0")


def downgrade() -> None:
    # SQLite deployments keep columns for rollback safety.
    pass
