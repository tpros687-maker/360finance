"""add coneat and kg_producidos_anio to potreros

Revision ID: 0014_coneat
Revises: 0013_franjas
Create Date: 2026-05-06
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_coneat"
down_revision: Union[str, None] = "0013_franjas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("potreros", sa.Column("coneat", sa.Numeric(6, 1), nullable=True))
    op.add_column("potreros", sa.Column("kg_producidos_anio", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("potreros", "kg_producidos_anio")
    op.drop_column("potreros", "coneat")
