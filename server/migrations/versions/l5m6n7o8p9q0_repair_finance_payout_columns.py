"""repair finance payout columns for databases already stamped at head

Revision ID: l5m6n7o8p9q0
Revises: k4l5m6n7o8p9
Create Date: 2026-06-14
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "l5m6n7o8p9q0"
down_revision: str | Sequence[str] | None = "k4l5m6n7o8p9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def _table_exists(table_name: str) -> bool:
    row = op.get_bind().exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _add_column_if_missing(table_name: str, column_name: str, definition: str) -> None:
    if _table_exists(table_name) and not _column_exists(table_name, column_name):
        op.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def upgrade() -> None:
    _add_column_if_missing("users", "is_director", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("operators", "icon_rate", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("company_tariffs", "executor_amount", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("payout_shares", "operator_icons", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("payout_shares", "operator_amount", "REAL NOT NULL DEFAULT 0")
    _add_column_if_missing("payout_shares", "executor_count", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("payout_shares", "executor_amount", "REAL NOT NULL DEFAULT 0")


def downgrade() -> None:
    # SQLite deployments keep columns for rollback safety.
    pass
