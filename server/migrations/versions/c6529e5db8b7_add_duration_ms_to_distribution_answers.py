"""add duration_ms to distribution_answers

Revision ID: c6529e5db8b7
Revises: i9j0k1l2m3n4
Create Date: 2026-06-09 13:38:07.220848

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6529e5db8b7'
down_revision: Union[str, Sequence[str], None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('distribution_answers', sa.Column('duration_ms', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('distribution_answers') as batch_op:
        batch_op.drop_column('duration_ms')
