"""add peak create price to tariffs

Revision ID: b8c9d0e1f2a3
Revises: a8f1c2d3e4f5
Create Date: 2026-05-23
"""

from alembic import op

revision = "b8c9d0e1f2a3"
down_revision = "a8f1c2d3e4f5"
branch_labels = None
depends_on = None


def _existing_columns(table_name: str) -> set[str]:
    conn = op.get_bind()
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def upgrade() -> None:
    if "price_create_peak" not in _existing_columns("tariffs"):
        op.execute("ALTER TABLE tariffs ADD COLUMN price_create_peak INTEGER")


def downgrade() -> None:
    # SQLite downgrade kept as no-op for compatibility with existing dev/prod DBs.
    pass
