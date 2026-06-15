"""add operator billing mode

Revision ID: p9q0r1s2t3u4
Revises: o8p9q0r1s2t3
Create Date: 2026-06-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "p9q0r1s2t3u4"
down_revision: str | Sequence[str] | None = "o8p9q0r1s2t3"
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


def upgrade() -> None:
    if _table_exists("operators") and not _column_exists("operators", "billing_mode"):
        op.execute("ALTER TABLE operators ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'company'")
        op.execute(
            """
            UPDATE operators
            SET billing_mode = CASE
                WHEN COALESCE(icon_rate, 0) > 0 THEN 'custom'
                ELSE 'company'
            END
            """
        )


def downgrade() -> None:
    # SQLite deployments keep columns for rollback safety.
    pass
