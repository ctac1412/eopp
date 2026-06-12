"""extend admin audit log for RBAC events

Revision ID: a2b3c4d5e6f7
Revises: z0a1b2c3d4e5
Create Date: 2026-06-11 00:00:05.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | Sequence[str] | None = "z0a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Return whether a SQLite table already has a column."""
    rows = op.get_bind().exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    """Add RBAC context columns to the existing admin audit table."""
    additions = {
        "category": "TEXT DEFAULT 'admin'",
        "actor_role": "TEXT",
        "permission": "TEXT",
        "metadata_json": "TEXT",
    }
    for column, ddl in additions.items():
        if not _column_exists("admin_audit_log", column):
            op.execute(f"ALTER TABLE admin_audit_log ADD COLUMN {column} {ddl}")


def downgrade() -> None:
    """Leave added audit columns in place because SQLite cannot drop them safely."""
    pass
