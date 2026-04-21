"""add plan and trial fields

Revision ID: 0bfad930e7f3
Revises: 67ab8a7ccb17
Create Date: 2026-04-21 23:17:02.507183

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0bfad930e7f3'
down_revision: Union[str, None] = '67ab8a7ccb17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('plan', sa.String(length=20), server_default='trial', nullable=False))
    op.add_column('users', sa.Column('trial_inicio', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('trial_fin', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('suscripcion_id', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'suscripcion_id')
    op.drop_column('users', 'trial_fin')
    op.drop_column('users', 'trial_inicio')
    op.drop_column('users', 'plan')
