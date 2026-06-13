"""add executor payout fields

Revision ID: k4l5m6n7o8p9
Revises: j3k4l5m6n7o8
Create Date: 2026-06-13
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op


revision: str = "k4l5m6n7o8p9"
down_revision: str | Sequence[str] | None = "j3k4l5m6n7o8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("company_tariffs", "executor_amount"):
        op.execute("ALTER TABLE company_tariffs ADD COLUMN executor_amount INTEGER NOT NULL DEFAULT 0")
    if not _column_exists("payout_shares", "executor_count"):
        op.execute("ALTER TABLE payout_shares ADD COLUMN executor_count INTEGER NOT NULL DEFAULT 0")
    if not _column_exists("payout_shares", "executor_amount"):
        op.execute("ALTER TABLE payout_shares ADD COLUMN executor_amount REAL NOT NULL DEFAULT 0")


def downgrade() -> None:
    # SQLite deployments keep columns for rollback safety.
    pass
