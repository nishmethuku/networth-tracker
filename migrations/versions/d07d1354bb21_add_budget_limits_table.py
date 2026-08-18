"""add budget_limits table

Revision ID: d07d1354bb21
Revises: 52eac577826c
Create Date: 2026-08-18 12:00:01.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'd07d1354bb21'
down_revision = '52eac577826c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'budget_limits',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('category', sa.String(length=32), nullable=False),
        sa.Column('monthly_limit', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=8), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('budget_limits_user_category_idx', 'budget_limits', ['user_id', 'category'])
    op.create_index('budget_limits_household_category_idx', 'budget_limits', ['household_id', 'category'])


def downgrade():
    op.drop_index('budget_limits_household_category_idx', table_name='budget_limits')
    op.drop_index('budget_limits_user_category_idx', table_name='budget_limits')
    op.drop_table('budget_limits')
