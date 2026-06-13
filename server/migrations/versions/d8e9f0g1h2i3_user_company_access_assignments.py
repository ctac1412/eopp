"""user company access assignments

Revision ID: d8e9f0g1h2i3
Revises: d7e8f9g0h1i2
Create Date: 2026-06-13 00:00:00.000000
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime

from alembic import op

revision: str = "d8e9f0g1h2i3"
down_revision: str | Sequence[str] | None = "d7e8f9g0h1i2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = (
    "user_finance_companies",
    "user_operator_companies",
    "user_executor_companies",
)


def _table_exists(table_name: str) -> bool:
    row = op.get_bind().exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _insert_assignment(table: str, user_id: int | None, company_id: int | None, now: str) -> None:
    if user_id is None:
        return
    conn = op.get_bind()
    existing = conn.exec_driver_sql(
        f"""
        SELECT id FROM {table}
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
        f"""
        INSERT INTO {table} (user_id, company_id, active, created_at, updated_at)
        VALUES (?, ?, 1, ?, NULL)
        """,
        (int(user_id), company_id, now),
    )


def _create_assignment_table(table_name: str) -> None:
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            company_id INTEGER REFERENCES companies(id),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
        """
    )
    op.execute(
        f"""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_{table_name}_user_company_active
        ON {table_name}(user_id, company_id)
        WHERE active = 1 AND company_id IS NOT NULL
        """
    )
    op.execute(
        f"""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_{table_name}_user_all_active
        ON {table_name}(user_id)
        WHERE active = 1 AND company_id IS NULL
        """
    )
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_company ON {table_name}(company_id)")


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(UTC).isoformat()

    for table in TABLES:
        _create_assignment_table(table)

    if _table_exists("finance_participant_profiles"):
        rows = conn.exec_driver_sql(
            """
            SELECT user_id, company_id
            FROM finance_participant_profiles
            WHERE active = 1
            """
        ).fetchall()
        for user_id, company_id in rows:
            _insert_assignment("user_finance_companies", user_id, company_id, now)

    if _table_exists("operator_profiles"):
        rows = conn.exec_driver_sql(
            """
            SELECT user_id, company_id, company_ids
            FROM operator_profiles
            WHERE active = 1
            """
        ).fetchall()
        for user_id, company_id, company_ids_raw in rows:
            company_ids: list[int] = []
            if company_ids_raw:
                try:
                    company_ids = [int(value) for value in json.loads(company_ids_raw) if value is not None]
                except (TypeError, ValueError, json.JSONDecodeError):
                    company_ids = []
            if not company_ids and company_id is not None:
                company_ids = [int(company_id)]
            for cid in dict.fromkeys(company_ids):
                _insert_assignment("user_operator_companies", user_id, cid, now)

    if _table_exists("master_profiles"):
        rows = conn.exec_driver_sql(
            """
            SELECT user_id, company_id, scope
            FROM master_profiles
            WHERE active = 1
            """
        ).fetchall()
        for user_id, company_id, scope in rows:
            _insert_assignment(
                "user_executor_companies",
                user_id,
                None if scope == "all_companies" else company_id,
                now,
            )

    rows = conn.exec_driver_sql(
        """
        SELECT DISTINCT user_id, company_id
        FROM api_keys
        WHERE user_id IS NOT NULL
        """
    ).fetchall()
    for user_id, company_id in rows:
        _insert_assignment("user_executor_companies", user_id, company_id, now)

    keyless = conn.exec_driver_sql(
        "SELECT COUNT(*) FROM api_keys WHERE user_id IS NULL"
    ).scalar()
    operatorless = conn.exec_driver_sql(
        """
        SELECT COUNT(*)
        FROM operators o
        LEFT JOIN operator_profiles p ON p.operator_id = o.id
        WHERE p.user_id IS NULL
        """
    ).scalar() if _table_exists("operators") and _table_exists("operator_profiles") else 0
    print(
        "user_company_access_migration "
        f"api_keys_without_user={keyless} operators_without_user={operatorless}"
    )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table}")
