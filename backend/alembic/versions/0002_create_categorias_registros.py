"""create categorias and registros tables with seed data

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    # ── categorias ──────────────────────────────────────────────────────────
    op.create_table(
        "categorias",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column(
            "tipo",
            sa.Enum("gasto", "ingreso", name="tipomovimiento"),
            nullable=False,
        ),
        sa.Column("es_personalizada", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#6b7280"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_categorias_id"), "categorias", ["id"], unique=False)
    op.create_index(op.f("ix_categorias_user_id"), "categorias", ["user_id"], unique=False)

    # ── registros ────────────────────────────────────────────────────────────
    op.create_table(
        "registros",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("categoria_id", sa.Integer(), sa.ForeignKey("categorias.id", ondelete="RESTRICT"), nullable=False),
        sa.Column(
            "tipo",
            sa.Enum("gasto", "ingreso", name="tipomovimiento"),
            nullable=False,
        ),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("comprobante_url", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_registros_id"), "registros", ["id"], unique=False)
    op.create_index(op.f("ix_registros_user_id"), "registros", ["user_id"], unique=False)
    op.create_index(op.f("ix_registros_categoria_id"), "registros", ["categoria_id"], unique=False)
    op.create_index(op.f("ix_registros_fecha"), "registros", ["fecha"], unique=False)

    # ── seed data ─────────────────────────────────────────────────────────────
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Veterinaria', 'gasto'::tipomovimiento, false, '#ef4444')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Alimentación', 'gasto'::tipomovimiento, false, '#f97316')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Combustible', 'gasto'::tipomovimiento, false, '#eab308')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Mano de obra', 'gasto'::tipomovimiento, false, '#84cc16')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Maquinaria', 'gasto'::tipomovimiento, false, '#06b6d4')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Semillas', 'gasto'::tipomovimiento, false, '#3b82f6')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Agroquímicos', 'gasto'::tipomovimiento, false, '#8b5cf6')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Fardos', 'gasto'::tipomovimiento, false, '#ec4899')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Sales', 'gasto'::tipomovimiento, false, '#14b8a6')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Otros', 'gasto'::tipomovimiento, false, '#6b7280')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Venta de animales', 'ingreso'::tipomovimiento, false, '#22c55e')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Venta de granos', 'ingreso'::tipomovimiento, false, '#10b981')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Arrendamiento', 'ingreso'::tipomovimiento, false, '#06b6d4')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Subsidios', 'ingreso'::tipomovimiento, false, '#3b82f6')")
    op.execute("INSERT INTO categorias (nombre, tipo, es_personalizada, color) VALUES ('Otros ingresos', 'ingreso'::tipomovimiento, false, '#6b7280')")


def downgrade() -> None:
    op.drop_index(op.f("ix_registros_fecha"), table_name="registros")
    op.drop_index(op.f("ix_registros_categoria_id"), table_name="registros")
    op.drop_index(op.f("ix_registros_user_id"), table_name="registros")
    op.drop_index(op.f("ix_registros_id"), table_name="registros")
    op.drop_table("registros")

    op.drop_index(op.f("ix_categorias_user_id"), table_name="categorias")
    op.drop_index(op.f("ix_categorias_id"), table_name="categorias")
    op.drop_table("categorias")

    op.execute("DROP TYPE IF EXISTS tipomovimiento")
