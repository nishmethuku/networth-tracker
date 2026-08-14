"""add budget_entries table

Revision ID: 448dfbabf6d8
Revises: ab51c13a2eff
Create Date: 2026-08-13 22:49:30.173060

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '448dfbabf6d8'
down_revision = 'ab51c13a2eff'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'budget_entries',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('entry_type', sa.String(length=8), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=8), nullable=False),
        sa.Column('category', sa.String(length=32), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_private', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('budget_entries_user_date_idx', 'budget_entries', ['user_id', 'entry_date'])
    op.create_index('budget_entries_household_date_idx', 'budget_entries', ['household_id', 'entry_date'])


def downgrade():
    op.drop_index('budget_entries_household_date_idx', table_name='budget_entries')
    op.drop_index('budget_entries_user_date_idx', table_name='budget_entries')
    op.drop_table('budget_entries')
