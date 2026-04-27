"""alter movimientos_ganado especie to varchar

Revision ID: 0011_alter_movimientos_especie_to_varchar
Revises: a1b2c3d4e5f6
Create Date: 2026-04-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = '0011_esp_fix'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE movimientos_ganado ALTER COLUMN especie TYPE VARCHAR(100)")


def downgrade() -> None:
    op.execute("ALTER TABLE movimientos_ganado ALTER COLUMN especie TYPE VARCHAR(32)")
