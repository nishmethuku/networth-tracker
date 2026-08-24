"""add liabilities table

Revision ID: c4a8f1e2d5b7
Revises: b91e4d5f6a3c
Create Date: 2026-08-24 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'c4a8f1e2d5b7'
down_revision = 'b91e4d5f6a3c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'liabilities',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('liability_type', sa.String(length=32), nullable=False),
        sa.Column('currency', sa.String(length=8), nullable=False),
        sa.Column('current_balance', sa.Float(), nullable=False),
        sa.Column('original_amount', sa.Float(), nullable=True),
        sa.Column('interest_rate', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_private', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('liabilities_user_id_idx', 'liabilities', ['user_id'])
    op.create_index('liabilities_household_id_idx', 'liabilities', ['household_id'])


def downgrade():
    op.drop_index('liabilities_household_id_idx', table_name='liabilities')
    op.drop_index('liabilities_user_id_idx', table_name='liabilities')
    op.drop_table('liabilities')
