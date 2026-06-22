"""add puzzle operator rates

Revision ID: a4b5c6d7e8f9
Revises: z3a4b5c6d7e8
Create Date: 2026-06-21
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "a4b5c6d7e8f9"
down_revision: str | Sequence[str] | None = "z3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    row = op.get_bind().exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def _add_column_if_missing(table_name: str, column_name: str, definition: str) -> None:
    if _table_exists(table_name) and not _column_exists(table_name, column_name):
        op.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def upgrade() -> None:
    _add_column_if_missing("company_tariffs", "operator_puzzle_amount", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("default_company_tariffs", "operator_puzzle_amount", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("operators", "puzzle_rate", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing(
        "operator_company_billing_overrides",
        "puzzle_rate",
        "INTEGER NOT NULL DEFAULT 0",
    )


def downgrade() -> None:
    pass
