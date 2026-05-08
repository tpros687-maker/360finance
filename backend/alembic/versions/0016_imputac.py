"""add tipo_imputacion, actividad_tipo, actividad_id to registros

Revision ID: 0016_imputac
Revises: 0015_produccion
Create Date: 2026-05-08
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_imputac"
down_revision: Union[str, None] = "0015_produccion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("registros", sa.Column("tipo_imputacion", sa.String(20), nullable=True))
    op.add_column("registros", sa.Column("actividad_tipo", sa.String(20), nullable=True))
    op.add_column("registros", sa.Column("actividad_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("registros", "actividad_id")
    op.drop_column("registros", "actividad_tipo")
    op.drop_column("registros", "tipo_imputacion")
