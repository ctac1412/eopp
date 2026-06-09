"""add courses and test_runs tables

Revision ID: p8q9r0s1t2u3
Revises: o7p8q9r0s1t2
Create Date: 2026-06-09
"""

from alembic import op


revision = "p8q9r0s1t2u3"
down_revision = "o7p8q9r0s1t2"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_by TEXT DEFAULT '',
            created_at TEXT NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE course_captchas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL REFERENCES courses(id),
            captcha_file_id INTEGER NOT NULL REFERENCES captcha_files(id),
            sort_order INTEGER DEFAULT 0
        )
    """)
    op.execute("""
        CREATE TABLE test_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL REFERENCES courses(id),
            participant_type TEXT NOT NULL,
            participant_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            interval_min REAL DEFAULT 2.0,
            interval_max REAL DEFAULT 7.0,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE test_run_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_run_id INTEGER NOT NULL REFERENCES test_runs(id),
            captcha_file_id INTEGER NOT NULL REFERENCES captcha_files(id),
            captcha_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            variant_index INTEGER,
            duration_ms INTEGER,
            icon_times TEXT,
            created_at TEXT NOT NULL
        )
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS test_run_results")
    op.execute("DROP TABLE IF EXISTS test_runs")
    op.execute("DROP TABLE IF EXISTS course_captchas")
    op.execute("DROP TABLE IF EXISTS courses")
