"""add productos

Revision ID: 67ab8a7ccb17
Revises: 0010
Create Date: 2026-04-21 23:04:14.018653

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '67ab8a7ccb17'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'productos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=200), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('tipo', sa.String(length=20), nullable=False),
        sa.Column('precio', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('moneda', sa.String(length=3), server_default='UYU', nullable=False),
        sa.Column('stock', sa.Integer(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_productos_user_id'), 'productos', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_productos_user_id'), table_name='productos')
    op.drop_table('productos')
