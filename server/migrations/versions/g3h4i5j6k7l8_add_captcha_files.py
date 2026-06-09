"""add captcha_files table

Revision ID: g3h4i5j6k7l8
Revises: f2a3b4c5d6e7
Create Date: 2026-05-26
"""

from alembic import op

revision = "g3h4i5j6k7l8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS captcha_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            captcha_id TEXT NOT NULL UNIQUE,
            file_path TEXT NOT NULL,
            file_status TEXT NOT NULL,
            captcha_type TEXT DEFAULT 'unknown',
            tiles_hash TEXT,
            valid_index INTEGER,
            variants_count INTEGER,
            file_size INTEGER,
            file_mtime TEXT,
            classification TEXT DEFAULT NULL,
            usage_log_id INTEGER DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            last_seen_at TEXT DEFAULT (datetime('now'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_captcha_files_tiles_hash ON captcha_files(tiles_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_captcha_files_status ON captcha_files(file_status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS captcha_files")
