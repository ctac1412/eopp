"""add company billing defaults

Revision ID: s0t1u2v3w4x5
Revises: r0s1t2u3v4w5
Create Date: 2026-06-15 14:00:00.000000
"""

from alembic import op

revision = "s0t1u2v3w4x5"
down_revision = "r0s1t2u3v4w5"
branch_labels = None
depends_on = None


def _has_column(conn, table_name: str, column_name: str) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    conn = op.get_bind()
    columns = [
        ("default_percent_rate", "REAL NOT NULL DEFAULT 0"),
        ("default_tax_rate", "REAL NOT NULL DEFAULT 0"),
        ("default_commission_user_id", "INTEGER"),
        ("default_tax_user_id", "INTEGER"),
    ]
    for name, definition in columns:
        if not _has_column(conn, "company_billing_settings", name):
            op.execute(f"ALTER TABLE company_billing_settings ADD COLUMN {name} {definition}")


def downgrade() -> None:
    conn = op.get_bind()
    for name in [
        "default_tax_user_id",
        "default_commission_user_id",
        "default_tax_rate",
        "default_percent_rate",
    ]:
        if _has_column(conn, "company_billing_settings", name):
            op.execute(f"ALTER TABLE company_billing_settings DROP COLUMN {name}")
