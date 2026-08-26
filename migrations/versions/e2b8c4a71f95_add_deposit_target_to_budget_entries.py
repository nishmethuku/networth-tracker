"""add deposit_target_holding_id to budget_entries

Revision ID: e2b8c4a71f95
Revises: f7a3e5c19b42
Create Date: 2026-08-26 00:00:00.000000

Lets a Budget income entry (e.g. "Salary") optionally link to a cash
Holding, so logging the income also increases that holding's balance
(holdings_service.build_deposit_valuation) instead of requiring a
separate manual edit -- the mirror of the existing funding_source_
holding_id mechanism on expense entries, requested directly by a user
("while adding my salary, I want to mention going into Axis Vijay").
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e2b8c4a71f95'
down_revision = 'f7a3e5c19b42'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('budget_entries', sa.Column('deposit_target_holding_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        'budget_entries_deposit_target_holding_id_fkey', 'budget_entries', 'holdings',
        ['deposit_target_holding_id'], ['id'],
        # SET NULL, not the default RESTRICT: a logged income entry is a
        # historical record independent of whether the holding it was
        # deposited into still exists later (e.g. an account gets closed
        # and its holding deleted) -- without this, deleting a holding
        # with any linked budget entries would fail outright with a raw
        # FK-violation 500 instead of either succeeding or a clean error,
        # the exact bug already fixed once for linked_liability_id.
        ondelete='SET NULL',
    )
    op.create_index('budget_entries_deposit_target_holding_id_idx', 'budget_entries', ['deposit_target_holding_id'])


def downgrade():
    op.drop_index('budget_entries_deposit_target_holding_id_idx', table_name='budget_entries')
    op.drop_constraint('budget_entries_deposit_target_holding_id_fkey', 'budget_entries', type_='foreignkey')
    op.drop_column('budget_entries', 'deposit_target_holding_id')
