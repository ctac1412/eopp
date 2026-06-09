"""operators table

Revision ID: h7i8j9k0l1m2
Revises: g5h6i7j8k9l0
Create Date: 2026-06-04 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h7i8j9k0l1m2'
down_revision: Union[str, Sequence[str], None] = 'g5h6i7j8k9l0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'operators',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('uuid', sa.Text(), nullable=False, unique=True),
        sa.Column('nickname', sa.Text(), nullable=False),
        sa.Column('created_at', sa.Text(), nullable=False),
    )

    op.create_table(
        'operator_master_links',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('operator_id', sa.Integer(), nullable=False),
        sa.Column('master_key_id', sa.Integer(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.Text(), nullable=False),
    )

    op.execute("DROP TABLE IF EXISTS operator_subscriptions")


def downgrade() -> None:
    op.create_table(
        'operator_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('operator_key_id', sa.Integer(), nullable=False),
        sa.Column('master_key_id', sa.Integer(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.Text(), nullable=False),
    )
    op.drop_table('operator_master_links')
    op.drop_table('operators')
