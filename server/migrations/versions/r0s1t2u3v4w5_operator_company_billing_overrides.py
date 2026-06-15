"""add operator company billing overrides

Revision ID: r0s1t2u3v4w5
Revises: q0r1s2t3u4v5
Create Date: 2026-06-15 13:00:00.000000
"""

from alembic import op

revision = "r0s1t2u3v4w5"
down_revision = "q0r1s2t3u4v5"
branch_labels = None
depends_on = None


def _has_table(conn, table_name: str) -> bool:
    row = conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_table(conn, "operator_company_billing_overrides"):
        op.execute(
            """
            CREATE TABLE operator_company_billing_overrides (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operator_id INTEGER NOT NULL,
                company_id INTEGER NOT NULL,
                billing_mode TEXT NOT NULL DEFAULT 'company',
                icon_rate INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(operator_id, company_id),
                FOREIGN KEY(operator_id) REFERENCES operators(id) ON DELETE CASCADE,
                FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
            )
            """
        )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_operator_company_billing_overrides_operator
        ON operator_company_billing_overrides(operator_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_operator_company_billing_overrides_company
        ON operator_company_billing_overrides(company_id)
        """
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _has_table(conn, "operator_company_billing_overrides"):
        op.execute("DROP TABLE operator_company_billing_overrides")
