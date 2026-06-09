"""add has_coordinates and has_boxes to captcha_files

Revision ID: r1s2t3u4v5w6
Revises: q9r0s1t2u3v4
Create Date: 2026-06-09
"""

from alembic import op


revision = "r1s2t3u4v5w6"
down_revision = "q9r0s1t2u3v4"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE captcha_files ADD COLUMN has_coordinates INTEGER DEFAULT 0")
    op.execute("ALTER TABLE captcha_files ADD COLUMN has_boxes INTEGER DEFAULT 0")


def downgrade():
    pass
