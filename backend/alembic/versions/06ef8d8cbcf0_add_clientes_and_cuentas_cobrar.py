"""add clientes and cuentas_cobrar

Revision ID: 06ef8d8cbcf0
Revises: 57155e8c7244
Create Date: 2026-04-20 22:54:02.945650

"""
from alembic import op
import sqlalchemy as sa

revision: str = '06ef8d8cbcf0'
down_revision = '57155e8c7244'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'clientes',
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
    op.create_index(op.f('ix_clientes_user_id'), 'clientes', ['user_id'], unique=False)

    op.create_table(
        'cuentas_cobrar',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('cliente_id', sa.Integer(), nullable=False),
        sa.Column('monto', sa.Float(), nullable=False),
        sa.Column('moneda', sa.String(length=3), server_default='UYU', nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('fecha_vencimiento', sa.DateTime(timezone=True), nullable=True),
        sa.Column('pagado', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['cliente_id'], ['clientes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cuentas_cobrar_cliente_id'), 'cuentas_cobrar', ['cliente_id'], unique=False)
    op.create_index(op.f('ix_cuentas_cobrar_user_id'), 'cuentas_cobrar', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_cuentas_cobrar_user_id'), table_name='cuentas_cobrar')
    op.drop_index(op.f('ix_cuentas_cobrar_cliente_id'), table_name='cuentas_cobrar')
    op.drop_table('cuentas_cobrar')
    op.drop_index(op.f('ix_clientes_user_id'), table_name='clientes')
    op.drop_table('clientes')
