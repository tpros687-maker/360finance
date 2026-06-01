"""add token_reset_password to users

Revision ID: 0024_token_reset_password
Revises: 0023_email_verificacion
Create Date: 2026-06-01

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0024_token_reset_password"
down_revision: Union[str, None] = "0023_email_verificacion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_reset_password", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "token_reset_password")
