"""add moneda to registros

Revision ID: 57155e8c7244
Revises: 0009
Create Date: 2026-04-20 22:25:06.691204

"""
from alembic import op
import sqlalchemy as sa

revision: str = '57155e8c7244'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('registros', sa.Column('moneda', sa.String(length=3), server_default='UYU', nullable=False))


def downgrade() -> None:
    op.drop_column('registros', 'moneda')
