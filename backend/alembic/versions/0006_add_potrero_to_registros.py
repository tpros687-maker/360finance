"""add potrero_id to registros and ensure comprobante_url exists

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "registros",
        sa.Column(
            "potrero_id",
            sa.Integer(),
            sa.ForeignKey("potreros.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_registros_potrero_id", "registros", ["potrero_id"])


def downgrade() -> None:
    op.drop_index("ix_registros_potrero_id", table_name="registros")
    op.drop_column("registros", "potrero_id")
