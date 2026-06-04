"""add captcha distribution tables

Revision ID: g5h6i7j8k9l0
Revises: f4827f618ac7
Create Date: 2026-06-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g5h6i7j8k9l0'
down_revision: Union[str, Sequence[str], None] = 'f4827f618ac7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'distribution_answers',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('usage_log_id', sa.Integer(), nullable=True, default=0),
        sa.Column('captcha_id', sa.Text(), nullable=False),
        sa.Column('operator_id', sa.Integer(), nullable=False),
        sa.Column('icon_position', sa.Integer(), nullable=False),
        sa.Column('x', sa.Integer(), nullable=False),
        sa.Column('y', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('distribution_answers')
