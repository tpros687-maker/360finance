"""replace lotes_ganado with lotes_v2 schema

Revision ID: 0020_lotes_v2
Revises: 0019_rcache
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0020_lotes_v2"
down_revision = "0019_rcache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("lotes_ganado")

    op.create_table(
        "lotes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("potrero_id", sa.Integer(), nullable=False),
        sa.Column("categoria", sa.String(50), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("fecha_entrada", sa.Date(), nullable=False),
        sa.Column("peso_total_entrada_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("precio_kg_compra", sa.Numeric(10, 4), nullable=True),
        sa.Column("lote_padre_id", sa.Integer(), nullable=True),
        sa.Column("cerrado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["potrero_id"], ["potreros.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lote_padre_id"], ["lotes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lotes_id", "lotes", ["id"])
    op.create_index("ix_lotes_user_id", "lotes", ["user_id"])
    op.create_index("ix_lotes_potrero_id", "lotes", ["potrero_id"])

    op.create_table(
        "movimientos_lote",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("lote_id", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("potrero_origen_id", sa.Integer(), nullable=False),
        sa.Column("potrero_destino_id", sa.Integer(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lote_id"], ["lotes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["potrero_origen_id"], ["potreros.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["potrero_destino_id"], ["potreros.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_movimientos_lote_id", "movimientos_lote", ["id"])
    op.create_index("ix_movimientos_lote_lote_id", "movimientos_lote", ["lote_id"])

    op.create_table(
        "divisiones_lote",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("lote_padre_id", sa.Integer(), nullable=False),
        sa.Column("lote_hijo_id", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("cantidad_separada", sa.Integer(), nullable=False),
        sa.Column("motivo", sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lote_padre_id"], ["lotes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lote_hijo_id"], ["lotes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_divisiones_lote_id", "divisiones_lote", ["id"])

    op.create_table(
        "ventas_lote",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("lote_id", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("cantidad_vendida", sa.Integer(), nullable=False),
        sa.Column("peso_total_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("precio_kg", sa.Numeric(10, 4), nullable=False),
        sa.Column("moneda", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lote_id"], ["lotes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ventas_lote_id", "ventas_lote", ["id"])
    op.create_index("ix_ventas_lote_lote_id", "ventas_lote", ["lote_id"])


def downgrade() -> None:
    op.drop_table("ventas_lote")
    op.drop_table("divisiones_lote")
    op.drop_table("movimientos_lote")
    op.drop_table("lotes")
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
