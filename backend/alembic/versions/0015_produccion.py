"""add lotes_ganado, eventos_reproductivos, ciclos_agricolas

Revision ID: 0015_produccion
Revises: 0014_coneat
Create Date: 2026-05-06
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_produccion"
down_revision: Union[str, None] = "0014_coneat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lotes_ganado",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("potrero_id", sa.Integer(), sa.ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False),
        sa.Column("especie", sa.String(100), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("fecha_entrada", sa.Date(), nullable=False),
        sa.Column("peso_entrada_kg", sa.Numeric(10, 2), nullable=False),
        sa.Column("fecha_salida", sa.Date(), nullable=True),
        sa.Column("peso_salida_kg", sa.Numeric(10, 2), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
    )

    op.create_table(
        "eventos_reproductivos",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("potrero_id", sa.Integer(), sa.ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(50), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("vientres_totales", sa.Integer(), nullable=False),
        sa.Column("resultado", sa.Integer(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
    )

    op.create_table(
        "ciclos_agricolas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("potrero_id", sa.Integer(), sa.ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False),
        sa.Column("zafra", sa.String(20), nullable=False),
        sa.Column("cultivo", sa.String(100), nullable=False),
        sa.Column("fecha_siembra", sa.Date(), nullable=True),
        sa.Column("fecha_cosecha", sa.Date(), nullable=True),
        sa.Column("toneladas_cosechadas", sa.Numeric(10, 3), nullable=True),
        sa.Column("precio_venta_tn", sa.Numeric(10, 2), nullable=True),
        sa.Column("moneda", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("notas", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("ciclos_agricolas")
    op.drop_table("eventos_reproductivos")
    op.drop_table("lotes_ganado")
