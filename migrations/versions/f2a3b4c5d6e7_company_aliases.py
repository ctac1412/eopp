"""add company aliases

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-05-23 18:00:00.000000
"""

from alembic import op

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    tables = {row[0] for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'")}
    if "company_aliases" not in tables:
        op.execute(
            """
            CREATE TABLE company_aliases (
                alias TEXT PRIMARY KEY,
                company TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def downgrade() -> None:
    conn = op.get_bind()
    tables = {row[0] for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'")}
    if "company_aliases" in tables:
        op.execute("DROP TABLE company_aliases")
