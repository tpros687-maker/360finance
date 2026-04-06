"""create mapa tables (potreros, animales, puntos_interes, movimientos_ganado)

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable PostGIS if not already enabled
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # ── potreros ──────────────────────────────────────────────────────────────
    op.create_table(
        "potreros",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nombre", sa.String(length=200), nullable=False),
        sa.Column(
            "geometria",
            Geometry(geometry_type="POLYGON", srid=4326),
            nullable=False,
        ),
        sa.Column(
            "tipo",
            sa.Enum("agricultura", "ganaderia", "mixto", name="tipopotrero"),
            nullable=False,
        ),
        sa.Column(
            "estado_pasto",
            sa.Enum("bueno", "regular", "malo", name="estadopasto"),
            nullable=False,
        ),
        sa.Column("tiene_suplementacion", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("suplementacion_detalle", sa.Text(), nullable=True),
        sa.Column("tiene_franjas", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("cantidad_franjas", sa.Integer(), nullable=True),
        sa.Column("franjas_usadas", sa.Integer(), nullable=True),
        sa.Column("observaciones", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_potreros_id"), "potreros", ["id"], unique=False)
    op.create_index(op.f("ix_potreros_user_id"), "potreros", ["user_id"], unique=False)

    # ── animales ──────────────────────────────────────────────────────────────
    op.create_table(
        "animales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("potrero_id", sa.Integer(), sa.ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "especie",
            sa.Enum("bovino", "ovino", "equino", "porcino", "otro", name="especieanimal"),
            nullable=False,
        ),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("raza", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_animales_id"), "animales", ["id"], unique=False)
    op.create_index(op.f("ix_animales_potrero_id"), "animales", ["potrero_id"], unique=False)
    op.create_index(op.f("ix_animales_user_id"), "animales", ["user_id"], unique=False)

    # ── puntos_interes ────────────────────────────────────────────────────────
    op.create_table(
        "puntos_interes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("potrero_id", sa.Integer(), sa.ForeignKey("potreros.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nombre", sa.String(length=200), nullable=False),
        sa.Column(
            "tipo",
            sa.Enum("bebedero", "casa", "sombra", "comedero", name="tipopunto"),
            nullable=False,
        ),
        sa.Column(
            "geometria",
            Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_puntos_interes_id"), "puntos_interes", ["id"], unique=False)
    op.create_index(op.f("ix_puntos_interes_user_id"), "puntos_interes", ["user_id"], unique=False)
    op.create_index(op.f("ix_puntos_interes_potrero_id"), "puntos_interes", ["potrero_id"], unique=False)

    # ── movimientos_ganado ────────────────────────────────────────────────────
    op.create_table(
        "movimientos_ganado",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("potrero_origen_id", sa.Integer(), sa.ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False),
        sa.Column("potrero_destino_id", sa.Integer(), sa.ForeignKey("potreros.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column(
            "especie",
            sa.Enum("bovino", "ovino", "equino", "porcino", "otro", name="especieanimal"),
            nullable=False,
        ),
        sa.Column("fecha_programada", sa.Date(), nullable=False),
        sa.Column("fecha_ejecutada", sa.Date(), nullable=True),
        sa.Column(
            "estado",
            sa.Enum("programado", "ejecutado", "cancelado", name="estadomovimiento"),
            nullable=False,
            server_default="programado",
        ),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_movimientos_ganado_id"), "movimientos_ganado", ["id"], unique=False)
    op.create_index(op.f("ix_movimientos_ganado_user_id"), "movimientos_ganado", ["user_id"], unique=False)
    op.create_index(op.f("ix_movimientos_ganado_potrero_origen_id"), "movimientos_ganado", ["potrero_origen_id"], unique=False)
    op.create_index(op.f("ix_movimientos_ganado_potrero_destino_id"), "movimientos_ganado", ["potrero_destino_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_movimientos_ganado_potrero_destino_id"), table_name="movimientos_ganado")
    op.drop_index(op.f("ix_movimientos_ganado_potrero_origen_id"), table_name="movimientos_ganado")
    op.drop_index(op.f("ix_movimientos_ganado_user_id"), table_name="movimientos_ganado")
    op.drop_index(op.f("ix_movimientos_ganado_id"), table_name="movimientos_ganado")
    op.drop_table("movimientos_ganado")

    op.drop_index(op.f("ix_puntos_interes_potrero_id"), table_name="puntos_interes")
    op.drop_index(op.f("ix_puntos_interes_user_id"), table_name="puntos_interes")
    op.drop_index(op.f("ix_puntos_interes_id"), table_name="puntos_interes")
    op.drop_table("puntos_interes")

    op.drop_index(op.f("ix_animales_user_id"), table_name="animales")
    op.drop_index(op.f("ix_animales_potrero_id"), table_name="animales")
    op.drop_index(op.f("ix_animales_id"), table_name="animales")
    op.drop_table("animales")

    op.drop_index(op.f("ix_potreros_user_id"), table_name="potreros")
    op.drop_index(op.f("ix_potreros_id"), table_name="potreros")
    op.drop_table("potreros")

    op.execute("DROP TYPE IF EXISTS estadomovimiento")
    op.execute("DROP TYPE IF EXISTS tipopunto")
    op.execute("DROP TYPE IF EXISTS especieanimal")
    op.execute("DROP TYPE IF EXISTS estadopasto")
    op.execute("DROP TYPE IF EXISTS tipopotrero")
