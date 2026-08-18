"""add recurring fields to budget_entries

Revision ID: 52eac577826c
Revises: 448dfbabf6d8
Create Date: 2026-08-18 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '52eac577826c'
down_revision = '448dfbabf6d8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('budget_entries', sa.Column('is_recurring', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('budget_entries', sa.Column('recurring_frequency', sa.String(length=16), nullable=True))


def downgrade():
    op.drop_column('budget_entries', 'recurring_frequency')
    op.drop_column('budget_entries', 'is_recurring')
