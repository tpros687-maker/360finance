"""alter animales.especie from enum to varchar

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Cast the existing enum values to text, then to varchar.
    # The especieanimal enum is still used by movimientos_ganado so we do NOT drop it.
    op.execute(
        "ALTER TABLE animales ALTER COLUMN especie TYPE VARCHAR(100) USING especie::text"
    )


def downgrade() -> None:
    # Restore only if all current values are valid enum members.
    op.execute(
        "ALTER TABLE animales ALTER COLUMN especie TYPE especieanimal "
        "USING especie::especieanimal"
    )
