"""company tariffs and master profile scope

Revision ID: d6e7f8g9h0i1
Revises: d5e6f7g8h9i0
Create Date: 2026-06-13 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "d6e7f8g9h0i1"
down_revision: str | Sequence[str] | None = "d5e6f7g8h9i0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("master_profiles", "scope"):
        op.execute("ALTER TABLE master_profiles ADD COLUMN scope TEXT NOT NULL DEFAULT 'own_company'")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS company_tariffs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
            price_create INTEGER NOT NULL,
            price_reschedule INTEGER NOT NULL,
            price_create_peak INTEGER,
            price_custom_slots INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_company_tariffs_company_id ON company_tariffs(company_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS company_tariffs")
