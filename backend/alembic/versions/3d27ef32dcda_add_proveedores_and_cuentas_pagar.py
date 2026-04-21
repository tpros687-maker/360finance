"""add proveedores and cuentas_pagar

Revision ID: 3d27ef32dcda
Revises: 06ef8d8cbcf0
Create Date: 2026-04-20 23:08:33.636259

"""
from alembic import op
import sqlalchemy as sa

revision: str = '3d27ef32dcda'
down_revision = '06ef8d8cbcf0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'proveedores',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=200), nullable=False),
        sa.Column('telefono', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=200), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_proveedores_user_id'), 'proveedores', ['user_id'], unique=False)

    op.create_table(
        'cuentas_pagar',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('proveedor_id', sa.Integer(), nullable=False),
        sa.Column('monto', sa.Float(), nullable=False),
        sa.Column('moneda', sa.String(length=3), server_default='UYU', nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('fecha_vencimiento', sa.DateTime(timezone=True), nullable=True),
        sa.Column('pagado', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['proveedor_id'], ['proveedores.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cuentas_pagar_proveedor_id'), 'cuentas_pagar', ['proveedor_id'], unique=False)
    op.create_index(op.f('ix_cuentas_pagar_user_id'), 'cuentas_pagar', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_cuentas_pagar_user_id'), table_name='cuentas_pagar')
    op.drop_index(op.f('ix_cuentas_pagar_proveedor_id'), table_name='cuentas_pagar')
    op.drop_table('cuentas_pagar')
    op.drop_index(op.f('ix_proveedores_user_id'), table_name='proveedores')
    op.drop_table('proveedores')
