"""add franjas estado

Revision ID: c1d2e3f4a5b6
Revises: b9c1d2e3f4a5
Create Date: 2026-05-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "b9c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "franjas_estado",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("potrero_id", sa.Integer(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("en_uso", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("fecha_entrada", sa.Date(), nullable=True),
        sa.Column("fecha_inicio_descanso", sa.Date(), nullable=True),
        sa.Column("dias_descanso_objetivo", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["potrero_id"], ["potreros.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("potrero_id", "numero", name="uq_franja_potrero_numero"),
    )
    op.create_index("ix_franjas_estado_id", "franjas_estado", ["id"])
    op.create_index("ix_franjas_estado_potrero_id", "franjas_estado", ["potrero_id"])


def downgrade() -> None:
    op.drop_index("ix_franjas_estado_potrero_id", table_name="franjas_estado")
    op.drop_index("ix_franjas_estado_id", table_name="franjas_estado")
    op.drop_table("franjas_estado")
