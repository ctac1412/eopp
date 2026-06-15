"""add default company tariff

Revision ID: o8p9q0r1s2t3
Revises: n7o8p9q0r1s2
Create Date: 2026-06-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "o8p9q0r1s2t3"
down_revision: str | Sequence[str] | None = "n7o8p9q0r1s2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS default_company_tariffs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            price_create INTEGER NOT NULL,
            price_reschedule INTEGER NOT NULL,
            price_create_peak INTEGER,
            price_custom_slots INTEGER,
            executor_amount INTEGER NOT NULL DEFAULT 0,
            operator_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS default_company_tariffs")
