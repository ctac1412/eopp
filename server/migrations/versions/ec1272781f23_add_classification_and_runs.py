"""add_classification_and_runs

Revision ID: ec1272781f23
Revises: n6o7p8q9r0s1
Create Date: 2026-05-27 21:07:58.995517
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ec1272781f23'
down_revision: Union[str, Sequence[str], None] = 'n6o7p8q9r0s1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add classification column (skip if already exists)
    try:
        op.execute("ALTER TABLE captcha_files ADD COLUMN classification VARCHAR")
    except Exception:
        pass  # column already exists from manual migration

    # Create classification_runs table for AI hypothesis testing stats
    op.execute("""
        CREATE TABLE IF NOT EXISTS classification_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT NOT NULL,
            model_version INTEGER NOT NULL,
            total INTEGER NOT NULL,
            figure_found INTEGER NOT NULL DEFAULT 0,
            digit_found INTEGER NOT NULL DEFAULT 0,
            puzzle_found INTEGER NOT NULL DEFAULT 0,
            true_positives INTEGER NOT NULL DEFAULT 0,
            false_positives INTEGER NOT NULL DEFAULT 0,
            false_negatives INTEGER NOT NULL DEFAULT 0,
            true_negatives INTEGER NOT NULL DEFAULT 0,
            accuracy REAL,
            precision REAL,
            recall REAL,
            f1 REAL,
            speed_avg REAL,
            speed_median REAL,
            solver_top1_hits INTEGER NOT NULL DEFAULT 0,
            solver_top1_total INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS classification_runs")
    # SQLite doesn't support DROP COLUMN easily, skip classification column rollback
