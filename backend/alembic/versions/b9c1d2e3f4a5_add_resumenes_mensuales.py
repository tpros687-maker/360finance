"""add resumenes mensuales

Revision ID: b9c1d2e3f4a5
Revises: a1b2c3d4e5f6
Create Date: 2026-05-21

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b9c1d2e3f4a5"
down_revision: Union[str, None] = "0022_user_telefono"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "resumenes_mensuales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("total_ingresos", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_gastos", sa.Float(), nullable=False, server_default="0"),
        sa.Column("balance", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cobros_cobrados", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cobros_pendientes", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pagos_pagados", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pagos_pendientes", sa.Float(), nullable=False, server_default="0"),
        sa.Column("notas_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tareas_creadas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tareas_completadas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("categoria_top_gasto", sa.String(), nullable=True),
        sa.Column("monto_top_gasto", sa.Float(), nullable=True),
        sa.Column("categoria_top_ingreso", sa.String(), nullable=True),
        sa.Column("monto_top_ingreso", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "year", "month", name="uq_resumen_user_mes"),
    )
    op.create_index("ix_resumenes_mensuales_id", "resumenes_mensuales", ["id"])
    op.create_index("ix_resumenes_mensuales_user_id", "resumenes_mensuales", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_resumenes_mensuales_user_id", table_name="resumenes_mensuales")
    op.drop_index("ix_resumenes_mensuales_id", table_name="resumenes_mensuales")
    op.drop_table("resumenes_mensuales")
