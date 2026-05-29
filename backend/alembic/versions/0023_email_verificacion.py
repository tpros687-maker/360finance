"""add email_verificado and token_verificacion to users

Revision ID: 0023_email_verificacion
Revises: c1d2e3f4a5b6
Create Date: 2026-05-29

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0023_email_verificacion"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verificado", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "users",
        sa.Column("token_verificacion", sa.String(100), nullable=True),
    )
    # Nuevos registros deben verificar; server_default='true' cubre usuarios existentes.
    # Cambiamos el default a false para registros futuros (lo maneja SQLAlchemy, no la DB).


def downgrade() -> None:
    op.drop_column("users", "token_verificacion")
    op.drop_column("users", "email_verificado")
