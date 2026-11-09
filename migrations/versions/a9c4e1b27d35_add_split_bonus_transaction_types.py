"""add split and bonus transaction types

Revision ID: a9c4e1b27d35
Revises: d7a3b9c2e016
Create Date: 2026-11-09 15:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a9c4e1b27d35'
down_revision = 'd7a3b9c2e016'
branch_labels = None
depends_on = None

OLD_TYPES = "'buy', 'sell', 'dividend', 'interest'"
NEW_TYPES = OLD_TYPES + ", 'split', 'bonus'"


def upgrade():
    op.drop_constraint('holding_transactions_transaction_type_check', 'holding_transactions', type_='check')
    op.create_check_constraint('holding_transactions_transaction_type_check', 'holding_transactions', f"transaction_type IN ({NEW_TYPES})")


def downgrade():
    op.execute("DELETE FROM holding_transactions WHERE transaction_type IN ('split', 'bonus')")
    op.drop_constraint('holding_transactions_transaction_type_check', 'holding_transactions', type_='check')
    op.create_check_constraint('holding_transactions_transaction_type_check', 'holding_transactions', f"transaction_type IN ({OLD_TYPES})")
