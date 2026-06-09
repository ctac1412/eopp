"""add has_custom_slots and price_custom_slots

Revision ID: f4827f618ac7
Revises: ec1272781f23
Create Date: 2026-06-03 14:47:46.245416

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4827f618ac7'
down_revision: Union[str, Sequence[str], None] = 'ec1272781f23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usage_log', sa.Column('has_custom_slots', sa.Boolean(), nullable=True, server_default=sa.text('0')))
    op.add_column('tariffs', sa.Column('price_custom_slots', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('usage_log', 'has_custom_slots')
    op.drop_column('tariffs', 'price_custom_slots')
