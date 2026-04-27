"""add agricultural fields to potreros and aplicaciones_potrero table

Revision ID: 0012_agro
Revises: 0011_esp_fix
Create Date: 2026-04-27 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0012_agro'
down_revision: Union[str, None] = '0011_esp_fix'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('potreros', sa.Column('cultivo', sa.String(200), nullable=True))
    op.add_column('potreros', sa.Column('es_primera', sa.Boolean(), nullable=True))
    op.add_column('potreros', sa.Column('fecha_siembra', sa.Date(), nullable=True))

    op.create_table(
        'aplicaciones_potrero',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('potrero_id', sa.Integer(), sa.ForeignKey('potreros.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('producto', sa.String(200), nullable=False),
        sa.Column('fecha_aplicacion', sa.Date(), nullable=False),
        sa.Column('costo', sa.Numeric(14, 2), nullable=True),
        sa.Column('moneda', sa.String(3), nullable=False, server_default='UYU'),
        sa.Column('observaciones', sa.Text(), nullable=True),
        sa.Column('registro_id', sa.Integer(), sa.ForeignKey('registros.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('aplicaciones_potrero')
    op.drop_column('potreros', 'fecha_siembra')
    op.drop_column('potreros', 'es_primera')
    op.drop_column('potreros', 'cultivo')
