"""add onboarding fields to users

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("onboarding_completado", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("users", sa.Column("nombre_campo", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("departamento", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("moneda", sa.String(10), nullable=False, server_default="UYU"))


def downgrade() -> None:
    op.drop_column("users", "moneda")
    op.drop_column("users", "departamento")
    op.drop_column("users", "nombre_campo")
    op.drop_column("users", "onboarding_completado")
