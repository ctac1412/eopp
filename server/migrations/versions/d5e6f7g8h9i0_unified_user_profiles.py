"""unified user memberships and functional profiles

Revision ID: d5e6f7g8h9i0
Revises: c4d5e6f7g8h9
Create Date: 2026-06-13 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from alembic import op

revision: str = "d5e6f7g8h9i0"
down_revision: str | Sequence[str] | None = "c4d5e6f7g8h9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_COMPANY = 'ООО "АРТ-ТРАНС"'


def _table_exists(table_name: str) -> bool:
    row = op.get_bind().exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def _ensure_column(table_name: str, column_sql: str) -> None:
    column_name = column_sql.split()[0]
    if not _column_exists(table_name, column_name):
        op.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}")


def _ensure_default_company(now: str) -> int:
    conn = op.get_bind()
    row = conn.exec_driver_sql("SELECT id FROM companies WHERE name = ?", (DEFAULT_COMPANY,)).fetchone()
    if row:
        return int(row[0])
    result = conn.exec_driver_sql(
        "INSERT INTO companies (name, aliases, notes, created_at, updated_at) VALUES (?, NULL, ?, ?, NULL)",
        (DEFAULT_COMPANY, "Default company for migrated API keys", now),
    )
    return int(result.lastrowid)


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(UTC).isoformat()

    _ensure_column("users", "system_role TEXT DEFAULT NULL")
    conn.exec_driver_sql("UPDATE users SET system_role = role WHERE system_role IS NULL AND role IN ('super_admin', 'administrator')")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS company_memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            role TEXT NOT NULL DEFAULT 'manager',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            CONSTRAINT uq_company_membership_user_company UNIQUE (user_id, company_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS master_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            CONSTRAINT uq_master_profile_user UNIQUE (user_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS operator_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            operator_id INTEGER REFERENCES operators(id),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            CONSTRAINT uq_operator_profile_user UNIQUE (user_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS finance_participant_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            CONSTRAINT uq_finance_profile_user UNIQUE (user_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_company_memberships_company ON company_memberships(company_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_master_profiles_company ON master_profiles(company_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_operator_profiles_company ON operator_profiles(company_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_finance_profiles_company ON finance_participant_profiles(company_id)")

    arttans_id = _ensure_default_company(now)
    conn.exec_driver_sql("UPDATE api_keys SET company_id = ? WHERE company_id IS NULL", (arttans_id,))
    conn.exec_driver_sql("UPDATE users SET company_id = ? WHERE company_id IS NULL", (arttans_id,))

    users = conn.exec_driver_sql("SELECT id, role, company_id FROM users").fetchall()
    for user_id, role, company_id in users:
        company_id = company_id or arttans_id
        membership_role = role if role in {"administrator", "manager"} else "manager"
        conn.exec_driver_sql(
            """
            INSERT OR IGNORE INTO company_memberships
                (user_id, company_id, role, active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, NULL)
            """,
            (user_id, company_id, membership_role, now),
        )

    key_users = conn.exec_driver_sql(
        "SELECT DISTINCT user_id, company_id FROM api_keys WHERE user_id IS NOT NULL"
    ).fetchall()
    for user_id, company_id in key_users:
        conn.exec_driver_sql(
            """
            INSERT OR IGNORE INTO master_profiles
                (user_id, company_id, active, created_at, updated_at)
            VALUES (?, ?, 1, ?, NULL)
            """,
            (user_id, company_id or arttans_id, now),
        )

    operators = conn.exec_driver_sql("SELECT id, uuid, nickname, company_id FROM operators").fetchall()
    existing_logins = {
        row[0]
        for row in conn.exec_driver_sql(
            "SELECT login FROM users WHERE login IS NOT NULL AND login != ''"
        ).fetchall()
    }
    for operator_id, uuid, nickname, company_id in operators:
        company_id = company_id or arttans_id
        login_base = f"operator_{uuid or operator_id}"
        login = login_base
        suffix = 2
        while login in existing_logins:
            login = f"{login_base}_{suffix}"
            suffix += 1
        existing_logins.add(login)
        result = conn.exec_driver_sql(
            """
            INSERT INTO users (name, login, password_hash, role, system_role, active, company_id, created_at)
            VALUES (?, ?, NULL, 'operator', NULL, 1, ?, ?)
            """,
            (nickname or login, login, company_id, now),
        )
        user_id = int(result.lastrowid)
        conn.exec_driver_sql(
            """
            INSERT OR IGNORE INTO company_memberships
                (user_id, company_id, role, active, created_at, updated_at)
            VALUES (?, ?, 'manager', 1, ?, NULL)
            """,
            (user_id, company_id, now),
        )
        conn.exec_driver_sql(
            """
            INSERT OR IGNORE INTO operator_profiles
                (user_id, company_id, operator_id, active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, NULL)
            """,
            (user_id, company_id, operator_id, now),
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS finance_participant_profiles")
    op.execute("DROP TABLE IF EXISTS operator_profiles")
    op.execute("DROP TABLE IF EXISTS master_profiles")
    op.execute("DROP TABLE IF EXISTS company_memberships")
