"""add companies table and company_id FKs

Revision ID: u2v3w4x5y6z7
Revises: t1u2v3w4x5y6
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'u2v3w4x5y6z7'
down_revision: Union[str, Sequence[str], None] = 't1u2v3w4x5y6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    , (table_name,)).fetchall()
    return len(rows) > 0


def upgrade() -> None:
    # Create companies table
    if not _table_exists("companies"):
        op.create_table(
            "companies",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(), unique=True, nullable=False),
            sa.Column("aliases", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.Text(), nullable=True),
        )

    # Add company_id to api_keys
    if not _column_exists("api_keys", "company_id"):
        op.execute("ALTER TABLE api_keys ADD COLUMN company_id INTEGER")

    # Add company_id to operators
    if _table_exists("operators") and not _column_exists("operators", "company_id"):
        op.execute("ALTER TABLE operators ADD COLUMN company_id INTEGER")

    # Add company_id to usage_log
    if not _column_exists("usage_log", "company_id"):
        op.execute("ALTER TABLE usage_log ADD COLUMN company_id INTEGER")


def downgrade() -> None:
    # SQLite does not support DROP COLUMN easily; skip for safety.
    pass
