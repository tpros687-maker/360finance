"""add telefono to users

Revision ID: 0022_user_telefono
Revises: 0021_cuaderno
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0022_user_telefono"
down_revision = "0021_cuaderno"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("telefono", sa.String(30), nullable=True),
    )
    op.create_unique_constraint("uq_users_telefono", "users", ["telefono"])
    op.create_index("ix_users_telefono", "users", ["telefono"])


def downgrade() -> None:
    op.drop_index("ix_users_telefono", table_name="users")
    op.drop_constraint("uq_users_telefono", "users", type_="unique")
    op.drop_column("users", "telefono")
