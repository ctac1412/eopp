"""add billing defaults to default company tariff

Revision ID: t0u1v2w3x4y5
Revises: s0t1u2v3w4x5
Create Date: 2026-06-15 15:00:00.000000
"""

from alembic import op

revision = "t0u1v2w3x4y5"
down_revision = "s0t1u2v3w4x5"
branch_labels = None
depends_on = None


def _has_column(conn, table_name: str, column_name: str) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def _table_exists(conn, table_name: str) -> bool:
    row = conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "default_company_tariffs"):
        return

    columns = [
        ("tax_commission_mode", "TEXT NOT NULL DEFAULT 'added'"),
        ("default_percent_rate", "REAL NOT NULL DEFAULT 0"),
        ("default_tax_rate", "REAL NOT NULL DEFAULT 0"),
        ("default_commission_user_id", "INTEGER"),
        ("default_tax_user_id", "INTEGER"),
    ]
    for name, definition in columns:
        if not _has_column(conn, "default_company_tariffs", name):
            op.execute(f"ALTER TABLE default_company_tariffs ADD COLUMN {name} {definition}")


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "default_company_tariffs"):
        return

    for name in [
        "default_tax_user_id",
        "default_commission_user_id",
        "default_tax_rate",
        "default_percent_rate",
        "tax_commission_mode",
    ]:
        if _has_column(conn, "default_company_tariffs", name):
            op.execute(f"ALTER TABLE default_company_tariffs DROP COLUMN {name}")
