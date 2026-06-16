"""drop legacy operator nickname

Revision ID: x1y2z3a4b5c6
Revises: w1x2y3z4a5b6
Create Date: 2026-06-16 12:05:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "x1y2z3a4b5c6"
down_revision: str | Sequence[str] | None = "w1x2y3z4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = op.get_bind().exec_driver_sql(f'PRAGMA table_info("{table_name}")').fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("operators", "nickname"):
        return
    with op.batch_alter_table("operators") as batch:
        batch.drop_column("nickname")


def downgrade() -> None:
    if _column_exists("operators", "nickname"):
        return
    with op.batch_alter_table("operators") as batch:
        batch.add_column(sa.Column("nickname", sa.Text(), nullable=False, server_default="operator"))
