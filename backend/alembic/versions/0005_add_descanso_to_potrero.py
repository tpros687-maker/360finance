"""add en_descanso and fecha_descanso to potreros

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("potreros", sa.Column("en_descanso", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("potreros", sa.Column("fecha_descanso", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("potreros", "fecha_descanso")
    op.drop_column("potreros", "en_descanso")
