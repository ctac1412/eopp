"""add tax and commission modes

Revision ID: q0r1s2t3u4v5
Revises: p9q0r1s2t3u4
Create Date: 2026-06-15 12:00:00.000000
"""

from alembic import op

revision = "q0r1s2t3u4v5"
down_revision = "p9q0r1s2t3u4"
branch_labels = None
depends_on = None


def _has_column(conn, table_name: str, column_name: str) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_column(conn, "company_billing_settings", "tax_commission_mode"):
        op.execute(
            "ALTER TABLE company_billing_settings "
            "ADD COLUMN tax_commission_mode TEXT NOT NULL DEFAULT 'added'"
        )
    if not _has_column(conn, "invoices", "tax_commission_mode"):
        op.execute(
            "ALTER TABLE invoices ADD COLUMN tax_commission_mode TEXT DEFAULT 'added'"
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _has_column(conn, "invoices", "tax_commission_mode"):
        op.execute("ALTER TABLE invoices DROP COLUMN tax_commission_mode")
    if _has_column(conn, "company_billing_settings", "tax_commission_mode"):
        op.execute("ALTER TABLE company_billing_settings DROP COLUMN tax_commission_mode")
