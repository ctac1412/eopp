"""add manual captcha label fields

Revision ID: l4m5n6o7p8q9
Revises: k3l4m5n6o7p8
Create Date: 2026-05-26
"""

from alembic import op


revision = "l4m5n6o7p8q9"
down_revision = "k3l4m5n6o7p8"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE captcha_files ADD COLUMN manual_labeled BOOLEAN NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE captcha_files ADD COLUMN label_source VARCHAR DEFAULT NULL")
    op.execute("ALTER TABLE captcha_files ADD COLUMN solver_top1_matches_valid BOOLEAN DEFAULT NULL")


def downgrade():
    op.execute("ALTER TABLE captcha_files DROP COLUMN solver_top1_matches_valid")
    op.execute("ALTER TABLE captcha_files DROP COLUMN label_source")
    op.execute("ALTER TABLE captcha_files DROP COLUMN manual_labeled")
