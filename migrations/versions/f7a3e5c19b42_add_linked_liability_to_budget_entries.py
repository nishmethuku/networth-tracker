"""add linked_liability_id to budget_entries

Revision ID: f7a3e5c19b42
Revises: a4c8f1e29d67
Create Date: 2026-08-25 00:00:00.000000

Lets a Budget expense entry (e.g. "Mortgage payment") optionally link to a
Liability, so logging the payment also reduces that liability's balance
(liability_service.apply_payment) instead of requiring a separate manual
edit — closes the gap where these two already-built features (Liabilities,
Budget recurring entries) required duplicate manual bookkeeping to stay in
sync with each other.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7a3e5c19b42'
down_revision = 'a4c8f1e29d67'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('budget_entries', sa.Column('linked_liability_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        'budget_entries_linked_liability_id_fkey', 'budget_entries', 'liabilities',
        ['linked_liability_id'], ['id'],
        # SET NULL, not the default RESTRICT: a logged payment is a
        # historical expense record independent of whether the liability
        # it paid down still exists (e.g. a fully-paid-off loan gets
        # deleted later) -- without this, deleting a liability with any
        # linked budget entries fails outright with a raw FK-violation
        # 500 instead of either succeeding or a clean error.
        ondelete='SET NULL',
    )
    op.create_index('budget_entries_linked_liability_id_idx', 'budget_entries', ['linked_liability_id'])


def downgrade():
    op.drop_index('budget_entries_linked_liability_id_idx', table_name='budget_entries')
    op.drop_constraint('budget_entries_linked_liability_id_fkey', 'budget_entries', type_='foreignkey')
    op.drop_column('budget_entries', 'linked_liability_id')
