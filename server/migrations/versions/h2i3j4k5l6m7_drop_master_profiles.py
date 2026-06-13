"""drop master profiles

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-06-13
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from alembic import op


revision: str = "h2i3j4k5l6m7"
down_revision: str | Sequence[str] | None = "g1h2i3j4k5l6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    row = op.get_bind().exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _insert_executor_assignment(user_id: int | None, company_id: int | None, now: str) -> None:
    if user_id is None:
        return
    conn = op.get_bind()
    existing = conn.exec_driver_sql(
        """
        SELECT id FROM user_executor_companies
        WHERE user_id = ?
          AND active = 1
          AND (
            (company_id IS NULL AND ? IS NULL)
            OR company_id = ?
          )
        LIMIT 1
        """,
        (int(user_id), company_id, company_id),
    ).fetchone()
    if existing:
        return
    conn.exec_driver_sql(
        """
        INSERT INTO user_executor_companies (user_id, company_id, active, created_at, updated_at)
        VALUES (?, ?, 1, ?, NULL)
        """,
        (int(user_id), company_id, now),
    )


def upgrade() -> None:
    if not _table_exists("master_profiles"):
        return
    if not _table_exists("user_executor_companies"):
        op.execute(
            """
            CREATE TABLE IF NOT EXISTS user_executor_companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                company_id INTEGER REFERENCES companies(id),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
            """
        )
    now = datetime.now(UTC).isoformat()
    rows = op.get_bind().exec_driver_sql(
        """
        SELECT user_id, company_id, scope
        FROM master_profiles
        WHERE active = 1
        """
    ).fetchall()
    for user_id, company_id, scope in rows:
        _insert_executor_assignment(
            user_id,
            None if scope == "all_companies" else company_id,
            now,
        )
    op.execute("DROP TABLE master_profiles")


def downgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS master_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            scope TEXT NOT NULL DEFAULT 'own_company',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            CONSTRAINT uq_master_profile_user UNIQUE (user_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_master_profiles_company ON master_profiles(company_id)")

