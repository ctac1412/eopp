"""add operator payout fields

Revision ID: j3k4l5m6n7o8
Revises: i2j3k4l5m6n7
Create Date: 2026-06-13
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op


revision: str = "j3k4l5m6n7o8"
down_revision: str | Sequence[str] | None = "i2j3k4l5m6n7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("operators", "icon_rate"):
        op.execute("ALTER TABLE operators ADD COLUMN icon_rate INTEGER NOT NULL DEFAULT 0")
    if not _column_exists("payout_shares", "operator_icons"):
        op.execute("ALTER TABLE payout_shares ADD COLUMN operator_icons INTEGER NOT NULL DEFAULT 0")
    if not _column_exists("payout_shares", "operator_amount"):
        op.execute("ALTER TABLE payout_shares ADD COLUMN operator_amount REAL NOT NULL DEFAULT 0")


def downgrade() -> None:
    # SQLite deployments keep columns for rollback safety.
    pass
