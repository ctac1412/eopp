"""add captchas table

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-20
"""

from alembic import op

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE captchas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            captcha_id TEXT NOT NULL,
            status TEXT NOT NULL,
            usage_log_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (usage_log_id) REFERENCES usage_log(id)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS captchas")
