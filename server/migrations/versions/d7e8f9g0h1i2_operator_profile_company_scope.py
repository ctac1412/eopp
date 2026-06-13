"""operator profile company scope

Revision ID: d7e8f9g0h1i2
Revises: d6e7f8g9h0i1
Create Date: 2026-06-13 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "d7e8f9g0h1i2"
down_revision: str | Sequence[str] | None = "d6e7f8g9h0i1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("operator_profiles", "company_ids"):
        op.execute("ALTER TABLE operator_profiles ADD COLUMN company_ids TEXT")
    op.execute(
        """
        UPDATE operator_profiles
        SET company_ids = '[' || company_id || ']'
        WHERE company_ids IS NULL AND company_id IS NOT NULL
        """
    )


def downgrade() -> None:
    # SQLite cannot drop columns without a table rebuild; keep this migration additive.
    pass
