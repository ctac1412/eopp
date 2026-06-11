"""add admin_audit_log table

Revision ID: y9z0a1b2c3d4
Revises: x5y6z7a8b9c0
Create Date: 2026-06-11 00:00:03.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'y9z0a1b2c3d4'
down_revision: Union[str, Sequence[str], None] = 'x5y6z7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    row = conn.exec_driver_sql(
        f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    ).fetchone()
    return row is not None


def upgrade() -> None:
    if _table_exists("admin_audit_log"):
        return
    op.create_table(
        "admin_audit_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("timestamp", sa.Text(), nullable=False),
    )
    op.create_index("idx_audit_log_admin", "admin_audit_log", ["admin_id"])
    op.create_index("idx_audit_log_target", "admin_audit_log", ["target_type", "target_id"])


def downgrade() -> None:
    op.drop_table("admin_audit_log")
