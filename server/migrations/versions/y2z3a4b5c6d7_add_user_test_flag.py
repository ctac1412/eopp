"""add user test flag

Revision ID: y2z3a4b5c6d7
Revises: x1y2z3a4b5c6
Create Date: 2026-06-16
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "y2z3a4b5c6d7"
down_revision: str | Sequence[str] | None = "x1y2z3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("users", "is_test"):
        op.add_column("users", sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("0")))


def downgrade() -> None:
    if _column_exists("users", "is_test"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("is_test")
