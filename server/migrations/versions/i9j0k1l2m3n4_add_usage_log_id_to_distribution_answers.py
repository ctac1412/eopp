"""add usage_log_id to distribution_answers

Revision ID: i9j0k1l2m3n4
Revises: g5h6i7j8k9l0
Create Date: 2026-06-04 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, Sequence[str], None] = 'g5h6i7j8k9l0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    try:
        op.add_column('distribution_answers', sa.Column('usage_log_id', sa.Integer(), nullable=True, default=0))
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_column('distribution_answers', 'usage_log_id')
    except Exception:
        pass
