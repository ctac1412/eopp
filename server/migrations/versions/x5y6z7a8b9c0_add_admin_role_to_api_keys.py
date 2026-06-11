"""add admin_role to api_keys

Revision ID: x5y6z7a8b9c0
Revises: w4x5y6z7a8b9
Create Date: 2026-06-11 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'x5y6z7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'w4x5y6z7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    if not _column_exists("api_keys", "admin_role"):
        op.execute("ALTER TABLE api_keys ADD COLUMN admin_role TEXT DEFAULT NULL")
    # Promote existing is_admin=1 keys to super_admin role
    op.execute(
        "UPDATE api_keys SET admin_role = 'super_admin' "
        "WHERE is_admin = 1 AND admin_role IS NULL"
    )


def downgrade() -> None:
    pass
