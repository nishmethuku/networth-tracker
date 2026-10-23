"""add payment sources to budget_entries

Revision ID: c1f7a2d83e46
Revises: a9d4c7e21b58
Create Date: 2026-10-23 00:00:00.000000

Remembers which credit card was charged and which cash account paid for an
expense, so deleting the expense can put the money back.
"""
from alembic import op
import sqlalchemy as sa

revision = 'c1f7a2d83e46'
down_revision = 'a9d4c7e21b58'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('budget_entries', sa.Column('charged_liability_id', sa.BigInteger(), nullable=True))
    op.add_column('budget_entries', sa.Column('funding_holding_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        'budget_entries_charged_liability_fk', 'budget_entries', 'liabilities',
        ['charged_liability_id'], ['id'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'budget_entries_funding_holding_fk', 'budget_entries', 'holdings',
        ['funding_holding_id'], ['id'], ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('budget_entries_funding_holding_fk', 'budget_entries', type_='foreignkey')
    op.drop_constraint('budget_entries_charged_liability_fk', 'budget_entries', type_='foreignkey')
    op.drop_column('budget_entries', 'funding_holding_id')
    op.drop_column('budget_entries', 'charged_liability_id')
