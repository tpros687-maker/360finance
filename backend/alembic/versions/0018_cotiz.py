"""add cotizaciones_diarias table

Revision ID: 0018_cotiz
Revises: 0017_refs
Create Date: 2026-05-08
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018_cotiz"
down_revision: Union[str, None] = "0017_refs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cotizaciones_diarias",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("fecha", sa.Date(), nullable=False, index=True),
        sa.Column("usd_uyu", sa.Numeric(10, 4), nullable=False),
        sa.Column("usd_ars", sa.Numeric(10, 4), nullable=True),
        sa.Column("fuente", sa.String(50), nullable=True),
        sa.UniqueConstraint("fecha", name="uq_cotizacion_fecha"),
    )


def downgrade() -> None:
    op.drop_table("cotizaciones_diarias")
