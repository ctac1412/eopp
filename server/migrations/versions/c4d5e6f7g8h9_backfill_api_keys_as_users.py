"""backfill api keys as password users

Revision ID: c4d5e6f7g8h9
Revises: b3c4d5e6f7g8
Create Date: 2026-06-13 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
import hashlib
import re

from alembic import op

revision: str = "c4d5e6f7g8h9"
down_revision: str | Sequence[str] | None = "b3c4d5e6f7g8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ITERATIONS = 120_000


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


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest}"


def _login_from_label(label: str | None, api_key_id: int) -> str:
    raw = (label or "").strip().lower()
    login = re.sub(r"[^a-z0-9_.-]+", "_", raw).strip("._-")
    return (login or f"api_key_{api_key_id}")[:80]


def _unique_login(base_login: str, existing: set[str]) -> str:
    login = base_login
    index = 2
    while login in existing:
        suffix = f"_{index}"
        login = f"{base_login[: 80 - len(suffix)]}{suffix}"
        index += 1
    existing.add(login)
    return login


def _ensure_auth_schema() -> None:
    if not _column_exists("users", "login"):
        op.execute("ALTER TABLE users ADD COLUMN login TEXT DEFAULT NULL")
    if not _column_exists("users", "password_hash"):
        op.execute("ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT NULL")
    if not _column_exists("users", "role"):
        op.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'manager'")
    if not _column_exists("users", "active"):
        op.execute("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
    if not _column_exists("users", "company_id"):
        op.execute("ALTER TABLE users ADD COLUMN company_id INTEGER REFERENCES companies(id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_login ON users(login)")

    if not _column_exists("api_keys", "user_id"):
        op.execute("ALTER TABLE api_keys ADD COLUMN user_id INTEGER REFERENCES users(id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_api_keys_user_id ON api_keys(user_id)")


def upgrade() -> None:
    """Ensure every API key can be used as a login/password account.

    This is intentionally idempotent for production databases: it only creates a
    user for API keys without ``user_id`` and hashes the API key value as that
    user's password.
    """
    _ensure_auth_schema()
    conn = op.get_bind()
    now = datetime.now(UTC).isoformat()
    existing_rows = conn.exec_driver_sql(
        "SELECT login FROM users WHERE login IS NOT NULL AND login != ''"
    ).fetchall()
    existing = {row[0] for row in existing_rows}
    api_keys = conn.exec_driver_sql(
        """
        SELECT id, key, label, is_admin, admin_role, company_id, user_id
        FROM api_keys
        ORDER BY id
        """
    ).fetchall()

    for row in api_keys:
        api_key_id, key, label, is_admin, admin_role, company_id, user_id = row
        if user_id:
            continue
        role = admin_role or ("super_admin" if is_admin else "manager")
        login = _unique_login(_login_from_label(label, api_key_id), existing)
        name = (label or login).strip() or login
        password_hash = _hash_password(str(key), f"api-key-{api_key_id}")
        result = conn.exec_driver_sql(
            """
            INSERT INTO users (name, login, password_hash, role, active, company_id, created_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """,
            (name, login, password_hash, role, company_id, now),
        )
        conn.exec_driver_sql(
            "UPDATE api_keys SET user_id = ? WHERE id = ?",
            (result.lastrowid, api_key_id),
        )


def downgrade() -> None:
    """Keep migrated users in place; login rollback would be destructive."""
    pass
