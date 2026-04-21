"""add es_productor and es_negocio to users

Revision ID: 0010
Revises: 3d27ef32dcda
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "3d27ef32dcda"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("es_productor", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "users",
        sa.Column("es_negocio", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("users", "es_negocio")
    op.drop_column("users", "es_productor")
