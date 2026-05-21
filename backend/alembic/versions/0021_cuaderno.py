"""add notas_cuaderno and tareas_cuaderno tables

Revision ID: 0021_cuaderno
Revises: 0020_lotes_v2
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0021_cuaderno"
down_revision = "0020_lotes_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notas_cuaderno",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("potrero_id", sa.Integer(), nullable=True),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["potrero_id"], ["potreros.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notas_cuaderno_id", "notas_cuaderno", ["id"])
    op.create_index("ix_notas_cuaderno_user_id", "notas_cuaderno", ["user_id"])
    op.create_index("ix_notas_cuaderno_potrero_id", "notas_cuaderno", ["potrero_id"])

    op.create_table(
        "tareas_cuaderno",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("potrero_id", sa.Integer(), nullable=True),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("fecha_planificada", sa.Date(), nullable=True),
        sa.Column(
            "completada",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "notificar_dias_antes",
            sa.Integer(),
            nullable=True,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["potrero_id"], ["potreros.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tareas_cuaderno_id", "tareas_cuaderno", ["id"])
    op.create_index("ix_tareas_cuaderno_user_id", "tareas_cuaderno", ["user_id"])
    op.create_index("ix_tareas_cuaderno_potrero_id", "tareas_cuaderno", ["potrero_id"])


def downgrade() -> None:
    op.drop_table("tareas_cuaderno")
    op.drop_table("notas_cuaderno")
