"""add referencias_productivas table

Revision ID: 0017_refs
Revises: 0016_imputac
Create Date: 2026-05-08
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_refs"
down_revision: Union[str, None] = "0016_imputac"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "referencias_productivas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("pais", sa.String(20), nullable=False),
        sa.Column("zona", sa.String(50), nullable=True),
        sa.Column("actividad", sa.String(50), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=True),
        sa.Column("margen_neto_ha_usd_bajo", sa.Numeric(10, 2), nullable=False),
        sa.Column("margen_neto_ha_usd_medio", sa.Numeric(10, 2), nullable=False),
        sa.Column("margen_neto_ha_usd_alto", sa.Numeric(10, 2), nullable=False),
        sa.Column("fuente", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("referencias_productivas")
