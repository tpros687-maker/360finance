"""add rentabilidad_cache table

Revision ID: 0019_rcache
Revises: 0018_cotiz
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0019_rcache"
down_revision = "0018_cotiz"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rentabilidad_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("potrero_id", sa.Integer(), nullable=False),
        sa.Column("periodo_desde", sa.Date(), nullable=False),
        sa.Column("periodo_hasta", sa.Date(), nullable=False),
        sa.Column("resultado_json", sa.Text(), nullable=False),
        sa.Column(
            "calculado_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("valido", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.ForeignKeyConstraint(["potrero_id"], ["potreros.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "potrero_id", "periodo_desde", "periodo_hasta",
            name="uq_rent_cache",
        ),
    )
    op.create_index("ix_rentabilidad_cache_id", "rentabilidad_cache", ["id"])
    op.create_index("ix_rentabilidad_cache_user_id", "rentabilidad_cache", ["user_id"])
    op.create_index("ix_rentabilidad_cache_potrero_id", "rentabilidad_cache", ["potrero_id"])


def downgrade() -> None:
    op.drop_table("rentabilidad_cache")
