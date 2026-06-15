"""add default payout splits

Revision ID: v0w1x2y3z4a5
Revises: u0v1w2x3y4z5
Create Date: 2026-06-15 19:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "v0w1x2y3z4a5"
down_revision = "u0v1w2x3y4z5"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    row = conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "default_payout_splits"):
        return
    op.create_table(
        "default_payout_splits",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("split_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "default_payout_splits"):
        op.drop_table("default_payout_splits")
