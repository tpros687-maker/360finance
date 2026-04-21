"""add pagos_historial

Revision ID: a1b2c3d4e5f6
Revises: 0bfad930e7f3
Create Date: 2026-04-21 23:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '0bfad930e7f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pagos_historial',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('monto', sa.Numeric(10, 2), nullable=False),
        sa.Column('moneda', sa.String(length=3), server_default='USD', nullable=False),
        sa.Column('estado', sa.String(length=30), nullable=False),
        sa.Column('mp_payment_id', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_pagos_historial_user_id', 'pagos_historial', ['user_id'])
    op.create_index('ix_pagos_historial_mp_payment_id', 'pagos_historial', ['mp_payment_id'])


def downgrade() -> None:
    op.drop_index('ix_pagos_historial_mp_payment_id', table_name='pagos_historial')
    op.drop_index('ix_pagos_historial_user_id', table_name='pagos_historial')
    op.drop_table('pagos_historial')
