"""repair finance income backfill

Revision ID: w1x2y3z4a5b6
Revises: v0w1x2y3z4a5
Create Date: 2026-06-15 20:30:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "w1x2y3z4a5b6"
down_revision: str | Sequence[str] | None = "v0w1x2y3z4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    row = op.get_bind().exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def upgrade() -> None:
    if not (_table_exists("usage_log") and _table_exists("finance_entries")):
        return

    op.get_bind().exec_driver_sql(
        """
        DELETE FROM finance_entries
        WHERE source = 'migration'
          AND kind = 'customer_income'
          AND source_key LIKE 'usage:%:income'
          AND COALESCE(amount, 0) <= 0
          AND payout_id IS NULL
          AND edit_state = 'open'
          AND EXISTS (
              SELECT 1
              FROM usage_log ul
              WHERE ul.id = finance_entries.usage_log_id
                AND COALESCE(ul.price, 0) <= 0
          )
        """
    )


def downgrade() -> None:
    pass
