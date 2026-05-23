"""add prepaid packages and deductions

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-05-23
"""

from alembic import op

revision = "d0e1f2a3b4c5"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def _existing_tables() -> set[str]:
    conn = op.get_bind()
    rows = conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    return {row[0] for row in rows}


def upgrade() -> None:
    tables = _existing_tables()
    if "prepaid_packages" not in tables:
        op.execute(
            """CREATE TABLE prepaid_packages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_key_id INTEGER NOT NULL,
                balance_amount INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
            )"""
        )
    if "prepaid_deductions" not in tables:
        op.execute(
            """CREATE TABLE prepaid_deductions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                package_id INTEGER NOT NULL,
                usage_log_id INTEGER NOT NULL UNIQUE,
                amount INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (package_id) REFERENCES prepaid_packages(id),
                FOREIGN KEY (usage_log_id) REFERENCES usage_log(id)
            )"""
        )


def downgrade() -> None:
    # SQLite downgrade kept as no-op for compatibility.
    pass

