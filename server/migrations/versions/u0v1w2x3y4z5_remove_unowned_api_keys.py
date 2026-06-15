"""remove unowned non-system api keys

Revision ID: u0v1w2x3y4z5
Revises: t0u1v2w3x4y5
Create Date: 2026-06-15 18:00:00.000000
"""

from alembic import op

revision = "u0v1w2x3y4z5"
down_revision = "t0u1v2w3x4y5"
branch_labels = None
depends_on = None


def _has_column(conn, table_name: str, column_name: str) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_column(conn, "api_keys", "user_id"):
        return
    admin_role_filter = "AND (admin_role IS NULL OR admin_role = '')" if _has_column(conn, "api_keys", "admin_role") else ""
    is_admin_filter = "AND COALESCE(is_admin, 0) = 0" if _has_column(conn, "api_keys", "is_admin") else ""
    op.execute(
        f"""
        DELETE FROM api_keys
         WHERE user_id IS NULL
           {is_admin_filter}
           {admin_role_filter}
        """
    )


def downgrade() -> None:
    pass
