"""add company billing settings

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-05-23 14:30:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "e1f2a3b4c5d6"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    tables = {row[0] for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'")}
    if "company_billing_settings" not in tables:
        op.execute(
            """
            CREATE TABLE company_billing_settings (
                company TEXT PRIMARY KEY,
                auto_invoice_reopen INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT
            )
            """
        )


def downgrade() -> None:
    conn = op.get_bind()
    tables = {row[0] for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'")}
    if "company_billing_settings" in tables:
        op.execute("DROP TABLE company_billing_settings")
